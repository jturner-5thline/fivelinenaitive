import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NewsChannel {
  id: string;
  name: string;
  keywords: string[];
  sources: string[];
  color: string;
  position: number;
  is_active: boolean;
}

export function useNewsChannels() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<NewsChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('news_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('position');
    if (data) setChannels(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const createChannel = useCallback(async (channel: Omit<NewsChannel, 'id' | 'position' | 'is_active'>) => {
    if (!user) return;
    const { data } = await supabase
      .from('news_channels')
      .insert({ ...channel, user_id: user.id, position: channels.length })
      .select()
      .single();
    if (data) setChannels(prev => [...prev, data]);
    return data;
  }, [user, channels.length]);

  const updateChannel = useCallback(async (id: string, updates: Partial<NewsChannel>) => {
    if (!user) return;
    await supabase.from('news_channels').update(updates).eq('id', id).eq('user_id', user.id);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [user]);

  const deleteChannel = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('news_channels').delete().eq('id', id).eq('user_id', user.id);
    setChannels(prev => prev.filter(c => c.id !== id));
  }, [user]);

  return { channels, isLoading, createChannel, updateChannel, deleteChannel, refetch: fetchChannels };
}
