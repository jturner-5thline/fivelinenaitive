/**
 * Shared attachment storage for MCP: resolve a target (lender, deal, contact,
 * company) visible to the caller, store bytes under the caller's own storage
 * folder, skip exact duplicates (same name and size on the same record) and
 * create the attachment row the app's attachment lists read.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guessContentType, MAX_ATTACHMENT_BYTES } from "./lenderAttachments";
import { writeLenderRelated } from "./lenderRelatedWrites";

export const ATTACHMENT_TARGET_TYPES = ["lender", "deal", "contact", "company"] as const;
export type AttachmentTargetType = (typeof ATTACHMENT_TARGET_TYPES)[number];

export const attachmentTargetSchema = {
  target_type: z.enum(ATTACHMENT_TARGET_TYPES).describe("Record type to attach to."),
  target_id: z.string().uuid().describe("master_lenders.id, deals.id, contacts.id or crm_companies.id."),
};

const CONFIG: Record<AttachmentTargetType, { bucket: string; table: string; fk: string; lookup: string }> = {
  lender: { bucket: "lender-attachments", table: "lender_attachments", fk: "lender_name", lookup: "master_lenders" },
  deal: { bucket: "deal-attachments", table: "deal_attachments", fk: "deal_id", lookup: "deals" },
  contact: { bucket: "crm-contact-attachments", table: "crm_contact_attachments", fk: "contact_id", lookup: "contacts" },
  company: { bucket: "crm-company-attachments", table: "crm_company_attachments", fk: "crm_company_id", lookup: "crm_companies" },
};

export interface ResolvedTarget { type: AttachmentTargetType; id: string; name: string; companyId: string | null; bucket: string; folder: string }

export async function resolveAttachmentTarget(sb: SupabaseClient, userId: string, type: AttachmentTargetType, id: string): Promise<ResolvedTarget> {
  const cfg = CONFIG[type];
  const select = type === "lender" ? "id, name, company_id" : type === "deal" ? "id, company, company_id" : type === "contact" ? "id, full_name, org_company_id" : "id, name, org_company_id";
  const { data, error } = await sb.from(cfg.lookup).select(select).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${type} ${id} not found (or not visible to you).`);
  const row = data as unknown as Record<string, string | null>;
  const name = String(row.name ?? row.company ?? row.full_name ?? id);
  if (type === "lender" && !row.company_id) throw new Error("This funding source has no workspace, so attachments cannot be stored for it.");
  // Storage policies require the caller's user id as the first folder; deal/contact/company paths carry the record id next.
  const folder = type === "lender" ? `${userId}/${name}` : `${userId}/${id}`;
  return { type, id, name, companyId: row.company_id ?? row.org_company_id ?? null, bucket: cfg.bucket, folder };
}

export function storedFileName(fileName: string): string {
  const ext = (fileName.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "") || "bin";
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
}

/** Only document/image types matching the extension are accepted; never active content. */
export function checkFile(fileName: string, size: number): { contentType: string } {
  const contentType = guessContentType(fileName);
  if (contentType === "application/octet-stream") throw new Error("file_name: unsupported file type (use pdf, doc(x), xls(x), ppt(x), csv, txt, md, png or jpg).");
  if (!Number.isFinite(size) || size <= 0) throw new Error("File is empty.");
  if (size > MAX_ATTACHMENT_BYTES) throw new Error("File is larger than 20 MB.");
  return { contentType };
}

export async function findDuplicateAttachment(sb: SupabaseClient, target: ResolvedTarget, fileName: string, size: number) {
  const cfg = CONFIG[target.type];
  let q = sb.from(cfg.table).select("id, name, size_bytes, created_at").eq("name", fileName).eq("size_bytes", size).limit(1);
  q = target.type === "lender" ? q.eq("lender_name", target.name).eq("company_id", target.companyId) : q.eq(cfg.fk, target.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
}

export async function createAttachmentRow(
  sb: SupabaseClient, userId: string, target: ResolvedTarget,
  file: { name: string; path: string; size: number; contentType: string; category: string; source?: string; changeReason?: string; origin: string },
): Promise<Record<string, unknown>> {
  if (target.type === "lender") {
    const res = await writeLenderRelated(sb as never, "lender_attachments", "create", target.id, undefined,
      { name: file.name, file_path: file.path, content_type: file.contentType, size_bytes: file.size, category: file.category }, false, file.source, file.changeReason);
    if ("isError" in res) throw new Error(res.content[0].text);
    return JSON.parse(res.content[0].text).record;
  }
  const cfg = CONFIG[target.type];
  const row: Record<string, unknown> = { [cfg.fk]: target.id, user_id: userId, name: file.name, file_path: file.path, content_type: file.contentType, size_bytes: file.size, category: file.category };
  if (target.type === "deal") row.source = file.origin;
  const { data, error } = await sb.from(cfg.table).insert(row).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Attachment row was not created (permission denied).");
  return data as Record<string, unknown>;
}

export async function deleteAttachmentRow(sb: SupabaseClient, target: ResolvedTarget, rowId: string) {
  if (target.type === "lender") {
    await writeLenderRelated(sb as never, "lender_attachments", "delete", target.id, rowId, {}, true, "mcp", "Rolled back: uploaded file did not match the upload request");
    return;
  }
  await sb.from(CONFIG[target.type].table).delete().eq("id", rowId);
}

/** Upload bytes and create the row; skips exact duplicates. Used by Gmail/Drive imports. */
export async function storeAttachmentBytes(
  sb: SupabaseClient, userId: string, target: ResolvedTarget, fileName: string, bytes: Uint8Array,
  category: string, origin: string, source?: string, changeReason?: string,
) {
  const { contentType } = checkFile(fileName, bytes.byteLength);
  const dup = await findDuplicateAttachment(sb, target, fileName, bytes.byteLength);
  if (dup) return { skipped: true, reason: "A file with the same name and size is already attached to this record.", existing_attachment: dup };
  const path = `${target.folder}/${storedFileName(fileName)}`;
  const { error: upErr } = await sb.storage.from(target.bucket).upload(path, bytes, { contentType });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  try {
    const row = await createAttachmentRow(sb, userId, target, { name: fileName, path, size: bytes.byteLength, contentType, category, source, changeReason, origin });
    return { skipped: false, attachment: row };
  } catch (e) {
    await sb.storage.from(target.bucket).remove([path]);
    throw e;
  }
}

export interface UploadToken { v: 1; t: AttachmentTargetType; id: string; p: string; n: string; s: number; c: string; exp: number }

export function encodeUploadToken(t: UploadToken): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(t)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeUploadToken(raw: string): UploadToken {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const t = JSON.parse(decodeURIComponent(escape(atob(b64 + "===".slice((b64.length + 3) % 4))))) as UploadToken;
    if (t.v !== 1 || !ATTACHMENT_TARGET_TYPES.includes(t.t) || typeof t.p !== "string" || typeof t.n !== "string" || typeof t.s !== "number") throw new Error("bad");
    return t;
  } catch {
    throw new Error("upload_token is not valid.");
  }
}

export function decodeBase64Bytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
