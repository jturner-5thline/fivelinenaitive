/**
 * Canonical lender stage / milestone label resolver.
 *
 * Used everywhere we render historical lender activity (audit trail, deal
 * activity feed, lender row, dropdowns) so the same value never drifts
 * between a UUID, a slug, and a human-readable label.
 *
 * Resolution priority for any incoming `value`:
 *   1. If `value` matches a configured stage/substage `id` -> use its `label`
 *   2. If `value` matches a configured stage/substage `label` -> preserve it
 *   3. If `value` is a slug/key (kebab/snake/camel) -> Title Case it,
 *      preserving known acronyms (DRL, AI, NDA, LOI, etc.)
 *   4. If `value` is a raw UUID with no mapping -> show neutral fallback
 *      ("Unknown Stage" / "Unknown Milestone")
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acronyms that must stay fully uppercase in the rendered label.
const ACRONYMS = new Set([
  'DRL',
  'AI',
  'NDA',
  'LOI',
  'IOI',
  'MNDA',
  'CIM',
  'KPI',
  'KYC',
  'TS',
  'ROI',
  'MRR',
  'ARR',
  'B2B',
  'B2C',
  'API',
  'SaaS',
]);

interface LabeledOption {
  id: string;
  label: string;
  key?: string;
}

export type StageOptionLike = LabeledOption;
export type SubstageOptionLike = LabeledOption;
export type LenderActivityLabelType = 'stage' | 'milestone';

const NONE_VALUES = new Set(['', 'none', 'null', 'undefined']);

const OPAQUE_ID_RE = /^(?=.*\d)[a-z0-9]{6,}(?:-[a-z0-9]{2,}){1,}$/i;

function canonicalizeLabelKey(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function looksLikeRawSlug(value: string): boolean {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value.trim());
}

function looksLikeOpaqueId(value: string): boolean {
  const trimmed = value.trim();
  return isUuid(trimmed) || OPAQUE_ID_RE.test(trimmed);
}

function guardResolvedLabel(value: string, unknownLabel: string): string {
  const trimmed = value.trim();
  if (!trimmed || looksLikeOpaqueId(trimmed) || looksLikeRawSlug(trimmed)) {
    return unknownLabel;
  }

  return trimmed;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Convert a slug / kebab / snake / camel value to a Title Case label,
 * preserving known acronyms.
 */
export function titleCaseLabel(raw: string): string {
  if (!raw) return raw;

  // Split kebab/snake/space first, then handle camelCase pieces.
  const tokens = raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);

  return tokens
    .map((token) => {
      const upper = token.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;

      // Keep all-caps short tokens as-is (e.g. "AI", "DRL")
      if (token.length <= 4 && token === upper && /^[A-Z]+$/.test(token)) {
        return token;
      }

      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

interface ResolveOptions {
  options?: ReadonlyArray<LabeledOption>;
  /** Returned when value is a raw UUID with no mapping in `options`. */
  unknownLabel?: string;
  /** When true, returns null instead of "None" for empty input. */
  preserveEmpty?: boolean;
  /** Returned when value is null/empty and preserveEmpty is false. */
  emptyLabel?: string;
}

/**
 * Resolve any stored stage/milestone value to its canonical display label.
 */
export function resolveLabel(
  value: string | null | undefined,
  {
    options = [],
    unknownLabel = 'Unknown',
    preserveEmpty = false,
    emptyLabel = 'None',
  }: ResolveOptions = {},
): string {
  if (value === null || value === undefined) {
    return preserveEmpty ? '' : emptyLabel;
  }

  const trimmed = String(value).trim();

  if (!trimmed || NONE_VALUES.has(trimmed.toLowerCase())) {
    return preserveEmpty ? '' : emptyLabel;
  }

  const valueKey = canonicalizeLabelKey(trimmed);

  // 1. Exact id match
  const byId = options.find((o) => o.id === trimmed);
  if (byId) return guardResolvedLabel(byId.label, unknownLabel);

  // 2. Canonical key / slug match against id, explicit key, or label-derived key
  const byKey = options.find((o) => {
    const optionKeys = [o.id, o.label, o.key].filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );
    return optionKeys.some((candidate) => canonicalizeLabelKey(candidate) === valueKey);
  });
  if (byKey) return guardResolvedLabel(byKey.label, unknownLabel);

  // 3. Exact label match (case-insensitive) -> preserve existing label
  const byLabel = options.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) return guardResolvedLabel(byLabel.label, unknownLabel);

  // 4. Opaque id with no mapping -> neutral fallback
  if (looksLikeOpaqueId(trimmed)) return unknownLabel;

  // 5. Slug / key -> title case with acronym preservation
  return guardResolvedLabel(titleCaseLabel(trimmed), unknownLabel);
}

export function resolveStageLabel(
  value: string | null | undefined,
  options: ReadonlyArray<LabeledOption> = [],
): string {
  return resolveLabel(value, { options, unknownLabel: 'Unknown Stage' });
}

export function resolveSubstageLabel(
  value: string | null | undefined,
  options: ReadonlyArray<LabeledOption> = [],
): string {
  return resolveLabel(value, { options, unknownLabel: 'Unknown Milestone' });
}

export function resolveLenderActivityLabel(
  value: string | null | undefined,
  type: LenderActivityLabelType,
  _lenderId?: string,
  options: ReadonlyArray<LabeledOption> = [],
): string {
  const unknownLabel = type === 'stage' ? 'Unknown Stage' : 'Unknown Milestone';

  return resolveLabel(value, {
    options,
    unknownLabel,
    emptyLabel: unknownLabel,
  });
}

/**
 * Try to extract `{ entity, from, to }` from an activity log entry so we can
 * re-render the description with humanized labels regardless of what the
 * stored description text contains.
 */
export interface ActivityChangePayload {
  entityName?: string | null;
  from?: string | null;
  to?: string | null;
}

export function extractChangePayload(
  metadata: unknown,
  description: string,
  changeWord: 'stage' | 'milestone',
): ActivityChangePayload {
  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const readMetaString = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = meta[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return null;
  };

  const entityName = readMetaString(
    'lender_name',
    'entity_name',
    'lenderName',
    'entityName',
  );
  const from = readMetaString('from', 'from_value', 'old_value', 'oldValue');
  const to = readMetaString('to', 'to_value', 'new_value', 'newValue');

  // Fallback: try to parse "<Name> {stage|milestone} changed from X to Y"
  if ((!entityName || from === null || to === null) && description) {
    const prefixRe = new RegExp(`^(.+?)\\s+${changeWord}\\s+changed`, 'i');
    const prefixMatch = description.match(prefixRe);
    const tail = prefixMatch ? description.slice(prefixMatch[0].length).trim() : '';
    const pairMatch = tail.match(
      /^from\s+(.+?)\s+to\s+(.+?)(?=\s+from\s+.+?\s+to\s+.+$|$)/i,
    );

    if (prefixMatch) {
      return {
        entityName: entityName ?? prefixMatch[1],
        from: from ?? pairMatch?.[1] ?? null,
        to: to ?? pairMatch?.[2] ?? null,
      };
    }
  }

  return { entityName, from, to };
}
