import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';
import { useAuth } from '@/contexts/AuthContext';

/**
 * All dashboard tab keys that can be permission-controlled.
 */
export const ALL_DASHBOARD_TABS = [
  'overview',
  'pnl',
  'balance',
  'cashflow',
  'scenarios',
  'collaborate',
  'export',
  'salesBdRoi',
  'salesModel',
] as const;

export type DashboardTabKey = (typeof ALL_DASHBOARD_TABS)[number];

export const TAB_DISPLAY_NAMES: Record<DashboardTabKey, string> = {
  overview: 'Overview',
  pnl: 'P&L',
  balance: 'Balance Sheet',
  cashflow: 'Cash Flow',
  scenarios: 'Scenarios',
  collaborate: 'Collaborate',
  export: 'Board Pack',
  salesBdRoi: 'Sales & BD ROI',
  salesModel: 'Sales Model',
};

/** Emails that can see and manage the Permissions tab */
export const PERMISSIONS_ADMINS = ['jturner@5thline.co', 'jmoffitt@5thline.co'];

/** Hard-coded user list for the grid */
export const MANAGED_USERS = [
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'cminaldi@5thline.co',
];

/** Per-user permission map: email → set of allowed tab keys */
export type TabPermissions = Record<string, DashboardTabKey[]>;

/** Default permissions */
const DEFAULT_PERMISSIONS: TabPermissions = {
  'jturner@5thline.co': [...ALL_DASHBOARD_TABS],
  'jmoffitt@5thline.co': [...ALL_DASHBOARD_TABS],
  'cminaldi@5thline.co': ['salesBdRoi', 'salesModel'],
};

export function useFPATabPermissions() {
  const { company } = useCompany();
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<TabPermissions>(DEFAULT_PERMISSIONS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingSaveRef = useRef(false);

  const currentEmail = user?.email?.toLowerCase() ?? '';
  const isPermissionsAdmin = PERMISSIONS_ADMINS.includes(currentEmail);

  // Load from company_settings.fpa_dashboard_config.tab_permissions
  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('fpa_dashboard_config')
          .eq('company_id', company.id)
          .maybeSingle();

        if (error) { console.error(error); setIsLoaded(true); return; }

        const cfg = (data?.fpa_dashboard_config as Record<string, any>) || {};
        if (cfg.tab_permissions && typeof cfg.tab_permissions === 'object') {
          setPermissions({ ...DEFAULT_PERMISSIONS, ...cfg.tab_permissions });
        }
      } catch (err) {
        console.error('Error loading tab permissions:', err);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [company?.id]);

  // Realtime
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`fpa-tab-permissions-${company.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'company_settings',
        filter: `company_id=eq.${company.id}`,
      }, (payload) => {
        if (pendingSaveRef.current) return;
        const cfg = (payload.new as any)?.fpa_dashboard_config as Record<string, any> | null;
        if (cfg?.tab_permissions) {
          setPermissions({ ...DEFAULT_PERMISSIONS, ...cfg.tab_permissions });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [company?.id]);

  const savePermissions = useCallback(async (newPerms: TabPermissions) => {
    if (!company?.id || !isPermissionsAdmin) return false;

    pendingSaveRef.current = true;
    setIsSaving(true);
    setPermissions(newPerms);
    try {
      await supabase.rpc('save_fpa_dashboard_config' as any, {
        _company_id: company.id,
        _config_key: 'tab_permissions',
        _config_value: newPerms,
      });
      return true;
    } catch (err) {
      console.error('Error saving tab permissions:', err);
      return false;
    } finally {
      setIsSaving(false);
      setTimeout(() => { pendingSaveRef.current = false; }, 300);
    }
  }, [company?.id, isPermissionsAdmin]);

  /** Which tabs the current user can see */
  const allowedTabs: DashboardTabKey[] = (() => {
    // If no specific permission entry for this user, show all tabs (default open)
    const userPerms = permissions[currentEmail];
    if (!userPerms) return [...ALL_DASHBOARD_TABS];
    return userPerms;
  })();

  const canViewTab = useCallback((tab: string): boolean => {
    return allowedTabs.includes(tab as DashboardTabKey);
  }, [allowedTabs]);

  return {
    permissions,
    savePermissions,
    isLoaded,
    isSaving,
    isPermissionsAdmin,
    currentEmail,
    allowedTabs,
    canViewTab,
  };
}
