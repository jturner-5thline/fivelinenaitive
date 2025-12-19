import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface ReferralSource {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

export function useReferralSources() {
  const { user } = useAuth();
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReferralSources = useCallback(async () => {
    if (!user) {
      setReferralSources([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, email, phone, company')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      setReferralSources(data || []);
    } catch (error) {
      console.error('Error fetching referral sources:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReferralSources();
  }, [fetchReferralSources]);

  const addReferralSource = useCallback(async (name: string): Promise<ReferralSource | null> => {
    if (!user || !name.trim()) return null;

    try {
      const { data, error } = await supabase
        .from('referral_sources')
        .insert({
          name: name.trim(),
          user_id: user.id,
        })
        .select('id, name, email, phone, company')
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already exists",
            description: `"${name}" is already in your referral sources.`,
            variant: "destructive",
          });
          return referralSources.find(r => r.name.toLowerCase() === name.toLowerCase().trim()) || null;
        }
        throw error;
      }

      setReferralSources(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      
      toast({
        title: "Referral source added",
        description: `"${name}" has been added to your referral sources.`,
      });

      return data;
    } catch (error) {
      console.error('Error adding referral source:', error);
      toast({
        title: "Error",
        description: "Failed to add referral source.",
        variant: "destructive",
      });
      return null;
    }
  }, [user, referralSources]);

  const deleteReferralSource = useCallback(async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('referral_sources')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      setReferralSources(prev => prev.filter(r => r.id !== id));
      
      toast({
        title: "Referral source removed",
        description: "The referral source has been removed.",
      });
    } catch (error) {
      console.error('Error deleting referral source:', error);
      toast({
        title: "Error",
        description: "Failed to remove referral source.",
        variant: "destructive",
      });
    }
  }, [user]);

  return {
    referralSources,
    isLoading,
    addReferralSource,
    deleteReferralSource,
    refreshReferralSources: fetchReferralSources,
  };
}
