import type { Database } from '@/integrations/supabase/types';

export type ChannelTypeValue = Database['public']['Enums']['channel_type'];

/**
 * Canonical list of Channel Type options surfaced across Sales & BD.
 * These mirror the Rules Config defaults — Banks, Service Providers,
 * Investors, M&A, Advisors, Other.
 */
export const CHANNEL_TYPE_OPTIONS: { value: ChannelTypeValue; label: string; color: string }[] = [
  { value: 'Banks', label: 'Banks', color: '#3b82f6' },
  { value: 'M&A and Investment Bankers', label: 'M&A / IB', color: '#8b5cf6' },
  { value: 'Service Providers', label: 'Service Providers', color: '#f59e0b' },
  { value: 'Investors', label: 'Investors', color: '#10b981' },
  { value: 'Advisors', label: 'Debt Advisor', color: '#ec4899' },
  { value: 'Lenders' as ChannelTypeValue, label: 'Lenders', color: '#14b8a6' },
  { value: 'Other', label: 'Other', color: '#64748b' },
];

export const CHANNEL_TYPE_LABELS: Record<ChannelTypeValue, string> = CHANNEL_TYPE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<ChannelTypeValue, string>,
);

export function channelLabel(v: ChannelTypeValue | string | null | undefined): string {
  if (!v) return '—';
  return (CHANNEL_TYPE_LABELS as Record<string, string>)[v] || v;
}

export const CHANNEL_TYPE_VALUES: ChannelTypeValue[] = CHANNEL_TYPE_OPTIONS.map(o => o.value);