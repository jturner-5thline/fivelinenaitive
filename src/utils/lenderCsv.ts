// Funding source (master_lenders) CSV template, export, and RFC-4180 parsing.
// The export headers ARE the import template, so an exported file round-trips with no mapping.

export type LenderFieldKind = 'text' | 'number' | 'array' | 'boolean';

export interface LenderField {
  key: string;
  header: string;
  kind: LenderFieldKind;
  aliases?: string[];
  example?: string;
}

export const LENDER_FIELDS: LenderField[] = [
  { key: 'name', header: 'Lender Name', kind: 'text', aliases: ['name', 'lender', 'funding source', 'firm', 'firm name', 'company', 'company name'], example: 'Example Capital' },
  { key: 'lender_type', header: 'Lender Type', kind: 'text', aliases: ['type'], example: 'Venture Debt' },
  { key: 'tier', header: 'Tier', kind: 'text', example: 'Tier 1' },
  { key: 'appetite_status', header: 'Appetite Status', kind: 'text', aliases: ['appetite'] },
  { key: 'active', header: 'Active', kind: 'boolean', example: 'TRUE' },
  { key: 'min_deal', header: 'Min Deal ($)', kind: 'number', aliases: ['min deal', 'min check', 'check size min', 'min check size', 'minimum deal'], example: '2000000' },
  { key: 'max_deal', header: 'Max Deal ($)', kind: 'number', aliases: ['max deal', 'max check', 'check size max', 'max check size', 'maximum deal'], example: '25000000' },
  { key: 'sweet_spot_min', header: 'Sweet Spot Min ($)', kind: 'number', aliases: ['sweet spot min'] },
  { key: 'sweet_spot_max', header: 'Sweet Spot Max ($)', kind: 'number', aliases: ['sweet spot max'] },
  { key: 'min_revenue', header: 'Min Revenue ($)', kind: 'number', aliases: ['min revenue', 'minimum revenue', 'revenue min'], example: '5000000' },
  { key: 'ebitda_min', header: 'EBITDA Min ($)', kind: 'number', aliases: ['ebitda min', 'min ebitda'] },
  { key: 'min_gross_margin_pct', header: 'Min Gross Margin (%)', kind: 'number', aliases: ['min gross margin', 'gross margin'] },
  { key: 'max_leverage', header: 'Max Leverage', kind: 'number', aliases: ['leverage'] },
  { key: 'loan_types', header: 'Loan Types', kind: 'array', aliases: ['loan type', 'products', 'preferences'], example: 'Term Loan, ABL' },
  { key: 'industries', header: 'Industries', kind: 'array', aliases: ['industry', 'sectors', 'sector'], example: 'SaaS, Healthcare' },
  { key: 'industries_to_avoid', header: 'Industries to Avoid', kind: 'array', aliases: ['industries excluded', 'excluded industries'] },
  { key: 'geo', header: 'Geo', kind: 'text', aliases: ['geography'] },
  { key: 'geographies', header: 'Geographies', kind: 'array', aliases: ['regions'] },
  { key: 'geographies_excluded', header: 'Geographies Excluded', kind: 'array' },
  { key: 'b2b_b2c', header: 'B2B/B2C', kind: 'text', aliases: ['b2b b2c'] },
  { key: 'sponsorship', header: 'Sponsorship', kind: 'text' },
  { key: 'sponsor_requirement', header: 'Sponsor Requirement', kind: 'text' },
  { key: 'sub_debt', header: 'Sub Debt', kind: 'text' },
  { key: 'cash_burn', header: 'Cash Burn', kind: 'text' },
  { key: 'refinancing', header: 'Refinancing', kind: 'text' },
  { key: 'company_requirements', header: 'Company Requirements', kind: 'text' },
  { key: 'deal_structure_notes', header: 'Deal Structure Notes', kind: 'text', aliases: ['description', 'deal structure', 'structure notes'] },
  { key: 'funding_source_notes', header: 'Funding Source Notes', kind: 'text', aliases: ['notes'] },
  { key: 'about_notes', header: 'About', kind: 'text', aliases: ['about notes', 'background'] },
  { key: 'upfront_checklist', header: 'Upfront Checklist', kind: 'text' },
  { key: 'post_term_sheet_checklist', header: 'Post Term Sheet Checklist', kind: 'text' },
  { key: 'nda', header: 'NDA', kind: 'text', aliases: ['nda status'] },
  { key: 'referral_agreement', header: 'Referral Agreement', kind: 'text' },
  { key: 'referral_fee_offered', header: 'Referral Fee Offered', kind: 'text', aliases: ['referral fee'] },
  { key: 'referral_lender', header: 'Referral Lender', kind: 'text' },
  { key: 'onboarded_to_flex', header: 'Onboarded to FLEx', kind: 'text' },
  { key: 'relationship_owners', header: 'Relationship Owners', kind: 'text', aliases: ['relationship owner', 'owner', 'owners'] },
  { key: 'contact_name', header: 'Contact Name', kind: 'text', aliases: ['contact', 'primary contact'], example: 'Jane Smith' },
  { key: 'contact_title', header: 'Contact Title', kind: 'text', aliases: ['title'] },
  { key: 'email', header: 'Contact Email', kind: 'text', aliases: ['email', 'e-mail', 'email address'], example: 'jane@example.com' },
  { key: 'contact_phone', header: 'Contact Phone', kind: 'text' },
  { key: 'phone', header: 'Phone', kind: 'text', aliases: ['main phone', 'office phone'] },
  { key: 'contact_geography', header: 'Contact Geography', kind: 'text' },
  { key: 'website', header: 'Website', kind: 'text', aliases: ['url', 'website url', 'site'], example: 'https://example.com' },
  { key: 'linkedin_url', header: 'LinkedIn', kind: 'text', aliases: ['linkedin url'] },
  { key: 'lender_one_pager_url', header: 'One Pager URL', kind: 'text', aliases: ['one pager', 'lender one pager'] },
  { key: 'address', header: 'Address', kind: 'text' },
  { key: 'city', header: 'City', kind: 'text' },
  { key: 'state', header: 'State', kind: 'text' },
  { key: 'country', header: 'Country', kind: 'text' },
  { key: 'gift_address', header: 'Gift Address', kind: 'text' },
  { key: 'tags', header: 'Tags', kind: 'array' },
];

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const f of LENDER_FIELDS) m.set(norm(f.header), f.key);
  for (const f of LENDER_FIELDS) {
    for (const a of [f.key.replace(/_/g, ' '), ...(f.aliases ?? [])]) {
      const n = norm(a);
      if (!m.has(n)) m.set(n, f.key);
    }
  }
  return m;
})();

