import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EmailSnippet {
  id: string;
  user_id: string;
  name: string;
  body: string;
  category: string;
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type EmailSnippetInsert = Pick<EmailSnippet, 'name' | 'body'> & {
  category?: string;
};

// Supported tokens and their display labels
export const SNIPPET_TOKENS = [
  { token: '{First Name}', label: 'First Name', description: 'Recipient first name' },
  { token: '{Last Name}', label: 'Last Name', description: 'Recipient last name' },
  { token: '{Full Name}', label: 'Full Name', description: 'Recipient full name' },
  { token: '{Company}', label: 'Company', description: 'Recipient company name' },
  { token: '{Deal Name}', label: 'Deal Name', description: 'Current deal name' },
  { token: '{My Name}', label: 'My Name', description: 'Your display name' },
  { token: '{Today}', label: 'Today', description: "Today's date" },
] as const;

export interface TokenContext {
  recipientName?: string;
  recipientEmail?: string;
  companyName?: string;
  dealName?: string;
  senderName?: string;
}

export function resolveTokens(body: string, ctx: TokenContext): string {
  const firstName = ctx.recipientName?.split(' ')[0] || '';
  const lastName = ctx.recipientName?.split(' ').slice(1).join(' ') || '';
  
  let result = body;
  result = result.replace(/\{First Name\}/g, firstName || '{First Name}');
  result = result.replace(/\{Last Name\}/g, lastName || '{Last Name}');
  result = result.replace(/\{Full Name\}/g, ctx.recipientName || '{Full Name}');
  result = result.replace(/\{Company\}/g, ctx.companyName || '{Company}');
  result = result.replace(/\{Deal Name\}/g, ctx.dealName || '{Deal Name}');
  result = result.replace(/\{My Name\}/g, ctx.senderName || '{My Name}');
  result = result.replace(/\{Today\}/g, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  return result;
}

export function useEmailSnippets() {
  const queryClient = useQueryClient();
  const queryKey = ['email-snippets'];

  const { data: snippets = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_snippets')
        .select('*')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return data as EmailSnippet[];
    },
  });

  const createSnippet = useMutation({
    mutationFn: async (snippet: EmailSnippetInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('email_snippets')
        .insert({ ...snippet, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Snippet created');
    },
    onError: () => toast.error('Failed to create snippet'),
  });

  const updateSnippet = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailSnippet> & { id: string }) => {
      const { error } = await supabase
        .from('email_snippets')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Snippet updated');
    },
    onError: () => toast.error('Failed to update snippet'),
  });

  const deleteSnippet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_snippets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Snippet deleted');
    },
    onError: () => toast.error('Failed to delete snippet'),
  });

  const incrementUsage = useMutation({
    mutationFn: async (id: string) => {
      const snippet = snippets.find(s => s.id === id);
      if (!snippet) return;
      await supabase
        .from('email_snippets')
        .update({ usage_count: snippet.usage_count + 1 })
        .eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    snippets,
    isLoading,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    incrementUsage,
  };
}
