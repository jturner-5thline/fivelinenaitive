import { useMemo } from 'react';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';

export type KeyAlertType =
  | 'stale_lender'
  | 'missing_followup'
  | 'at_risk'
  | 'milestone_overdue';

export type KeyAlertPriority = 'high' | 'medium' | 'low';

export interface KeyAlert {
  id: string;
  type: KeyAlertType;
  title: string;
  description: string;
  dealId: string;
  dealName: string;
  priority: KeyAlertPriority;
  timestamp: Date;
}

/**
 * Shared Key Alerts feed used by both the (legacy) standalone widget and the
 * Key Alerts page inside the Deals dialog. Single source of truth so we don't
 * drift two implementations of stale-lender / at-risk / overdue-milestone
 * detection.
 */
export function useKeyAlerts(options?: { dismissed?: Set<string> }) {
  const dismissed = options?.dismissed ?? new Set<string>();
  const { deals } = useDealsContext();
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const { toggles } = useDashboardLayout();

  return useMemo<KeyAlert[]>(() => {
    const displayName = profile?.display_name || profile?.first_name || '';
    const myDeals = deals.filter(
      (d) =>
        d.manager?.toLowerCase() === displayName?.toLowerCase() &&
        d.status !== 'archived',
    );
    const yellowThreshold = preferences?.lenderUpdateYellowDays ?? 7;
    const result: KeyAlert[] = [];

    myDeals.forEach((deal) => {
      // Stale lender alerts
      deal.lenders?.forEach((lender) => {
        if (lender.trackingStatus === 'active' && lender.updatedAt) {
          const daysSince = differenceInDays(new Date(), new Date(lender.updatedAt));
          if (daysSince >= yellowThreshold) {
            result.push({
              id: `stale-${deal.id}-${lender.id}`,
              type: 'stale_lender',
              title: `${lender.name} needs an update`,
              description: `No update in ${daysSince} days on ${deal.company}`,
              dealId: deal.id,
              dealName: deal.company,
              priority: daysSince >= yellowThreshold * 2 ? 'high' : 'medium',
              timestamp: new Date(lender.updatedAt),
            });
          }
        }
      });

      // At-risk deals
      if (deal.status === 'at-risk' || deal.status === 'off-track') {
        result.push({
          id: `risk-${deal.id}`,
          type: 'at_risk',
          title: `${deal.company} is ${
            deal.status === 'at-risk' ? 'at risk' : 'off track'
          }`,
          description: 'Deal status requires attention',
          dealId: deal.id,
          dealName: deal.company,
          priority: deal.status === 'off-track' ? 'high' : 'medium',
          timestamp: new Date(deal.updatedAt),
        });
      }

      // Overdue milestones
      deal.milestones?.forEach((m) => {
        if (!m.completed && m.dueDate && new Date(m.dueDate) < new Date()) {
          result.push({
            id: `milestone-${m.id}`,
            type: 'milestone_overdue',
            title: `"${m.title}" is overdue`,
            description: `Due ${formatDistanceToNow(new Date(m.dueDate), {
              addSuffix: true,
            })} · ${deal.company}`,
            dealId: deal.id,
            dealName: deal.company,
            priority:
              differenceInDays(new Date(), new Date(m.dueDate)) > 7
                ? 'high'
                : 'medium',
            timestamp: new Date(m.dueDate),
          });
        }
      });
    });

    const priorityOrder: Record<KeyAlertPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    let filtered = result
      .filter((a) => !dismissed.has(a.id))
      .sort(
        (a, b) =>
          priorityOrder[a.priority] - priorityOrder[b.priority] ||
          b.timestamp.getTime() - a.timestamp.getTime(),
      );

    if (toggles.onlyUrgentAlerts) {
      filtered = filtered.filter((a) => a.priority === 'high');
    }

    return filtered;
  }, [deals, profile, preferences, dismissed, toggles.onlyUrgentAlerts]);
}