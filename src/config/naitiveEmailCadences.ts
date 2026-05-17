/**
 * Configurable email cadences for the naitive pipeline.
 *
 * Mirrors the milestone config pattern: seeded defaults are merged with
 * user overrides persisted to localStorage. Shape is intentionally
 * structured so it can later be swapped for a Supabase-backed store and
 * wired into real outbound email automation.
 */

export type SenderType = 'deal-owner' | 'company-owner' | 'admin' | 'custom';
export type OffsetUnit = 'minutes' | 'hours' | 'days';
export type CadenceTriggerType =
  | 'stage-entered'
  | 'access-granted'
  | 'call-missed'
  | 'manual';
export type EmailTriggerType =
  | 'cadence-start'
  | 'after-previous'
  | 'before-scheduled-call'
  | 'after-scheduled-call'
  | 'manual';

export interface CadenceCondition {
  /** dotted attribute path resolved against a deal/lead engagement payload */
  field: string;
  operator: 'equals' | 'not-equals' | 'is-true' | 'is-false' | 'exists' | 'missing';
  value?: string | number | boolean;
}

export interface BranchRule {
  id: string;
  label: string;
  /** all conditions must match for this branch to apply */
  conditions: CadenceCondition[];
  /** ids of emails (within the cadence) that belong to this branch */
  emailIds: string[];
}

export type StageActionTarget = string; // canonical stage id, e.g. 'dormant'

export interface StageAction {
  id: string;
  /** When this action fires within the cadence lifecycle */
  trigger: 'on-cadence-start' | 'on-cadence-complete' | 'on-email-send';
  /** if trigger=on-email-send, which email triggers it */
  emailId?: string;
  /** target stage id */
  targetStage: StageActionTarget;
  /** required when targetStage === 'closed-lost' */
  closedLostReason?: string;
}

export interface CadenceEmail {
  id: string;
  sequenceOrder: number;
  name: string;
  subject: string;
  body: string;
  senderType: SenderType;
  triggerType: EmailTriggerType;
  triggerOffset: number;
  triggerOffsetUnit: OffsetUnit;
  businessDaysOnly: boolean;
  /** branch-key gates — empty means "always send" */
  conditions: CadenceCondition[];
  metadata?: Record<string, unknown>;
}

