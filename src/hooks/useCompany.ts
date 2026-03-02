import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type CompanyRole = 'owner' | 'admin' | 'member';

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  industry: string | null;
  employee_size: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  created_at: string;
  updated_at: string;
  email?: string;
  display_name?: string;
  avatar_url?: string | null;
}

interface PublicProfile {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

async function fetchCompanyData(userId: string, userEmail?: string | null) {
  // Get user's company membership
  const { data: memberData, error: memberError } = await supabase
    .from('company_members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError) throw memberError;

  if (!memberData) {
    return { company: null, members: [], userRole: null };
  }

  const userRole = memberData.role as CompanyRole;

  // Get company details
  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', memberData.company_id)
    .single();

  if (companyError) throw companyError;

  // Get all members
  const { data: membersData, error: membersError } = await supabase
    .from('company_members')
    .select('*')
    .eq('company_id', memberData.company_id);

  if (membersError) throw membersError;

  let membersWithProfiles: CompanyMember[] = [];

  if (membersData && membersData.length > 0) {
    const userIds = membersData.map(m => m.user_id);
    
    const { data: rawProfilesData, error: profilesError } = await supabase
      .from('profiles_public' as any)
      .select('user_id, display_name, first_name, last_name, avatar_url')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    const profilesData = (rawProfilesData || []) as unknown as PublicProfile[];

    // Generate signed URLs for avatars stored in Supabase storage
    const profilesWithSignedUrls = await Promise.all(
      profilesData.map(async (profile) => {
        let signedAvatarUrl = profile.avatar_url;
        
        if (profile.avatar_url && !profile.avatar_url.startsWith('http')) {
          const { data: signedData } = await supabase.storage
            .from('avatars')
            .createSignedUrl(profile.avatar_url, 3600);
          signedAvatarUrl = signedData?.signedUrl || profile.avatar_url;
        }
        
        return { ...profile, avatar_url: signedAvatarUrl };
      })
    );

    membersWithProfiles = membersData.map(member => {
      const profile = profilesWithSignedUrls?.find(p => p.user_id === member.user_id);
      const displayName = profile?.display_name || 
        (profile?.first_name && profile?.last_name 
          ? `${profile.first_name} ${profile.last_name}`.trim() 
          : profile?.first_name || null);
      return {
        ...member,
        display_name: displayName,
        avatar_url: profile?.avatar_url || null,
        email: member.user_id === userId ? (userEmail || null) : null
      };
    });
  }

  return { company: companyData as Company, members: membersWithProfiles, userRole };
}

export function useCompany() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['company', user?.id],
    queryFn: () => fetchCompanyData(user!.id, user!.email),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents refetches across components
    gcTime: 10 * 60 * 1000,
  });

  const company = data?.company ?? null;
  const members = data?.members ?? [];
  const userRole = data?.userRole ?? null;
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const isOwner = userRole === 'owner';

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['company', user?.id] });
  }, [queryClient, user?.id]);

  const createCompany = async (name: string) => {
    if (!user) return { error: 'Not authenticated' };

    setIsSaving(true);
    try {
      const companyId = crypto.randomUUID();

      const { error: companyError } = await supabase
        .from('companies')
        .insert({ id: companyId, name });

      if (companyError) throw companyError;

      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: companyId,
          user_id: user.id,
          role: 'owner'
        });

      if (memberError) throw memberError;

      refetch();
      toast.success('Company created successfully');
      return { error: null };
    } catch (error: any) {
      console.error('Error creating company:', error);
      toast.error(error.message || 'Failed to create company');
      return { error: error.message };
    } finally {
      setIsSaving(false);
    }
  };

  const updateCompany = async (updates: Partial<Company>) => {
    if (!company || !isAdmin) return { error: 'Not authorized' };

    setIsSaving(true);
    try {
      const { data: updatedData, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', company.id)
        .select()
        .single();

      if (error) throw error;
      if (!updatedData) throw new Error('Update failed - no rows affected');

      refetch();
      toast.success('Company updated successfully');
      return { error: null };
    } catch (error: any) {
      console.error('Error updating company:', error);
      toast.error(error.message || 'Failed to update company');
      return { error: error.message };
    } finally {
      setIsSaving(false);
    }
  };

  const inviteMember = async (email: string, role: CompanyRole = 'member') => {
    if (!company || !isAdmin) return { error: 'Not authorized' };
    toast.info('Member invitation system requires email integration');
    return { error: 'Not implemented' };
  };

  const updateMemberRole = async (memberId: string, newRole: CompanyRole) => {
    if (!company || !isAdmin) return { error: 'Not authorized' };
    if (newRole === 'owner') return { error: 'Cannot assign owner role' };

    try {
      const { error } = await supabase
        .from('company_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      refetch();
      toast.success('Member role updated');
      return { error: null };
    } catch (error: any) {
      console.error('Error updating member role:', error);
      toast.error(error.message || 'Failed to update member role');
      return { error: error.message };
    }
  };

  const removeMember = async (memberId: string) => {
    if (!company || !isAdmin) return { error: 'Not authorized' };

    try {
      const { error } = await supabase
        .from('company_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      refetch();
      toast.success('Member removed');
      return { error: null };
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.message || 'Failed to remove member');
      return { error: error.message };
    }
  };

  return {
    company,
    members,
    userRole,
    isAdmin,
    isOwner,
    isLoading,
    isSaving,
    createCompany,
    updateCompany,
    inviteMember,
    updateMemberRole,
    removeMember,
    refetch
  };
}
