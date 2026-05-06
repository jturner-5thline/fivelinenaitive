import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/**
 * Hook to persist dashboard widget configs (snapshot cards, hidden cards, custom widgets)
 * at the company level via company_settings.fpa_dashboard_config.
 * All company members see the same config; only admins can save changes.
 * Subscribes to realtime updates so non-admin users see changes instantly.
 */
export function useCompanyDashboardConfig<T extends Record<string, any>>(
  configKey: string,
  defaultValue: T,
  options?: { allowAllMembers?: boolean },
) {
  const { company, isAdmin, isOwner } = useCompany();
  const canEdit = options?.allowAllMembers ? !!company?.id : (isAdmin || isOwner);
  const [config, setConfig] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track locally-pending saves so we don't overwrite our own optimistic update
  const pendingSaveRef = useRef(false);

  // Load from company_settings.fpa_dashboard_config[configKey]
  useEffect(() => {
    if (!company?.id) return;
    // Reset loaded flag when key changes so consumers can re-hydrate.
    setIsLoaded(false);
    // Drop any pending debounced save from the *previous* key — otherwise
    // a save queued under e.g. JT could land in JM's blob after the user
    // switched tabs.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('fpa_dashboard_config')
          .eq('company_id', company.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading dashboard config:', error);
          setIsLoaded(true);
          return;
        }

        const fpaConfig = (data?.fpa_dashboard_config as Record<string, any>) || {};
        if (fpaConfig[configKey] !== undefined) {
          setConfig({ ...defaultValue, ...fpaConfig[configKey] });
        } else {
          // No saved value for this key — reset to default so callers don't
          // see stale data from a previously loaded key.
          setConfig(defaultValue);
        }
      } catch (err) {
        console.error('Error loading dashboard config:', err);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [company?.id, configKey]);

  // Realtime subscription — push config changes to all company members
  useEffect(() => {
    if (!company?.id) return;

    const channel = supabase
      .channel(`company-dashboard-config-${configKey}-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'company_settings',
          filter: `company_id=eq.${company.id}`,
        },
        (payload) => {
          // Skip if we have a pending save (avoid echo)
          if (pendingSaveRef.current) return;

          const fpaConfig = (payload.new as any)?.fpa_dashboard_config as Record<string, any> | null;
          if (fpaConfig && fpaConfig[configKey] !== undefined) {
            setConfig({ ...defaultValue, ...fpaConfig[configKey] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id, configKey]);

  // Debounced save — uses security-definer RPC so any company member can save
  const saveConfig = useCallback((newConfig: T) => {
    setConfig(newConfig);

    if (!canEdit || !company?.id) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = true;
    saveTimerRef.current = setTimeout(async () => {
      try {
        await supabase.rpc('save_fpa_dashboard_config' as any, {
          _company_id: company.id,
          _config_key: configKey,
          _config_value: newConfig,
        });
      } catch (err) {
        console.error('Error saving dashboard config:', err);
      } finally {
        setTimeout(() => { pendingSaveRef.current = false; }, 300);
      }
    }, 500);
  }, [canEdit, company?.id, configKey]);

  return { config, saveConfig, isLoaded, canEdit };
}