/** Returns a field key for a header, or null if unknown. */
export function autoMapHeader(header: string): string | null {
  return ALIAS_INDEX.get(norm(header)) ?? null;
}

/** True when every non-empty header exactly matches a canonical template header. */
export function isStandardTemplate(headers: string[]): boolean {
  const canon = new Set(LENDER_FIELDS.map(f => norm(f.header)));
  const used = headers.filter(h => h.trim());
  return used.length > 0 && used.every(h => canon.has(norm(h))) && used.some(h => norm(h) === 'lender name');
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join(', ') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exports every funding source field using the canonical template headers. */
export function exportLendersToCsv(lenders: Record<string, any>[]): string {
  const header = LENDER_FIELDS.map(f => escapeCsvField(f.header)).join(',');
  const rows = lenders.map(l => LENDER_FIELDS.map(f => escapeCsvField(l[f.key])).join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export function buildLenderTemplateCsv(): string {
  const header = LENDER_FIELDS.map(f => escapeCsvField(f.header)).join(',');
  const example = LENDER_FIELDS.map(f => escapeCsvField(f.example ?? '')).join(',');
  return '\uFEFF' + [header, example].join('\r\n');
}

/** RFC-4180 parser: handles quoted commas, quotes and line breaks inside cells. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function toNumber(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)(k|m|mm|b)?%?$/);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' || m[2] === 'mm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  return Number(m[1]) * mult;
}

/** Convert a raw row into master_lenders column values using a header→field mapping. */
export function rowToLender(headers: string[], row: string[], mapping: Record<number, string | null>): Record<string, any> {
  const out: Record<string, any> = {};
  headers.forEach((_, idx) => {
    const key = mapping[idx];
    if (!key) return;
    const field = LENDER_FIELDS.find(f => f.key === key);
    const raw = (row[idx] ?? '').trim();
    if (!field || !raw) return;
    if (field.kind === 'number') {
      const n = toNumber(raw);
      if (n !== null) out[key] = n;
    } else if (field.kind === 'array') {
      const arr = raw.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
      if (arr.length) out[key] = arr;
    } else if (field.kind === 'boolean') {
      out[key] = /^(true|yes|y|1|active)$/i.test(raw);
    } else {
      out[key] = raw;
    }
  });
  return out;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
