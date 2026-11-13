import { defineTool } from "@lovable.dev/mcp-js";
import { aliasSchema, mutateDealRelationship } from "../dealRelationships";

export default defineTool({
  name: "add_deal_alias", title: "Add deal alias",
  description: "Add a deal alias with lowercased, trimmed, collapsed-whitespace alias_normalized. Unique per deal; equivalent retries return the existing alias without duplicate activity. Caller-scoped mutation and MCP deal activity are atomic. Requires user approval.",
  inputSchema: aliasSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => mutateDealRelationship("add_deal_alias", input, ctx),
});