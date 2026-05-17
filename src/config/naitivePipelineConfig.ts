/**
 * naitive Pipeline configuration — canonical stage types, descriptions,
 * synonym/alias matching, milestone defaults, and validation rules.
 *
 * Stages themselves persist on `deal_pipelines.stages` (JSONB). This module
 * provides the canonical mapping layer so renamed stages still receive the
 * right descriptions, milestone templates, and validation behavior.
 */

import { DealStageOption } from '@/contexts/DealStagesContext';
import type { NaitiveMilestoneDef } from '@/config/naitiveStageMilestones';

export type SystemStageType =
  | 'qual-call'
  | 'demo-access'
  | 'pilot-agreed'
  | 'onboarding'
  | 'active'
  | 'on-hold'
  | 'dormant'
  | 'closed-lost'
  | 'prospects'
  | 'churned';

export const SYSTEM_STAGE_TYPES: SystemStageType[] = [
  'prospects',
  'qual-call',
  'demo-access',
  'pilot-agreed',
  'onboarding',
  'active',
  'on-hold',
  'dormant',
  'closed-lost',
  'churned',
];

export const SYSTEM_STAGE_LABELS: Record<SystemStageType, string> = {
  'prospects': 'Prospects',
  'qual-call': 'Qualification Call Scheduled',
  'demo-access': 'Demo Access',
  'pilot-agreed': 'Pilot Agreed',
  'onboarding': 'Onboarding',
  'active': 'Active',
  'on-hold': 'On Hold',
  'dormant': 'Dormant',
  'closed-lost': 'Closed Lost',
  'churned': 'Churned',
};

/**
 * The canonical spec stages from the Nomenclature & Pipeline Stages doc.
 * Everything else (Prospects, Onboarding, Active, Churned) is an extended
 * stage kept for backwards compatibility but flagged as non-canonical.
 */
export const CANONICAL_SYSTEM_STAGE_TYPES: SystemStageType[] = [
  'qual-call',
  'demo-access',
  'pilot-agreed',
  'on-hold',
  'dormant',
  'closed-lost',
];

export function isCanonicalSystemStageType(t: SystemStageType | null | undefined): boolean {
  return !!t && CANONICAL_SYSTEM_STAGE_TYPES.includes(t);
}

export const CANONICAL_STAGES_HELP_TEXT =
  'Spec-canonical stages: Qualification Call Scheduled, Demo Access, Pilot Agreed, On Hold, Dormant, Closed Lost. Other stages (Prospects, Onboarding, Active, Churned) are kept as extended/operational stages and are not part of the canonical spec.';

/** Alias / synonym map → canonical stage type. Keys are normalized strings. */
const STAGE_ALIASES: Record<string, SystemStageType> = {
  // qual-call
  'qual call': 'qual-call',
  'qualcall': 'qual-call',
  'qualification': 'qual-call',
  'qualification call': 'qual-call',
  'qualification call scheduled': 'qual-call',
  'qual': 'qual-call',
  'qualified call': 'qual-call',
  // demo-access
  'demo': 'demo-access',
  'demo access': 'demo-access',
  'platform access': 'demo-access',
  'access': 'demo-access',
  'trial': 'demo-access',
  'trial access': 'demo-access',
  // pilot-agreed
  'pilot': 'pilot-agreed',
  'pilot agreed': 'pilot-agreed',
  'pilot confirmed': 'pilot-agreed',
  'verbal commit': 'pilot-agreed',
  'verbal commitment': 'pilot-agreed',
  'proposal': 'pilot-agreed',
  // onboarding
  'onboarding': 'onboarding',
  'onboard': 'onboarding',
  'kick off': 'onboarding',
  'kickoff': 'onboarding',
  // active
  'active': 'active',
  'active customer': 'active',
  'live': 'active',
  'won': 'active',
  'closed won': 'active',
  // on-hold
  'on hold': 'on-hold',
  'hold': 'on-hold',
  'paused': 'on-hold',
  'parked': 'on-hold',
  // dormant
  'dormant': 'dormant',
  'no response': 'dormant',
  'unresponsive': 'dormant',
  'cold': 'dormant',
  'nurture': 'dormant',
  // closed-lost
  'lost': 'closed-lost',
  'closed lost': 'closed-lost',
  'close lost': 'closed-lost',
  'closed lost opportunity': 'closed-lost',
  'disqualified': 'closed-lost',
  // prospects
  'prospect': 'prospects',
  'prospects': 'prospects',
  'leads': 'prospects',
  'new': 'prospects',
  // churned
  'churn': 'churned',
  'churned': 'churned',
  'cancelled': 'churned',
};

