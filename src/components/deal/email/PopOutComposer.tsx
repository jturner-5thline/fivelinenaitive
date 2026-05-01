import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  X, Trash2, Minimize2, Maximize2, GripHorizontal, Minus, Check, AlertCircle, Cloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import type { ReplyDraft } from './InlineReplyComposer';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import { emailStringToArray, emailArrayToString } from './RecipientField';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from './EmailComposerCard';

function DraftStatusIndicator({ status }: { status: DraftSaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className={cn(
      'flex items-center gap-1 text-[10px] transition-opacity duration-300',
      status === 'saving' && 'text-muted-foreground',
      status === 'saved' && 'text-success',
      status === 'error' && 'text-destructive',
    )}>
      {status === 'saving' && <><Cloud className="h-2.5 w-2.5 animate-pulse" />Saving…</>}
      {status === 'saved' && <><Check className="h-2.5 w-2.5" />Draft saved</>}
      {status === 'error' && <><AlertCircle className="h-2.5 w-2.5" />Save failed</>}
    </span>
  );
}

interface PopOutComposerProps {
  draft: ReplyDraft;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>, opts?: ComposerSendOptions) => void;
  onDiscard: () => void;
  onPopIn: (draft: ReplyDraft) => void;
  onDraftChange?: (draft: ReplyDraft) => void;
  onFieldBlur?: () => void;
  saveStatus?: DraftSaveStatus;
  tokenContext?: TokenContext;
  dealName?: string | null;
  dealId?: string | null;
  signature?: string;
}

export function PopOutComposer({
  draft: initialDraft,
  onSend,
  onDiscard,
  onPopIn,
  onDraftChange,
  onFieldBlur,
  saveStatus = 'idle',
  tokenContext,
  dealName,
  dealId,
  signature,
}: PopOutComposerProps) {
  const [recipients, setRecipients] = useState<ComposerRecipients>(() => ({
    to: emailStringToArray(initialDraft.to),
    cc: emailStringToArray(initialDraft.cc),
    bcc: emailStringToArray(initialDraft.bcc),
  }));
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [attachments, setAttachments] = useState<string[]>(initialDraft.attachments);
  const [files, setFiles] = useState<File[]>([]);
  const [minimized, setMinimized] = useState(false);

  // Floating window state
  const [position, setPosition] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth - 540 : 100,
    y: typeof window !== 'undefined' ? window.innerHeight - 520 : 100,
  });
  const [size, setSize] = useState({ width: 520, height: 520 });
  const dragRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const defaultTokenContext: TokenContext = tokenContext || {
    recipientName: initialDraft.toName,
    recipientEmail: initialDraft.to,
    senderName: 'You',
  };

  const getCurrentDraft = useCallback((): ReplyDraft => ({
    to: emailArrayToString(recipients.to),
    cc: emailArrayToString(recipients.cc),
    bcc: emailArrayToString(recipients.bcc),
    subject,
    body,
    attachments,
    threadId: initialDraft.threadId,
    toName: initialDraft.toName,
  }), [recipients, subject, body, attachments, initialDraft]);

  useEffect(() => {
    onDraftChange?.(getCurrentDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, subject, body, attachments]);

  const hasContent = body.trim().length > 0 || attachments.length > 0;

  // Drag-to-move
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragStart.current.y)),
      });
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, size.width]);

  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
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
    toast.success('Email sent successfully', { description: `To: ${recipients.to.join(', ')}`, icon: '✉️' });
  }, [recipients.to, subject, body, attachments, files, onSend, clearPreSendAlert]);

  const handleSend = useCallback(async (opts: ComposerSendOptions) => {
    if (recipients.to.length === 0) { toast.error('Please add a recipient'); return; }
    pendingSendOpts.current = opts;
    const passed = runChecks({ subject, body, attachments });
    if (passed) await executeSend(opts);
  }, [recipients.to, subject, body, attachments, runChecks, executeSend, pendingSendOpts]);

  const confirmDiscard = hasContent ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" aria-label="Discard draft">
          <X className="h-3 w-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
          <AlertDialogDescription>Your in-progress email will be permanently deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={onDiscard} aria-label="Discard draft">
      <X className="h-3 w-3" />
    </Button>
  );

  if (minimized) {
    return (
      <div
        className="fixed z-50 bottom-0 right-4 bg-card border border-border rounded-t-lg shadow-2xl cursor-pointer"
        style={{ width: 320 }}
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-foreground flex-1 truncate">
            Reply to {initialDraft.toName}
          </span>
          <DraftStatusIndicator status={saveStatus} />
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setMinimized(false); }} aria-label="Maximize">
            <Maximize2 className="h-3 w-3" />
          </Button>
          {confirmDiscard}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        minWidth: 380,
        minHeight: 320,
      }}
      role="dialog"
      aria-label="Pop-out email composer"
    >
      {/* Drag header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 cursor-move select-none shrink-0"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          Reply to {initialDraft.toName}
        </span>
        <DraftStatusIndicator status={saveStatus} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMinimized(true)} aria-label="Minimize">
              <Minus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Minimize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onPopIn(getCurrentDraft())} aria-label="Pop in">
              <Minimize2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Back to inline</TooltipContent>
        </Tooltip>
        {confirmDiscard}
      </div>

      {/* Unified composer card fills the floating window */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <EmailComposerCard
          replyToName={initialDraft.toName}
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
          onFieldBlur={onFieldBlur}
          dealName={dealName}
          dealId={dealId}
          signature={signature}
          saveStatus={saveStatus}
          tokenContext={defaultTokenContext}
          variant="popout"
          showSubject
          className="rounded-none border-0 shadow-none mx-0 my-0 h-full"
        />
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startW = size.width;
          const startH = size.height;
          const onMove = (ev: MouseEvent) => {
            setSize({
              width: Math.max(380, startW + (ev.clientX - startX)),
              height: Math.max(320, startH + (ev.clientY - startY)),
            });
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        aria-label="Resize"
        role="separator"
      >
        <svg className="h-4 w-4 text-muted-foreground/30" viewBox="0 0 16 16">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" />
          <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
        </svg>
      </div>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={() => void executeSend(pendingSendOpts.current)}
        onAddAttachment={() => { clearPreSendAlert(); /* attachment add handled inside the card */ }}
        onAddSubject={() => { clearPreSendAlert(); }}
      />
    </div>
  );
}
