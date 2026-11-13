import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { contactLinkSchema, mutateDealRelationship } from "../dealRelationships";

export default defineTool({
  name: "link_deal_contact", title: "Link deal contact",
  description: "Link an existing workspace contact to a deal by contact_id or email. Optionally set or update role; omitted role is preserved. Returns the link plus contact name, email and company. Caller-scoped, atomic MCP deal activity; identical retries are no-ops. Never creates a contact. Requires user approval.",
  inputSchema: { ...contactLinkSchema, role: z.string().max(200).optional().describe("Deal-specific contact role, e.g. Client – CFO; only changed when supplied.") },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => mutateDealRelationship("link_deal_contact", input, ctx),
});