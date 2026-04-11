import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useMetricsEditPermission } from '@/hooks/useMetricsEditPermission';

export interface DashboardFolder {
  id: string;
  name: string;
  dashboardIds: string[];
  isExpanded: boolean;
}

interface DashboardFoldersContextType {
  folders: DashboardFolder[];
  createFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  moveDashboardToFolder: (dashboardId: string, folderId: string | null) => void;
  getDashboardFolder: (dashboardId: string) => string | null;
  getUnfolderedDashboardIds: (allDashboardIds: string[]) => string[];
  canEdit: boolean;
}

const DashboardFoldersContext = createContext<DashboardFoldersContextType | undefined>(undefined);

const CONFIG_KEY = 'dashboard_folders';

export function DashboardFoldersProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const { canEditMetrics } = useMetricsEditPermission();
  const [folders, setFolders] = useState<DashboardFolder[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from company_settings.fpa_dashboard_config[CONFIG_KEY]
  useEffect(() => {
    if (!company?.id) return;

    (async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('fpa_dashboard_config')
          .eq('company_id', company.id)
          .maybeSingle();

        const fpaConfig = (data?.fpa_dashboard_config as Record<string, any>) || {};
        if (fpaConfig[CONFIG_KEY] && Array.isArray(fpaConfig[CONFIG_KEY])) {
          setFolders(fpaConfig[CONFIG_KEY]);
        }
      } catch (err) {
        console.error('Error loading dashboard folders:', err);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [company?.id]);

  const persistFolders = useCallback((newFolders: DashboardFolder[]) => {
    if (!isLoaded || !company?.id || !canEditMetrics) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await supabase.rpc('save_fpa_dashboard_config' as any, {
          _company_id: company.id,
          _config_key: CONFIG_KEY,
          _config_value: newFolders,
        });
      } catch (err) {
        console.error('Error saving dashboard folders:', err);
      }
    }, 500);
  }, [isLoaded, company?.id, canEditMetrics]);

  const createFolder = useCallback((name: string) => {
    const updated = [...folders, {
      id: `folder-${Date.now()}`,
      name,
      dashboardIds: [],
      isExpanded: true,
    }];
    setFolders(updated);
    persistFolders(updated);
  }, [folders, persistFolders]);

  const renameFolder = useCallback((id: string, name: string) => {
    const updated = folders.map(f => f.id === id ? { ...f, name } : f);
    setFolders(updated);
    persistFolders(updated);
  }, [folders, persistFolders]);

  const deleteFolder = useCallback((id: string) => {
    const updated = folders.filter(f => f.id !== id);
    setFolders(updated);
    persistFolders(updated);
  }, [folders, persistFolders]);

  const toggleFolder = useCallback((id: string) => {
    // Toggle is a local UI state, no need to persist
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
  }, []);

  const moveDashboardToFolder = useCallback((dashboardId: string, folderId: string | null) => {
    const updated = folders.map(f => {
      const without = f.dashboardIds.filter(id => id !== dashboardId);
      if (f.id === folderId) {
        return { ...f, dashboardIds: [...without, dashboardId] };
      }
      return { ...f, dashboardIds: without };
    });
    setFolders(updated);
    persistFolders(updated);
  }, [folders, persistFolders]);

  const getDashboardFolder = useCallback((dashboardId: string) => {
    const folder = folders.find(f => f.dashboardIds.includes(dashboardId));
    return folder?.id ?? null;
  }, [folders]);

  const getUnfolderedDashboardIds = useCallback((allDashboardIds: string[]) => {
    const allFoldered = new Set(folders.flatMap(f => f.dashboardIds));
    return allDashboardIds.filter(id => !allFoldered.has(id));
  }, [folders]);

  return (
    <DashboardFoldersContext.Provider value={{
      folders,
      createFolder,
      renameFolder,
      deleteFolder,
      toggleFolder,
      moveDashboardToFolder,
      getDashboardFolder,
      getUnfolderedDashboardIds,
      canEdit: canEditMetrics,
    }}>
      {children}
    </DashboardFoldersContext.Provider>
  );
}

export function useDashboardFolders() {
  const context = useContext(DashboardFoldersContext);
  if (!context) {
    throw new Error('useDashboardFolders must be used within a DashboardFoldersProvider');
  }
  return context;
}
