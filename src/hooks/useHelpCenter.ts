import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  body_html: string;
  category: string;
  tags: string[];
  status: string;
  view_count: number;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  company_id: string;
  requester_user_id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_type: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export function useHelpArticles(category?: string, searchQuery?: string) {
  return useQuery({
    queryKey: ['help-articles', category, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('help_articles')
        .select('*')
        .eq('status', 'published')
        .order('view_count', { ascending: false });

      if (category) query = query.eq('category', category);

      const { data, error } = await query;
      if (error) throw error;

      let results = (data || []) as HelpArticle[];

      // Client-side search filter since we can't use ts_query directly via SDK
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase();
        results = results.filter(
          a => a.title.toLowerCase().includes(q) ||
               a.category.toLowerCase().includes(q) ||
               a.tags.some(t => t.toLowerCase().includes(q))
        );
      }

      return results;
    },
  });
}

export function useHelpArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ['help-article', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .eq('slug', slug!)
        .eq('status', 'published')
        .single();

      if (error) throw error;
      return data as HelpArticle;
    },
    enabled: !!slug,
  });
}

export function useHelpCategories() {
  return useQuery({
    queryKey: ['help-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('category')
        .eq('status', 'published');

      if (error) throw error;
      const cats = [...new Set((data || []).map(d => d.category))];
      return cats.sort();
    },
  });
}

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SupportTicket[];
    },
  });
}

export function useTicketComments(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-comments', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as TicketComment[];
    },
    enabled: !!ticketId,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      subject: string;
      description?: string;
      priority?: string;
      company_id: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          subject: params.subject,
          description: params.description || null,
          priority: params.priority || 'normal',
          company_id: params.company_id,
          requester_user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Support ticket created');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create ticket');
    },
  });
}

export function useAddTicketComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { ticket_id: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('support_ticket_comments')
        .insert({
          ticket_id: params.ticket_id,
          body: params.body,
          author_type: 'user',
          author_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-comments', vars.ticket_id] });
      toast.success('Comment added');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add comment');
    },
  });
}
