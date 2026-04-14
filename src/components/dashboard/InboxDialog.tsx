import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { useNavigate } from 'react-router-dom';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { MockEmail } from '@/components/deal/email/mockEmailData';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface InboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Map Gmail messages to MockEmail format for DealEmailsTab compatibility
function mapGmailToMockEmails(gmailMessages: any[], folderOverride: 'inbox' | 'sent' | 'drafts' = 'inbox'): MockEmail[] {
  return gmailMessages.map((msg) => ({
    id: msg.id || msg.gmail_message_id,
    threadId: msg.thread_id || msg.id || msg.gmail_message_id,
    subject: msg.subject || '(No subject)',
    from_name: msg.from_name || msg.from_email || 'Unknown',
    from_email: msg.from_email || '',
    to_name: (msg.to_names || msg.to_emails || [])[0] || 'You',
    to_email: (msg.to_emails || [])[0] || '',
    snippet: msg.snippet || '',
    body_preview: msg.body_text || msg.body_html || msg.snippet || '',
    received_at: msg.received_at || new Date().toISOString(),
    is_read: msg.is_read ?? true,
    is_starred: msg.is_starred ?? false,
    folder: folderOverride,
    labels: msg.labels || [],
    has_attachments: false,
    is_linked_to_deal: false,
    is_follow_up: false,
    needs_response: folderOverride === 'inbox' ? !msg.is_read : false,
    category: 'deal' as const,
  }));
}

export function InboxDialog({ open, onOpenChange }: InboxDialogProps) {
  const {
    status, messages, isLoading,
    listMessages, sendEmail,
  } = useGmail();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hasLoaded, setHasLoaded] = useState(false);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [isSentLoading, setIsSentLoading] = useState(false);
  const [cachedInboxEmails, setCachedInboxEmails] = useState<any[]>([]);
  const sentFetchedRef = useRef(false);

  // Fetch inbox messages, then sent messages sequentially to avoid rate limits
  useEffect(() => {
    if (!open || !status.connected || hasLoaded) return;

    setHasLoaded(true);

    const fetchAll = async () => {
      // 1. Fetch inbox
      const inboxResult = await listMessages({ maxResults: 50, labelIds: ['INBOX'] });

      // If inbox returned fallback/empty due to rate limit, load from cache
      if (!inboxResult?.messages?.length && user) {
        const { data: cached } = await supabase
          .from('email_cache')
          .select('*')
          .eq('user_id', user.id)
          .order('received_at', { ascending: false })
          .limit(50);
        if (cached?.length) {
          setCachedInboxEmails(cached);
        }
      }

      // 2. Fetch sent AFTER inbox to avoid concurrent Nylas requests
      if (!sentFetchedRef.current) {
        setIsSentLoading(true);
        sentFetchedRef.current = true;
        try {
          const { data, error } = await supabase.functions.invoke('gmail-messages', {
            body: {
              action: 'list',
              max_results: 50,
              label_ids: ['SENT'],
            },
          });
          if (!error && data?.messages) {
            setSentMessages(data.messages);
          }
        } catch { /* ignore */ }
        setIsSentLoading(false);
      }
    };

    fetchAll();
  }, [open, status.connected, hasLoaded, listMessages, user]);

  // Reset load flag when dialog closes
  useEffect(() => {
    if (!open) {
      setHasLoaded(false);
      setSentMessages([]);
      setCachedInboxEmails([]);
      sentFetchedRef.current = false;
    }
  }, [open]);

  // Combine inbox + sent into a single dataset with correct folder tags
  // Use API messages if available, fall back to cached emails
  const mappedEmails = useMemo(() => {
    const inboxSource = messages.length > 0 ? messages : cachedInboxEmails;
    const inboxEmails = mapGmailToMockEmails(inboxSource, 'inbox');
    const sentEmails = mapGmailToMockEmails(sentMessages, 'sent');

    // Deduplicate: if an email appears in both inbox and sent (e.g. self-sent), prefer inbox
    const seenIds = new Set(inboxEmails.map(e => e.id));
    const uniqueSent = sentEmails.filter(e => !seenIds.has(e.id));

    return [...inboxEmails, ...uniqueSent];
  }, [messages, sentMessages, cachedInboxEmails]);

  const handleRefresh = useCallback(() => {
    listMessages({ maxResults: 50, labelIds: ['INBOX'] });
    // Also refresh sent
    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase.functions.invoke('gmail-messages', {
        body: { action: 'list', max_results: 50, label_ids: ['SENT'] },
      }).then(({ data, error }) => {
        if (!error && data?.messages) setSentMessages(data.messages);
      });
    });
  }, [listMessages]);

  if (!status.connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Connect your Gmail</p>
              <p className="text-sm text-muted-foreground mt-1">
                Link your email in Integrations to access your inbox here.
              </p>
            </div>
            <Button onClick={() => { onOpenChange(false); navigate('/integrations'); }}>
              Go to Integrations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[1400px] h-[85vh] p-0 flex flex-col overflow-hidden"
        overlayClassName="bg-black/50 transition-opacity duration-200"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <DealEmailsTab
            dealId=""
            externalEmails={mappedEmails}
            onRefresh={handleRefresh}
            isRefreshingExternal={isLoading || isSentLoading}
            onGmailSend={sendEmail}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
