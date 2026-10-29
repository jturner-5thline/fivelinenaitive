export type ChannelPartnerStageKey = 'prospect' | 'nurturing' | 'trial' | 'engaged';

export const CHANNEL_PARTNER_STAGES: { key: ChannelPartnerStageKey; label: string; definition: string }[] = [
  { key: 'prospect', label: 'Prospect', definition: 'Those who may be interested, yet to confirm.' },
  { key: 'nurturing', label: 'Nurturing', definition: 'Those who are interested and in discussions.' },
  { key: 'trial', label: 'Trial', definition: 'We are testing out the relationship.' },
  { key: 'engaged', label: 'Engaged', definition: 'We have an official agreement in place.' },
];

/**
 * Maps an existing partner pipeline stage name onto the 4-stage Channel
 * Partner view. Returns null for stages that leave the pipeline
 * (Terminated, Not a fit, Dormant).
 */
export function channelPartnerStageFor(stageName: string | null | undefined): ChannelPartnerStageKey | null {
  const n = (stageName || '').trim().toLowerCase();
  if (!n) return 'prospect';
  if (/terminat|not a fit|dormant|lost/.test(n)) return null;
  if (/active partner|engaged|agreement signed|^active$/.test(n)) return 'engaged';
  if (/trial|pilot|proposal|agreement/.test(n)) return 'trial';
  if (/nurtur|discussion|contacted/.test(n)) return 'nurturing';
  return 'prospect';
}
