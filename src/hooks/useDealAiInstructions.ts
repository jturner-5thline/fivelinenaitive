import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Manages the per-deal `ai_custom_instructions` field. The text is prepended
 * to every AI interaction on this deal so users can give the assistant
 * deal-specific guidance (formatting templates, lender preferences, etc).
 */
export function useDealAiInstructions(dealId: string | undefined) {
  const [instructions, setInstructions] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!dealId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabase
        .from('deals')
        .select('ai_custom_instructions')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.warn('[deal-ai-instructions] load failed:', error);
      setInstructions((data as any)?.ai_custom_instructions || '');
      setIsLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dealId]);

  const save = useCallback(async (value: string) => {
    if (!dealId) return false;
    setIsSaving(true);
    const trimmed = value.trim();
    const { error } = await supabase
      .from('deals')
      .update({ ai_custom_instructions: trimmed || null })
      .eq('id', dealId);
    setIsSaving(false);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return false;
    }
    setInstructions(trimmed);
    toast({ title: trimmed ? 'AI instructions saved' : 'AI instructions cleared' });
    return true;
  }, [dealId]);

  return { instructions, setInstructions, isLoading, isSaving, save };
}