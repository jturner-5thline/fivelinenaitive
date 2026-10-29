export type MissingFieldMatchMode = 'any' | 'all';

/** Core funding-source fields that can be searched for missing values. */
export const LENDER_MISSING_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'lender_type', label: 'Funding source type' },
  { value: 'tier', label: 'Tier' },
  { value: 'website', label: 'Website' },
  { value: 'contact_name', label: 'Contact name' },
  { value: 'email', label: 'Contact email' },
  { value: 'contact_phone', label: 'Contact phone' },
  { value: 'min_deal', label: 'Min deal size' },
  { value: 'max_deal', label: 'Max deal size' },
  { value: 'min_revenue', label: 'Min revenue' },
  { value: 'ebitda_min', label: 'Min EBITDA' },
  { value: 'loan_types', label: 'Loan types' },
  { value: 'industries', label: 'Industries' },
  { value: 'industries_to_avoid', label: 'Industries to avoid' },
  { value: 'geo', label: 'Geography' },
  { value: 'sponsorship', label: 'Sponsorship' },
  { value: 'cash_burn', label: 'Cash burn' },
  { value: 'nda', label: 'NDA' },
  { value: 'relationship_owners', label: 'Relationship owners' },
  { value: 'linkedin_url', label: 'LinkedIn' },
  { value: 'about_notes', label: 'About / notes' },
];

export function isFieldValueMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.every((v) => isFieldValueMissing(v));
  return false;
}

export function filterLendersByMissingFields<T extends Record<string, unknown>>(
  lenders: T[],
  fields: string[] | undefined,
  mode: MissingFieldMatchMode = 'any',
): T[] {
  if (!fields || fields.length === 0) return lenders;
  return lenders.filter((l) =>
    mode === 'all'
      ? fields.every((f) => isFieldValueMissing(l[f]))
      : fields.some((f) => isFieldValueMissing(l[f])),
  );
}