export interface EmailCadenceDef {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  systemCadenceType?: string;
  /** canonical stage types this cadence applies to */
  applicableStageTypes: string[];
  senderType: SenderType;
  triggerType: CadenceTriggerType;
  triggerOffset: number;
  triggerOffsetUnit: OffsetUnit;
  businessDaysOnly: boolean;
  /** human-readable preconditions, e.g. "5-minute we're on the call sent" */
  preconditions?: string[];
  branchRules: BranchRule[];
  emails: CadenceEmail[];
  stageActions: StageAction[];
  completionActions?: StageAction[];
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Seed cadences
// ---------------------------------------------------------------------------

const ACCESS_CHECKIN_V_A_EMAIL_1: CadenceEmail = {
  id: 'access-checkin-a-1',
  sequenceOrder: 1,
  name: 'Check-in (logged in)',
  subject: 'Quick check-in before we talk!',
  body:
    `Hey [First Name],\n\n` +
    `Just checking in ahead of our call.\n\n` +
    `Looks like you've been poking around, nice. We'll use the time to go through whatever you found, good or confusing.\n\n` +
    `If anything stood out, jot it down. No prep needed beyond that.\n\n` +
    `See you [date] at [time].\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'cadence-start',
  triggerOffset: 0,
  triggerOffsetUnit: 'minutes',
  businessDaysOnly: false,
  conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-true' }],
};

const ACCESS_CHECKIN_V_A_EMAIL_2: CadenceEmail = {
  id: 'access-checkin-a-2',
  sequenceOrder: 2,
  name: 'Reminder (logged in)',
  subject: 'Just a reminder, our call is coming up!',
  body:
    `Hey [First Name],\n\n` +
    `Just a heads up, we're on in an hour. Looking forward to it.\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'before-scheduled-call',
  triggerOffset: 1,
  triggerOffsetUnit: 'hours',
  businessDaysOnly: false,
  conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-true' }],
};

const ACCESS_CHECKIN_V_B_EMAIL_1: CadenceEmail = {
  id: 'access-checkin-b-1',
  sequenceOrder: 1,
  name: 'Check-in (not logged in)',
  subject: 'Quick check-in before we talk!',
  body:
    `Hey [First Name],\n\n` +
    `Just checking in ahead of our call.\n\n` +
    `If you haven't had a chance to get into the platform yet, even a few hours before we speak will make the conversation way more useful.\n\n` +
    `Easiest place to start: create a dummy deal and see how it flows. No right or wrong way to do it.\n\n` +
    `See you [date] at [time].\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'cadence-start',
  triggerOffset: 0,
  triggerOffsetUnit: 'minutes',
  businessDaysOnly: false,
  conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-false' }],
};

const ACCESS_CHECKIN_V_B_EMAIL_2: CadenceEmail = {
  id: 'access-checkin-b-2',
  sequenceOrder: 2,
  name: 'Reminder (not logged in)',
  subject: 'Just a reminder, our call is coming up!',
  body:
    `Hey [First Name],\n\n` +
    `Just a heads up, we're on in an hour. Looking forward to it.\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'before-scheduled-call',
  triggerOffset: 1,
  triggerOffsetUnit: 'hours',
  businessDaysOnly: false,
  conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-false' }],
};

const ACCESS_PERIOD_CHECKIN: EmailCadenceDef = {
  id: 'access-period-checkin',
  name: 'Access Period Check-in',
  description:
    'Engagement-aware check-in three business days after platform access is granted, ' +
    'with a one-hour reminder before the scheduled feedback/walkthrough call.',
  isActive: true,
  systemCadenceType: 'access-period-checkin',
  applicableStageTypes: ['demo-access'],
  senderType: 'deal-owner',
  triggerType: 'access-granted',
  triggerOffset: 3,
  triggerOffsetUnit: 'days',
  businessDaysOnly: true,
  branchRules: [
    {
      id: 'branch-logged-in',
      label: 'Version A — Lead has logged in',
      conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-true' }],
      emailIds: [ACCESS_CHECKIN_V_A_EMAIL_1.id, ACCESS_CHECKIN_V_A_EMAIL_2.id],
    },
    {
      id: 'branch-not-logged-in',
      label: 'Version B — Lead has not logged in',
      conditions: [{ field: 'lead.hasLoggedIn', operator: 'is-false' }],
      emailIds: [ACCESS_CHECKIN_V_B_EMAIL_1.id, ACCESS_CHECKIN_V_B_EMAIL_2.id],
    },
  ],
  emails: [
    ACCESS_CHECKIN_V_A_EMAIL_1,
    ACCESS_CHECKIN_V_A_EMAIL_2,
    ACCESS_CHECKIN_V_B_EMAIL_1,
    ACCESS_CHECKIN_V_B_EMAIL_2,
  ],
  stageActions: [],
  sortOrder: 1,
};

const NO_SHOW_EMAIL_1: CadenceEmail = {
  id: 'no-show-1',
  sequenceOrder: 1,
  name: 'Sorry we missed each other',
  subject: 'Sorry we missed each other',
  body:
    `Hey [First Name],\n\n` +
    `Sorry we missed you today! I'd love to find another time.\n\n` +
    `Happy to push it out a few days if that works better, whatever works for you.\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'cadence-start',
  triggerOffset: 0,
  triggerOffsetUnit: 'minutes',
  businessDaysOnly: false,
  conditions: [],
};

const NO_SHOW_EMAIL_2: CadenceEmail = {
  id: 'no-show-2',
  sequenceOrder: 2,
  name: 'Bump',
  subject: 'Re: Sorry we missed each other',
  body:
    `Hey [First Name],\n\n` +
    `Just bumping this up in case it got buried.\n\n` +
    `Still happy to connect whenever. And if the timing just isn't right at the moment, no worries at all, just let me know.\n\n[Name]`,
  senderType: 'deal-owner',
  triggerType: 'after-previous',
  triggerOffset: 2,
  triggerOffsetUnit: 'days',
  businessDaysOnly: true,
  conditions: [],
};

const NO_SHOW_EMAIL_3: CadenceEmail = {
  id: 'no-show-3',
  sequenceOrder: 3,
  name: 'Closing the loop',
  subject: 'Closing the loop',
  body:
    `Hey [First Name],\n\n` +
    `Seems like the timing isn't quite right, I'll stop nudging.\n\n` +
    `Whenever it makes more sense, just drop me a line and we'll pick up from where we left off.\n\n` +
    `Take care.`,
  senderType: 'deal-owner',
  triggerType: 'after-previous',
  triggerOffset: 4,
  triggerOffsetUnit: 'days',
  businessDaysOnly: true,
  conditions: [],
};

const NO_SHOW_FEEDBACK_CALL: EmailCadenceDef = {
  id: 'no-show-feedback-call',
  name: 'No show to the Feedback Call Sequence',
  description:
    'Fires 20 minutes after a missed feedback & walkthrough call. Moves the lead to ' +
    'Dormant immediately, then to Closed Lost after the final follow-up if there is no response.',
  isActive: true,
  systemCadenceType: 'no-show-feedback-call',
  applicableStageTypes: ['demo-access', 'pilot-agreed'],
  senderType: 'deal-owner',
  triggerType: 'call-missed',
  triggerOffset: 20,
  triggerOffsetUnit: 'minutes',
  businessDaysOnly: false,
  preconditions: [
    "A 5-minute 'we're on the call' message has already been sent to the lead.",
  ],
  branchRules: [],
  emails: [NO_SHOW_EMAIL_1, NO_SHOW_EMAIL_2, NO_SHOW_EMAIL_3],
  stageActions: [
    {
      id: 'no-show-to-dormant',
      trigger: 'on-cadence-start',
      targetStage: 'dormant',
    },
    {
      id: 'no-show-to-closed-lost',
      trigger: 'on-email-send',
      emailId: NO_SHOW_EMAIL_3.id,
      targetStage: 'closed-lost',
      closedLostReason: 'went silent after follow up cadence',
    },
  ],
  sortOrder: 2,
};

export const DEFAULT_EMAIL_CADENCES: EmailCadenceDef[] = [
  ACCESS_PERIOD_CHECKIN,
  NO_SHOW_FEEDBACK_CALL,
];

// ---------------------------------------------------------------------------
// Persistence (mirrors milestone config pattern)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'naitive:email-cadence-config:v1';
const CHANGE_EVENT = 'naitive:email-cadence-config:change';

function readOverrides(): EmailCadenceDef[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as EmailCadenceDef[];
  } catch {
    /* ignore */
  }
  return null;
}

