import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Top-level FPA module tab keys (shown in FPAWorkspace).
 * 'dashboards' and 'data' are always visible (locked).
 */
export const ALL_MODULE_TABS = [
  'dashboards',
  'data',
  'sheets',
  'ai',
  'automations',
] as const;

export type ModuleTabKey = (typeof ALL_MODULE_TABS)[number];

export const MODULE_TAB_DISPLAY_NAMES: Record<ModuleTabKey, string> = {
  dashboards: 'Dashboards',
  data: 'Data',
  sheets: 'Sheets',
  ai: 'AI',
  automations: 'Automations',
};

/** Module tabs that cannot be hidden */
export const LOCKED_MODULE_TABS: ModuleTabKey[] = ['dashboards', 'data'];

/**
 * All dashboard sub-tab keys that can be permission-controlled.
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

/** Only jturner can manage tab visibility/permissions */
export const PERMISSIONS_ADMINS = ['jturner@5thline.co'];

/** Per-user permission map: email → set of allowed tab keys */
export type TabPermissions = Record<string, DashboardTabKey[]>;

/** Per-user module tab map: email → set of allowed module tab keys */
export type ModuleTabPermissions = Record<string, ModuleTabKey[]>;

/** Default permissions */
const DEFAULT_PERMISSIONS: TabPermissions = {
  'jturner@5thline.co': [...ALL_DASHBOARD_TABS],
  'jmoffitt@5thline.co': [...ALL_DASHBOARD_TABS],
  'cminaldi@5thline.co': ['salesBdRoi', 'salesModel'],
};

const DEFAULT_MODULE_PERMISSIONS: ModuleTabPermissions = {};

/** Info about a company member for the permissions grid */
export interface PermissionUser {
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

export function useFPATabPermissions() {
  const { company } = useCompany();
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<TabPermissions>(DEFAULT_PERMISSIONS);
  const [modulePermissions, setModulePermissions] = useState<ModuleTabPermissions>(DEFAULT_MODULE_PERMISSIONS);
  const [companyUsers, setCompanyUsers] = useState<PermissionUser[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingSaveRef = useRef(false);

  const currentEmail = user?.email?.toLowerCase() ?? '';
  const isPermissionsAdmin = PERMISSIONS_ADMINS.includes(currentEmail);

  // Load company members with profiles (email + names)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_team_members_for_mention', {
          _user_id: user.id,
        });
        if (error) { console.error('Error fetching team members:', error); return; }
        const users: PermissionUser[] = ((data as any[]) || []).map((m: any) => ({
          email: (m.email || '').toLowerCase(),
          displayName: m.display_name || [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || '',
          firstName: m.first_name || null,
          lastName: m.last_name || null,
        })).filter((u: PermissionUser) => u.email);
        setCompanyUsers(users);
      } catch (err) {
        console.error('Error fetching team members:', err);
      }
    })();
  }, [user?.id]);

  // Load from company_settings.fpa_dashboard_config
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
        if (cfg.module_tab_permissions && typeof cfg.module_tab_permissions === 'object') {
          setModulePermissions({ ...DEFAULT_MODULE_PERMISSIONS, ...cfg.module_tab_permissions });
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
        if (cfg?.module_tab_permissions) {
          setModulePermissions({ ...DEFAULT_MODULE_PERMISSIONS, ...cfg.module_tab_permissions });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [company?.id]);

  const savePermissions = useCallback(async (newPerms: TabPermissions, newModulePerms?: ModuleTabPermissions) => {
    if (!company?.id || !isPermissionsAdmin) return false;

    pendingSaveRef.current = true;
    setIsSaving(true);
    setPermissions(newPerms);
    if (newModulePerms) setModulePermissions(newModulePerms);

    try {
      // Save dashboard tab permissions
      await supabase.rpc('save_fpa_dashboard_config' as any, {
        _company_id: company.id,
        _config_key: 'tab_permissions',
        _config_value: newPerms,
      });

      // Save module tab permissions
      if (newModulePerms) {
        await supabase.rpc('save_fpa_dashboard_config' as any, {
          _company_id: company.id,
          _config_key: 'module_tab_permissions',
          _config_value: newModulePerms,
        });
      }

      return true;
    } catch (err) {
      console.error('Error saving tab permissions:', err);
      return false;
    } finally {
      setIsSaving(false);
      setTimeout(() => { pendingSaveRef.current = false; }, 300);
    }
  }, [company?.id, isPermissionsAdmin]);

  /** Which dashboard tabs the current user can see */
  const allowedTabs: DashboardTabKey[] = (() => {
    const userPerms = permissions[currentEmail];
    if (!userPerms) return [...ALL_DASHBOARD_TABS];
    return userPerms;
  })();

  /** Which module tabs the current user can see */
  const allowedModuleTabs: ModuleTabKey[] = (() => {
    const userPerms = modulePermissions[currentEmail];
    // If no explicit config for this user, show all
    if (!userPerms) return [...ALL_MODULE_TABS];
    // Always include locked tabs
    const set = new Set(userPerms);
    LOCKED_MODULE_TABS.forEach(t => set.add(t));
    return ALL_MODULE_TABS.filter(t => set.has(t));
  })();

  const canViewTab = useCallback((tab: string): boolean => {
    return allowedTabs.includes(tab as DashboardTabKey);
  }, [allowedTabs]);

  const canViewModuleTab = useCallback((tab: string): boolean => {
    return allowedModuleTabs.includes(tab as ModuleTabKey);
  }, [allowedModuleTabs]);

  return {
    permissions,
    modulePermissions,
    savePermissions,
    isLoaded,
    isSaving,
    isPermissionsAdmin,
    currentEmail,
    allowedTabs,
    allowedModuleTabs,
    canViewTab,
    canViewModuleTab,
    companyUsers,
  };
}
