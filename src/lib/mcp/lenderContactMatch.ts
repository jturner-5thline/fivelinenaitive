/** Duplicate detection for lender_contacts: same email (case-insensitive) or same normalized name. */
export function normalizePersonName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\b(mr|mrs|ms|dr|jr|sr|ii|iii)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function findExistingLenderContact<T extends { id: string; name: string | null; email: string | null }>(
  rows: T[], input: { name?: string | null; email?: string | null },
): T | null {
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const byEmail = rows.find((r) => r.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = normalizePersonName(input.name);
  if (name) {
    const byName = rows.find((r) => normalizePersonName(r.name) === name);
    // A same-name row with a different email is a different person.
    if (byName && !(email && byName.email && byName.email.trim().toLowerCase() !== email)) return byName;
  }
  return null;
}

/** Parse the structured conflict raised by mcp_write_lender_related. */
export function parseCrmLinkConflict(message: string): Record<string, unknown> | null {
  const i = message.indexOf("crm_contact_company_conflict:");
  if (i < 0) return null;
  try { return JSON.parse(message.slice(i + "crm_contact_company_conflict:".length)); } catch { return null; }
}
