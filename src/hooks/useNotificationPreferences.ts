import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationPreferences {
  notify_stale_alerts: boolean;
  notify_activity_deal_created: boolean;
  notify_activity_lender_added: boolean;
  notify_activity_lender_updated: boolean;
  notify_activity_stage_changed: boolean;
  notify_activity_status_changed: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notify_stale_alerts: true,
  notify_activity_deal_created: true,
  notify_activity_lender_added: true,
  notify_activity_lender_updated: true,
  notify_activity_stage_changed: true,
  notify_activity_status_changed: true,
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('notify_stale_alerts, notify_activity_deal_created, notify_activity_lender_added, notify_activity_lender_updated, notify_activity_stage_changed, notify_activity_status_changed')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching notification preferences:', error);
    } else if (data) {
      setPreferences({
        notify_stale_alerts: data.notify_stale_alerts ?? true,
        notify_activity_deal_created: data.notify_activity_deal_created ?? true,
        notify_activity_lender_added: data.notify_activity_lender_added ?? true,
        notify_activity_lender_updated: data.notify_activity_lender_updated ?? true,
        notify_activity_stage_changed: data.notify_activity_stage_changed ?? true,
        notify_activity_status_changed: data.notify_activity_status_changed ?? true,
      });
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const shouldShowActivity = useCallback((activityType: string): boolean => {
    switch (activityType) {
      case 'deal_created':
        return preferences.notify_activity_deal_created;
      case 'lender_added':
        return preferences.notify_activity_lender_added;
      case 'lender_updated':
        return preferences.notify_activity_lender_updated;
      case 'stage_changed':
        return preferences.notify_activity_stage_changed;
      case 'status_changed':
        return preferences.notify_activity_status_changed;
      default:
        return true; // Show unknown activity types by default
    }
  }, [preferences]);

  return {
    preferences,
    isLoading,
    shouldShowStaleAlerts: preferences.notify_stale_alerts,
    shouldShowActivity,
    refresh: fetchPreferences,
  };
}
