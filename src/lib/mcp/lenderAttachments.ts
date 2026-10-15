/** Shared constants for the lender attachment MCP tools (mirror useLenderAttachments). */
export const LENDER_ATTACHMENT_BUCKET = "lender-attachments";

export const LENDER_ATTACHMENT_CATEGORIES = [
  "general",
  "nda",
  "marketing_materials",
  "contracts",
  "presentations",
  "due_diligence",
  "term_sheets",
  "correspondence",
  "referral_agreement",
  "other",
] as const;

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
