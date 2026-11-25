// Pure helpers for Active-pipeline deal update emails (testable without network).
export const RECIPIENTS = ["jturner@5thline.co", "jmoffitt@5thline.co", "swilliams@5thline.co"];
export const BATCH_WINDOW_MINUTES = 40;

export interface QueueRow {
  id: string;
  deal_id: string;
  changes: Record<string, { from: string | null; to: string | null }>;
  changed_by: string | null;
  created_at: string;
}
export interface DealSnapshot { id: string; company: string; stage: string | null; status: string | null; notes: string | null }

/** A batch is ready once its oldest pending update is at least 40 minutes old. */
export function isBatchReady(oldestCreatedAt: string | null, now: Date): boolean {
  if (!oldestCreatedAt) return false;
  return now.getTime() - new Date(oldestCreatedAt).getTime() >= BATCH_WINDOW_MINUTES * 60_000;
}

export function buildSubject(dealNames: string[]): string {
  return dealNames.length === 1 ? `${dealNames[0]} Has Been Updated` : `${dealNames.length} Deals have been updated`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function stripHtml(s: string | null): string {
  return String(s ?? "").replace(/<\/p>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n").trim();
}
export function prettyStatus(v: string | null): string {
  if (!v) return "—";
  return v.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export function describeChange(field: string, c: { from: string | null; to: string | null }, stageLabel: (id: string | null) => string, deal = "Deal"): string {
  if (field === "stage") return `${deal} moved into ${stageLabel(c.to)}`;
  if (field === "status") return `${deal} status was updated to ${prettyStatus(c.to)}`;
  const note = stripHtml(c.to);
  if (!note) return `${deal} status note was cleared`;
  return `${deal} status note was updated to "${note.length > 200 ? note.slice(0, 200) + "…" : note}"`;
}

export function buildEmailHtml(
  deals: DealSnapshot[], rowsByDeal: Record<string, QueueRow[]>,
  stageLabel: (id: string | null) => string, nameOf: (uid: string | null) => string | null, appUrl: string,
): string {
  const blocks = deals.map((d) => {
    const items = (rowsByDeal[d.id] ?? []).flatMap((r) => Object.entries(r.changes).map(([f, c]) => {
      const who = nameOf(r.changed_by);
      return `<li style="margin:2px 0">${esc(describeChange(f, c, stageLabel, d.company))} <span style="color:#6b7280">— ${esc(fmtTime(r.created_at))}${who ? ` by ${esc(who)}` : ""}</span></li>`;
    })).join("");
    const note = stripHtml(d.notes);
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
<h2 style="margin:0 0 8px;font-size:17px"><a href="${appUrl}/deal/${d.id}" style="color:#0B1526">${esc(d.company)}</a></h2>
<p style="margin:0 0 4px;font-size:13px;font-weight:600">What changed</p><ul style="margin:0 0 12px;padding-left:18px;font-size:13px">${items}</ul>
<p style="margin:0 0 4px;font-size:13px;font-weight:600">Current</p>
<table style="font-size:13px;border-collapse:collapse"><tr><td style="color:#6b7280;padding:2px 12px 2px 0">Stage</td><td>${esc(stageLabel(d.stage))}</td></tr>
<tr><td style="color:#6b7280;padding:2px 12px 2px 0">Status</td><td>${esc(prettyStatus(d.status))}</td></tr>
<tr><td style="color:#6b7280;padding:2px 12px 2px 0;vertical-align:top">Status Note</td><td style="white-space:pre-wrap">${esc(note || "—")}</td></tr></table></div>`;
  }).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">${blocks}<p style="font-size:11px;color:#9ca3af">Deal Updates — Active pipeline.</p></div>`;
}
