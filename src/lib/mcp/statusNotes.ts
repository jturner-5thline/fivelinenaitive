import type { ToolContext } from "@lovable.dev/mcp-js";
import type { supabaseForUser } from "./supabase";

type Sb = ReturnType<typeof supabaseForUser>;
export type NoteMode = "prepend" | "append" | "replace";

const EMPTY = new Set(["", "<p></p>", "<p><br></p>"]);
const isEmpty = (s: string | null | undefined) => EMPTY.has(String(s ?? "").trim());

/** Convert plain text to the HTML paragraphs the Status Note box renders. HTML input is kept as-is. */
function toHtml(note: string): string {
  if (/<\/?(p|ul|ol|li|br|strong|em)\b/i.test(note)) return note;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return note.split(/\r?\n/).map((l) => (l.trim() ? `<p>${esc(l)}</p>` : "<p></p>")).join("");
}

function combine(existing: string, note: string, mode: NoteMode): string {
  const next = toHtml(note);
  if (mode === "replace" || isEmpty(existing)) return next;
  const sep = "<p></p>"; // one blank line
  return mode === "prepend" ? `${next}${sep}${existing}` : `${existing}${sep}${next}`;
}

/**
 * Write the deal's Status Note (deals.notes) exactly like the deal page does:
 * archive the previous note to deal_status_notes, bump notes_updated_at and
 * log to deal_activity. Runs under the caller's RLS.
 */
export async function writeDealStatusNote(
  sb: Sb,
  ctx: ToolContext,
  deal_id: string,
  note: string,
  mode: NoteMode,
  source: string,
): Promise<{ error: string } | { deal_id: string; notes: string; notes_updated_at: string }> {
  if (!note.trim()) return { error: "Note cannot be empty." };
  const { data: deal, error: readErr } = await sb.from("deals").select("id, notes").eq("id", deal_id).maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!deal) return { error: `Deal ${deal_id} not found or you do not have access to it.` };

  const existing = String((deal as { notes?: string | null }).notes ?? "");
  const updated = combine(existing, note, mode);
  const now = new Date().toISOString();

  const { data: row, error: updErr } = await sb
    .from("deals")
    .update({ notes: updated, notes_updated_at: now })
    .eq("id", deal_id)
    .select("id, notes, notes_updated_at")
    .maybeSingle();
  if (updErr) return { error: updErr.message };
  if (!row) return { error: `You do not have permission to edit deal ${deal_id}.` };

  const userId = ctx.getUserId?.() ?? null;
  if (!isEmpty(existing) && existing !== updated) {
    const { error } = await sb.from("deal_status_notes").insert({ deal_id, note: existing.trim(), user_id: userId });
    if (error) console.error("[status-note] history insert failed", error.message);
  }
  const { error: actErr } = await sb.from("deal_activity").insert({
    deal_id,
    user_id: userId,
    source,
    action_type: "status_note_updated",
    before: { notes: existing },
    after: { notes: updated, mode },
  });
  if (actErr) console.error("[status-note] activity insert failed", actErr.message);

  const r = row as { notes: string | null; notes_updated_at: string | null };
  return { deal_id, notes: r.notes ?? updated, notes_updated_at: r.notes_updated_at ?? now };
}
