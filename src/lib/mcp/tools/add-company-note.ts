import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { noteInput, runCrmNote } from "../crmRecordEdits";

export default defineTool({
  name: "add_company_note",
  title: "Add company note",
  description: "Add a dated note to a CRM company's activity history (shown on the company page). Pass idempotency_key so retries return the existing note instead of creating a duplicate.",
  inputSchema: { company_id: z.string().uuid(), ...noteInput },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ company_id, ...rest }, ctx) => runCrmNote("company", company_id, rest, ctx),
});
