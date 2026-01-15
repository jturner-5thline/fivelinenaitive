import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationPreferences {
  notify_stale_alerts: boolean;
  notify_activity_lender_added: boolean;
  notify_activity_lender_updated: boolean;
  notify_activity_stage_changed: boolean;
  notify_activity_status_changed: boolean;
  notify_activity_milestone_added: boolean;
  notify_activity_milestone_completed: boolean;
  notify_activity_milestone_missed: boolean;
  notify_flex_alerts: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notify_stale_alerts: true,
  notify_activity_lender_added: true,
  notify_activity_lender_updated: true,
  notify_activity_stage_changed: true,
  notify_activity_status_changed: true,
  notify_activity_milestone_added: true,
  notify_activity_milestone_completed: true,
  notify_activity_milestone_missed: true,
  notify_flex_alerts: true,
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
      .select('notify_stale_alerts, notify_activity_lender_added, notify_activity_lender_updated, notify_activity_stage_changed, notify_activity_status_changed, notify_activity_milestone_added, notify_activity_milestone_completed, notify_activity_milestone_missed, notify_flex_alerts')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching notification preferences:', error);
    } else if (data) {
      setPreferences({
        notify_stale_alerts: data.notify_stale_alerts ?? true,
        notify_activity_lender_added: data.notify_activity_lender_added ?? true,
        notify_activity_lender_updated: data.notify_activity_lender_updated ?? true,
        notify_activity_stage_changed: data.notify_activity_stage_changed ?? true,
        notify_activity_status_changed: data.notify_activity_status_changed ?? true,
        notify_activity_milestone_added: (data as any).notify_activity_milestone_added ?? true,
        notify_activity_milestone_completed: (data as any).notify_activity_milestone_completed ?? true,
        notify_activity_milestone_missed: (data as any).notify_activity_milestone_missed ?? true,
        notify_flex_alerts: (data as any).notify_flex_alerts ?? true,
      });
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const shouldShowActivity = useCallback((activityType: string): boolean => {
    switch (activityType) {
      case 'lender_added':
        return preferences.notify_activity_lender_added;
      case 'lender_updated':
      case 'lender_stage_changed':
        return preferences.notify_activity_lender_updated;
      case 'stage_changed':
        return preferences.notify_activity_stage_changed;
      case 'status_changed':
        return preferences.notify_activity_status_changed;
      case 'milestone_added':
        return preferences.notify_activity_milestone_added;
      case 'milestone_completed':
        return preferences.notify_activity_milestone_completed;
      case 'milestone_missed':
        return preferences.notify_activity_milestone_missed;
      case 'deal_created':
        // Don't show deal_created notifications
        return false;
      default:
        return false; // Don't show unknown activity types
    }
  }, [preferences]);

  return {
    preferences,
    isLoading,
    shouldShowStaleAlerts: preferences.notify_stale_alerts,
    shouldShowFlexAlerts: preferences.notify_flex_alerts,
    shouldShowActivity,
    refresh: fetchPreferences,
  };
}
