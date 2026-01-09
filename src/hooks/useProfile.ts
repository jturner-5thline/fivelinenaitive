import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  phone: string | null;
  company_name: string | null;
  backup_email: string | null;
  company_url: string | null;
  company_size: string | null;
  company_role: string | null;
  email_notifications: boolean;
  deal_updates_email: boolean;
  lender_updates_email: boolean;
  weekly_summary_email: boolean;
  in_app_notifications: boolean;
  deal_updates_app: boolean;
  lender_updates_app: boolean;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      // Generate signed URL for avatar if it exists
      if (data?.avatar_url) {
        // Use stored file path directly (or extract from legacy URL format)
        const filePath = data.avatar_url.includes('://') 
          ? data.avatar_url.split('/avatars/')[1]?.split('?')[0]
          : data.avatar_url;
        
        if (filePath) {
          const { data: signedData } = await supabase.storage
            .from('avatars')
            .createSignedUrl(filePath, 3600); // 1 hour expiry
          
          if (signedData?.signedUrl) {
            data.avatar_url = signedData.signedUrl;
          }
        }
      }
      
      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (updates: Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>, showToast = true) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...updates } : null);
      if (showToast && !updates.onboarding_completed) {
        toast({
          title: "Profile updated",
          description: "Your profile has been updated successfully.",
        });
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const completeOnboarding = async () => {
    await updateProfile({ onboarding_completed: true }, false);
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    try {
      // Delete old avatar if exists
      await supabase.storage.from('avatars').remove([filePath]);

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get signed URL for immediate use
      const { data: signedData } = await supabase.storage
        .from('avatars')
        .createSignedUrl(filePath, 3600); // 1 hour expiry
      
      // Store the file path reference in the profile (we'll generate signed URLs on fetch)
      await updateProfile({ avatar_url: filePath });
      
      return signedData?.signedUrl || null;
    } catch (err) {
      console.error('Error uploading avatar:', err);
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive",
      });
      return null;
    }
  };

  return {
    profile,
    isLoading,
    updateProfile,
    uploadAvatar,
    completeOnboarding,
    refreshProfile: fetchProfile,
  };
}
