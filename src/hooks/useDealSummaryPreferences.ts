import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface OrgNotificationDefaults {
  id: string;
  company_id: string;
  daily_deal_summary_enabled: boolean;
  daily_deal_summary_weekdays_only: boolean;
  daily_deal_summary_time_et: string | null;
  weekly_deal_summary_enabled: boolean;
  weekly_deal_summary_day_et: string | null;
  weekly_deal_summary_time_et: string | null;
}

export interface UserDealSummaryPrefs {
  id: string;
  user_id: string;
  daily_deal_summary_enabled: boolean | null;
  daily_deal_summary_time_et: string | null;
  weekly_deal_summary_enabled: boolean | null;
  weekly_deal_summary_day_et: string | null;
  weekly_deal_summary_time_et: string | null;
  last_daily_deal_summary_sent_at: string | null;
  last_weekly_deal_summary_sent_at: string | null;
}

export interface EffectiveDealSummaryPrefs {
  dailyEnabled: boolean;
  dailyTimeET: string;
  dailyWeekdaysOnly: boolean;
  weeklyEnabled: boolean;
  weeklyDayET: string;
  weeklyTimeET: string;
  // Source tracking
  dailyEnabledIsOverride: boolean;
  dailyTimeIsOverride: boolean;
  weeklyEnabledIsOverride: boolean;
  weeklyDayIsOverride: boolean;
  weeklyTimeIsOverride: boolean;
}

/**
 * Resolves effective deal summary preferences for the current user.
 * User overrides take precedence over org defaults.
 * null user fields = inherit from org. Org defaults default to false/off.
 */
export function useDealSummaryPreferences() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  // Fetch org defaults
  const orgDefaultsQuery = useQuery({
    queryKey: ['org-notification-defaults', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_notification_defaults')
        .select('*')
        .eq('company_id', company!.id)
        .maybeSingle();
      if (error) throw error;
      return data as OrgNotificationDefaults | null;
    },
  });

  // Fetch user prefs
  const userPrefsQuery = useQuery({
    queryKey: ['user-deal-summary-preferences', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_deal_summary_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserDealSummaryPrefs | null;
    },
  });

  // Compute effective preferences
  const orgDef = orgDefaultsQuery.data;
  const userPref = userPrefsQuery.data;

  const effective: EffectiveDealSummaryPrefs = {
    dailyEnabled: userPref?.daily_deal_summary_enabled ?? orgDef?.daily_deal_summary_enabled ?? false,
    dailyTimeET: (userPref?.daily_deal_summary_time_et ?? orgDef?.daily_deal_summary_time_et ?? '18:00').substring(0, 5),
    dailyWeekdaysOnly: orgDef?.daily_deal_summary_weekdays_only ?? true,
    weeklyEnabled: userPref?.weekly_deal_summary_enabled ?? orgDef?.weekly_deal_summary_enabled ?? false,
    weeklyDayET: userPref?.weekly_deal_summary_day_et ?? orgDef?.weekly_deal_summary_day_et ?? 'saturday',
    weeklyTimeET: (userPref?.weekly_deal_summary_time_et ?? orgDef?.weekly_deal_summary_time_et ?? '08:00').substring(0, 5),
    dailyEnabledIsOverride: userPref?.daily_deal_summary_enabled != null,
    dailyTimeIsOverride: userPref?.daily_deal_summary_time_et != null,
    weeklyEnabledIsOverride: userPref?.weekly_deal_summary_enabled != null,
    weeklyDayIsOverride: userPref?.weekly_deal_summary_day_et != null,
    weeklyTimeIsOverride: userPref?.weekly_deal_summary_time_et != null,
  };

  // Update user preferences
  const updateUserPrefs = useMutation({
    mutationFn: async (updates: Partial<Omit<UserDealSummaryPrefs, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_daily_deal_summary_sent_at' | 'last_weekly_deal_summary_sent_at'>>) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_deal_summary_preferences')
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() } as any,
          { onConflict: 'user_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-deal-summary-preferences', user?.id] });
      toast.success('Preference updated');
    },
    onError: () => {
      toast.error('Failed to update preference');
    },
  });

  // Update org defaults (admin only)
  const updateOrgDefaults = useMutation({
    mutationFn: async (updates: Partial<Omit<OrgNotificationDefaults, 'id' | 'company_id' | 'created_at' | 'updated_at'>>) => {
      if (!company?.id) throw new Error('No company');
      const { error } = await supabase
        .from('org_notification_defaults')
        .upsert(
          { company_id: company.id, ...updates, updated_at: new Date().toISOString() } as any,
          { onConflict: 'company_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-notification-defaults', company?.id] });
      toast.success('Organization defaults updated');
    },
    onError: () => {
      toast.error('Failed to update organization defaults');
    },
  });

  return {
    effective,
    orgDefaults: orgDef,
    userPrefs: userPref,
    isLoading: orgDefaultsQuery.isLoading || userPrefsQuery.isLoading,
    updateUserPrefs,
    updateOrgDefaults,
  };
}
