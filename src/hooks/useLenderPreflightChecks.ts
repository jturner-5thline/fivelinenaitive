import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Pre-flight risk checks run against a list of lenders just before a
 * submission round is sent on a deal. Each check is a soft warning — the
 * UI is non-blocking and the user can always proceed.
 *
 * Three checks:
 *  1. PASS HISTORY — lender has passed on 2+ deals of the same `deal_type`
 *     in the last 90 days.
 *  2. SIZE MISMATCH — current deal value is outside the lender's stated
 *     [min_deal, max_deal] range from the lender directory.
 *  3. GEOGRAPHY MISMATCH — company HQ does not appear in the lender's
 *     stated geographic preference (`master_lenders.geo`).
 */

export type LenderPreflightWarningKind = 'pass_history' | 'size_mismatch' | 'geography_mismatch';

export interface LenderPreflightWarning {
  kind: LenderPreflightWarningKind;
  /** One-line user-facing message. */
  message: string;
  /** Severity. Currently always 'warning' (non-blocking). */
  severity: 'warning';
}

export interface LenderPreflightResult {
  /** Lender name (matches the `deal_lenders.name` casing on this deal). */
  lenderName: string;
  /** master_lenders.id when the lender was matched to the directory. */
  masterLenderId: string | null;
  warnings: LenderPreflightWarning[];
}

const PASS_HISTORY_WINDOW_DAYS = 90;
const PASS_HISTORY_THRESHOLD = 2;

/** Loose case/whitespace insensitive equality used to match lender names across tables. */
function nameKey(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase();
}

/**
 * Best-effort detector for whether a free-text geo string from
 * `master_lenders.geo` covers a given (city, state, country) trio.
 * Returns `true` when the geo field is empty/unspecified, when it mentions
 * "national"/"global"/"north america"/"us"/"usa", or when it contains any
 * substring of the deal's HQ. Returns `false` only when there's a clear
 * mismatch.
 */
function geographyCovers(geo: string | null | undefined, hq: { city?: string | null; state?: string | null; country?: string | null }): boolean {
  const g = (geo || '').trim().toLowerCase();
  if (!g) return true; // no preference stated → don't warn
  if (/\b(global|worldwide|international|national|nationwide|all (states|geos)|any|north america|n\.?\s?america|us(a)?|united states|canada\s*\/\s*us|us\s*&\s*canada|us\s*\+\s*canada)\b/.test(g)) {
    return true;
  }
  const candidates = [hq.city, hq.state, hq.country].map((s) => (s || '').trim().toLowerCase()).filter(Boolean);
  if (candidates.length === 0) return true; // no HQ on file → can't judge
  return candidates.some((c) => g.includes(c));
}

interface UseLenderPreflightChecksParams {
  dealId: string | null | undefined;
  /** Names (as on `deal_lenders.name`) currently slated for submission. */
  lenderNames: string[];
  /** When false, the hook skips all queries (e.g. dialog closed). */
  enabled?: boolean;
}

interface UseLenderPreflightChecksResult {
  loading: boolean;
  /** Warnings keyed by lender name (lowercased). */
  byLender: Record<string, LenderPreflightResult>;
  /** Flat list of warnings across every included lender. */
  flat: LenderPreflightResult[];
  /** True when at least one warning was raised on any included lender. */
  hasAny: boolean;
}

