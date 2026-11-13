import { defineTool } from "@lovable.dev/mcp-js";
import { aliasSchema, mutateDealRelationship } from "../dealRelationships";

export default defineTool({
  name: "remove_deal_alias", title: "Remove deal alias",
  description: "Remove only the matching alias on this deal, ignoring case and collapsing whitespace. Already-absent retries succeed without duplicate activity. Caller-scoped mutation and MCP deal activity are atomic. Requires user approval.",
  inputSchema: aliasSchema,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => mutateDealRelationship("remove_deal_alias", input, ctx),
});