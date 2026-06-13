// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent · Duty 1 — Chat response formatter.
 *
 * Turns the typed audit payload from adminAgentAudit.ts into clean,
 * human-readable chat blocks suitable for the Ask nAItive AI surface.
 * Output is intentionally plain markdown so the existing chat renderer
 * displays it without bespoke UI work.
 */

import type { DealAudit, ItemFinding } from "./adminAgentAudit.ts";

function fmtRelative(iso: string | null, bd: number | null): string {
  if (!iso) return "no post-creation update recorded";
  if (bd == null) return "—";
  if (bd === 0) return "updated today";
  if (bd === 1) return "1 business day ago";
  return `${bd} business days ago`;
}

function statusTag(item: ItemFinding): string {
  if (item.review_status === "fresh") return "current";
  if (item.review_status === "no_post_creation_update_recorded") {
    return "no post-creation update recorded";
  }
  return "may need review";
}

export function formatDealBlock(audit: DealAudit): string {
  const lines: string[] = [];
  lines.push(`**${audit.deal_name}** · stage: ${audit.stage ?? "—"} · status: ${audit.status ?? "—"}`);
  const flagged = audit.items.filter((i) =>
    i.review_status !== "fresh" && !i.field.startsWith("funding_source:")
  );
  if (flagged.length === 0) {
    lines.push("- All critical items are current.");
  } else {
    for (const item of flagged) {
      if (item.field === "funding_sources") {
        const lenderRows = audit.items.filter(
          (i) => i.field.startsWith("funding_source:") && i.review_status !== "fresh",
        );
        lines.push(`- **Funding Sources** — ${statusTag(item)}`);
        for (const l of lenderRows) {
          lines.push(`    - ${l.label}: ${statusTag(l)} (${fmtRelative(l.last_updated_at, l.business_days_since_last_update)})`);
        }
      } else {
        lines.push(`- **${item.label}** — ${statusTag(item)} (${fmtRelative(item.last_updated_at, item.business_days_since_last_update)})`);
      }
    }
  }
  lines.push("");
  lines.push(`What would you like to do on **${audit.deal_name}** — update, create a follow-up, or leave each item unchanged?`);
  return lines.join("\n");
}

export function formatPortfolioBlocks(opts: {
  summarySentence: string;
  page: DealAudit[];
  showMore: boolean;
  nextOffset: number | null;
}): string {
  const out: string[] = [opts.summarySentence, ""];
  for (const a of opts.page) {
    out.push(formatDealBlock(a));
    out.push("");
  }
  if (opts.showMore && opts.nextOffset != null) {
    out.push(`_Show more — ask "show more" to see the next ${opts.page.length} deal(s)._`);
  }
  return out.join("\n");
}
