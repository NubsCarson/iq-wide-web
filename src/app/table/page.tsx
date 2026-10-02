"use client";

// Dev view: every DbRoot and its tables as a TreeView on the left, details
// for the selected node on the right. Same data source the search catalog
// will use later — one /dbroots call, cached. Node ids encode the kind so
// the click handler can dispatch ("dbroot:{pda}", "table:{dbrootPda}:{hex}").

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import styled from "styled-components";
import {
  TreeView,
  ScrollView,
  TextInput,
  Window,
  WindowHeader,
  WindowContent,
  GroupBox,
} from "react95";
import { PayloadView } from "@/components/transaction/payload-view";
import { readCodeInGW } from "@/lib/gateway/reader";
import { gwFetch } from "@/lib/gateway/reader";
import { resolveDbRootLabel } from "@/lib/dbroot/known-labels";
import { resolveDAppLink } from "@/lib/dbroot/dapp-links";
import { FONT } from "@/lib/ui/typography";

// 768px: standard tablet/phone cutoff. Below this the two-column desktop layout
// gets too cramped, so we stack the tree on top with a shortened ScrollView.
const MOBILE_MAX = 767;

const PageShell = styled.div`
  min-height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: ${MOBILE_MAX}px) {
    padding: 8px;
    align-items: flex-start;
  }
`;

const Shell = styled(Window)`
  width: 100%;
  max-width: 1200px;
`;

const Split = styled.div`
  display: flex;
  gap: 12px;
  min-height: 520px;
  @media (max-width: ${MOBILE_MAX}px) {
    flex-direction: column;
    min-height: 0;
  }
`;

const TreeCol = styled.div`
  flex: 0 0 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  @media (max-width: ${MOBILE_MAX}px) {
    flex: 0 0 auto;
    width: 100%;
  }
`;

const DetailsCol = styled.div`
  flex: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

// ~240px on mobile keeps the tree visible but leaves room for details below
// the fold; desktop keeps the original 480 so the full tree is usable at once.
const TreeScroll = styled(ScrollView)`
  height: 480px;
  margin-top: 8px;
  width: 100%;
  @media (max-width: ${MOBILE_MAX}px) {
    height: 240px;
  }
