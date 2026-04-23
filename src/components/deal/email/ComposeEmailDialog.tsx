import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Send,
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { RecipientField, emailStringToArray } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void | Promise<void>;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
}

export function ComposeEmailDialog({ open, onOpenChange, onSend, replyTo }: ComposeEmailDialogProps) {
  const [toRecipients, setToRecipients] = useState<string[]>(replyTo?.to_email ? [replyTo.to_email] : []);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
  const { search } = useEmailContacts();

  const resetForm = () => {
    setToRecipients(replyTo?.to_email ? [replyTo.to_email] : []);
    setCcRecipients([]);
    setBccRecipients([]);
    setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
    setBody('');
    setShowCcBcc(false);
    setAttachments([]);
  };

  const executeSend = async () => {
    clearPreSendAlert();
    if (toRecipients.length === 0) {
      toast.error('Please add a recipient');
      return;
    }

    setIsSending(true);

    const toEmail = toRecipients[0];
    const recipientName = toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    await onSend({
      subject,
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: recipientName,
      to_email: toRecipients.join(', '),
      snippet: body.substring(0, 120),
      body_preview: body,
      received_at: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      folder: 'sent',
      labels: ['Sent'],
      has_attachments: attachments.length > 0,
      is_linked_to_deal: false,
      is_follow_up: false,
      needs_response: false,
      category: 'deal',
    });

    setIsSending(false);
    resetForm();
    onOpenChange(false);
  };

  const handleSend = () => {
    if (toRecipients.length === 0) { toast.error('Please add a recipient'); return; }
    const passed = runChecks({ subject, body, attachments });
    if (passed) executeSend();
  };

  const handleAddAttachment = () => {
    const fakeNames = ['proposal.pdf', 'financials.xlsx', 'term_sheet.docx', 'deck.pptx', 'summary.pdf'];
    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    if (!attachments.includes(randomName)) {
      setAttachments(prev => [...prev, randomName]);
      toast.info(`Attached: ${randomName}`);
    }
  };

  const handleDiscard = () => {
    resetForm();
    onOpenChange(false);
    toast.info('Draft discarded');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col sm:rounded-xl",
          // Mobile: ~96vw x ~93dvh
          "w-[96vw] h-[93dvh] max-w-[97vw] max-h-[94dvh]",
          // Tablet (>= 640px): ~94vw x 90dvh
          "sm:w-[94vw] sm:h-[90dvh] sm:max-w-[94vw] sm:max-h-[92dvh]",
          // Desktop (>= 1024px): ~92vw x 88dvh, capped at 1400 x 980
          "lg:w-[min(92vw,1400px)] lg:h-[min(88dvh,980px)] lg:max-w-[1400px] lg:max-h-[980px]",
        )}
      >
        {/* Header */}
        <DialogHeader
          className="shrink-0 border-b"
          style={{ padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
          <DialogTitle className="text-base sm:text-lg">
            {replyTo ? 'Reply' : 'New Message'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {replyTo ? `Replying to ${replyTo.to_name}` : 'Compose and send an email'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{ padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
          <div className="space-y-3">
          {/* To field */}
          <div className="flex items-center gap-2">
            <RecipientField
              label="To"
              recipients={toRecipients}
              onChange={setToRecipients}
              search={search}
              placeholder="recipient@example.com"
              className="flex-1"
              labelClassName="w-10"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2 shrink-0"
              onClick={() => setShowCcBcc(!showCcBcc)}
            >
              Cc/Bcc
              {showCcBcc ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          </div>

          {/* Cc/Bcc fields */}
          {showCcBcc && (
            <>
              <RecipientField
                label="Cc"
                recipients={ccRecipients}
                onChange={setCcRecipients}
                search={search}
                placeholder="cc@example.com"
                labelClassName="w-10"
              />
              <RecipientField
                label="Bcc"
                recipients={bccRecipients}
                onChange={setBccRecipients}
                search={search}
                placeholder="bcc@example.com"
                labelClassName="w-10"
              />
            </>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-10 shrink-0">Subj</Label>
            <Input
              ref={subjectInputRef}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium"
            />
          </div>
        </div>

          <Separator className="my-1" />

          {/* Body — grows to fill remaining space inside the scrollable region */}
          <div className="flex-1 min-h-[200px] flex flex-col">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message..."
              className="flex-1 min-h-[200px] border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent"
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="pt-3">
              <div className="flex flex-wrap gap-2">
                {attachments.map(name => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="text-xs gap-1.5 pr-1 py-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    {name}
                    <button
                      onClick={() => setAttachments(prev => prev.filter(a => a !== name))}
                      className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t flex flex-wrap items-center gap-2"
          style={{ padding: 'clamp(0.625rem, 1.25vw, 1rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
          <Button
            onClick={handleSend}
            disabled={isSending}
            size="sm"
            className="gap-1.5"
          >
            {isSending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={handleAddAttachment}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach
          </Button>

          <div className="flex-1 min-w-0" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleDiscard}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={executeSend}
        onAddAttachment={() => { clearPreSendAlert(); handleAddAttachment(); }}
        onAddSubject={() => { clearPreSendAlert(); subjectInputRef.current?.focus(); }}
      />
    </Dialog>
  );
}
