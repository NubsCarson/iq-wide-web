const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", json: "application/json", txt: "text/plain", md: "text/plain", html: "text/html", pdf: "application/pdf",
};

/** Metadata is untrusted. Encoding is inferred because older writers omit it;
 * callers expose the stored string as well so ambiguous text remains readable. */
export function decodePayload(payload: { data?: string | null; metadata?: string }, ext?: string) {
  let meta: Record<string, unknown> = {};
  try { const value = JSON.parse(payload.metadata ?? "{}"); if (value && typeof value === "object" && !Array.isArray(value)) meta = value; } catch { /* Show files with malformed metadata too. */ }
  const filename = typeof meta.filename === "string" && meta.filename ? meta.filename : "download";
  const declared = typeof meta.filetype === "string" ? meta.filetype.toLowerCase().split(";")[0].trim() : "";
  const mime = declared && declared !== "application/octet-stream" ? declared : EXT_MIME[filename.split(".").pop()?.toLowerCase() ?? ""] ?? EXT_MIME[ext?.toLowerCase().replace(/^\./, "") ?? ""] ?? "application/octet-stream";
  const raw = payload.data ?? "";
  const candidate = raw.startsWith("data:") ? raw.match(/^data:[^,]*;base64,([\s\S]*)$/)?.[1] ?? "" : raw;
  let base64: string | null = null;
  let decoded: string | null = null;
  if (candidate && candidate.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(candidate)) {
    try {
      const binary = atob(candidate);
      if (btoa(binary) === candidate) {
        base64 = candidate;
        try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))); } catch { /* Binary file. */ }
      }
    } catch { /* Preserve invalid base64 as plain text. */ }
  }
  const isText = mime.startsWith("text/") || mime === "application/json" || mime === "image/svg+xml";
  // A short plain word can also be syntactically valid base64. Do not
  // destroy declared text when the inferred bytes are not UTF-8.
  if (isText && decoded === null && !raw.startsWith("data:")) base64 = null;
  let text = isText ? (decoded ?? (base64 ? null : raw)) : null;
  if (text !== null && mime === "application/json") { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Preserve invalid JSON. */ } }
  return { filename, mime, text, base64, encoded: decoded !== null };
}
