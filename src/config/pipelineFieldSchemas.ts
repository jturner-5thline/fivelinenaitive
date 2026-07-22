/**
 * Pipeline-aware extra-field schemas for the Deal Detail page.
 *
 * Each pipeline (finserv, naitive, debt, equity, m&a, …) can declare a list
 * of pipeline-specific fields that should appear on the Deal Detail page in
 * a clearly-labeled section under "Deal Information". The same schema is the
 * source of truth for the create-deal form so the two stay in sync.
 *
 * To add fields to a new pipeline:
 *   1. Add the column to the `deals` table (or whichever pipeline-specific table).
 *   2. Add an entry to PIPELINE_FIELD_SCHEMAS keyed by the deal's pipeline
 *      identifier (currently we key by `dealClass` because that's what the
 *      detail page already carries; extend to `pipelineId` if needed).
 *   3. Map the column in `useDealsDatabase.updateDeal` (write) and
 *      `mapDbDealToDeal` (read) — the keys here MUST match the names used
 *      in `Deal` (camelCase).
 */

export type PipelineFieldType =
  | 'text'
  | 'email'
  | 'currency'
  | 'date'
  | 'select'
  | 'multi-select'
  | 'switch';

export interface PipelineFieldDef {
  /** camelCase key on the `Deal` object (also the prop name we read/write). */
  key: string;
  label: string;
  type: PipelineFieldType;
  options?: readonly string[];
  placeholder?: string;
  /** When `full`, the field spans both columns. Defaults to a single column slot. */
  column?: 'left' | 'right' | 'full';
}

export interface PipelineSchema {
  /** Display label for the section card. */
  sectionLabel: string;
  fields: PipelineFieldDef[];
}

/* ── FinServ field set — mirrors FinServCreateDealDialog ───────────────── */

export const FINSERV_LEAD_SOURCES = [
  'Referral',
  'Networking',
  'Inbound',
  'Partner',
  'Other',
] as const;

export const FINSERV_OPPORTUNITY_TYPES = [
  'New One-Time Project (e.g., cleanup, RiskReady)',
  'New Ongoing Engagement',
  'Expansion',
  'Renewal',
  'Reactivation (returning dormant client or prospect)',
  'Agentic Support',
] as const;

export const FINSERV_SERVICES = [
  'Bookkeeping',
  'Controllership',
  'FP&A',
  'CFO Advisory',
  'Transaction Advisory',
  'HR & Compliance Advisory',
  'RiskReady',
] as const;

export const FINSERV_FEE_TYPES = [
  'Fixed Fee',
  'Variable Billing',
  'Hybrid (Fixed + Variable)',
] as const;

export const PIPELINE_FIELD_SCHEMAS: Record<string, PipelineSchema> = {
  finserv: {
    sectionLabel: 'FinServ Details',
    fields: [
      // Contact Email, Lead Source, and Referral Source (Person) have been
      // migrated into the shared Deal Information fields (Client Contact,
      // Sourced Via, Referral Source) and are intentionally hidden here for
      // FinServ deals. The underlying columns remain populated for legacy
      // data integrity.
      // Ordered so the 2-column grid reads as tight, balanced row pairs:
      //   Row 1: Opportunity Type | Fee Type           (commercial)
      //   Row 2: MRR              | One-Time Revenue   (commercial)
      //   Row 3: Contract Start   | Projected Close    (dates)
      //   Row 4: Contract End     | On Hold            (dates + compact status)
      //   Row 5: Services Offered (full width)
      { key: 'opportunityType', label: 'Opportunity Type', type: 'select', options: FINSERV_OPPORTUNITY_TYPES, column: 'left' },
      { key: 'feeType', label: 'Fee Type', type: 'select', options: FINSERV_FEE_TYPES, column: 'right' },
      { key: 'mrr', label: 'MRR', type: 'currency', placeholder: '0', column: 'left' },
      { key: 'oneTimeRevenue', label: 'One-Time Revenue', type: 'currency', placeholder: '0', column: 'right' },
      { key: 'contractStartDate', label: 'Contract Start', type: 'date', column: 'left' },
      { key: 'projectedCloseDate', label: 'Projected Close', type: 'date', column: 'right' },
      { key: 'contractEndDate', label: 'Contract End', type: 'date', column: 'left' },
      { key: 'onHold', label: 'On Hold', type: 'switch', column: 'right' },
      { key: 'servicesOffered', label: 'Services Offered', type: 'multi-select', options: FINSERV_SERVICES, column: 'full' },
    ],
  },
  // naitive / standard pipelines currently have no extra fields beyond the
  // shared Deal Information set. Add entries here as new pipeline-specific
  // attributes are introduced.
};

export function getPipelineSchema(dealClass: string | null | undefined): PipelineSchema | null {
  if (!dealClass) return null;
  return PIPELINE_FIELD_SCHEMAS[dealClass] ?? null;
}