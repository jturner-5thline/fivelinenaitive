import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from '@/hooks/use-toast';

export interface LenderEditPermissions {
  allowedRoles: ('owner' | 'admin' | 'member')[];
  allowMembersToEditStage: boolean;
  allowMembersToEditMilestones: boolean;
  allowMembersToEditNotes: boolean;
}

export interface CompanyPermissionSettings {
  lenderEdit: LenderEditPermissions;
}

const DEFAULT_PERMISSIONS: CompanyPermissionSettings = {
  lenderEdit: {
    allowedRoles: ['owner', 'admin', 'member'],
    allowMembersToEditStage: true,
    allowMembersToEditMilestones: true,
    allowMembersToEditNotes: true,
  },
};

export function usePermissionSettings() {
  const { company, userRole, isAdmin } = useCompany();
  const [settings, setSettings] = useState<CompanyPermissionSettings>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Check if current user can edit lender stages
  const canEditLenderStage = useCallback(() => {
    if (!userRole) return false;
    const { lenderEdit } = settings;
    if (lenderEdit.allowedRoles.includes(userRole)) {
      if (userRole === 'member') {
        return lenderEdit.allowMembersToEditStage;
      }
      return true;
    }
    return false;
  }, [userRole, settings]);

  // Check if current user can edit milestones
  const canEditMilestones = useCallback(() => {
    if (!userRole) return false;
    const { lenderEdit } = settings;
    if (lenderEdit.allowedRoles.includes(userRole)) {
      if (userRole === 'member') {
        return lenderEdit.allowMembersToEditMilestones;
      }
      return true;
    }
    return false;
  }, [userRole, settings]);

  // Check if current user can edit notes
  const canEditNotes = useCallback(() => {
    if (!userRole) return false;
    const { lenderEdit } = settings;
    if (lenderEdit.allowedRoles.includes(userRole)) {
      if (userRole === 'member') {
        return lenderEdit.allowMembersToEditNotes;
      }
      return true;
    }
    return false;
  }, [userRole, settings]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!company?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', company.id)
        .eq('setting_key', 'permissions')
        .maybeSingle();

      if (error) throw error;

      if (data?.setting_value) {
        setSettings({
          ...DEFAULT_PERMISSIONS,
          ...(data.setting_value as unknown as CompanyPermissionSettings),
        });
      }
    } catch (error) {
      console.error('Error fetching permission settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id]);

  // Save settings
  const saveSettings = useCallback(async (newSettings: CompanyPermissionSettings) => {
    if (!company?.id || !isAdmin) {
      toast({
        title: "Not authorized",
        description: "Only admins can change permission settings",
        variant: "destructive",
      });
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert({
          company_id: company.id,
          setting_key: 'permissions',
          setting_value: newSettings as unknown as Record<string, unknown>,
        }, {
          onConflict: 'company_id,setting_key',
        });

      if (error) throw error;

      setSettings(newSettings);
      toast({
        title: "Settings saved",
        description: "Permission settings updated successfully",
      });
      return true;
    } catch (error) {
      console.error('Error saving permission settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [company?.id, isAdmin]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    canEditLenderStage,
    canEditMilestones,
    canEditNotes,
    saveSettings,
    refetch: fetchSettings,
  };
}
