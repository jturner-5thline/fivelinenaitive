/**
 * Funding-source matching for Claap meetings. A lender is suggested only on
 * (a) a participant email domain that belongs to exactly one of the
 * workspace's lenders' contacts, or (b) the lender's exact full name appearing
 * as whole words in the title. Fuzzy title similarity and participant-name
 * guesses are not used: they suggested unrelated calls (e.g. onboarding calls).
 * When a domain is shared by several lenders, an exact title name picks one;
 * otherwise no lender is suggested.
 */
export interface LenderRef { id: string; name: string }
export interface DomainContact { lender_id: string; email: string | null }
export interface LenderMatch { lenderId: string; lenderName: string; source: string; confidence: number }

export function normalizeMatchName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** True when the full lender name appears in the title on word boundaries. */
export function titleHasExactName(title: string, lenderName: string): boolean {
  const n = normalizeMatchName(lenderName);
  const t = normalizeMatchName(title);
  if (n.length < 4 || !t) return false;
  return ` ${t} `.includes(` ${n} `);
}

export function domainOf(email: string | null | undefined): string | null {
  const at = String(email ?? "").lastIndexOf("@");
  return at > 0 ? String(email).slice(at + 1).trim().toLowerCase() || null : null;
}

export function pickLenderMatch(input: {
  title: string | null;
  externalDomains: string[];
  lenders: LenderRef[];
  domainContacts: DomainContact[];
}): LenderMatch | null {
  const lenders = new Map(input.lenders.map((l) => [l.id, l]));
  const title = input.title ?? "";
  const titleHits = title ? input.lenders.filter((l) => titleHasExactName(title, l.name)) : [];
  const domains = new Set(input.externalDomains.map((d) => d.toLowerCase()));
  const byDomain = new Map<string, Set<string>>();
  for (const c of input.domainContacts) {
    const d = domainOf(c.email);
    if (!d || !domains.has(d) || !lenders.has(c.lender_id)) continue;
    if (!byDomain.has(d)) byDomain.set(d, new Set());
    byDomain.get(d)!.add(c.lender_id);
  }
  for (const [domain, ids] of byDomain) {
    if (ids.size === 1) {
      const l = lenders.get([...ids][0])!;
      return { lenderId: l.id, lenderName: l.name, source: `Lender contact domain match: ${domain}`, confidence: 70 };
    }
    const exact = titleHits.filter((l) => ids.has(l.id));
    if (exact.length === 1) return { lenderId: exact[0].id, lenderName: exact[0].name, source: `Shared domain ${domain} + exact lender name in title: "${exact[0].name}"`, confidence: 80 };
  }
  // Longest exact name wins so "First National Capital" beats "First National".
  if (titleHits.length) {
    const best = [...titleHits].sort((a, b) => normalizeMatchName(b.name).length - normalizeMatchName(a.name).length);
    if (best.length === 1 || normalizeMatchName(best[0].name).length > normalizeMatchName(best[1].name).length) {
      return { lenderId: best[0].id, lenderName: best[0].name, source: `Exact lender name in title: "${best[0].name}"`, confidence: 75 };
    }
  }
  return null;
}

// deno-lint-ignore no-explicit-any
type QueryClient = { from: (t: string) => any };

/** Load a workspace's lenders (all pages) and the lender contacts on the given domains. */
export async function loadLenderMatchInputs(client: QueryClient, companyId: string, externalDomains: string[]) {
  const lenders: LenderRef[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await client.from("master_lenders").select("id, name").eq("company_id", companyId).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LenderRef[];
    lenders.push(...rows);
    if (rows.length < 1000) break;
  }
  const ids = new Set(lenders.map((l) => l.id));
  let domainContacts: DomainContact[] = [];
  for (const domain of externalDomains.slice(0, 20)) {
    const { data } = await client.from("lender_contacts").select("lender_id, email").ilike("email", `%@${domain}`).limit(200);
    domainContacts = domainContacts.concat(((data ?? []) as DomainContact[]).filter((c) => ids.has(c.lender_id)));
  }
  return { lenders, domainContacts };
}
