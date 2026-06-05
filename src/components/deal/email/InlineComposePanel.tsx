import { useState, useCallback, useMemo, useEffect, useId } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MockEmail, type EmailThread } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from './EmailComposerCard';
import { AiAssistSidebar } from './AiAssistSidebar';
import { dispatchComposeBody } from './scheduleIntent';

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

  // ─── AI Assist sidebar (parity with reply/view mode) ─────────────────
  // Previously the AI Assist panel was only mounted by EmailListAndDetail
  // when a real thread was open, so the "New" compose flow had no way to
  // reach features like "Suggest meeting times" from the calendar. We
  // expose the same toggle + panel here using a synthetic draft-shaped
  // thread so the sidebar's Quick Actions (Suggest Times, Schedule
  // Meeting, Create Task, Summarize, etc.) work for fresh drafts too.
  const [showAiAssist, setShowAiAssist] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('naitive:inbox:ai-assist-open') === '1';
  });
  useEffect(() => {
    try { window.localStorage.setItem('naitive:inbox:ai-assist-open', showAiAssist ? '1' : '0'); } catch {}
  }, [showAiAssist]);
  const reactId = useId();
  const composeThreadId = useMemo(
    () => `compose-new-${replyTo?.threadId || reactId}`,
    [reactId, replyTo?.threadId],
  );
  // Feed schedule-intent + open-availability detection in AiAssistSidebar.
  useEffect(() => {
    dispatchComposeBody({ threadId: composeThreadId, body });
  }, [body, composeThreadId]);
  const syntheticThread = useMemo<EmailThread>(() => {
    const draftMsg: MockEmail = {
      id: composeThreadId,
      threadId: composeThreadId,
      subject: subject || replyTo?.subject || '',
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: replyTo?.to_name || recipients.to[0] || '',
      to_email: recipients.to.join(', '),
      snippet: '',
      body_preview: body,
      received_at: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      folder: 'drafts',
      labels: [],
      has_attachments: false,
      is_linked_to_deal: !!dealId,
      is_follow_up: false,
      needs_response: false,
      category: 'deal',
    } as MockEmail;
    return {
      threadId: composeThreadId,
      subject: subject || replyTo?.subject || 'New message',
      // Empty inbound list — every "from counterparty" gated card in the
      // sidebar (lender pass, workflow analysis, open-availability) will
      // self-hide because there's no inbound message to analyse.
      emails: [],
      latestEmail: draftMsg,
      participants: [],
      hasUnread: false,
      isStarred: false,
      isLinked: !!dealId,
      hasAttachments: false,
      needsResponse: false,
      dealName: dealName ?? undefined,
      category: 'deal',
    };
  }, [composeThreadId, subject, body, recipients.to, replyTo, dealId, dealName]);

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
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowAiAssist((v) => !v)}
                aria-pressed={showAiAssist}
                aria-label="Toggle AI Assist"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors',
                  showAiAssist
                    ? 'border-[hsl(var(--outlook-blue)/0.4)] bg-[hsl(var(--outlook-blue)/0.08)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-[hsl(var(--outlook-blue)/0.3)]',
                )}
              >
                <Sparkles className={cn('h-4 w-4', showAiAssist ? 'text-[hsl(var(--outlook-blue))]' : 'text-foreground/70')} />
                <span className={cn('text-[10px]', showAiAssist ? 'text-[hsl(var(--outlook-blue))]' : 'text-foreground/60')}>AI Assist</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showAiAssist ? 'Hide AI Assist' : 'Show AI Assist'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Body: composer + (optional) AI Assist rail. Mirrors the reply/view
          layout from EmailListAndDetail — sidebar on the right, composer on
          the left, collapses to single column when toggled off. */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
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
            threadId={composeThreadId}
            className="rounded-none border-0 shadow-none mx-0 my-0 h-full"
          />
        </div>
        {showAiAssist && (
          <div className="hidden md:flex h-full min-h-0 w-full max-w-[min(360px,32vw)] border-l border-[hsl(var(--email-border))] bg-transparent overflow-hidden">
            <AiAssistSidebar
              thread={syntheticThread}
              dealId={dealId ?? undefined}
              dealName={dealName ?? undefined}
              onClose={() => setShowAiAssist(false)}
              onInsertDraft={(text) => setBody((prev) => (prev ? prev + text : text))}
              onOpenInlineReply={() => { /* already in compose */ }}
            />
          </div>
        )}
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
