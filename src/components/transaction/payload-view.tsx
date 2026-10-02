"use client";

import { useState } from "react";
import { decodePayload } from "@/lib/transaction-payload";

// The IQLabs console look — mirrors the gateway's /render SVG (Win95 green-on-
// black CRT) but as a styled <pre> so it works for text *and* JSON. Used as the
// PayloadView fallback whenever the bytes aren't an image.
const IQ_GREEN = "#41FF00";
const IQ_GREEN_DARK = "#006400";
const consoleShellStyle: React.CSSProperties = {
  background: "#c0c0c0",
  border: "2px solid #c0c0c0",
  borderTopColor: "#dfdfdf",
  borderLeftColor: "#dfdfdf",
  borderBottomColor: "#404040",
  borderRightColor: "#404040",
  margin: "4px 0",
  minWidth: 0,
};
const consoleTitleBarStyle: React.CSSProperties = {
  background: `linear-gradient(to right, #000 0%, ${IQ_GREEN_DARK} 100%)`,
  color: IQ_GREEN,
  fontFamily: "'DejaVu Sans Mono', ui-monospace, monospace",
  fontWeight: "bold",
  fontSize: 13,
  padding: "4px 8px",
  textShadow: `0 0 4px ${IQ_GREEN}`,
};
const consoleBodyStyle: React.CSSProperties = {
  background: "#0a0a0a",
  color: IQ_GREEN,
  fontFamily: "'DejaVu Sans Mono', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 1.5,
  padding: 12,
  margin: 0,
  maxHeight: 320,
  overflow: "auto",
  whiteSpace: "pre",
  wordBreak: "normal",
  textShadow: `0 0 3px ${IQ_GREEN}`,
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0 1px, rgba(65,255,0,0.04) 1px 2px, transparent 2px 4px)",
};
const consoleFooterStyle: React.CSSProperties = {
  background: "#c0c0c0",
  color: "#000",
  fontFamily: "'DejaVu Sans Mono', ui-monospace, monospace",
  fontSize: 11,
  padding: "3px 8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

function ConsoleView({
  title,
  body,
  download,
}: {
  title: string;
  body: string;
  download?: { href: string; filename: string };
}) {
  return (
    <div style={consoleShellStyle}>
      <div style={consoleTitleBarStyle}>IQLabs — {title}</div>
      <pre tabIndex={0} aria-label={`${title} content`} style={consoleBodyStyle}>{body}</pre>
      <div style={consoleFooterStyle}>
        <span>inscribed on solana via iqlabs</span>
        {download && (
          <a href={download.href} download={download.filename} style={{ color: "#000", textDecoration: "underline" }}>
            download
          </a>
        )}
      </div>
    </div>
  );
}

export function PayloadView({ payload, ext }: { payload: { data?: string | null; metadata?: string }; ext?: string }) {
  const { filename, mime, text, encoded, base64 } = decodePayload(payload, ext);
  const [stored, setStored] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const download = { href: base64 ? `data:application/octet-stream;base64,${base64}` : `data:application/octet-stream;charset=utf-8,${encodeURIComponent(payload.data ?? "")}`, filename };
  // Only raster images render inline. HTML and SVG never execute in this page.
  const image = /^image\/(png|jpeg|gif|webp|avif)$/.test(mime) && base64;
  return <>
    {image && !imageFailed ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:${mime};base64,${base64}`} alt={filename} onError={() => setImageFailed(true)} style={{ maxWidth: "100%", maxHeight: 480, display: "block" }} />
      <a href={download.href} download={filename}>Download {filename}</a>
    </> : <ConsoleView title={filename} body={stored ? payload.data ?? "" : text ?? `Preview unavailable (${mime}). Download the file to inspect it.`} download={download} />}
    {encoded && text !== null && <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={stored} onChange={e => setStored(e.target.checked)} /> Show stored data (base64)</label>}
  </>;
}
