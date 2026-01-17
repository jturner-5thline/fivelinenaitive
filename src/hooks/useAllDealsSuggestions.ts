import { useMemo } from 'react';
import { differenceInDays, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { Deal, DealLender, DealMilestone } from '@/types/deal';

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
  const suggestions = useMemo(() => {
    const allSuggestions: DealSuggestion[] = [];

    deals.forEach(deal => {
      // Only show suggestions for active deals (not archived or on-hold)
      if (deal.status === 'archived' || deal.status === 'on-hold') return;

      const milestones = milestonesMap[deal.id] || [];

      // 1. Check for stale lenders (no update in 5+ days)
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
              title: `${lender.name} hasn't been updated in ${daysSinceUpdate} days`,
              description: `On deal "${deal.company}"`,
              actionLabel: 'Update Lender',
            });
          } else if (daysSinceUpdate >= 5) {
            allSuggestions.push({
              id: `stale-lender-${deal.id}-${lender.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'warning',
              priority: 'medium',
              title: `${lender.name} needs attention`,
              description: `${daysSinceUpdate} days since last update on "${deal.company}"`,
              actionLabel: 'Review',
            });
          }
        }
      });

      // 2. Check for overdue milestones
      milestones.forEach(milestone => {
        if (!milestone.completed && milestone.dueDate) {
          const dueDate = parseISO(milestone.dueDate);
          
          if (isPast(dueDate) && !isToday(dueDate)) {
            const daysOverdue = differenceInDays(new Date(), dueDate);
            allSuggestions.push({
              id: `overdue-milestone-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'warning',
              priority: daysOverdue >= 7 ? 'high' : 'medium',
              title: `"${milestone.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
              description: `On deal "${deal.company}"`,
              actionLabel: 'Complete or Reschedule',
            });
          } else if (isToday(dueDate)) {
            allSuggestions.push({
              id: `due-today-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'reminder',
              priority: 'high',
              title: `"${milestone.title}" is due today`,
              description: `On deal "${deal.company}"`,
              actionLabel: 'Mark Complete',
            });
          } else if (isTomorrow(dueDate)) {
            allSuggestions.push({
              id: `due-tomorrow-${deal.id}-${milestone.id}`,
              dealId: deal.id,
              dealName: deal.company,
              type: 'reminder',
              priority: 'medium',
              title: `"${milestone.title}" is due tomorrow`,
              description: `On deal "${deal.company}"`,
              actionLabel: 'View',
            });
          }
        }
      });

      // 3. Check for term sheet opportunities
      const termSheetLenders = deal.lenders?.filter(l => l.stage === 'Term Sheet') || [];
      if (termSheetLenders.length > 0) {
        allSuggestions.push({
          id: `term-sheet-${deal.id}`,
          dealId: deal.id,
          dealName: deal.company,
          type: 'opportunity',
          priority: 'high',
          title: `${termSheetLenders.length} lender${termSheetLenders.length > 1 ? 's at' : ' at'} Term Sheet`,
          description: `${deal.company} - ${termSheetLenders.map(l => l.name).join(', ')}`,
          actionLabel: 'Focus on closing',
        });
      }

      // 4. Check for stale deals (no update in 7+ days)
      if (deal.updatedAt) {
        const daysSinceDealUpdate = differenceInDays(new Date(), parseISO(deal.updatedAt));
        
        if (daysSinceDealUpdate >= 10) {
          allSuggestions.push({
            id: `stale-deal-${deal.id}`,
            dealId: deal.id,
            dealName: deal.company,
            type: 'warning',
            priority: daysSinceDealUpdate >= 14 ? 'high' : 'medium',
            title: `No updates in ${daysSinceDealUpdate} days`,
            description: `"${deal.company}" needs attention`,
            actionLabel: 'Review Deal',
          });
        }
      }

      // 5. Lenders stuck in early stages for 10+ days
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
          title: `${stuckLenders.length} lenders stuck in early stages`,
          description: `"${deal.company}" - consider follow-up or moving to pass`,
          actionLabel: 'Review Lenders',
        });
      }
    });

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return allSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [deals, milestonesMap]);

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
