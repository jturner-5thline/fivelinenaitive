import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const MEMO_SECTIONS = [
  { key: "executive_overview", heading: "Executive / Deal Overview" },
  { key: "facility_overview", heading: "Facility Overview" },
  { key: "financial_profile", heading: "Financial Profile" },
  { key: "credit_strengths", heading: "Key Credit Strengths" },
  { key: "key_risks", heading: "Key Risks & Hurdles" },
  { key: "lender_status", heading: "Lender Process & Status" },
  { key: "recommendation", heading: "Recommendation / Next Steps" },
] as const;

export type MemoSectionKey = typeof MEMO_SECTIONS[number]['key'];

export interface MemoResult {
  content: string;
  sections: Record<string, string>;
}

export function useDealSpaceMemo(dealId: string | undefined) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [memoContent, setMemoContent] = useState<string>('');
  const [memoSections, setMemoSections] = useState<Record<string, string>>({});

  const generateFullMemo = useCallback(async (): Promise<MemoResult | null> => {
    if (!dealId) return null;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'generate-memo' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const result: MemoResult = {
        content: data.content || '',
        sections: data.sections || {},
      };
      setMemoContent(result.content);
      setMemoSections(result.sections);
      return result;
    } catch (err) {
      console.error('Generate memo error:', err);
      toast({
        title: 'Memo generation failed',
        description: err instanceof Error ? err.message : 'Could not generate memo',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [dealId]);

  const regenerateSection = useCallback(async (sectionKey: string): Promise<string | null> => {
    if (!dealId) return null;
    setIsRegenerating(sectionKey);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'regenerate-section', sectionKey },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const newContent = data.content || '';
      
      // Update the section in state
      setMemoSections(prev => ({ ...prev, [sectionKey]: newContent }));
      
      // Rebuild full content by replacing section in the memo
      const section = MEMO_SECTIONS.find(s => s.key === sectionKey);
      if (section && memoContent) {
        const sectionPattern = new RegExp(
          `## ${section.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n## |$)`,
          'i'
        );
        const updatedContent = memoContent.replace(sectionPattern, newContent.trim());
        setMemoContent(updatedContent);
      }

      toast({ title: 'Section regenerated', description: `"${section?.heading}" has been updated.` });
      return newContent;
    } catch (err) {
      console.error('Regenerate section error:', err);
      toast({
        title: 'Regeneration failed',
        description: err instanceof Error ? err.message : 'Could not regenerate section',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsRegenerating(null);
    }
  }, [dealId, memoContent]);

  return {
    isGenerating,
    isRegenerating,
    memoContent,
    memoSections,
    generateFullMemo,
    regenerateSection,
    setMemoContent,
    setMemoSections,
  };
}
