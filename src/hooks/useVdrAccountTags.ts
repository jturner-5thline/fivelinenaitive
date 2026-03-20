import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AccountTag {
  document_id: string;
  account_category: string;
  confidence_score: number;
}

export function useVdrAccountTags(dealId: string) {
  const [tags, setTags] = useState<AccountTag[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('vdr_document_account_tags')
      .select('document_id, account_category, confidence_score')
      .eq('deal_id', dealId);

    if (!error && data) setTags(data);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const categories = useMemo(() => {
    const cats = new Set(tags.map(t => t.account_category));
    return [...cats].sort();
  }, [tags]);

  const tagsByDocId = useMemo(() => {
    const map = new Map<string, AccountTag[]>();
    for (const t of tags) {
      if (!map.has(t.document_id)) map.set(t.document_id, []);
      map.get(t.document_id)!.push(t);
    }
    return map;
  }, [tags]);

  return { tags, categories, tagsByDocId, loading, refetch: fetchTags };
}
