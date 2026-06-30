// Shared helpers for editing date/timestamp fields in the Approval Queue.
// Format on load → MM-DD-YYYY. Parse on save → ISO (UTC midnight) or YYYY-MM-DD
// depending on the original value's shape, so backend writes stay compatible.

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MDY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

export const isIsoDateLike = (value: unknown): value is string =>
  typeof value === 'string' && (ISO_DATETIME_RE.test(value) || ISO_DATE_RE.test(value));

export const isDateFieldName = (key: string): boolean =>
  /(_at|_date|date|completed|deadline|due|follow_?up|expires?|scheduled)$/i.test(key);

export const formatEditableDate = (value?: unknown): string => {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return String(value);
  if (!isIsoDateLike(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
};

// Convert the user-facing MM-DD-YYYY (or partial) string back to a backend-safe value.
// Preserves the original value's shape: ISO datetime → ISO datetime, plain date → YYYY-MM-DD.
export const parseEditableDateToIso = (
  input: string,
  originalValue?: unknown
): string | null => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(MDY_RE);
  if (!m) return trimmed; // not yet a complete date; pass through
  const [, mm, dd, yyyy] = m;
  const wantsDateOnly =
    typeof originalValue === 'string' && ISO_DATE_RE.test(originalValue);
  return wantsDateOnly ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
};