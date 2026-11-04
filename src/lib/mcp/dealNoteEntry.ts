/**
 * Deal Space notes are stored as TipTap HTML. Convert an agent-supplied entry
 * to that format: HTML passes through, plain text/markdown-ish text is escaped
 * and turned into paragraphs and bullet lists so it renders in the notes pop-up.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function entryToHtml(entry: string, format: "text" | "html"): string {
  const trimmed = entry.trim();
  if (format === "html") return trimmed;
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li><p>${li}</p></li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet) { list.push(inline(bullet[1])); continue; }
    flush();
    if (!line) continue;
    out.push(heading ? `<h3>${inline(heading[1])}</h3>` : `<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}
