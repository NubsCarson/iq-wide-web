"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Window, WindowContent, WindowHeader } from "react95";
import { TransactionView } from "@/components/transaction/transaction-view";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { AppPanel } from "@/components/app-panel/app-panel";
import { AppHeader } from "@/components/ui/app-header";
import { AppFooter } from "@/components/ui/app-footer";
import { PageContainer, ResponsiveGrid } from "@/components/ui/layout";
import { FONT } from "@/lib/ui/typography";
import { IQGIT_URL } from "@/lib/constants";
import { useResolve } from "@/resolver/use-resolve";
import type { DbRoot, TableHint } from "@/resolver/types";

function MessageWindow({ title, body, color }: { title: string; body: string; color?: string }) {
  return (
    <PageContainer>
      <AppHeader showBack />
      <Window style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <WindowHeader><span>{title}</span></WindowHeader>
        <WindowContent>
          <p style={{ padding: 16, margin: 0, fontSize: FONT.body, color: color ?? "inherit" }}>
            {body}
          </p>
        </WindowContent>
      </Window>
      <AppFooter />
    </PageContainer>
  );
}

// Matched a table PDA on a known DbRoot. Today only the git case is wired up;
// other dApps fall through to the dev belongs-to placeholder.
//
// iq-wide-web is open source — if you run a dApp and add a new DbRoot, please
// PR a case here so your tables render the way you want.
function DbRootMatch({ dbroot, hint }: { dbroot: DbRoot; hint: TableHint }) {
  // A git_commits commit-table hint always looks like "git_commits:OWNER:REPO".
  // Non-git matches drop straight to belongs-to.
  const gitParts = hint.label?.startsWith("git_commits:") ? hint.label.split(":") : null;
  if (gitParts && gitParts.length === 3) {
    return <GitMatch owner={gitParts[1]} repo={gitParts[2]} />;
  }

  const dApp = dbroot.id ?? dbroot.pda;
  const table = hint.label ?? hint.hex;
  return (
    <PageContainer>
      <AppHeader showBack />
      <Window style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <WindowHeader><span>belongs to</span></WindowHeader>
        <WindowContent>
          <p style={{ padding: 16, margin: 0, fontSize: FONT.body }}>
            This address belongs to <strong>{dApp}</strong> — table &quot;{table}&quot;.
          </p>
          <p style={{ padding: "0 16px 16px", margin: 0, fontSize: FONT.body }}>
            See it in the <Link href="/table" style={{ textDecoration: "underline" }}>tables explorer</Link>.
          </p>
        </WindowContent>
      </Window>
      <AppFooter />
    </PageContainer>
  );
}

// A git repo that landed on the client page. Deployed iqpages sites are
// already intercepted by src/proxy.ts before they reach us, so anything we
// see here is an un-deployed repo — hand it off to the git frontend.
function GitMatch({ owner, repo }: { owner: string; repo: string }) {
  const target = `${IQGIT_URL}/${owner}/${repo}`;
  useEffect(() => {
    window.location.href = target;
  }, [target]);
  return <MessageWindow title="git repo" body={`Sending you to ${target}`} />;
}

export default function IdentPage() {
  const params = useParams<{ ident: string }>();
  const ident = params?.ident ?? "";
  const { data: resolved, isLoading } = useResolve(ident);

  if (isLoading || !resolved) {
    return <MessageWindow title="resolving…" body={`Looking up ${ident}`} />;
  }

  switch (resolved.kind) {
    case "dbroot-table":
      return <DbRootMatch dbroot={resolved.dbroot} hint={resolved.hint} />;

    case "tx":
      return <TransactionView signature={resolved.signature} />;

    case "not-found":
      return <MessageWindow title="404" body={`Nothing found for ${ident}.`} color="#b00020" />;

    case "wallet":
      return (
        <PageContainer>
          <AppHeader showBack />
          <ResponsiveGrid>
            <ProfilePanel walletAddress={resolved.pubkey} />
            <AppPanel walletAddress={resolved.pubkey} />
          </ResponsiveGrid>
          <AppFooter viewing={resolved.pubkey} />
        </PageContainer>
      );
  }
}
