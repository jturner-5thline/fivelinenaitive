import { describe, it, expect } from 'vitest';
import { channelPartnerStageFor, CHANNEL_PARTNER_STAGES } from './channelPartnerStages';

describe('channelPartnerStageFor', () => {
  it('orders the four stages left to right', () => {
    expect(CHANNEL_PARTNER_STAGES.map(s => s.label)).toEqual(['Prospect', 'Nurturing', 'Trial', 'Engaged']);
  });
  it('maps existing stages', () => {
    expect(channelPartnerStageFor('On Hold')).toBe('prospect');
    expect(channelPartnerStageFor('Added to Ecosystem')).toBe('prospect');
    expect(channelPartnerStageFor('Nurturing')).toBe('nurturing');
    expect(channelPartnerStageFor('Trial / Pilot')).toBe('trial');
    expect(channelPartnerStageFor('Proposal Issued')).toBe('trial');
    expect(channelPartnerStageFor('Active Partner')).toBe('engaged');
  });
  it('drops exited partners', () => {
    expect(channelPartnerStageFor('Terminated')).toBeNull();
    expect(channelPartnerStageFor('Not a fit')).toBeNull();
  });
});
