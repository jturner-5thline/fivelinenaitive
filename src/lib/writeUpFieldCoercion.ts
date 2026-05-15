import { DealWriteUpData } from '@/components/deal/DealWriteUp';

const BILLING_MODEL_OPTIONS = [
  'Subscription',
  'Transaction',
  'License',
  'Usage-based',
  'Hybrid',
  'Other',
] as const;

/** Map a free-text fragment to one of BILLING_MODEL_OPTIONS, or null if no match. */
function mapBillingModel(fragment: string): string | null {
  const s = fragment.toLowerCase().trim();
  if (!s) return null;
  if (BILLING_MODEL_OPTIONS.some(o => o.toLowerCase() === s)) {
    return BILLING_MODEL_OPTIONS.find(o => o.toLowerCase() === s)!;
  }
  if (/saas|subscri|recurring|monthly|annual|arr|mrr/.test(s)) return 'Subscription';
  if (/usage|metered|consumption|per[- ]?use|pay[- ]?as[- ]?you[- ]?go/.test(s)) return 'Usage-based';
  if (/licen[sc]e|perpetual|seat/.test(s)) return 'License';
  if (/transac|per[- ]?transaction|interchange|take[- ]?rate|commission/.test(s)) return 'Transaction';
  if (/hybrid|mixed|combination|tier/.test(s)) return 'Hybrid';
  return null;
}

function toArrayOfStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map(v => (v === null || v === undefined ? '' : String(v).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[;,/|]|\sand\s/i)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    // last resort — wrap stringified
    const s = String((value as { toString?: () => string }).toString?.() ?? '').trim();
    return s ? [s] : [];
  }
  return [String(value)];
}

function coerceBillingModels(value: unknown): string[] {
  const fragments = toArrayOfStrings(value);
  if (fragments.length === 0) return [];
  const mapped: string[] = [];
  let unmatched = false;
  for (const frag of fragments) {
    const m = mapBillingModel(frag);
    if (m) {
      if (!mapped.includes(m)) mapped.push(m);
    } else {
      unmatched = true;
    }
  }
  if (mapped.length === 0 && unmatched) return ['Other'];
  if (unmatched && !mapped.includes('Other')) mapped.push('Other');
  return mapped;
}

function coerceString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => String(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function coerceDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function coerceBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|y|1)$/i.test(value.trim());
  return Boolean(value);
}

/**
 * Coerce an AI-extracted value into the exact shape the form expects for that
 * write-up field. Throws if the value cannot be reasonably converted.
 */
export function coerceWriteUpFieldValue<K extends keyof DealWriteUpData>(
  field: K,
  value: unknown,
): DealWriteUpData[K] {
  switch (field) {
    case 'billingModels':
      return coerceBillingModels(value) as DealWriteUpData[K];
    case 'industries':
    case 'dealTypes':
    case 'customerBase':
      return toArrayOfStrings(value) as DealWriteUpData[K];
    case 'financialDataAsOf':
      return coerceDate(value) as DealWriteUpData[K];
    case 'publishAsAnonymous':
    case 'existingDebtLegacyDismissed':
      return coerceBool(value) as DealWriteUpData[K];
    // Object/array structured fields — pass through only if shape matches.
    case 'keyItems':
    case 'companyHighlights':
    case 'financialYears':
    case 'financialComments':
    case 'team':
    case 'existingDebtItems':
    case 'visibleMetrics':
    case 'financialColumnVisibility':
      if (value === null || value === undefined) {
        throw new Error('Empty structured value');
      }
      return value as DealWriteUpData[K];
    default:
      return coerceString(value) as DealWriteUpData[K];
  }
}