export function useLenderPreflightChecks({
  dealId,
  lenderNames,
  enabled = true,
}: UseLenderPreflightChecksParams): UseLenderPreflightChecksResult {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, LenderPreflightResult>>({});

  // Stable key so the effect re-runs when the included set actually changes.
  const lenderKey = useMemo(
    () => lenderNames.map((n) => nameKey(n)).filter(Boolean).sort().join('|'),
    [lenderNames]
  );

  useEffect(() => {
    if (!enabled || !dealId || lenderNames.length === 0) {
      setResults({});
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1) Current deal — type, value, company name, owning company_id (for HQ join).
        const { data: deal, error: dealErr } = await supabase
          .from('deals')
          .select('id, deal_type, value, company, crm_company_id, company_id')
          .eq('id', dealId)
          .maybeSingle();
        if (dealErr) throw dealErr;

        const dealType = (deal?.deal_type || '').trim();
        const dealValue = typeof deal?.value === 'number' ? deal.value : null;

        // 2) Company HQ — best effort via crm_companies when linked.
        let hq: { city?: string | null; state?: string | null; country?: string | null } = {};
        if (deal?.crm_company_id) {
          const { data: crm } = await supabase
            .from('crm_companies')
            .select('hq_city, hq_state, hq_country')
            .eq('id', deal.crm_company_id)
            .maybeSingle();
          if (crm) hq = { city: crm.hq_city, state: crm.hq_state, country: crm.hq_country };
        }

        // 3) Master lender directory rows for the included lenders.
        const { data: masters } = await supabase
          .from('master_lenders')
          .select('id, name, min_deal, max_deal, geo')
          .in(
            'name',
            // pull a generous superset; we'll match case-insensitively below
            Array.from(new Set(lenderNames.map((n) => n.trim()))).filter(Boolean)
          );
        const masterByName: Record<string, { id: string; min_deal: number | null; max_deal: number | null; geo: string | null }> = {};
        (masters || []).forEach((m: any) => {
          masterByName[nameKey(m.name)] = {
            id: m.id,
            min_deal: typeof m.min_deal === 'number' ? m.min_deal : m.min_deal != null ? Number(m.min_deal) : null,
            max_deal: typeof m.max_deal === 'number' ? m.max_deal : m.max_deal != null ? Number(m.max_deal) : null,
            geo: m.geo ?? null,
          };
        });

        // 4) Pass-history check — count "passed" deal_lenders rows in the last
        //    90 days, scoped to deals of the same `deal_type` (when known).
        const passCounts: Record<string, number> = {};
        if (dealType) {
          const since = new Date(Date.now() - PASS_HISTORY_WINDOW_DAYS * 86_400_000).toISOString();
          const { data: passed } = await supabase
            .from('deal_lenders')
            .select('name, deal_id, updated_at, deals!inner(id, deal_type)')
            .or('tracking_status.eq.passed,substage.eq.passed')
            .gte('updated_at', since)
            .in('name', Array.from(new Set(lenderNames.map((n) => n.trim()))).filter(Boolean));
          (passed || []).forEach((row: any) => {
            const rowType = (row?.deals?.deal_type || '').trim();
            if (!rowType || rowType !== dealType) return;
            // Don't count the current deal against itself.
            if (row.deal_id === dealId) return;
            const k = nameKey(row.name);
            passCounts[k] = (passCounts[k] || 0) + 1;
          });
        }

        if (cancelled) return;

        // 5) Compose per-lender result.
        const out: Record<string, LenderPreflightResult> = {};
        for (const original of lenderNames) {
          const k = nameKey(original);
          if (!k || out[k]) continue;
          const master = masterByName[k];
          const warnings: LenderPreflightWarning[] = [];

          // Pass history
          const n = passCounts[k] || 0;
          if (n >= PASS_HISTORY_THRESHOLD && dealType) {
            warnings.push({
              kind: 'pass_history',
              severity: 'warning',
              message: `${original} has passed on ${n} ${dealType} deal${n === 1 ? '' : 's'} in the last 90 days.`,
            });
          }

          // Size mismatch
          if (master && dealValue != null) {
            const min = master.min_deal;
            const max = master.max_deal;
            const hasRange = (min != null && Number.isFinite(min)) || (max != null && Number.isFinite(max));
            if (hasRange) {
              const outOfRange =
                (min != null && Number.isFinite(min) && dealValue < min) ||
                (max != null && Number.isFinite(max) && dealValue > max);
              if (outOfRange) {
                const fmt = (v: number | null | undefined) =>
                  v == null || !Number.isFinite(v) ? '?' : `$${(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}MM`;
                warnings.push({
                  kind: 'size_mismatch',
                  severity: 'warning',
                  message: `Deal is ${fmt(dealValue)} — ${original} typically does ${fmt(min)}–${fmt(max)}.`,
                });
              }
            }
          }

          // Geography mismatch
          if (master && master.geo && (hq.city || hq.state || hq.country)) {
            if (!geographyCovers(master.geo, hq)) {
              const hqLabel = [hq.city, hq.state, hq.country].filter(Boolean).join(', ');
              warnings.push({
                kind: 'geography_mismatch',
                severity: 'warning',
                message: `${original} prefers ${master.geo} — this company is HQ'd in ${hqLabel}.`,
              });
            }
          }

          out[k] = {
            lenderName: original,
            masterLenderId: master?.id ?? null,
            warnings,
          };
        }

        setResults(out);
      } catch (err) {
        console.warn('[useLenderPreflightChecks] failed', err);
        if (!cancelled) setResults({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, lenderKey, enabled]);

  const flat = useMemo(
    () => Object.values(results).filter((r) => r.warnings.length > 0),
    [results]
  );

  return {
    loading,
    byLender: results,
    flat,
    hasAny: flat.length > 0,
  };
}