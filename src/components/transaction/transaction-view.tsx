"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Window, WindowHeader, WindowContent } from "react95";
import { AppHeader } from "@/components/ui/app-header";
import { AppFooter } from "@/components/ui/app-footer";
import { PageContainer } from "@/components/ui/layout";
import { readCodeInGW } from "@/lib/gateway/reader";
import { PayloadView } from "./payload-view";

export function TransactionView({ signature }: { signature: string }) {
  const file = useQuery({ queryKey: ["data", signature], queryFn: () => readCodeInGW(signature), staleTime: Infinity, retry: 1 });
  return <PageContainer>
    <AppHeader showBack />
    <Window style={{ width: "100%", maxWidth: 800, margin: "0 auto", minWidth: 0 }}>
      <WindowHeader><h1 style={{ margin: 0, fontSize: "inherit" }}>Inscribed file</h1></WindowHeader>
      <WindowContent>
        <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere", display: "block", marginBottom: 16 }}>View transaction on Solscan</a>
        {file.isPending && <p role="status">Loading inscription…</p>}
        {file.isError && <div role="alert"><p>Could not load this inscription. The gateway may be unavailable, or this transaction may not contain an IQ file.</p><Button onClick={() => file.refetch()}>Retry</Button></div>}
        {file.data && (file.data.data === null ? <p>No inscribed file was returned for this transaction.</p> : <PayloadView key={signature} payload={file.data} />)}
        {file.data && <details style={{ marginTop: 16 }}><summary>Metadata</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{file.data.metadata || "No metadata"}</pre></details>}
      </WindowContent>
    </Window>
    <AppFooter />
  </PageContainer>;
}