`;

interface TableHint {
  label: string | null;
  hex: string;
  tablePda: string | null;
}
interface DbRoot {
  pda: string;
  id: string | null;
  idHex: string;
  creator: string | null;
  tableCreators: string[];
  extCreators: string[];
  tableSeeds: TableHint[];
  globalTableSeeds: TableHint[];
}

async function fetchDbRoots(): Promise<DbRoot[]> {
  const res = await gwFetch("/dbroots");
  const data = await res.json();
  return Array.isArray(data.dbroots) ? data.dbroots : [];
}

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
// A DbRoot's id is the raw utf-8 label if the writer stored it that way, or
// recovered by hashing known candidates against the on-chain hash if it didn't.
// Either path gives the same label — that's the whole point.
function dbrootLabel(d: DbRoot): string {
  return resolveDbRootLabel(d.id, d.idHex) ?? `(${short(d.idHex)})`;
}

// Tree node labels can't wrap (TreeView renders one line per node), so we cap
// long hint labels. We split on both ":" and "_" because dApps use either as
// separators (e.g. "git_repos_v2_<owner>"); pubkey-shaped segments (32-44
// base58) get shortened, and the whole thing is hard-capped at 32 chars.
const PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Compact pubkey-shaped segments only; the tree row CSS below wraps the rest
// so the full label is visible even if it spans 2-3 lines.
function hintLabel(t: TableHint): string {
  const raw = t.label ?? `(${t.hex.slice(0, 10)}…)`;
  return raw
    .split(/([:_])/) // keep separators
    .map((part) => (PUBKEY.test(part) ? short(part) : part))
    .join("");
}

// Tree node ids carry the kind so onNodeSelect can dispatch by parsing them.
//   "dbroot:{dbrootPda}"
//   "table:{dbrootPda}:{hintHex}"
function buildTree(dbroots: DbRoot[], search: string) {
  const q = search.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  return dbroots
    .map((d) => {
      const items = d.tableSeeds
        .filter((t) => matches(hintLabel(t)))
        .map((t) => ({ id: `table:${d.pda}:${t.hex}`, label: hintLabel(t) }));
      const rootLabel = dbrootLabel(d);
      // Keep a dbroot in the tree if its name matches OR any of its tables do.
      if (!matches(rootLabel) && items.length === 0) return null;
      return { id: `dbroot:${d.pda}`, label: rootLabel, items: items.length ? items : undefined };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);
}

function findHint(dbroots: DbRoot[], dbrootPda: string, hex: string) {
  const root = dbroots.find((d) => d.pda === dbrootPda);
  const hint = root?.tableSeeds.find((t) => t.hex === hex);
  return root && hint ? { root, hint } : null;
}

// Row as returned by /table/{pda}/rows. Columns are whatever the table
// defined; the gateway also tacks on these metadata fields.
type GatewayRow = Record<string, unknown> & {
  __txSignature?: string;
  __signer?: string;
  __blockTime?: number;
};

async function fetchRows(tablePda: string): Promise<GatewayRow[]> {
  // limit=50: the gateway head-page caches 50 anyway, and we never need more
  // than a screenful here. Bigger limits cost a real cold fetch.
  const res = await gwFetch(`/table/${tablePda}/rows?limit=50`);
  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

// Try to pick a single-line summary for a row before it's expanded — the
// id column if the meta said which one (we don't have meta on this page),
// otherwise the first short-looking column value.
function rowSummary(row: GatewayRow): string {
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("__")) continue;
    if (typeof v === "string" && v.length > 0 && v.length < 80) return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return "(row)";
}

// Long sig/pubkey strings in row JSON have no spaces and would otherwise blow
// the flex column wide. break-all lets them wrap, pre-wrap keeps the JSON
// indentation, and the container takes minWidth: 0 so flex respects its share.
const codeBlockStyle: React.CSSProperties = {
  background: "#000",
  color: "#0f0",
  padding: 8,
  margin: "4px 0",
  overflow: "auto",
  maxHeight: 240,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

function ExpandedRow({
  row,
  dbrootLabel: rootLabel,
  tableLabel,
}: {
  row: GatewayRow;
  dbrootLabel: string | null;
  tableLabel: string | null;
}) {
  const dapp = resolveDAppLink({ dbrootLabel: rootLabel, tableLabel, row });
  // Two ways a row can point at a fetchable payload:
  //   (a) row.sig — inline meta row whose data is a separate chunked asset
  //       (e.g. an iqlocker entry whose `sig` is the webp upload trans).
  //   (b) row.__onChainPath set — the trans itself is the head of a chunked
  //       asset (linked-list or session). row.__txSignature is the entry point.
  // Pure inline rows (no sig, empty __onChainPath) already have their content
  // spread into the row fields above; nothing to fetch.
  const txSig = row.__txSignature;
  const assetSig = typeof row.sig === "string" ? row.sig : undefined;
  const onChainPath = typeof row.__onChainPath === "string" ? row.__onChainPath : "";
  const dataSig = assetSig ?? (onChainPath.length > 0 ? txSig : undefined);
  const payload = useQuery({
    queryKey: ["data", dataSig],
    queryFn: () => readCodeInGW(dataSig!),
    enabled: !!dataSig,
    // /data/{sig} is immutable (sig is content), so cache for the session.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const ext = typeof row.ext === "string" ? row.ext : undefined;

  return (
    <div style={{ padding: 8, fontSize: FONT.meta, lineHeight: 1.6, minWidth: 0 }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: FONT.body }}>row fields</strong>
        {dapp && (
          <a
            href={dapp.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: FONT.meta, textDecoration: "underline" }}
          >
            {dapp.label} ↗
          </a>
        )}
        {txSig && (
          <a
            href={`https://solscan.io/tx/${txSig}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: FONT.meta, textDecoration: "underline" }}
          >
            open on solscan ↗
          </a>
        )}
      </div>
      <pre style={codeBlockStyle}>{JSON.stringify(row, null, 2)}</pre>
      {dataSig && (
        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: FONT.body }}>payload</strong>
          {payload.isLoading && <div>loading…</div>}
          {payload.isError && <div role="alert">Could not load this file. <button onClick={() => payload.refetch()}>Retry</button></div>}
          {payload.data && <PayloadView key={dataSig} payload={payload.data} ext={ext} />}
        </div>
      )}
    </div>
  );
}

function RowsPanel({
  tablePda,
  dbrootLabel: rootLabel,
  tableLabel,
}: {
  tablePda: string;
  dbrootLabel: string | null;
  tableLabel: string | null;
}) {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["rows", tablePda],
    queryFn: () => fetchRows(tablePda),
    // Gateway head-page TTL is 60s; refetching faster than that just hits its
    // memory cache anyway. Keep client cache long so React Query doesn't
    // refetch on remount when the user clicks between tables.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const [openSig, setOpenSig] = useState<string | null>(null);

  if (isLoading) return <p style={{ fontSize: FONT.body }}>loading rows…</p>;
  if (error) return <p style={{ fontSize: FONT.body, color: "#b00020" }}>failed to load rows</p>;
  if (!rows || rows.length === 0) return <p style={{ fontSize: FONT.body, opacity: 0.6 }}>(no rows)</p>;

  return (
    <ScrollView style={{ height: 360 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((row, i) => {
          const sig = row.__txSignature ?? `idx-${i}`;
          const isOpen = openSig === sig;
          const time = row.__blockTime ? new Date(row.__blockTime * 1000).toLocaleString() : "";
          return (
            <div key={sig} style={{ borderBottom: "1px dotted rgba(0,0,0,0.2)" }}>
              <button
                onClick={() => setOpenSig(isOpen ? null : sig)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontSize: FONT.meta,
                  fontFamily: "inherit",
                }}
              >
                <span style={{ marginRight: 6 }}>{isOpen ? "▼" : "▶"}</span>
                <span>{rowSummary(row)}</span>
                {time && <span style={{ marginLeft: 8, opacity: 0.6 }}>{time}</span>}
              </button>
              {isOpen && <ExpandedRow row={row} dbrootLabel={rootLabel} tableLabel={tableLabel} />}
            </div>
          );
        })}
      </div>
    </ScrollView>
  );
}

