import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface LenderNote {
  id: string;
  lender_name: string;
  master_lender_id: string | null;
  author_user_id: string;
  body: string;
  is_flag: boolean;
  tags: string[];
  company_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  author_display_name?: string;
  author_avatar_url?: string;
}

export const LENDER_NOTE_TAGS = [
  'relationship risk',
  'slow to respond',
  'excellent documentation',
  'strong relationship',
  'pricing concern',
  'deal size mismatch',
  'industry preference',
  'geographic limitation',
  'great communicator',
  'requires follow-up',
  'new contact',
  'key partner',
] as const;

export function useLenderNotes(lenderName: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lender-notes', lenderName],
    queryFn: async () => {
      if (!lenderName) return [];
      const { data, error } = await supabase
        .from('lender_notes')
        .select('*')
        .eq('lender_name', lenderName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch author profiles
      const userIds = [...new Set((data || []).map(n => n.author_user_id))];
      let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);
        if (profileData) {
          profiles = Object.fromEntries(
            profileData.map(p => [p.user_id, { display_name: p.display_name || 'Unknown', avatar_url: p.avatar_url }])
          );
        }
      }

      return (data || []).map(n => ({
        ...n,
        tags: n.tags || [],
        author_display_name: profiles[n.author_user_id]?.display_name || 'Unknown',
        author_avatar_url: profiles[n.author_user_id]?.avatar_url || null,
      })) as LenderNote[];
    },
    enabled: !!lenderName && !!user,
  });
}

export function useLenderHasFlags(lenderName: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lender-has-flags', lenderName],
    queryFn: async () => {
      if (!lenderName) return false;
      const { count, error } = await supabase
        .from('lender_notes')
        .select('id', { count: 'exact', head: true })
        .eq('lender_name', lenderName)
        .eq('is_flag', true);

      if (error) return false;
      return (count || 0) > 0;
    },
    enabled: !!lenderName && !!user,
    staleTime: 30000,
  });
}

export function useLenderFlagsBulk(lenderNames: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lender-flags-bulk', lenderNames.sort().join(',')],
    queryFn: async () => {
      if (lenderNames.length === 0) return new Set<string>();
      const { data, error } = await supabase
        .from('lender_notes')
        .select('lender_name')
        .in('lender_name', lenderNames)
        .eq('is_flag', true);

      if (error) return new Set<string>();
      return new Set((data || []).map(d => d.lender_name));
    },
    enabled: lenderNames.length > 0 && !!user,
    staleTime: 30000,
  });
}

export function useAddLenderNote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async ({
      lenderName,
      masterLenderId,
      body,
      isFlag,
      tags,
    }: {
      lenderName: string;
      masterLenderId?: string | null;
      body: string;
      isFlag: boolean;
      tags: string[];
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('lender_notes')
        .insert({
          lender_name: lenderName,
          master_lender_id: masterLenderId || null,
          author_user_id: user.id,
          body: body.trim(),
          is_flag: isFlag,
          tags,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lender-notes', variables.lenderName] });
      queryClient.invalidateQueries({ queryKey: ['lender-has-flags', variables.lenderName] });
      queryClient.invalidateQueries({ queryKey: ['lender-flags-bulk'] });
      toast.success('Note added');
    },
    onError: (error) => {
      toast.error('Failed to add note: ' + error.message);
    },
  });
}

export function useDeleteLenderNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, lenderName }: { noteId: string; lenderName: string }) => {
      const { error } = await supabase
        .from('lender_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
      return lenderName;
    },
    onSuccess: (lenderName) => {
      queryClient.invalidateQueries({ queryKey: ['lender-notes', lenderName] });
      queryClient.invalidateQueries({ queryKey: ['lender-has-flags', lenderName] });
      queryClient.invalidateQueries({ queryKey: ['lender-flags-bulk'] });
      toast.success('Note deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete note: ' + error.message);
    },
  });
}

export function useLenderNoteCount(lenderName: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lender-note-count', lenderName],
    queryFn: async () => {
      if (!lenderName) return 0;
      const { count, error } = await supabase
        .from('lender_notes')
        .select('id', { count: 'exact', head: true })
        .eq('lender_name', lenderName);

      if (error) return 0;
      return count || 0;
    },
    enabled: !!lenderName && !!user,
    staleTime: 30000,
  });
}
