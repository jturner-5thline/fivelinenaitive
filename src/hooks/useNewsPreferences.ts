import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NewsPreferences {
  id: string;
  user_id: string;
  onboarding_completed: boolean;
  industries: string[];
  keywords: string[];
  preferred_sources: string[];
  default_layout: string;
  default_tab: string;
  digest_frequency: string;
  digest_max_articles: number;
}

const defaultPreferences: Omit<NewsPreferences, 'id' | 'user_id'> = {
  onboarding_completed: false,
  industries: [],
  keywords: [],
  preferred_sources: [],
  default_layout: 'grid',
  default_tab: 'all',
  digest_frequency: 'none',
  digest_max_articles: 10,
};

export function useNewsPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NewsPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (!user) { setIsLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('news_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setPreferences(data as NewsPreferences | null);
    } catch (err) {
      console.error('Error fetching news preferences:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchPreferences(); }, [fetchPreferences]);

  const savePreferences = useCallback(async (prefs: Partial<Omit<NewsPreferences, 'id' | 'user_id'>>) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('news_preferences')
        .upsert({
          user_id: user.id,
          ...defaultPreferences,
          ...preferences,
          ...prefs,
        } as any, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      setPreferences(data as NewsPreferences);
    } catch (err) {
      console.error('Error saving news preferences:', err);
    }
  }, [user, preferences]);

  const needsOnboarding = !isLoading && (!preferences || !preferences.onboarding_completed);

  return { preferences, isLoading, needsOnboarding, savePreferences, refetch: fetchPreferences };
}
