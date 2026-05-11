import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { emailStringToArray, emailArrayToString } from './RecipientField';
import { MockEmail } from './mockEmailData';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from './EmailComposerCard';
export type { ComposerSendOptions } from './EmailComposerCard';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';

// Re-export the public draft contract so callers/PopOutComposer keep working.
export interface ReplyDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: string[];
  threadId: string;
  toName: string;
}

interface InlineReplyComposerProps {
  replyTo: { subject: string; to_email: string; to_name: string; threadId: string };
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>, opts?: ComposerSendOptions) => void;
  onDiscard: () => void;
  onPopOut: (draft: ReplyDraft) => void;
  initialDraft?: ReplyDraft | null;
  onDraftChange?: (draft: ReplyDraft) => void;
  onFieldBlur?: () => void;
  saveStatus?: DraftSaveStatus;
  tokenContext?: TokenContext;
  /**
   * Optional contextual deal metadata. When passed, the unified composer card
   * will surface the auto-link affordance.
   */
  dealName?: string | null;
  dealId?: string | null;
  /** Optional signature ghost text. */
  signature?: string;
}

export function InlineReplyComposer({
  replyTo,
  onSend,
  onDiscard,
  onPopOut,
  initialDraft,
  onDraftChange,
  onFieldBlur,
  saveStatus = 'idle',
  tokenContext,
  dealName,
  dealId,
  signature,
}: InlineReplyComposerProps) {
  // Recipients are arrays internally; persisted in ReplyDraft as comma strings.
  const [recipients, setRecipients] = useState<ComposerRecipients>(() => ({
    to: initialDraft?.to ? emailStringToArray(initialDraft.to) : [replyTo.to_email],
    cc: emailStringToArray(initialDraft?.cc ?? ''),
    bcc: emailStringToArray(initialDraft?.bcc ?? ''),
  }));
  const [subject, setSubject] = useState(initialDraft?.subject ?? `Re: ${replyTo.subject}`);
  const [body, setBody] = useState(initialDraft?.body ?? '');
  const [attachments, setAttachments] = useState<string[]>(initialDraft?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);

  const getCurrentDraft = useCallback((): ReplyDraft => ({
    to: emailArrayToString(recipients.to),
    cc: emailArrayToString(recipients.cc),
    bcc: emailArrayToString(recipients.bcc),
    subject,
    body,
    attachments,
    threadId: replyTo.threadId,
    toName: replyTo.to_name,
  }), [recipients, subject, body, attachments, replyTo]);

  // Notify parent when any field changes — preserves auto-save contract.
  useEffect(() => {
    onDraftChange?.(getCurrentDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, subject, body, attachments]);

  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();

  const executeSend = useCallback(async (opts: ComposerSendOptions) => {
    clearPreSendAlert();
    const toEmails = recipients.to;
    if (toEmails.length === 0) {
      toast.error('Please add a recipient');
      return;
    }
    const toEmail = toEmails[0];
    const recipientName = toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    await onSend({
      subject,
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: recipientName,
      to_email: toEmails.join(', '),
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
      _to: toEmails,
      _outgoing_files: files.length > 0 ? files : undefined,
      _cc: recipients.cc.length > 0 ? recipients.cc : undefined,
      _bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
    }, opts);
    toast.success('Email sent successfully', { description: `To: ${toEmails.join(', ')}`, icon: '✉️' });
  }, [recipients.to, subject, body, attachments, files, onSend, clearPreSendAlert]);

  const pendingSendOpts = useMemo<{ current: ComposerSendOptions }>(() => ({ current: {} }), []);

  const handleSend = useCallback(async (opts: ComposerSendOptions) => {
    if (recipients.to.length === 0) {
      toast.error('Please add a recipient');
      return;
    }
    pendingSendOpts.current = opts;
    const passed = runChecks({ subject, body, attachments });
    if (passed) {
      await executeSend(opts);
    }
  }, [recipients.to, subject, body, attachments, runChecks, executeSend, pendingSendOpts]);

  const handleAddAttachment = () => {
    const fakeNames = ['proposal.pdf', 'financials.xlsx', 'term_sheet.docx', 'deck.pptx', 'summary.pdf'];
    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    if (!attachments.includes(randomName)) {
      setAttachments(prev => [...prev, randomName]);
      toast.info(`Attached: ${randomName}`);
    }
  };

  const defaultTokenContext: TokenContext = tokenContext || {
    recipientName: replyTo.to_name,
    recipientEmail: replyTo.to_email,
    senderName: 'You',
  };

  return (
    <>
      <EmailComposerCard
        replyToName={replyTo.to_name}
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
        onDiscard={onDiscard}
        onPopOut={() => onPopOut(getCurrentDraft())}
        onFieldBlur={onFieldBlur}
        dealName={dealName}
        dealId={dealId}
        signature={signature}
        saveStatus={saveStatus}
        tokenContext={defaultTokenContext}
        variant="inline"
        showSubject={false}
        resizable
      />
      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={() => void executeSend(pendingSendOpts.current)}
        onAddAttachment={() => { clearPreSendAlert(); handleAddAttachment(); }}
        onAddSubject={() => { clearPreSendAlert(); }}
      />
    </>
  );
}