function Details({ dbroots, selected }: { dbroots: DbRoot[]; selected: string | null }) {
  if (!selected) {
    return <p style={{ fontSize: FONT.body, opacity: 0.6 }}>Select a node on the left.</p>;
  }
  const [kind, ...rest] = selected.split(":");

  if (kind === "dbroot") {
    const d = dbroots.find((x) => x.pda === rest[0]);
    if (!d) return <p>not found</p>;
    return (
      <div style={{ fontSize: FONT.body, lineHeight: 1.6, wordBreak: "break-all" }}>
        <div style={{ fontSize: FONT.brand, marginBottom: 8 }}>{dbrootLabel(d)}</div>
        <div>pda: <code style={{ fontSize: FONT.meta }}>{d.pda}</code></div>
        {d.creator && <div>creator: <code style={{ fontSize: FONT.meta }}>{d.creator}</code></div>}
        <div>tables: {d.tableSeeds.length} (global: {d.globalTableSeeds.length})</div>
        <div>table creators: {d.tableCreators.length || "anyone"}</div>
        <div>ext creators: {d.extCreators.length || "anyone"}</div>
      </div>
    );
  }

  if (kind === "table") {
    const match = findHint(dbroots, rest[0], rest[1]);
    if (!match) return <p>not found</p>;
    const { root, hint } = match;
    return (
      <div style={{ fontSize: FONT.body, lineHeight: 1.6, wordBreak: "break-all" }}>
        <div style={{ fontSize: FONT.brand, marginBottom: 8 }}>{hintLabel(hint)}</div>
        <div>dbroot: {dbrootLabel(root)}</div>
        <div>hint hex: <code style={{ fontSize: FONT.meta }}>{hint.hex}</code></div>
        {hint.tablePda && (
          <div style={{ marginTop: 8 }}>
            table pda: <code style={{ fontSize: FONT.meta }}>{hint.tablePda}</code>
            {/* Generic "open /{pda}" link disabled for now: for most tables
                visiting the PDA just lands on the belongs-to placeholder. The
                meaningful cases (e.g. a git_commits commit-table that maps to
                a deployed iqpages site) are reached through their own flows.
                Re-enable per-hint-type when there's something useful to open.
            <div style={{ marginTop: 8 }}>
              <Link href={`/${hint.tablePda}`} style={{ textDecoration: "underline" }}>
                open /{short(hint.tablePda)} →
              </Link>
            </div>
            */}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function TablePage() {
  const { data: dbroots, isLoading, error } = useQuery({
    queryKey: ["dbroots"],
    queryFn: fetchDbRoots,
    staleTime: 30 * 60_000,
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const tree = useMemo(() => (dbroots ? buildTree(dbroots, search) : []), [dbroots, search]);

  return (
    <PageShell>
      <Shell>
        <WindowHeader>
          <span>[ iqdb_console.exe ]</span>
        </WindowHeader>
        <WindowContent>
          {isLoading && <p style={{ fontSize: FONT.body }}>loading…</p>}
          {error && <p style={{ fontSize: FONT.body, color: "#b00020" }}>failed to load</p>}

          {dbroots && (
            <Split>
              <TreeCol>
                <GroupBox label="Tables">
                  <TextInput
                    placeholder="search table…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <TreeScroll>
                    {/* react95 TreeView renders one line per node; long hints
                        would push the column. Force every nested element to
                        wrap so the full label is visible inside the box. */}
                    <div className="iq-tree-wrap">
                      <TreeView
                        tree={tree}
                        onNodeSelect={(_e, id) => setSelected(String(id))}
                      />
                    </div>
                    <style>{`
                      .iq-tree-wrap * {
                        white-space: normal !important;
                        word-break: break-all !important;
                        overflow-wrap: anywhere !important;
                      }
                    `}</style>
                  </TreeScroll>
                </GroupBox>
              </TreeCol>
              <DetailsCol>
                <GroupBox label="Details">
                  <Details dbroots={dbroots} selected={selected} />
                </GroupBox>
                {(() => {
                  if (!selected) return null;
                  const [kind, dbrootPda, hex] = selected.split(":");
                  if (kind !== "table") return null;
                  const match = findHint(dbroots, dbrootPda, hex);
                  if (!match?.hint.tablePda) return null;
                  const rootLabel = resolveDbRootLabel(match.root.id, match.root.idHex);
                  return (
                    <GroupBox label="Rows">
                      <RowsPanel
                        tablePda={match.hint.tablePda}
                        dbrootLabel={rootLabel}
                        tableLabel={match.hint.label}
                      />
                    </GroupBox>
                  );
                })()}
              </DetailsCol>
            </Split>
          )}
        </WindowContent>
      </Shell>
    </PageShell>
  );
}
