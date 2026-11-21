import { z } from 'zod';

export const agreementDate = z.string().date();
export const criterionSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().nonnegative(),
  text: z.string().min(1).max(20000).refine((s) => s.trim().length > 0),
  is_met: z.boolean().optional(),
  group: z.string().min(1).max(100).nullable().default(null),
  metric: z.enum(['total_commitment', 'interest_only_months', 'term_months', 'interest_rate', 'all_in_rate', 'advance_rate', 'min_balance', 'personal_guarantee', 'board_seat', 'lender_equity', 'other']).nullable().default(null),
  operator: z.enum(['>=', '<=', '=', 'none']).nullable().default(null),
  value: z.number().finite().nullable().default(null),
  unit: z.string().max(50).nullable().default(null),
});
export const qualifierGroupSchema = z.object({
  key: z.string().min(1).max(100), label: z.string().min(1).max(200),
  match_rule: z.enum(['all', 'any']), min_required: z.number().int().min(1).nullable().default(null),
  fee: z.number().finite().nonnegative().nullable().default(null), notes: z.string().max(20000).nullable().default(null),
});
export const agreementFields = z.object({
  executed_qualifies: z.boolean(),
  match_rule: z.enum(['all', 'any']),
  min_required: z.number().int().min(1).nullable().default(null),
  groups: z.array(qualifierGroupSchema).max(200).nullable().default(null),
  groups_logic: z.enum(['all_groups', 'each_group_separately']).default('all_groups'),
  criteria: z.array(criterionSchema).max(200).refine((rows) => new Set(rows.map((r) => r.position)).size === rows.length, 'Positions must be unique'),
  source_file_id: z.string().max(1000).nullable().default(null),
  source_file_url: z.string().url().refine((s) => new URL(s).protocol === 'https:', 'Use an HTTPS agreement link').nullable().default(null),
  agreement_signed_date: agreementDate.nullable().default(null),
  notes: z.string().max(20000).nullable().default(null),
});
export const agreementSchema = agreementFields.superRefine((record, ctx) => {
  const groups = record.groups ?? [];
  const keys = new Set(groups.map((g) => g.key));
  if (keys.size !== groups.length) ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Group keys must be unique' });
  record.criteria.forEach((c, i) => {
    if (c.group && !keys.has(c.group)) ctx.addIssue({ code: 'custom', path: ['criteria', i, 'group'], message: 'Choose an existing group' });
  });
  if (record.min_required !== null && record.min_required > record.criteria.filter((c) => !c.group).length) ctx.addIssue({ code: 'custom', path: ['min_required'], message: 'Required count must not exceed ungrouped criteria' });
  groups.forEach((g, i) => {
    if (g.min_required !== null && g.min_required > record.criteria.filter((c) => c.group === g.key).length) ctx.addIssue({ code: 'custom', path: ['groups', i, 'min_required'], message: 'Required count must not exceed criteria in this group' });
  });
});
export function qualifierRuleText(rule: 'all' | 'any', minimum: number | null, count: number) {
  return minimum !== null ? `${minimum} of ${count} required` : rule === 'all' ? 'All required' : 'Any 1 required';
}
export function evaluateQualifiers(record: QualifierAgreement) {
  const passes = (rows: QualifierAgreement['criteria'], rule: 'all' | 'any', minimum: number | null) =>
    rows.length > 0 && rows.filter((c) => c.is_met).length >= (minimum ?? (rule === 'all' ? rows.length : 1));
  const ungrouped = record.criteria.filter((c) => !c.group);
  const groups = (record.groups ?? []).map((g) => ({ key: g.key, passed: passes(record.criteria.filter((c) => c.group === g.key), g.match_rule, g.min_required), fee: g.fee }));
  const recordPassed = ungrouped.length ? passes(ungrouped, record.match_rule, record.min_required) : true;
  const qualified = recordPassed && (groups.length ? (record.groups_logic === 'all_groups' ? groups.every((g) => g.passed) : groups.some((g) => g.passed)) : ungrouped.length > 0 && recordPassed);
  return { qualified, groups, earned_group_fees: groups.reduce((sum, g) => sum + (g.passed && recordPassed && (record.groups_logic === 'each_group_separately' || qualified) ? g.fee ?? 0 : 0), 0) };
}
export const feeFields = {
  retainer_fee: z.number().finite().nonnegative().nullable().optional(),
  milestone_fee: z.number().finite().nonnegative().nullable().optional(),
  success_fee_percent: z.number().finite().min(0).max(100).nullable().optional(),
  success_fee_minimum: z.number().finite().nonnegative().nullable().optional(),
  exclusivity: z.string().max(2000).nullable().optional(),
  contract_start_date: agreementDate.nullable().optional(),
  contract_end_date: agreementDate.nullable().optional(),
};
export const feePatchSchema = z.object(feeFields).strict();
export type QualifierAgreement = z.infer<typeof agreementSchema> & { updated_at?: string; deal_id?: string };

/** Percent is stored in whole percentage points: 1.5 means 1.5%. */
export function agreementTotalFee(value: number | null | undefined, percent: number | null | undefined, minimum: number | null | undefined) {
  return Math.max((Number(value) || 0) * (Number(percent) || 0) / 100, Number(minimum) || 0);
}