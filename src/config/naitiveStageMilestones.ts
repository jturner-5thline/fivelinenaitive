/**
 * Stage-specific milestone definitions for the naitive pipeline.
 * Only stages listed here show milestone diamonds on deal tiles.
 */
export interface NaitiveMilestoneDef {
  key: string;
  label: string;
  position: number;
}

export const NAITIVE_STAGE_MILESTONES: Record<string, NaitiveMilestoneDef[]> = {
  'intro-conversations': [
    { key: 'scheduled', label: 'Scheduled', position: 0 },
    { key: 'completed', label: 'Completed', position: 1 },
  ],
  'demo-completed': [
    { key: 'trial-access-granted', label: 'Trial Access Granted', position: 0 },
    { key: 'verbal-commit', label: 'Verbal Commit', position: 1 },
  ],
  'offer-sent': [
    { key: 'sent', label: 'Sent', position: 0 },
    { key: 'signed', label: 'Signed', position: 1 },
  ],
  'onboarding': [
    { key: 'info-gathered', label: 'Info Gathered', position: 0 },
    { key: 'kickoff-call-completed', label: 'Kick off call Completed', position: 1 },
    { key: 'data-migration-complete', label: 'Data Migration Complete', position: 2 },
    { key: 'team-onboarded', label: 'Team Onboarded', position: 3 },
  ],
};

/** Stages that have no milestones */
export const NAITIVE_NO_MILESTONE_STAGES = ['prospects', 'active-customer', 'close-lost-opportunity'];

export function getStageMilestones(stageId: string): NaitiveMilestoneDef[] {
  return NAITIVE_STAGE_MILESTONES[stageId] || [];
}
