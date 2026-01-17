import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DealEmail {
  id: string;
  deal_id: string;
  gmail_message_id: string;
  user_id: string;
  linked_at: string;
  notes: string | null;
}

export interface DealEmailWithMessage extends DealEmail {
  message?: {
    id: string;
    subject: string;
    from_name: string | null;
    from_email: string | null;
    snippet: string | null;
    received_at: string | null;
    is_read: boolean;
    is_starred: boolean;
  };
}

export function useDealEmails(dealId?: string) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<DealEmailWithMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    if (!dealId || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch deal_emails
      const { data: dealEmails, error: deError } = await supabase
        .from('deal_emails')
        .select('*')
        .eq('deal_id', dealId)
        .order('linked_at', { ascending: false });

      if (deError) throw deError;

      if (!dealEmails || dealEmails.length === 0) {
        setEmails([]);
        return;
      }

      // Fetch corresponding gmail messages
      const messageIds = dealEmails.map(de => de.gmail_message_id);
      const { data: messages, error: msgError } = await supabase
        .from('gmail_messages')
        .select('gmail_message_id, subject, from_name, from_email, snippet, received_at, is_read, is_starred')
        .in('gmail_message_id', messageIds);

      if (msgError) throw msgError;

      // Merge data
      const messageMap = new Map(messages?.map(m => [m.gmail_message_id, m]));
      const emailsWithMessages: DealEmailWithMessage[] = dealEmails.map(de => ({
        ...de,
        message: messageMap.get(de.gmail_message_id) ? {
          id: de.gmail_message_id,
          subject: messageMap.get(de.gmail_message_id)?.subject || '',
          from_name: messageMap.get(de.gmail_message_id)?.from_name || null,
          from_email: messageMap.get(de.gmail_message_id)?.from_email || null,
          snippet: messageMap.get(de.gmail_message_id)?.snippet || null,
          received_at: messageMap.get(de.gmail_message_id)?.received_at || null,
          is_read: messageMap.get(de.gmail_message_id)?.is_read || false,
          is_starred: messageMap.get(de.gmail_message_id)?.is_starred || false,
        } : undefined,
      }));

      setEmails(emailsWithMessages);
    } catch (err: any) {
      console.error('Error fetching deal emails:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const linkEmail = useCallback(async (gmailMessageId: string, notes?: string) => {
    if (!dealId || !user) return false;

    try {
      const { error } = await supabase
        .from('deal_emails')
        .insert({
          deal_id: dealId,
          gmail_message_id: gmailMessageId,
          user_id: user.id,
          notes: notes || null,
        });

      if (error) {
        if (error.code === '23505') {
          // Duplicate - already linked
          return false;
        }
        throw error;
      }

      await fetchEmails();
      return true;
    } catch (err: any) {
      console.error('Error linking email:', err);
      setError(err.message);
      return false;
    }
  }, [dealId, user, fetchEmails]);

  const unlinkEmail = useCallback(async (id: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('deal_emails')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEmails(prev => prev.filter(e => e.id !== id));
      return true;
    } catch (err: any) {
      console.error('Error unlinking email:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  const isEmailLinked = useCallback((gmailMessageId: string) => {
    return emails.some(e => e.gmail_message_id === gmailMessageId);
  }, [emails]);

  return {
    emails,
    isLoading,
    error,
    fetchEmails,
    linkEmail,
    unlinkEmail,
    isEmailLinked,
  };
}

// Hook to get linked deal IDs for a specific email
export function useEmailDeals(gmailMessageId?: string) {
  const { user } = useAuth();
  const [dealIds, setDealIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDealIds = useCallback(async () => {
    if (!gmailMessageId || !user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_emails')
        .select('deal_id')
        .eq('gmail_message_id', gmailMessageId);

      if (error) throw error;
      setDealIds(data?.map(d => d.deal_id) || []);
    } catch (err) {
      console.error('Error fetching email deals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [gmailMessageId, user]);

  useEffect(() => {
    fetchDealIds();
  }, [fetchDealIds]);

  return { dealIds, isLoading, refetch: fetchDealIds };
}
