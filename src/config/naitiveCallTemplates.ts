/**
 * Default templates for deal-level call records and calendar invite titles.
 * Spec: Nomenclature & Pipeline Stages doc — Call Nomenclature.
 *
 * Used by the Google Calendar / Email integration when creating invites
 * tied to a naitive pipeline deal. `{company}` is replaced with the deal's
 * company name at send time.
 */

export type NaitiveCallTemplateKey =
  | 'qualification-call'
  | 'feedback-walkthrough-call'
  | 'onboarding-call';

export interface NaitiveCallTemplate {
  key: NaitiveCallTemplateKey;
  label: string;
  /** Title format string. `{company}` is the only supported placeholder. */
  titleFormat: string;
  /** Canonical stage(s) this template is associated with. */
  stageTypes: string[];
}

export const NAITIVE_CALL_TEMPLATES: NaitiveCallTemplate[] = [
  {
    key: 'qualification-call',
    label: 'Qualification Call',
    titleFormat: '{company} <> naitive',
    stageTypes: ['qual-call'],
  },
  {
    key: 'feedback-walkthrough-call',
    label: 'Feedback & Walkthrough Call',
    titleFormat: '{company} <> naitive - Feedback & Walkthrough Call',
    stageTypes: ['demo-access'],
  },
  {
    key: 'onboarding-call',
    label: 'Onboarding Call',
    titleFormat: '{company} <> naitive - Onboarding Call',
    stageTypes: ['onboarding', 'pilot-agreed'],
  },
];

export function formatNaitiveCallTitle(
  key: NaitiveCallTemplateKey,
  companyName: string | null | undefined,
): string {
  const tpl = NAITIVE_CALL_TEMPLATES.find((t) => t.key === key);
  if (!tpl) return companyName ? `${companyName} <> naitive` : 'naitive';
  return tpl.titleFormat.replace('{company}', (companyName || '').trim() || 'Company');
}

export function getCallTemplatesForStage(stageType: string | null | undefined): NaitiveCallTemplate[] {
  if (!stageType) return [];
  return NAITIVE_CALL_TEMPLATES.filter((t) => t.stageTypes.includes(stageType));
}