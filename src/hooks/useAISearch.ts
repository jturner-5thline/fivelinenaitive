import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AISearchResult {
  type: 'answer' | 'navigation' | 'data_query' | 'help';
  answer: string;
  dataTypes: string[];
  filters: Record<string, string | null>;
  navigation?: { page: string; description: string } | null;
  suggestedActions: string[];
  sources: string[];
  originalQuery: string;
}

export function useAISearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const search = useCallback(async (query: string): Promise<AISearchResult | null> => {
    if (!query.trim() || query.length < 3) {
      setResult(null);
      return null;
    }
    
    setIsSearching(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('universal-search', {
        body: { 
          query: query.trim(),
          userId: user?.id,
        },
      });

      if (fnError) {
        if (fnError.message?.includes('429') || fnError.message?.includes('Rate limit')) {
          const msg = "Too many requests. Please wait a moment.";
          toast.error(msg);
          setError(msg);
        } else if (fnError.message?.includes('402')) {
          const msg = "AI credits exhausted. Please contact your administrator.";
          toast.error(msg);
          setError(msg);
        } else {
          throw fnError;
        }
        return null;
      }
      
      setResult(data);
      return data;
    } catch (err) {
      console.error('AI search error:', err);
      const msg = "Search failed. Please try again.";
      toast.error(msg);
      setError(msg);
      return null;
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const getNavigationPath = useCallback((aiResult: AISearchResult): string | null => {
    if (aiResult.navigation?.page) {
      return aiResult.navigation.page;
    }
    
    const dataType = aiResult.dataTypes[0];
    const filters = aiResult.filters;
    
    switch (dataType) {
      case 'deals':
        const dealsUrl = new URL('/deals', window.location.origin);
        if (filters.stage) dealsUrl.searchParams.set('stage', filters.stage);
        if (filters.status) dealsUrl.searchParams.set('status', filters.status);
        if (filters.keyword) dealsUrl.searchParams.set('search', filters.keyword);
        return dealsUrl.pathname + dealsUrl.search;
      case 'lenders':
        return filters.keyword ? `/lenders?search=${encodeURIComponent(filters.keyword)}` : '/lenders';
      case 'analytics':
        return '/analytics';
      case 'insights':
        return '/insights';
      case 'activities':
        return '/notifications';
      case 'reports':
        return '/reports';
      case 'help':
      case 'documentation':
        return '/help';
      case 'privacy':
        return '/privacy';
      case 'terms':
        return '/terms';
      default:
        return null;
    }
  }, []);

  return {
    search,
    clear,
    result,
    isSearching,
    error,
    getNavigationPath,
  };
}
