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
}

export type StageOptionLike = LabeledOption;
export type SubstageOptionLike = LabeledOption;

const NONE_VALUES = new Set(['', 'none', 'null', 'undefined']);

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
}

/**
 * Resolve any stored stage/milestone value to its canonical display label.
 */
export function resolveLabel(
  value: string | null | undefined,
  { options = [], unknownLabel = 'Unknown', preserveEmpty = false }: ResolveOptions = {},
): string {
  if (value === null || value === undefined) {
    return preserveEmpty ? '' : 'None';
  }

  const trimmed = String(value).trim();

  if (!trimmed || NONE_VALUES.has(trimmed.toLowerCase())) {
    return preserveEmpty ? '' : 'None';
  }

  // 1. Exact id match
  const byId = options.find((o) => o.id === trimmed);
  if (byId) return byId.label;

  // 2. Exact label match (case-insensitive) -> preserve existing label
  const byLabel = options.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) return byLabel.label;

  // 3. UUID with no mapping -> neutral fallback
  if (isUuid(trimmed)) return unknownLabel;

  // 4. Slug / key -> title case
  return titleCaseLabel(trimmed);
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

  const entityName =
    (typeof meta.lender_name === 'string' && meta.lender_name) ||
    (typeof meta.entity_name === 'string' && meta.entity_name) ||
    null;

  const from = typeof meta.from === 'string' ? meta.from : null;
  const to = typeof meta.to === 'string' ? meta.to : null;

  // Fallback: try to parse "<Name> {stage|milestone} changed from X to Y"
  if ((!entityName || from === null || to === null) && description) {
    const re = new RegExp(
      `^(.+?)\\s+${changeWord}\\s+changed\\s+from\\s+(.+?)\\s+to\\s+(.+?)\\s*$`,
      'i',
    );
    const match = description.match(re);
    if (match) {
      return {
        entityName: entityName ?? match[1],
        from: from ?? match[2],
        to: to ?? match[3],
      };
    }
  }

  return { entityName, from, to };
}
