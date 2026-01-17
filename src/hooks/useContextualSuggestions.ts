import { useState, useEffect, useMemo } from 'react';
import { differenceInDays, differenceInHours, parseISO, isPast, isToday, isTomorrow } from 'date-fns';

export interface Suggestion {
  id: string;
  type: 'warning' | 'action' | 'opportunity' | 'reminder';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: 'navigate' | 'prompt' | 'highlight';
  actionData?: Record<string, unknown>;
}

interface LenderData {
  id: string;
  name: string;
  stage: string;
  updatedAt?: string;
  notes?: string;
}

interface MilestoneData {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
}

interface DealData {
  id: string;
  company: string;
  stage: string;
  status: string;
  updatedAt?: string;
  lenders?: LenderData[];
  milestones?: MilestoneData[];
  notes?: string;
}

export function useContextualSuggestions(deal: DealData | null) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const computedSuggestions = useMemo(() => {
    if (!deal) return [];

    const newSuggestions: Suggestion[] = [];

    // 1. Check for stale lenders (no update in 5+ business days)
    deal.lenders?.forEach(lender => {
      if (lender.updatedAt && lender.stage !== 'Closed' && lender.stage !== 'Pass') {
        const daysSinceUpdate = differenceInDays(new Date(), parseISO(lender.updatedAt));
        
        if (daysSinceUpdate >= 5) {
          newSuggestions.push({
            id: `stale-lender-${lender.id}`,
            type: 'warning',
            priority: daysSinceUpdate >= 7 ? 'high' : 'medium',
            title: `${lender.name} hasn't been updated in ${daysSinceUpdate} days`,
            description: `Consider reaching out or updating the status of this lender.`,
            actionLabel: 'Update Lender',
            actionType: 'highlight',
            actionData: { lenderId: lender.id },
          });
        }
      }
    });

    // 2. Check for overdue milestones
    deal.milestones?.forEach(milestone => {
      if (!milestone.completed && milestone.dueDate) {
        const dueDate = parseISO(milestone.dueDate);
        
        if (isPast(dueDate) && !isToday(dueDate)) {
          const daysOverdue = differenceInDays(new Date(), dueDate);
          newSuggestions.push({
            id: `overdue-milestone-${milestone.id}`,
            type: 'warning',
            priority: daysOverdue >= 7 ? 'high' : 'medium',
            title: `"${milestone.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
            description: 'This milestone has passed its due date.',
            actionLabel: 'Complete or Reschedule',
            actionType: 'highlight',
            actionData: { milestoneId: milestone.id },
          });
        } else if (isToday(dueDate)) {
          newSuggestions.push({
            id: `due-today-${milestone.id}`,
            type: 'reminder',
            priority: 'high',
            title: `"${milestone.title}" is due today`,
            description: 'Make sure to complete this milestone today.',
            actionLabel: 'Mark Complete',
            actionType: 'highlight',
            actionData: { milestoneId: milestone.id },
          });
        } else if (isTomorrow(dueDate)) {
          newSuggestions.push({
            id: `due-tomorrow-${milestone.id}`,
            type: 'reminder',
            priority: 'medium',
            title: `"${milestone.title}" is due tomorrow`,
            description: 'This milestone is coming up soon.',
            actionLabel: 'View Milestone',
            actionType: 'highlight',
            actionData: { milestoneId: milestone.id },
          });
        }
      }
    });

    // 3. Check for lenders without notes
    const lendersWithoutNotes = deal.lenders?.filter(l => 
      !l.notes && l.stage !== 'Identified' && l.stage !== 'Closed' && l.stage !== 'Pass'
    ) || [];
    
    if (lendersWithoutNotes.length > 0) {
      newSuggestions.push({
        id: 'lenders-no-notes',
        type: 'action',
        priority: 'low',
        title: `${lendersWithoutNotes.length} lender${lendersWithoutNotes.length > 1 ? 's have' : ' has'} no notes`,
        description: `Add notes to track conversations with ${lendersWithoutNotes.slice(0, 3).map(l => l.name).join(', ')}${lendersWithoutNotes.length > 3 ? ` and ${lendersWithoutNotes.length - 3} more` : ''}.`,
        actionLabel: 'Add Notes',
        actionType: 'navigate',
        actionData: { tab: 'lenders' },
      });
    }

    // 4. Check for lenders stuck in early stages
    const stuckLenders = deal.lenders?.filter(lender => {
      if (!lender.updatedAt) return false;
      const daysSinceUpdate = differenceInDays(new Date(), parseISO(lender.updatedAt));
      return ['Identified', 'Initial Outreach'].includes(lender.stage) && daysSinceUpdate >= 10;
    }) || [];

    if (stuckLenders.length > 0) {
      newSuggestions.push({
        id: 'stuck-early-stage',
        type: 'opportunity',
        priority: 'medium',
        title: `${stuckLenders.length} lender${stuckLenders.length > 1 ? 's are' : ' is'} stuck in early stages`,
        description: 'Consider following up or moving them to pass if not progressing.',
        actionLabel: 'Review Lenders',
        actionType: 'navigate',
        actionData: { tab: 'lenders' },
      });
    }

    // 5. Check for deals without recent activity
    if (deal.updatedAt) {
      const daysSinceDealUpdate = differenceInDays(new Date(), parseISO(deal.updatedAt));
      
      if (daysSinceDealUpdate >= 7 && deal.status === 'Active') {
        newSuggestions.push({
          id: 'stale-deal',
          type: 'warning',
          priority: 'medium',
          title: 'No updates in the past week',
          description: 'This deal hasn\'t had any activity recently. Consider updating the status.',
          actionLabel: 'Add Activity',
          actionType: 'prompt',
        });
      }
    }

    // 6. Check for closing opportunities
    const termSheetLenders = deal.lenders?.filter(l => l.stage === 'Term Sheet') || [];
    if (termSheetLenders.length > 0) {
      newSuggestions.push({
        id: 'term-sheet-opportunity',
        type: 'opportunity',
        priority: 'high',
        title: `${termSheetLenders.length} lender${termSheetLenders.length > 1 ? 's at' : ' at'} Term Sheet stage`,
        description: `${termSheetLenders.map(l => l.name).join(', ')} - focus on closing!`,
        actionLabel: 'View Details',
        actionType: 'navigate',
        actionData: { tab: 'lenders' },
      });
    }

    // 7. No milestones set
    if (!deal.milestones || deal.milestones.length === 0) {
      newSuggestions.push({
        id: 'no-milestones',
        type: 'action',
        priority: 'low',
        title: 'No milestones set for this deal',
        description: 'Adding milestones helps track progress and deadlines.',
        actionLabel: 'Add Milestone',
        actionType: 'navigate',
        actionData: { tab: 'deal-management' },
      });
    }

    // 8. All milestones completed
    if (deal.milestones && deal.milestones.length > 0 && deal.milestones.every(m => m.completed)) {
      newSuggestions.push({
        id: 'all-milestones-done',
        type: 'opportunity',
        priority: 'medium',
        title: 'All milestones completed!',
        description: 'Consider updating the deal stage or adding new milestones.',
        actionLabel: 'Review Deal',
        actionType: 'navigate',
        actionData: { tab: 'deal-info' },
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return newSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [deal]);

  useEffect(() => {
    setSuggestions(computedSuggestions);
  }, [computedSuggestions]);

  return { suggestions };
}
