import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface UserPermissionState {
  dashboard: boolean;
  deals: boolean;
  newsFeed: boolean;
  research: boolean;
  metrics: boolean;
  insights: boolean;
  salesBd: boolean;
  hr: boolean;
  operations: boolean;
  integrations: boolean;
  admin: boolean;
  settings: boolean;
  help: boolean;
  lenders: boolean;
  analytics: boolean;
  reports: boolean;
  canExport: boolean;
  canBulkEdit: boolean;
  canDelete: boolean;
  canViewFinancials: boolean;
  canViewSensitive: boolean;
  chatWidget: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissionState = {
  dashboard: true,
  deals: true,
  newsFeed: true,
  research: true,
  metrics: true,
  insights: true,
  salesBd: true,
  hr: true,
  operations: true,
  integrations: true,
  settings: true,
  help: true,
  lenders: true,
  analytics: true,
  reports: true,
  admin: true,
  canExport: true,
  canBulkEdit: true,
  canDelete: true,
  canViewFinancials: true,
  canViewSensitive: true,
  chatWidget: true,
};

// Custom event name for permission updates
export const PERMISSIONS_UPDATED_EVENT = 'user_permissions_updated';

export function useUserPermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissionState>(DEFAULT_PERMISSIONS);

  const loadPermissions = useCallback(() => {
    if (!user?.id) {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }
    
    try {
      const stored = localStorage.getItem('user_page_permissions');
      if (!stored) {
        setPermissions(DEFAULT_PERMISSIONS);
        return;
      }
      
      const allPermissions = JSON.parse(stored) as Record<string, UserPermissionState>;
      setPermissions(allPermissions[user.id] || DEFAULT_PERMISSIONS);
    } catch {
      setPermissions(DEFAULT_PERMISSIONS);
    }
  }, [user?.id]);

  // Load permissions on mount and when user changes
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Listen for permission updates (from admin panel or other tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_page_permissions') {
        loadPermissions();
      }
    };

    const handleCustomEvent = () => {
      loadPermissions();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(PERMISSIONS_UPDATED_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(PERMISSIONS_UPDATED_EVENT, handleCustomEvent);
    };
  }, [loadPermissions]);

  return {
    permissions,
    hasPermission: (key: keyof UserPermissionState) => permissions[key] ?? true,
    canAccessChatWidget: permissions.chatWidget,
    canExport: permissions.canExport,
    canBulkEdit: permissions.canBulkEdit,
    canDelete: permissions.canDelete,
    canViewFinancials: permissions.canViewFinancials,
    canViewSensitive: permissions.canViewSensitive,
  };
}
