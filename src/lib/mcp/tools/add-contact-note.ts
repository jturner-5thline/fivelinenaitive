import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { noteInput, runCrmNote } from "../crmRecordEdits";

export default defineTool({
  name: "add_contact_note",
  title: "Add contact note",
  description: "Add a dated note to a CRM contact's activity history (shown on the contact page). Pass idempotency_key so retries return the existing note instead of creating a duplicate.",
  inputSchema: { contact_id: z.string().uuid(), ...noteInput },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ contact_id, ...rest }, ctx) => runCrmNote("contact", contact_id, rest, ctx),
});
