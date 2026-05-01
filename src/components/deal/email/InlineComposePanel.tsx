import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { MockEmail } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from './EmailComposerCard';

interface InlineComposePanelProps {
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>, opts?: ComposerSendOptions) => void | Promise<void>;
  onClose: () => void;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
  dealName?: string | null;
  dealId?: string | null;
  signature?: string;
}

export function InlineComposePanel({ onSend, onClose, replyTo, dealName, dealId, signature }: InlineComposePanelProps) {
  const [recipients, setRecipients] = useState<ComposerRecipients>({
    to: replyTo?.to_email ? [replyTo.to_email] : [],
    cc: [],
    bcc: [],
  });
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();

  const resetForm = useCallback(() => {
    setRecipients({ to: replyTo?.to_email ? [replyTo.to_email] : [], cc: [], bcc: [] });
    setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
    setBody('');
    setAttachments([]);
    setFiles([]);
  }, [replyTo]);

  const pendingSendOpts = useMemo<{ current: ComposerSendOptions }>(() => ({ current: {} }), []);

  const executeSend = useCallback(async (opts: ComposerSendOptions) => {
    clearPreSendAlert();
    if (recipients.to.length === 0) { toast.error('Please add a recipient'); return; }
    const toEmail = recipients.to[0];
    const recipientName = toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    await onSend({
      subject,
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: recipientName,
      to_email: recipients.to.join(', '),
      snippet: body.substring(0, 120),
      body_preview: body,
      body_html: body,
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
      _outgoing_files: files.length > 0 ? files : undefined,
      _cc: recipients.cc.length > 0 ? recipients.cc : undefined,
      _bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
    }, opts);
    resetForm();
    onClose();
  }, [recipients.to, subject, body, attachments, files, onSend, resetForm, onClose, clearPreSendAlert]);

  const handleSend = useCallback(async (opts: ComposerSendOptions) => {
    if (recipients.to.length === 0) { toast.error('Please add a recipient'); return; }
    pendingSendOpts.current = opts;
    const passed = runChecks({ subject, body, attachments });
    if (passed) await executeSend(opts);
  }, [recipients.to, subject, body, attachments, runChecks, executeSend, pendingSendOpts]);

  const handleDiscard = useCallback(() => {
    resetForm();
    onClose();
    toast.info('Draft discarded');
  }, [resetForm, onClose]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with back arrow */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/60 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{replyTo ? 'Reply' : 'New Message'}</span>
      </div>

      {/* Unified composer fills the panel */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <EmailComposerCard
          replyToName={replyTo?.to_name ?? null}
          hideReplyAnchor={!replyTo}
          recipients={recipients}
          onRecipientsChange={setRecipients}
          subject={subject}
          onSubjectChange={setSubject}
          body={body}
          onBodyChange={setBody}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onFilesChange={setFiles}
          onSend={handleSend}
          onDiscard={handleDiscard}
          dealName={dealName}
          dealId={dealId}
          signature={signature}
          variant="panel"
          showSubject
          className="rounded-none border-0 shadow-none mx-0 my-0 h-full"
        />
      </div>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={() => void executeSend(pendingSendOpts.current)}
        onAddAttachment={() => { clearPreSendAlert(); }}
        onAddSubject={() => { clearPreSendAlert(); }}
      />
    </div>
  );
}
