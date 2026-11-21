import { z } from 'zod';

export const agreementDate = z.string().date();
export const criterionSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().nonnegative(),
  text: z.string().min(1).max(20000).refine((s) => s.trim().length > 0),
  is_met: z.boolean().optional(),
  metric: z.enum(['total_commitment', 'interest_only_months', 'term_months', 'interest_rate', 'all_in_rate', 'advance_rate', 'min_balance', 'personal_guarantee', 'board_seat', 'lender_equity', 'other']).nullable().default(null),
  operator: z.enum(['>=', '<=', '=', 'none']).nullable().default(null),
  value: z.number().finite().nullable().default(null),
  unit: z.string().max(50).nullable().default(null),
});
export const agreementSchema = z.object({
  executed_qualifies: z.boolean(),
  match_rule: z.enum(['all', 'any']),
  criteria: z.array(criterionSchema).max(200).refine((rows) => new Set(rows.map((r) => r.position)).size === rows.length, 'Positions must be unique'),
  source_file_id: z.string().max(1000).nullable().default(null),
  source_file_url: z.string().url().refine((s) => new URL(s).protocol === 'https:', 'Use an HTTPS agreement link').nullable().default(null),
  agreement_signed_date: agreementDate.nullable().default(null),
  notes: z.string().max(20000).nullable().default(null),
});
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