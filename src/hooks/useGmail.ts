import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface GmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  from_name: string;
  to_emails?: string[];
  cc_emails?: string[];
  snippet: string;
  body_text?: string;
  body_html?: string;
  is_read: boolean;
  is_starred: boolean;
  labels: string[];
  received_at: string;
}

interface GmailStatus {
  connected: boolean;
  expires_at?: string;
  is_expired?: boolean;
  scope?: string;
  connected_at?: string;
}

export function useGmail() {
  const { user } = useAuth();
  const [status, setStatus] = useState<GmailStatus>({ connected: false });
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status
  const checkStatus = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke('gmail-status');
      
      if (error) throw error;
      setStatus(data);
      setError(null);
    } catch (err: any) {
      console.error('Gmail status error:', err);
      setError(err.message);
    }
  }, [user]);

  // Get OAuth URL and redirect to Google
  const connect = useCallback(async () => {
    if (!user) return;

    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/integrations?gmail_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: {
          action: 'get_auth_url',
          redirect_uri: redirectUri,
        },
      });

      if (error) throw error;
      
      // Store redirect URI in sessionStorage for callback
      sessionStorage.setItem('gmail_redirect_uri', redirectUri);
      
      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (err: any) {
      console.error('Gmail connect error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [user]);

  // Exchange authorization code for tokens
  const exchangeCode = useCallback(async (code: string) => {
    if (!user) return false;

    setIsConnecting(true);
    try {
      const redirectUri = sessionStorage.getItem('gmail_redirect_uri') || 
        `${window.location.origin}/integrations?gmail_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: {
          action: 'exchange_code',
          code,
          redirect_uri: redirectUri,
        },
      });

      if (error) throw error;
      
      sessionStorage.removeItem('gmail_redirect_uri');
      await checkStatus();
      setError(null);
      return true;
    } catch (err: any) {
      console.error('Gmail code exchange error:', err);
      setError(err.message);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [user, checkStatus]);

  // Disconnect Gmail
  const disconnect = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;
      
      setStatus({ connected: false });
      setMessages([]);
      setError(null);
    } catch (err: any) {
      console.error('Gmail disconnect error:', err);
      setError(err.message);
    }
  }, [user]);

  // List messages
  const listMessages = useCallback(async (options?: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    query?: string;
  }) => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'list',
          max_results: options?.maxResults || 20,
          page_token: options?.pageToken,
          label_ids: options?.labelIds,
          query: options?.query,
        },
      });

      if (error) throw error;
      
      setMessages(data.messages || []);
      setError(null);
      return data;
    } catch (err: any) {
      console.error('Gmail list error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Get single message
  const getMessage = useCallback(async (messageId: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'get',
          message_id: messageId,
        },
      });

      if (error) throw error;
      return data.message;
    } catch (err: any) {
      console.error('Gmail get message error:', err);
      setError(err.message);
      return null;
    }
  }, [user]);

  // Send email
  const sendEmail = useCallback(async (options: {
    to: string[];
    subject: string;
    body?: string;
    bodyHtml?: string;
    cc?: string[];
    bcc?: string[];
  }) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: options.to,
          subject: options.subject,
          body: options.body,
          body_html: options.bodyHtml,
          cc: options.cc,
          bcc: options.bcc,
        },
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Gmail send error:', err);
      setError(err.message);
      return null;
    }
  }, [user]);

  // Mark as read/unread
  const markRead = useCallback(async (messageId: string, read: boolean) => {
    if (!user) return false;

    try {
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: read ? 'mark_read' : 'mark_unread',
          message_id: messageId,
        },
      });

      if (error) throw error;
      
      // Update local state
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_read: read } : m
      ));
      return true;
    } catch (err: any) {
      console.error('Gmail mark read error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Star/unstar
  const toggleStar = useCallback(async (messageId: string, starred: boolean) => {
    if (!user) return false;

    try {
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: starred ? 'star' : 'unstar',
          message_id: messageId,
        },
      });

      if (error) throw error;
      
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_starred: starred } : m
      ));
      return true;
    } catch (err: any) {
      console.error('Gmail toggle star error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Move to trash
  const trashMessage = useCallback(async (messageId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'trash',
          message_id: messageId,
        },
      });

      if (error) throw error;
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return true;
    } catch (err: any) {
      console.error('Gmail trash error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Check status on mount
  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user, checkStatus]);

  return {
    status,
    messages,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    checkStatus,
    listMessages,
    getMessage,
    sendEmail,
    markRead,
    toggleStar,
    trashMessage,
  };
}
