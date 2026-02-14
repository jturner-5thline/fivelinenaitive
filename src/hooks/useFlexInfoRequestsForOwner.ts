import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FlexInfoRequestNotification {
  id: string;
  type: string;
  deal_id: string;
  message: string;
  user_email: string | null;
  lender_name: string | null;
  company_name: string | null;
  status: string;
  created_at: string;
}

export function useFlexInfoRequestsForOwner() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<FlexInfoRequestNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      // Get the user's company ID first
      const { data: membership, error: memberError } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (memberError || !membership) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      // Get all deal IDs in the user's company
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id')
        .eq('company_id', membership.company_id);

      if (dealsError) throw dealsError;

      const dealIds = (deals || []).map(d => d.id);
      if (dealIds.length === 0) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      // Get all info notifications for those deals
      const { data, error } = await supabase
        .from('flex_info_notifications')
        .select('*')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications((data as FlexInfoRequestNotification[]) || []);
    } catch (error) {
      console.error('Error fetching info request notifications:', error);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('flex-info-requests-owner')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flex_info_notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const pendingCount = notifications.filter(n => n.status === 'pending' || n.status === 'read').length;

  return {
    notifications,
    isLoading,
    pendingCount,
    refresh: fetchNotifications,
  };
}
