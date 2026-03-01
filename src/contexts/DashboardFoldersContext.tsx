import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';

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
}

const DashboardFoldersContext = createContext<DashboardFoldersContextType | undefined>(undefined);

const STORAGE_KEY = 'dashboard-folders';

export function DashboardFoldersProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<DashboardFolder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

  const createFolder = useCallback((name: string) => {
    setFolders(prev => [...prev, {
      id: `folder-${Date.now()}`,
      name,
      dashboardIds: [],
      isExpanded: true,
    }]);
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
  }, []);

  const moveDashboardToFolder = useCallback((dashboardId: string, folderId: string | null) => {
    setFolders(prev => prev.map(f => {
      const without = f.dashboardIds.filter(id => id !== dashboardId);
      if (f.id === folderId) {
        return { ...f, dashboardIds: [...without, dashboardId] };
      }
      return { ...f, dashboardIds: without };
    }));
  }, []);

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
