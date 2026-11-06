import { z } from "zod";

export const outstandingStatus = z.enum(["requested", "received", "submitted"]);
export const outstandingPriority = z.enum(["normal", "high", "urgent"]);
const date = z.string().date();
const metadata = z.record(z.string(), z.unknown()).refine(value => JSON.stringify(value).length <= 20000, "Metadata must not exceed 20,000 characters.");
export const outstandingCreateFields = {
  description: z.string().trim().min(1).max(2000),
  lender_id: z.string().uuid().optional().describe("deal_lenders.id attached to this deal, NOT master_lenders.id."),
  status: outstandingStatus.default("requested"),
  priority: outstandingPriority.default("normal"),
  due_date: date.optional(),
  eta: date.optional(),
  assigned_to: z.string().max(500).optional().describe("Opaque assignment text; the current widget has no assignee selector."),
  notes: z.string().max(10000).optional(),
  source_metadata: metadata.optional(),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
};
export const outstandingUpdateFields = {
  description: outstandingCreateFields.description.optional(),
  status: outstandingStatus.optional(),
  priority: outstandingPriority.optional(),
  due_date: date.nullable().optional(),
  eta: date.nullable().optional(),
  assigned_to: z.string().max(500).nullable().optional(),
  lender_id: z.string().uuid().nullable().optional().describe("deal_lenders.id attached to the item's deal; null clears."),
  notes: z.string().max(10000).nullable().optional(),
  is_archived: z.boolean().optional(),
  source_metadata_merge: metadata.optional(),
  append_note: z.string().trim().min(1).max(10000).optional().describe("Append a UTC-dated YYYY-MM-DD: text line. Cannot be combined with notes."),
};