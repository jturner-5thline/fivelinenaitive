import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LenderMatch, DealCriteria } from './useLenderMatching';
import { MasterLender } from './useMasterLenders';

interface SemanticScore {
  lenderId: string;
  bonus: number;     // 0-30
  reason: string;
}

/**
 * Non-blocking semantic matching: takes rule-based matches >= 30 score,
 * sends them in a single batch to AI, and returns bonus scores.
 */
export function useSemanticLenderMatching(
  matches: LenderMatch[],
  criteria: DealCriteria,
  enabled: boolean = true
) {
  const [semanticScores, setSemanticScores] = useState<Map<string, SemanticScore>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runSemanticMatching = useCallback(async () => {
    // Only score lenders with rule-based score >= 30
    const candidates = matches.filter(m => m.score >= 30);
    if (!enabled || candidates.length === 0) return;

    // Build deal context string from enriched fields
    const dealContext = [
      criteria.companyDescription && `Company: ${criteria.companyDescription}`,
      criteria.industry && `Industry: ${criteria.industry}`,
      criteria.useOfFunds && `Use of funds: ${criteria.useOfFunds}`,
      criteria.existingDebt && `Existing debt: ${criteria.existingDebt}`,
      criteria.grossMargins && `Gross margins: ${criteria.grossMargins}`,
      criteria.profitability && `Profitability: ${criteria.profitability}`,
      criteria.dealNotes?.length && `Deal notes: ${criteria.dealNotes.slice(0, 3).join('; ')}`,
      criteria.existingLenderFeedback?.length && `Lender feedback: ${criteria.existingLenderFeedback.slice(0, 5).join('; ')}`,
    ].filter(Boolean).join('\n');

    if (dealContext.length < 20) return; // Not enough context for semantic matching

    // Build lender summaries
    const lenderSummaries = candidates.slice(0, 25).map(m => ({
      id: m.lender.id,
      name: m.lender.name,
      text: [
        m.lender.deal_structure_notes,
        m.lender.company_requirements,
        m.lender.industries?.join(', '),
        m.lender.loan_types?.join(', '),
      ].filter(Boolean).join('. '),
    }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('semantic-lender-match', {
        body: { dealContext, lenderSummaries },
      });

      if (controller.signal.aborted) return;
      if (error) throw error;

      const scores = new Map<string, SemanticScore>();
      const results = data?.scores || [];
      for (const r of results) {
        scores.set(r.lenderId, {
          lenderId: r.lenderId,
          bonus: Math.min(30, Math.max(0, r.bonus || 0)),
          reason: r.reason || '',
        });
      }
      setSemanticScores(scores);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Semantic matching error:', err);
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [matches, criteria, enabled]);

  useEffect(() => {
    const timer = setTimeout(runSemanticMatching, 300); // Debounce
    return () => { clearTimeout(timer); abortRef.current?.abort(); };
  }, [runSemanticMatching]);

  // Merge semantic scores into matches
  const enhancedMatches = matches.map(m => {
    const semantic = semanticScores.get(m.lender.id);
    if (!semantic) return { ...m, semanticLoading: isLoading && m.score >= 30 };

    const bonus = semantic.bonus;
    const combined = m.score + bonus;
    const tier = combined >= 90 ? 'top' as const
      : combined >= 70 ? 'strong' as const
      : combined >= 50 ? 'possible' as const
      : 'weak' as const;

    return {
      ...m,
      semanticBonus: bonus,
      combinedScore: combined,
      matchPercent: Math.round((combined / 130) * 100),
      tier,
      semanticReason: semantic.reason,
      semanticLoading: false,
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore);

  return {
    enhancedMatches,
    isSemanticLoading: isLoading,
    hasSemanticData: semanticScores.size > 0,
  };
}
