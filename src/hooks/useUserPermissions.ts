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

export function useUserPermissions() {
  const { user } = useAuth();

  const getUserPermissions = (): UserPermissionState => {
    if (!user?.id) return DEFAULT_PERMISSIONS;
    
    try {
      const stored = localStorage.getItem('user_page_permissions');
      if (!stored) return DEFAULT_PERMISSIONS;
      
      const allPermissions = JSON.parse(stored) as Record<string, UserPermissionState>;
      return allPermissions[user.id] || DEFAULT_PERMISSIONS;
    } catch {
      return DEFAULT_PERMISSIONS;
    }
  };

  const permissions = getUserPermissions();

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
