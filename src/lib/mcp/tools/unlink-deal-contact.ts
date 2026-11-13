import { defineTool } from "@lovable.dev/mcp-js";
import { contactLinkSchema, mutateDealRelationship } from "../dealRelationships";

export default defineTool({
  name: "unlink_deal_contact", title: "Unlink deal contact",
  description: "Remove only an existing contact's contact_deals link by deal_id and contact_id or email; never delete the contact. Caller-scoped, atomic MCP deal activity only when changed; already-unlinked retries succeed as no-ops. Requires user approval.",
  inputSchema: contactLinkSchema,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => mutateDealRelationship("unlink_deal_contact", input, ctx),
});