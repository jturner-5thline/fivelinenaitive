import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  hr: false,
  operations: false,
  integrations: false,
  settings: true,
  help: true,
  lenders: true,
  analytics: true,
  reports: true,
  admin: false,
  canExport: false,
  canBulkEdit: false,
  canDelete: false,
  canViewFinancials: false,
  canViewSensitive: false,
  chatWidget: true,
};

// Custom event name for permission updates
export const PERMISSIONS_UPDATED_EVENT = 'user_permissions_updated';

export function useUserPermissions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: dbPermissions } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_permissions')
        .select('permissions')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error loading permissions:', error);
        return null;
      }
      return data?.permissions as unknown as UserPermissionState | null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const permissions: UserPermissionState = dbPermissions
    ? { ...DEFAULT_PERMISSIONS, ...dbPermissions }
    : DEFAULT_PERMISSIONS;

  // Listen for permission updates to refetch
  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', user?.id] });
    };

    window.addEventListener(PERMISSIONS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(PERMISSIONS_UPDATED_EVENT, handleUpdate);
  }, [queryClient, user?.id]);

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
