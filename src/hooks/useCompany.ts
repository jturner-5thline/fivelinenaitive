import { useState, useEffect, useCallback } from 'react';
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

export function useCompany() {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [userRole, setUserRole] = useState<CompanyRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const isOwner = userRole === 'owner';

  const fetchCompany = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Get user's company membership
      const { data: memberData, error: memberError } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!memberData) {
        setCompany(null);
        setUserRole(null);
        setMembers([]);
        setIsLoading(false);
        return;
      }

      setUserRole(memberData.role as CompanyRole);

      // Get company details
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', memberData.company_id)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Get all members
      const { data: membersData, error: membersError } = await supabase
        .from('company_members')
        .select('*')
        .eq('company_id', memberData.company_id);

      if (membersError) throw membersError;

      // Fetch profile data for each member to get display names, emails, and avatars
      if (membersData && membersData.length > 0) {
        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
        }

        // Generate signed URLs for avatars stored in Supabase storage
        const profilesWithSignedUrls = await Promise.all(
          (profilesData || []).map(async (profile) => {
            let signedAvatarUrl = profile.avatar_url;
            
            // If avatar_url is a storage path (not a full URL), generate signed URL
            if (profile.avatar_url && !profile.avatar_url.startsWith('http')) {
              const { data: signedData } = await supabase.storage
                .from('avatars')
                .createSignedUrl(profile.avatar_url, 3600);
              signedAvatarUrl = signedData?.signedUrl || profile.avatar_url;
            }
            
            return { ...profile, avatar_url: signedAvatarUrl };
          })
        );

        // Merge profile data with members
        const membersWithProfiles = membersData.map(member => {
          const profile = profilesWithSignedUrls?.find(p => p.user_id === member.user_id);
          return {
            ...member,
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
            email: user?.email && member.user_id === user.id ? user.email : null
          };
        });

        setMembers(membersWithProfiles);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('Error fetching company:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const createCompany = async (name: string) => {
    if (!user) return { error: 'Not authenticated' };

    setIsSaving(true);
    try {
      // Important: we cannot rely on `insert(...).select()` here because RLS SELECT
      // policies for `companies` require membership, which doesn't exist until
      // after we insert into `company_members`.
      const companyId = crypto.randomUUID();

      // 1) Create company (no returning/representation needed)
      const { error: companyError } = await supabase
        .from('companies')
        .insert({ id: companyId, name });

      if (companyError) throw companyError;

      // 2) Add user as owner
      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: companyId,
          user_id: user.id,
          role: 'owner'
        });

      if (memberError) throw memberError;

      // 3) Now that membership exists, fetch company details
      const { data: newCompany, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (fetchError) throw fetchError;

      setCompany(newCompany);
      setUserRole('owner');
      setMembers([
        {
          id: '',
          company_id: companyId,
          user_id: user.id,
          role: 'owner',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

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
      const { error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', company.id);

      if (error) throw error;

      setCompany(prev => prev ? { ...prev, ...updates } : null);
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
    
    // Note: This is a simplified version. In production, you'd send an invite email
    // and have the user accept it. For now, this assumes the user already exists.
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

      setMembers(prev => 
        prev.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      );
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

      setMembers(prev => prev.filter(m => m.id !== memberId));
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
    refetch: fetchCompany
  };
}