/** Normalize a stage label for matching: lowercase, strip punctuation, collapse spaces. */
export function normalizeStageLabel(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a stage's canonical system type.
 * Priority:
 *   1) Explicit `systemStageType` on the stage
 *   2) Exact normalized match against alias map (or canonical type name)
 *   3) Substring/contains match against alias keys
 */
export function resolveSystemStageType(
  stage: Pick<DealStageOption, 'id' | 'label' | 'systemStageType'> | null | undefined,
): SystemStageType | null {
  if (!stage) return null;
  if (stage.systemStageType && SYSTEM_STAGE_TYPES.includes(stage.systemStageType as SystemStageType)) {
    return stage.systemStageType as SystemStageType;
  }
  const candidates = [stage.id, stage.label].filter(Boolean) as string[];
  for (const raw of candidates) {
    const norm = normalizeStageLabel(raw);
    if (!norm) continue;
    // Exact alias match
    if (STAGE_ALIASES[norm]) return STAGE_ALIASES[norm];
    // Direct canonical name match (e.g. "qual-call" id)
    const dashed = norm.replace(/\s+/g, '-');
    if (SYSTEM_STAGE_TYPES.includes(dashed as SystemStageType)) return dashed as SystemStageType;
  }
  // Contains-match fallback
  for (const raw of candidates) {
    const norm = normalizeStageLabel(raw);
    if (!norm) continue;
    for (const [alias, type] of Object.entries(STAGE_ALIASES)) {
      if (norm.includes(alias) || alias.includes(norm)) return type;
    }
  }
  return null;
}

/** Default seeded description for each canonical stage type. */
export const STAGE_DESCRIPTION_DEFAULTS: Record<SystemStageType, string> = {
  'qual-call':
    'Entry point for all new leads. A call date is required when this stage is set. Once the Qualification Call is completed, an outcome field becomes mandatory: Demo Access (lead is qualified, credentials sent), Disqualified (→ Closed Lost), or No-Show (→ Dormant).',
  'demo-access':
    'Lead met qualification criteria. Credentials sent. 5-day access period begins. The Feedback & Walkthrough Call date must be logged when this stage is set. Access can be extended for an additional 5 days if needed. Check-in email sent 3 business days after access granted by the deal owner — split into two versions based on platform engagement.',
  'pilot-agreed':
    'Lead has verbally confirmed they want to move forward after the Feedback & Walkthrough Call. Onboarding handoff is triggered immediately, within the same day.',
  'onboarding':
    'Client is in the active onboarding phase. Working with the onboarding team to get set up.',
  'active':
    'Client is live and working on the platform. This is the long-term home for active clients. There is no separate Closed Won stage — active clients remain here.',
  'on-hold':
    'Lead is genuinely interested but not ready to move forward. Reason must be tagged (Timing or Product Gap). A revisit date must be logged — this stage should never sit without one. When the revisit date arrives, the record owner receives a CRM reminder to re-engage manually.',
  'dormant':
    'Triggered by no-show to the Qualification Call or Feedback & Walkthrough Call, or no response after either call with no clear next step agreed. A re-engagement sequence of 3 emails activates automatically from the record owner\u2019s account. If no response after all three emails → Closed Lost.',
  'closed-lost':
    'Lead explicitly disqualified at any stage. A specific disqualification reason must be logged before the stage can be saved — never left blank. No response is not a valid Closed Lost reason — those leads go to Dormant first.',
  'prospects': '',
  'churned': '',
};

/** Resolve the active description for a stage (admin override → seeded default). */
export function getStageDescription(stage: DealStageOption | null | undefined): string {
  if (!stage) return '';
  if (stage.description && stage.description.trim()) return stage.description;
  const type = resolveSystemStageType(stage);
  return type ? STAGE_DESCRIPTION_DEFAULTS[type] || '' : '';
}

/**
 * Default milestone templates, keyed by canonical system stage type.
 * Used as a fallback when no per-stage milestone overrides have been configured.
 */
