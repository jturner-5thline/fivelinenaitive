/** Pure hours & fees math, mirroring the deal page's Hours & Fees widget. */
export type FeeDealInput = {
  total_fee: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
  pre_signing_hours: number | null;
  post_signing_hours: number | null;
};

const n = (v: unknown) => Number(v) || 0;

export function computeDealHoursFees(d: FeeDealInput) {
  const total_fee = n(d.total_fee);
  const retainer_fee = n(d.retainer_fee);
  const milestone_fee = n(d.milestone_fee);
  // Closing fee = amount due at close, less fees already paid (matches UI).
  const closing_fee = Math.max(0, total_fee - retainer_fee - milestone_fee);
  const pre = n(d.pre_signing_hours);
  const post = n(d.post_signing_hours);
  const total_hours = pre + post;
  return {
    retainer_fee,
    milestone_fee,
    success_fee_percent: n(d.success_fee_percent),
    closing_fee,
    total_fee,
    pre_signing_hours: pre,
    post_signing_hours: post,
    total_hours,
    revenue_per_hour: total_hours > 0 && total_fee > 0 ? total_fee / total_hours : null,
    missing_fee_information: total_fee <= 0 && retainer_fee <= 0 && milestone_fee <= 0 && n(d.success_fee_percent) <= 0,
  };
}

export type DealHoursFees = ReturnType<typeof computeDealHoursFees>;

export function rollupHoursFees(rows: DealHoursFees[]) {
  const s = (k: keyof DealHoursFees) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const total_fee = s("total_fee");
  const total_hours = s("total_hours");
  const pcts = rows.map((r) => r.success_fee_percent).filter((p) => p > 0);
  return {
    deal_count: rows.length,
    retainer_fee: s("retainer_fee"),
    milestone_fee: s("milestone_fee"),
    closing_fee: s("closing_fee"),
    total_fee,
    avg_success_fee_percent: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    pre_signing_hours: s("pre_signing_hours"),
    post_signing_hours: s("post_signing_hours"),
    total_hours,
    revenue_per_hour: total_hours > 0 && total_fee > 0 ? total_fee / total_hours : null,
    missing_fee_information_count: rows.filter((r) => r.missing_fee_information).length,
  };
}
