import { useMemo } from 'react';
import type { Deal } from '@/types/deal';

interface ContextualPrompt {
  label: string;
  prompt: string;
  category: 'risk' | 'lender' | 'progress' | 'action' | 'research';
}

export function useContextualAIPrompts(deal: Deal | null | undefined) {
  return useMemo<ContextualPrompt[]>(() => {
    if (!deal) return [];

    const prompts: ContextualPrompt[] = [];
    const lenders = deal.lenders || [];
    const milestones = deal.milestones || [];
    const stage = deal.stage;
    const hasLenders = lenders.length > 0;
    const overdueMilestones = milestones.filter(m => !m.completed && m.dueDate && new Date(m.dueDate) < new Date());
    const staleLenders = lenders.filter(l => {
      if (!l.updatedAt) return false;
      const daysSince = (Date.now() - new Date(l.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7;
    });

    // Stage-specific prompts
    if (stage === 'screening' || stage === 'initial-review') {
      prompts.push(
        { label: 'Assess deal viability', prompt: `What are the key factors to assess whether ${deal.company} is viable for financing?`, category: 'research' },
        { label: 'Identify red flags', prompt: `What red flags or concerns should I watch for in the ${deal.company} deal at this early stage?`, category: 'risk' },
      );
    } else if (stage === 'outreach' || stage === 'lender-marketing') {
      prompts.push(
        { label: 'Draft lender intro', prompt: `Draft a brief lender introduction email for the ${deal.company} deal highlighting key credit strengths.`, category: 'action' },
        { label: 'Suggest target lenders', prompt: `Based on this deal profile, what types of lenders would be the best fit for ${deal.company}?`, category: 'lender' },
      );
    } else if (stage === 'diligence' || stage === 'underwriting') {
      prompts.push(
        { label: 'Diligence checklist gaps', prompt: `What key diligence items might still be missing for the ${deal.company} deal?`, category: 'progress' },
        { label: 'Summarize risks for IC', prompt: `Summarize the key risks and mitigants for ${deal.company} in a format suitable for an investment committee memo.`, category: 'risk' },
      );
    } else if (stage === 'term-sheet' || stage === 'closing') {
      prompts.push(
        { label: 'Compare term sheets', prompt: `Help me compare and analyze the term sheets received for ${deal.company}. What are the key differences to negotiate?`, category: 'lender' },
        { label: 'Draft closing checklist', prompt: `What are the typical closing conditions and checklist items I should track for ${deal.company}?`, category: 'action' },
      );
    }

    // Lender-specific prompts
    if (hasLenders) {
      prompts.push(
        { label: 'Lender process update', prompt: `Summarize the current lender process status for ${deal.company}. Which lenders are furthest along and which need follow-up?`, category: 'lender' },
      );
      if (staleLenders.length > 0) {
        const names = staleLenders.slice(0, 3).map(l => l.name).join(', ');
        prompts.push(
          { label: `Follow up with stale lenders`, prompt: `Draft follow-up messages for lenders that haven't been updated recently: ${names}. Keep the tone professional but create urgency.`, category: 'action' },
        );
      }
    } else {
      prompts.push(
        { label: 'Build lender strategy', prompt: `Help me build a lender outreach strategy for ${deal.company}. What should the approach be?`, category: 'lender' },
      );
    }

    // Milestone-specific prompts
    if (overdueMilestones.length > 0) {
      prompts.push(
        { label: `${overdueMilestones.length} overdue milestone${overdueMilestones.length > 1 ? 's' : ''}`, prompt: `I have ${overdueMilestones.length} overdue milestones for ${deal.company}: ${overdueMilestones.map(m => m.title).join(', ')}. What's the best way to get back on track?`, category: 'progress' },
      );
    }

    // Status-specific
    if (deal.isFlagged) {
      prompts.push(
        { label: 'Why is this flagged?', prompt: `This deal is flagged${deal.flagNotes ? ` with note: "${deal.flagNotes}"` : ''}. What actions should I take to resolve the flag on ${deal.company}?`, category: 'risk' },
      );
    }

    // Always-available prompts
    prompts.push(
      { label: 'Generate lender memo', prompt: `Generate a full lender-ready memo for the ${deal.company} deal.`, category: 'action' },
      { label: 'Key risks & hurdles', prompt: `What are the key risks and hurdles for the ${deal.company} deal?`, category: 'risk' },
    );

    return prompts;
  }, [deal]);
}