export const MILESTONE_DEFAULTS_BY_SYSTEM_TYPE: Partial<Record<SystemStageType, NaitiveMilestoneDef[]>> = {
  'qual-call': [
    {
      key: 'demo-access-granted',
      label: 'Demo Access',
      description: 'Lead is qualified, credentials sent.',
      position: 0,
      isActive: true,
    },
    {
      key: 'disqualified',
      label: 'Disqualified',
      description: 'Lead is not a fit. Moves deal to Closed Lost.',
      position: 1,
      outcomeTargetStage: 'closed-lost',
      isActive: true,
    },
    {
      key: 'no-show',
      label: 'No-Show',
      description: 'Lead did not attend. Moves deal to Dormant.',
      position: 2,
      outcomeTargetStage: 'dormant',
      isActive: true,
    },
  ],
  'demo-access': [
    {
      key: 'feedback-call-scheduled',
      label: 'Feedback & Walkthrough Call scheduled',
      description: 'Call date logged. DM expected to attend.',
      position: 0,
      isActive: true,
    },
    {
      key: 'feedback-call-completed',
      label: 'Feedback & Walkthrough Call completed',
      description: 'Requires DM present. Outcome (Pilot Agreed / Access Extended / On Hold / Dormant) becomes mandatory.',
      position: 1,
      isActive: true,
    },
  ],
  'pilot-agreed': [
    {
      key: 'proposal-issued',
      label: 'Proposal Issued',
      description: 'Formal proposal has been sent to the lead. Awaiting review and sign-off.',
      position: 0,
      isActive: true,
    },
    {
      key: 'proposal-agreed',
      label: 'Proposal Agreed',
      description: 'Lead has agreed to the proposal terms. Contract or booking process begins.',
      position: 1,
      isActive: true,
    },
    {
      key: 'client-booked',
      label: 'Client Booked',
      description: 'Lead has signed. Handoff to onboarding is confirmed and scheduled.',
      position: 2,
      isActive: true,
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      description: 'Handoff to onboarding complete. Moves deal to Onboarding stage.',
      position: 3,
      outcomeTargetStage: 'onboarding',
      isActive: true,
    },
    {
      key: 'active',
      label: 'Active',
      description: 'Client is live on the platform. Moves deal to Active stage.',
      position: 4,
      outcomeTargetStage: 'active',
      isActive: true,
    },
  ],
};

/** Validation rules keyed off canonical type — consumable by deal forms. */
export interface StageValidationRule {
  requireFields?: string[];
  outcomeOptions?: string[];
  notes?: string;
  disallowReasons?: string[];
  allowedReasons?: string[];
}

const STAGE_VALIDATION_RULES: Partial<Record<SystemStageType, StageValidationRule>> = {
  'qual-call': {
    requireFields: ['qualCallDate'],
    outcomeOptions: ['Demo Access', 'Disqualified', 'No-Show'],
    notes: 'Outcome required once the call is completed.',
  },
  'demo-access': {
    requireFields: ['feedbackCallDate'],
    outcomeOptions: ['Pilot Agreed', 'Access Extended', 'On Hold', 'Dormant'],
    notes: 'Outcome required once the Feedback & Walkthrough Call is held with DM present.',
  },
  'on-hold': {
    requireFields: ['holdReason', 'revisitDate'],
    allowedReasons: ['Timing', 'Product Gap'],
    notes: 'Revisit date and hold reason both required.',
  },
  'closed-lost': {
    requireFields: ['disqualificationReason'],
    disallowReasons: ['No response'],
    notes: 'Use Dormant first for unresponsive leads.',
  },
  'active': {
    notes: 'Terminal won-state. No Closed Won stage exists.',
  },
  'dormant': {
    notes: 'Auto-triggers a 3-email re-engagement sequence. After 3 with no reply → Closed Lost.',
  },
};

export function getStageValidationRules(
  stage: DealStageOption | null | undefined,
): StageValidationRule | null {
  const type = resolveSystemStageType(stage);
  if (!type) return null;
  return STAGE_VALIDATION_RULES[type] || null;
}

/**
 * Seed missing descriptions and canonical types into a stage list without
 * overwriting admin-authored edits. Returns a new array and a `changed` flag.
 */
export function seedMissingStageDescriptions(stages: DealStageOption[]): {
  stages: DealStageOption[];
  changed: boolean;
} {
  let changed = false;
  const next = stages.map((s) => {
    const out: DealStageOption = { ...s };
    if (!out.systemStageType) {
      const resolved = resolveSystemStageType(out);
      if (resolved) {
        out.systemStageType = resolved;
        changed = true;
      }
    }
    if (!out.description || !out.description.trim()) {
      const seed = getStageDescription(out);
      if (seed) {
        out.description = seed;
        changed = true;
      }
    }
    if (typeof out.isActive !== 'boolean') {
      out.isActive = true;
    }
    return out;
  });
  return { stages: next, changed };
}
