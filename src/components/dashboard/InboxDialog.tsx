import { useEffect, useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { useNavigate } from 'react-router-dom';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { MockEmail } from '@/components/deal/email/mockEmailData';

interface InboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Map Gmail messages to MockEmail format for DealEmailsTab compatibility
function mapGmailToMockEmails(gmailMessages: any[]): MockEmail[] {
  return gmailMessages.map((msg) => ({
    id: msg.id,
    threadId: msg.thread_id || msg.id,
    subject: msg.subject || '(No subject)',
    from_name: msg.from_name || msg.from_email || 'Unknown',
    from_email: msg.from_email || '',
    to_name: 'You',
    to_email: (msg.to_emails || [])[0] || '',
    snippet: msg.snippet || '',
    body_preview: msg.body_text || msg.body_html || msg.snippet || '',
    received_at: msg.received_at || new Date().toISOString(),
    is_read: msg.is_read ?? true,
    is_starred: msg.is_starred ?? false,
    folder: 'inbox' as const,
    labels: msg.labels || [],
    has_attachments: false,
    is_linked_to_deal: false,
    is_follow_up: false,
    needs_response: !msg.is_read,
    category: 'deal' as const,
  }));
}

export function InboxDialog({ open, onOpenChange }: InboxDialogProps) {
  const {
    status, messages, isLoading,
    listMessages, sendEmail,
  } = useGmail();
  const navigate = useNavigate();
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (open && status.connected && !hasLoaded) {
      listMessages({ maxResults: 50, labelIds: ['INBOX'] });
      setHasLoaded(true);
    }
  }, [open, status.connected, hasLoaded, listMessages]);

  // Reset load flag when dialog closes
  useEffect(() => {
    if (!open) setHasLoaded(false);
  }, [open]);

  const mappedEmails = useMemo(() => mapGmailToMockEmails(messages), [messages]);

  const handleRefresh = useCallback(() => {
    listMessages({ maxResults: 50, labelIds: ['INBOX'] });
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
      {/* Fix #1: backdrop overlay with fade-in */}
      <DialogContent
        className="max-w-[95vw] w-[1400px] h-[85vh] p-0 flex flex-col overflow-hidden"
        overlayClassName="bg-black/50 transition-opacity duration-200"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <DealEmailsTab
            dealId=""
            externalEmails={mappedEmails}
            onRefresh={handleRefresh}
            isRefreshingExternal={isLoading}
            onGmailSend={sendEmail}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
