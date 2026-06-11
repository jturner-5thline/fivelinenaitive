/**
 * Centralized deal fee math.
 *
 * Definition (project-wide):
 *   Total Fee = Deal Value × Success Fee %
 *
 * Success Fee % storage is normalized: a value > 1 is treated as a whole
 * percent (e.g. 5 → 0.05); a value in (0, 1] is treated as already-decimal
 * (e.g. 0.05 stays 0.05). 0 / null / NaN → 0.
 */
export function normalizeSuccessFeePercent(pct: number | null | undefined): number {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

export function computeTotalFee(
  dealValue: number | null | undefined,
  successFeePercent: number | null | undefined,
): number {
  const v = Number(dealValue);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v * normalizeSuccessFeePercent(successFeePercent);
}