import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DigestSettings {
  is_enabled: boolean;
  frequency: 'daily' | 'weekly';
  preferred_day: number;
  preferred_time: string;
  include_categories: string[];
  max_articles: number;
}

const DEFAULT_SETTINGS: DigestSettings = {
  is_enabled: false,
  frequency: 'weekly',
  preferred_day: 1,
  preferred_time: '09:00',
  include_categories: ['lenders', 'clients'],
  max_articles: 10,
};

export function useNewsDigestSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DigestSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    supabase
      .from('news_digest_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            is_enabled: data.is_enabled,
            frequency: data.frequency as 'daily' | 'weekly',
            preferred_day: data.preferred_day ?? 1,
            preferred_time: data.preferred_time ?? '09:00',
            include_categories: data.include_categories ?? ['lenders', 'clients'],
            max_articles: data.max_articles ?? 10,
          });
        }
        setIsLoading(false);
      });
  }, [user]);

  const updateSettings = useCallback(async (updates: Partial<DigestSettings>) => {
    if (!user) return;
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    await supabase
      .from('news_digest_settings')
      .upsert({ user_id: user.id, ...newSettings }, { onConflict: 'user_id' });
  }, [user, settings]);

  return { settings, isLoading, updateSettings };
}
