import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from '@/hooks/use-toast';

export interface CustomNoteTemplate {
  id: string;
  company_id: string | null;
  created_by: string;
  name: string;
  content: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomNoteTemplates() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const companyId = company?.id || null;

  const list = useQuery({
    queryKey: ['custom-note-templates', companyId],
    queryFn: async () => {
      let q = supabase.from('deal_space_note_templates').select('*').order('updated_at', { ascending: false });
      if (companyId) q = q.eq('company_id', companyId);
      else q = q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CustomNoteTemplate[];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async ({ name, content, icon }: { name: string; content: string; icon?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('deal_space_note_templates')
        .insert({ name, content, icon: icon || '📝', company_id: companyId, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-note-templates', companyId] });
      toast({ title: 'Template saved' });
    },
    onError: (e: any) => toast({ title: 'Failed to save template', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, name, content }: { id: string; name?: string; content?: string }) => {
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (content !== undefined) updates.content = content;
      const { error } = await supabase.from('deal_space_note_templates').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-note-templates', companyId] });
      toast({ title: 'Template updated' });
    },
    onError: (e: any) => toast({ title: 'Failed to update template', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_space_note_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-note-templates', companyId] });
      toast({ title: 'Template deleted' });
    },
    onError: (e: any) => toast({ title: 'Failed to delete template', description: e.message, variant: 'destructive' }),
  });

  return { templates: list.data || [], isLoading: list.isLoading, create, update, remove };
}
