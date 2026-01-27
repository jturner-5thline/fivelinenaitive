import { useMemo } from 'react';
import { differenceInDays, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { Deal, DealLender, DealMilestone } from '@/types/deal';
import { usePreferences, SuggestionPreferences, DEFAULT_SUGGESTION_PREFERENCES } from '@/contexts/PreferencesContext';

export interface DealSuggestion {
  id: string;
  dealId: string;
  dealName: string;
  type: 'warning' | 'action' | 'opportunity' | 'reminder';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel?: string;
}

export function useAllDealsSuggestions(
  deals: Deal[],
  milestonesMap: Record<string, DealMilestone[]>
) {
  const { preferences } = usePreferences();
  const suggestionPrefs: SuggestionPreferences = preferences.suggestions ?? DEFAULT_SUGGESTION_PREFERENCES;

  const suggestions = useMemo(() => {
    const allSuggestions: DealSuggestion[] = [];

    deals.forEach(deal => {
      // Only show suggestions for active deals (not archived or on-hold)
      if (deal.status === 'archived' || deal.status === 'on-hold') return;

      const milestones = milestonesMap[deal.id] || [];

      // 1. Check for stale lenders (no update in 5+ days)
      if (suggestionPrefs.staleLenders) {
        deal.lenders?.forEach(lender => {
          if (lender.updatedAt && lender.stage !== 'Closed' && lender.stage !== 'Pass') {
            const daysSinceUpdate = differenceInDays(new Date(), parseISO(lender.updatedAt));
            
            if (daysSinceUpdate >= 7) {
              allSuggestions.push({
                id: `stale-lender-${deal.id}-${lender.id}`,
                dealId: deal.id,
                dealName: deal.company,
                type: 'warning',
                priority: 'high',
                title: `Follow up with ${lender.name}`,
                description: `${deal.company} • ${daysSinceUpdate} days since last update`,
                actionLabel: 'Update Status',
              });
            } else if (daysSinceUpdate >= 5) {
              allSuggestions.push({
                id: `stale-lender-${deal.id}-${lender.id}`,
                dealId: deal.id,
                dealName: deal.company,
                type: 'warning',
                priority: 'medium',
                title: `Check in with ${lender.name}`,
                description: `${deal.company} • ${daysSinceUpdate} days since last update`,
                actionLabel: 'Review',
              });
            }
          }
        });
      }

      // 2. Check for overdue milestones
      milestones.forEach(milestone => {
        if (!milestone.completed && milestone.dueDate) {
          const dueDate = parseISO(milestone.dueDate);
          
          if (suggestionPrefs.overdueMilestones && isPast(dueDate) && !isToday(dueDate)) {
            const daysOverdue = differenceInDays(new Date(), dueDate);
            allSuggestions.push({
              id: `overdue-milestone-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'warning',
              priority: daysOverdue >= 7 ? 'high' : 'medium',
              title: `Complete "${milestone.title}"`,
              description: `${deal.company} • ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
              actionLabel: 'Mark Complete',
            });
          } else if (suggestionPrefs.upcomingMilestones && isToday(dueDate)) {
            allSuggestions.push({
              id: `due-today-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'reminder',
              priority: 'high',
              title: `Complete "${milestone.title}" today`,
              description: `${deal.company} • Due today`,
              actionLabel: 'Mark Complete',
            });
          } else if (suggestionPrefs.upcomingMilestones && isTomorrow(dueDate)) {
            allSuggestions.push({
              id: `due-tomorrow-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'reminder',
              priority: 'medium',
              title: `Prepare for "${milestone.title}"`,
              description: `${deal.company} • Due tomorrow`,
              actionLabel: 'View Details',
            });
          }
        }
      });

      // 3. Check for term sheet opportunities
      if (suggestionPrefs.termSheetOpportunities) {
        const termSheetLenders = deal.lenders?.filter(l => l.stage === 'Term Sheet') || [];
        if (termSheetLenders.length > 0) {
          allSuggestions.push({
            id: `term-sheet-${deal.id}`,
            dealId: deal.id,
            dealName: deal.company,
            type: 'opportunity',
            priority: 'high',
            title: `Close ${deal.company} with ${termSheetLenders.length === 1 ? termSheetLenders[0].name : `${termSheetLenders.length} lenders`}`,
            description: `Term sheet${termSheetLenders.length > 1 ? 's' : ''} ready • ${termSheetLenders.map(l => l.name).join(', ')}`,
            actionLabel: 'Review Terms',
          });
        }
      }

      // 4. Check for stale deals (no update in 7+ days)
      if (suggestionPrefs.staleDeals && deal.updatedAt) {
        const daysSinceDealUpdate = differenceInDays(new Date(), parseISO(deal.updatedAt));
        
        if (daysSinceDealUpdate >= 10) {
          allSuggestions.push({
            id: `stale-deal-${deal.id}`,
            dealId: deal.id,
            dealName: deal.company,
            type: 'warning',
            priority: daysSinceDealUpdate >= 14 ? 'high' : 'medium',
            title: `Update status on ${deal.company}`,
            description: `No activity in ${daysSinceDealUpdate} days`,
            actionLabel: 'Review Deal',
          });
        }
      }

      // 5. Lenders stuck in early stages for 10+ days
      if (suggestionPrefs.stuckLenders) {
        const stuckLenders = deal.lenders?.filter(lender => {
          if (!lender.updatedAt) return false;
          const daysSinceUpdate = differenceInDays(new Date(), parseISO(lender.updatedAt));
          return ['Identified', 'Initial Outreach'].includes(lender.stage) && daysSinceUpdate >= 10;
        }) || [];

        if (stuckLenders.length >= 2) {
          allSuggestions.push({
            id: `stuck-lenders-${deal.id}`,
            dealId: deal.id,
            dealName: deal.company,
            type: 'action',
            priority: 'medium',
            title: `Move forward or pass on ${stuckLenders.length} lenders`,
            description: `${deal.company} • Stuck in early stages 10+ days`,
            actionLabel: 'Review Lenders',
          });
        }
      }
    });

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return allSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [deals, milestonesMap, suggestionPrefs]);

  const counts = useMemo(() => ({
    total: suggestions.length,
    high: suggestions.filter(s => s.priority === 'high').length,
    medium: suggestions.filter(s => s.priority === 'medium').length,
    low: suggestions.filter(s => s.priority === 'low').length,
    byType: {
      warning: suggestions.filter(s => s.type === 'warning').length,
      action: suggestions.filter(s => s.type === 'action').length,
      opportunity: suggestions.filter(s => s.type === 'opportunity').length,
      reminder: suggestions.filter(s => s.type === 'reminder').length,
    },
  }), [suggestions]);

  return { suggestions, counts };
}
