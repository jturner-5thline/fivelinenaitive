// Returns an evaluator that, given an email, computes which of the current
// user's personal + team email labels apply via their active rules.
//
// Used to render auto-tag chips (e.g. Niki's "From James" tag) in:
//   - The Inbox dialog email list (DealEmailsTab via InboxDialog)
//   - Niki's Daily Briefing → Email tab
//
// Pure client-side evaluation; no DB writes. Labels themselves are loaded
// via useEmailLabels (RLS-scoped to the current user / their company).

import { useCallback, useMemo } from 'react';
import { useEmailLabels, type EmailLabel } from './useEmailLabels';
import { evaluateAutoLabels, type AutoLabelEmailLike } from '@/utils/autoEmailLabels';

export function useAutoEmailLabelEvaluator() {
  const { labels, rules, isLoading } = useEmailLabels();

  const labelsWithRules = useMemo(() => {
    const ids = new Set(rules.filter(r => r.is_active).map(r => r.label_id));
    return labels.filter(l => ids.has(l.id));
  }, [labels, rules]);

  const evaluate = useCallback((email: AutoLabelEmailLike): EmailLabel[] => {
    return evaluateAutoLabels(email, labelsWithRules, rules);
  }, [labelsWithRules, rules]);

  return { evaluate, labels: labelsWithRules, rules, isLoading };
}