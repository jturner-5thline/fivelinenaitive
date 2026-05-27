/**
 * Resolves a QuickBooks customer record to its display label for "by client"
 * charts. 5th Line tracks loans / engagements by COMPANY, but QBO frequently
 * stores the customer as a person (guarantor / signer). Whenever a
 * `company_name` is populated on the QBO customer it wins — only when no
 * company is set do we fall back to the personal display name.
 *
 * Priority:
 *   1. qbo_customer.company_name
 *   2. qbo_customer.display_name (= invoices.customer_name)
 *   3. "Unknown"
 *
 * Rows that fall through to step 2 with a person name are surfaced in the
 * data-quality report at /mnt/documents/qbo-client-name-quality-report.csv
 * so the team can backfill `company_name` in QBO.
 */
export interface QboCustomerNameRow {
  qb_id: string | null;
  realm_id: string | null;
  display_name: string | null;
  company_name: string | null;
}

export function resolveQboClientLabel(
  customerName: string | null | undefined,
  customer: { company_name?: string | null; display_name?: string | null } | undefined | null,
): string {
  const company = customer?.company_name?.trim();
  if (company) return company;
  const display = customer?.display_name?.trim() || customerName?.trim();
  return display || 'Unknown';
}

export function buildQboCustomerNameMap(rows: QboCustomerNameRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.qb_id || !row.realm_id) continue;
    map.set(
      `${row.realm_id}:${row.qb_id}`,
      resolveQboClientLabel(row.display_name, row),
    );
  }
  return map;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scott (2026-05-27): the Controller "Revenue by Client" charts surfaced
 * "Steven Adler" — a personal guarantor whose QBO Customer record has no
 * CompanyName and no linked CRM Company. The enriched resolver below adds two
 * fallback passes so individuals never leak onto the chart axis.
 *
 *   1. customer.company_name                       (QBO native company)
 *   2. CRM Company lookup by fuzzy customer name   (deal / contact match)
 *   3. customer.display_name when it looks like a COMPANY (Inc / LLC / Corp / …)
 *   4. "Other / Individuals" rollup bucket         (final fallback)
 * ────────────────────────────────────────────────────────────────────────────*/

export const OTHER_INDIVIDUALS_LABEL = 'Other / Individuals';

const COMPANY_SUFFIX_RE =
  /\b(?:inc|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|holdings?|group|partners?|capital|services?|technologies|tech|systems|solutions|labs?|studio|studios|enterprises?|associates|advisors|consulting|consultants)\b\.?/i;

/** Heuristic: looks like a 2–3 word personal name (Title-cased) with no
 *  company-suffix token. Conservative on purpose — single-word strings and
 *  anything with a comma/digit/ampersand are NOT treated as persons. */
export function looksLikePersonName(name: string | null | undefined): boolean {
  if (!name) return false;
  const v = name.trim();
  if (!v) return false;
  if (COMPANY_SUFFIX_RE.test(v)) return false;
  if (/[0-9,&@/]/.test(v)) return false;
  // 2–3 Title-cased tokens, optional middle initial.
  return /^[A-Z][a-z'’-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?$/.test(v);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Build a map of normalized CRM company name → canonical display name. */
export function buildCrmCompanyNameIndex(
  companies: Array<{ name: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of companies) {
    if (!c.name) continue;
    const key = normalize(c.name);
    if (key && !map.has(key)) map.set(key, c.name.trim());
  }
  return map;
}

/** Fuzzy match a QBO customer name against the CRM company index.
 *  Strategy: exact normalized match → prefix match (≥ 6 chars) → null. */
export function matchCrmCompanyName(
  candidate: string | null | undefined,
  index: Map<string, string>,
): string | null {
  if (!candidate) return null;
  const norm = normalize(candidate);
  if (!norm) return null;
  const direct = index.get(norm);
  if (direct) return direct;
  if (norm.length >= 6) {
    for (const [k, v] of index) {
      if (k.length >= 6 && (k.startsWith(norm) || norm.startsWith(k))) return v;
    }
  }
  return null;
}

export interface ResolveQboClientLabelEnrichedArgs {
  customerName: string | null | undefined;
  customer?: { company_name?: string | null; display_name?: string | null } | null;
  /** Pre-built CRM company-name index from `buildCrmCompanyNameIndex`. */
  crmCompanyIndex?: Map<string, string>;
}

export function resolveQboClientLabelEnriched(
  args: ResolveQboClientLabelEnrichedArgs,
): string {
  const { customerName, customer, crmCompanyIndex } = args;
  const company = customer?.company_name?.trim();
  if (company) return company;

  const display = customer?.display_name?.trim() || customerName?.trim() || '';

  // Pass 2: fuzzy match against CRM companies.
  if (crmCompanyIndex && display) {
    const crm = matchCrmCompanyName(display, crmCompanyIndex);
    if (crm) return crm;
  }

  // Pass 3: keep the display name if it doesn't look like a person.
  if (display && !looksLikePersonName(display)) return display;

  // Pass 4: bucket individuals so personal names never leak onto charts.
  return OTHER_INDIVIDUALS_LABEL;
}