function writeOverrides(list: EmailCadenceDef[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export function getAllEmailCadences(): EmailCadenceDef[] {
  const overrides = readOverrides();
  if (overrides) return overrides;
  return JSON.parse(JSON.stringify(DEFAULT_EMAIL_CADENCES));
}

export function setAllEmailCadences(list: EmailCadenceDef[]) {
  const next = list
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c, i) => ({
      ...c,
      sortOrder: i,
      emails: c.emails
        .slice()
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((e, j) => ({ ...e, sequenceOrder: j + 1 })),
    }));
  writeOverrides(next);
}

export function resetEmailCadences() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function subscribeToEmailCadences(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCadencesForStage(stageType: string | undefined | null): EmailCadenceDef[] {
  if (!stageType) return [];
  return getAllEmailCadences().filter(
    (c) => c.isActive && c.applicableStageTypes.includes(stageType),
  );
}

function evalCondition(c: CadenceCondition, payload: Record<string, any>): boolean {
  const value = c.field.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), payload);
  switch (c.operator) {
    case 'equals': return value === c.value;
    case 'not-equals': return value !== c.value;
    case 'is-true': return value === true;
    case 'is-false': return value === false;
    case 'exists': return value != null;
    case 'missing': return value == null;
    default: return false;
  }
}

export function resolveCadenceBranch(
  cadence: EmailCadenceDef,
  payload: Record<string, any>,
): BranchRule | null {
  for (const b of cadence.branchRules) {
    if (b.conditions.every((c) => evalCondition(c, payload))) return b;
  }
  return null;
}

export interface CadenceValidationIssue {
  level: 'error' | 'warning';
  message: string;
  emailId?: string;
}

