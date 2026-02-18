import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NewsAlert {
  id: string;
  keyword: string;
  is_active: boolean;
  notify_in_app: boolean;
  notify_email: boolean;
}

export function useNewsAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<NewsAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    supabase
      .from('news_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (data) setAlerts(data);
        setIsLoading(false);
      });
  }, [user]);

  const createAlert = useCallback(async (keyword: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('news_alerts')
      .insert({ user_id: user.id, keyword })
      .select()
      .single();
    if (data) setAlerts(prev => [...prev, data]);
  }, [user]);

  const updateAlert = useCallback(async (id: string, updates: Partial<NewsAlert>) => {
    if (!user) return;
    await supabase.from('news_alerts').update(updates).eq('id', id).eq('user_id', user.id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, [user]);

  const deleteAlert = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('news_alerts').delete().eq('id', id).eq('user_id', user.id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, [user]);

  const getMatchingAlerts = useCallback((text: string) => {
    return alerts.filter(a => a.is_active && text.toLowerCase().includes(a.keyword.toLowerCase()));
  }, [alerts]);

  return { alerts, isLoading, createAlert, updateAlert, deleteAlert, getMatchingAlerts };
}
