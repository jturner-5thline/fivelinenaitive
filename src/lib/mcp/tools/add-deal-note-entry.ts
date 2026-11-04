import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { entryToHtml } from "../dealNoteEntry";

export default defineTool({
  name: "add_deal_note_entry",
  title: "Add deal note entry",
  description:
    "Prepend or append an entry to a deal's Deal Space note (the notes pop-up), matched by title (default 'Q&A Notes'), creating the note if missing. Never replaces existing content; saves a version and logs deal activity. Use idempotency_key (e.g. a Claap recording ID) to avoid duplicate entries.",
  inputSchema: {
    deal_id: z.string().uuid(),
    title: z.string().trim().min(1).max(200).default("Q&A Notes").describe("Note title, matched case-insensitively and trimmed."),
    entry: z.string().trim().min(1, "Entry cannot be empty.").max(50000),
    format: z.enum(["text", "html"]).default("text").describe("text (default): plain text; '- ' lines become bullets, '# ' lines headings, **bold** supported. html: TipTap-compatible HTML stored as-is."),
    mode: z.enum(["prepend", "append"]).default("prepend"),
    create_if_missing: z.boolean().default(true),
    idempotency_key: z.string().trim().min(1).max(200).optional(),
    source: z.string().trim().min(1).max(100).default("Claude agent").describe("Attribution recorded in the activity log."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.rpc("add_deal_note_entry", {
      _deal_id: args.deal_id,
      _title: args.title,
      _entry_html: entryToHtml(args.entry, args.format),
      _mode: args.mode,
      _create_if_missing: args.create_if_missing,
      _idempotency_key: args.idempotency_key ?? null,
      _source: args.source,
    });
    if (error) return errorResult(error.message);
    const res = (data ?? {}) as Record<string, unknown>;
    if (res.status === "ambiguous") {
      return { ...textResult({ error: "Multiple notes match this title; nothing was written.", ...res }, res), isError: true as const };
    }
    if (res.status === "not_found") return errorResult(`No note titled "${args.title}" on this deal and create_if_missing is false.`);
    return textResult(res, res);
  },
});