export function validateCadenceConfig(
  cadence: EmailCadenceDef,
  knownStageIds: string[] = [],
): CadenceValidationIssue[] {
  const issues: CadenceValidationIssue[] = [];
  if (!cadence.name.trim()) issues.push({ level: 'error', message: 'Cadence must have a name.' });
  if (cadence.emails.length === 0) issues.push({ level: 'error', message: 'Cadence must have at least one email.' });

  for (const e of cadence.emails) {
    if (!e.subject.trim()) issues.push({ level: 'error', message: 'Subject is required.', emailId: e.id });
    if (!e.body.trim()) issues.push({ level: 'error', message: 'Body is required.', emailId: e.id });
    if (e.triggerOffset < 0) issues.push({ level: 'error', message: 'Trigger offset must be ≥ 0.', emailId: e.id });
  }

  // Branch variants should be mutually exclusive on the same field/value combo
  const branchEmailIds = new Set<string>();
  for (const b of cadence.branchRules) {
    for (const id of b.emailIds) {
      if (branchEmailIds.has(id)) {
        issues.push({ level: 'warning', message: `Email ${id} is referenced by multiple branches.` });
      }
      branchEmailIds.add(id);
    }
  }

  for (const a of cadence.stageActions) {
    if (knownStageIds.length && !knownStageIds.includes(a.targetStage)) {
      issues.push({ level: 'error', message: `Stage action targets unknown stage "${a.targetStage}".` });
    }
    if (a.targetStage === 'closed-lost' && !a.closedLostReason?.trim()) {
      issues.push({ level: 'error', message: 'Closed Lost stage action requires a reason.' });
    }
  }
  return issues;
}

export interface ScheduledCadenceEvent {
  cadenceId: string;
  emailId: string;
  sequenceOrder: number;
  fireAt: Date;
  businessDaysOnly: boolean;
  senderType: SenderType;
  subject: string;
}

function addOffset(base: Date, offset: number, unit: OffsetUnit, businessDaysOnly: boolean): Date {
  const out = new Date(base);
  if (unit === 'minutes') out.setMinutes(out.getMinutes() + offset);
  else if (unit === 'hours') out.setHours(out.getHours() + offset);
  else {
    let remaining = offset;
    while (remaining > 0) {
      out.setDate(out.getDate() + 1);
      if (!businessDaysOnly) { remaining -= 1; continue; }
      const dow = out.getDay();
      if (dow !== 0 && dow !== 6) remaining -= 1;
    }
  }
  return out;
}

/**
 * Build a flat schedule of when emails in this cadence would fire for a deal.
 * `anchors` provides the reference timestamps that triggers anchor against.
 */
export function getScheduledCadenceEvents(
  cadence: EmailCadenceDef,
  payload: Record<string, any>,
  anchors: { cadenceStart?: Date; scheduledCall?: Date } = {},
): ScheduledCadenceEvent[] {
  const branch = resolveCadenceBranch(cadence, payload);
  const allowed = branch ? new Set(branch.emailIds) : null;

  const start = anchors.cadenceStart ?? new Date();
  const events: ScheduledCadenceEvent[] = [];
  let previousFire = start;

  for (const e of cadence.emails.slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder)) {
    if (allowed && !allowed.has(e.id)) continue;
    let fireAt = start;
    switch (e.triggerType) {
      case 'cadence-start':
        fireAt = addOffset(start, e.triggerOffset, e.triggerOffsetUnit, e.businessDaysOnly);
        break;
      case 'after-previous':
        fireAt = addOffset(previousFire, e.triggerOffset, e.triggerOffsetUnit, e.businessDaysOnly);
        break;
      case 'before-scheduled-call':
        if (anchors.scheduledCall) {
          fireAt = new Date(anchors.scheduledCall);
          fireAt = addOffset(fireAt, -e.triggerOffset, e.triggerOffsetUnit, false);
        }
        break;
      case 'after-scheduled-call':
        if (anchors.scheduledCall) {
          fireAt = addOffset(anchors.scheduledCall, e.triggerOffset, e.triggerOffsetUnit, e.businessDaysOnly);
        }
        break;
      case 'manual':
      default:
        fireAt = start;
    }
    previousFire = fireAt;
    events.push({
      cadenceId: cadence.id,
      emailId: e.id,
      sequenceOrder: e.sequenceOrder,
      fireAt,
      businessDaysOnly: e.businessDaysOnly,
      senderType: e.senderType,
      subject: e.subject,
    });
  }
  return events;
}

/**
 * Apply a stage action to a deal. Returns the patch that should be persisted.
 * Actual persistence is left to the caller so this stays UI-framework agnostic.
 */
export function applyCadenceStageAction(
  deal: { id: string; stage?: string | null },
  action: StageAction,
): { dealId: string; stage: string; closedLostReason?: string } {
  return {
    dealId: deal.id,
    stage: action.targetStage,
    closedLostReason: action.closedLostReason,
  };
}
