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
  RefreshCw, Loader2, Sparkles,
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
import {
  TONE_ORDER,
  TONE_LABELS,
  DRAFT_INTENT_OPTIONS,
  type AiAssistToneKey,
} from './AiAssistSidebar';
import { dispatchComposeBody } from './scheduleIntent';

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

  // ── AI drafting controls (mirrors the AI Assist sidebar) ──────────────
  // The sidebar owns all generation logic, caching, and edge-function
  // plumbing. The popout remote-drives it via window events and receives
  // streamed draft updates back. This keeps a single source of truth for
  // AI state regardless of which surface is visible.
  const [aiTone, setAiTone] = useState<AiAssistToneKey>('balanced');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActiveIntent, setAiActiveIntent] = useState<string | null>(null);
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{
        body: string;
        tone: AiAssistToneKey;
        loading: boolean;
        activeIntentKey: string | null;
      }>).detail;
      if (!detail) return;
      setAiTone(detail.tone);
      setAiLoading(detail.loading);
      setAiActiveIntent(detail.activeIntentKey);
      if (detail.body && detail.body !== body) {
        setBody(detail.body);
      }
    };
    window.addEventListener('naitive:ai-assist:popout-draft-update', onUpdate as EventListener);
    return () => window.removeEventListener('naitive:ai-assist:popout-draft-update', onUpdate as EventListener);
    // body intentionally excluded — we only swap on AI-driven updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTone = useCallback((tone: AiAssistToneKey) => {
    setAiTone(tone);
    try {
      window.dispatchEvent(new CustomEvent('naitive:ai-assist:popout-select-tone', {
        detail: { tone },
      }));
    } catch {}
  }, []);
  const handleRegenerate = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('naitive:ai-assist:popout-regenerate'));
    } catch {}
  }, []);
  const handleApplyIntent = useCallback((key: string) => {
    try {
      window.dispatchEvent(new CustomEvent('naitive:ai-assist:popout-apply-intent', {
        detail: { key },
      }));
    } catch {}
  }, []);

  // Feed the schedule-intent listener in AiAssistSidebar so the prompt
  // card surfaces while the user is typing in the floating composer too.
  useEffect(() => {
    dispatchComposeBody({ threadId: initialDraft.threadId, body });
  }, [body, initialDraft.threadId]);

  // Floating window state — positioned ABSOLUTELY within the nearest
  // positioned ancestor (the email modal/container), so it stays fully
  // contained inside the email pop-up rather than floating against the
  // browser viewport.
  const dragRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ width: 480, height: 460 });
  // True when the parent container is too narrow to host a floating
  // window — in that case we fill the parent edge-to-edge so the
  // composer never clips horizontally inside the AI Assist sidebar.
  const [fullWidth, setFullWidth] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const getParentBounds = useCallback(() => {
    const parent = dragRef.current?.offsetParent as HTMLElement | null;
    if (!parent) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: parent.clientWidth, height: parent.clientHeight };
  }, []);

  // Anchor to bottom-right of the parent container on first mount, and clamp
  // whenever the parent resizes so we never overflow the email modal frame.
  useEffect(() => {
    const place = () => {
      const { width: pw, height: ph } = getParentBounds();
      const narrow = pw < 768;
      setFullWidth(narrow);
      if (narrow) {
        const w = Math.max(240, pw - 16);
        const h = Math.max(320, Math.min(Math.round(ph * 0.85), ph - 16));
        setSize({ width: w, height: h });
        setPosition({ x: 8, y: Math.max(8, ph - h - 8) });
      } else {
        const w = Math.min(size.width, Math.max(320, pw - 24));
        const h = Math.min(size.height, Math.max(280, ph - 24));
        setSize({ width: w, height: h });
        setPosition({
          x: Math.max(8, pw - w - 16),
          y: Math.max(8, ph - h - 16),
        });
      }
    };
    place();
    const parent = dragRef.current?.offsetParent as HTMLElement | null;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const { width: pw, height: ph } = getParentBounds();
      const narrow = pw < 768;
      setFullWidth(narrow);
      if (narrow) {
        setSize({
          width: Math.max(240, pw - 16),
          height: Math.max(320, Math.min(Math.round(ph * 0.85), ph - 16)),
        });
        setPosition((p) => ({ x: 8, y: Math.max(8, ph - (Math.max(320, Math.min(Math.round(ph * 0.85), ph - 16))) - 8) }));
        return;
      }
      setSize((s) => ({
        width: Math.min(s.width, Math.max(320, pw - 24)),
        height: Math.min(s.height, Math.max(280, ph - 24)),
      }));
      setPosition((p) => ({
        x: Math.max(8, Math.min(p.x, pw - 320 - 8)),
        y: Math.max(8, Math.min(p.y, ph - 280 - 8)),
      }));
    });
    ro.observe(parent);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const { width: pw, height: ph } = getParentBounds();
      setPosition({
        x: Math.max(0, Math.min(pw - size.width, e.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(ph - 40, e.clientY - dragStart.current.y)),
      });
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, size.width, getParentBounds]);

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
      _to: recipients.to,
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
        className="absolute z-40 bottom-3 right-4 bg-card/95 backdrop-blur-md border border-[hsl(var(--email-border))] rounded-t-xl shadow-xl cursor-pointer"
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
      className="absolute z-40 bg-card/95 backdrop-blur-md border border-[hsl(var(--email-border))] rounded-xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        minWidth: 320,
        minHeight: 280,
      }}
      role="dialog"
      aria-label="Pop-out email composer"
    >
      {/* Drag header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--email-border))] bg-card/60 cursor-move select-none shrink-0 rounded-t-xl"
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
        {/* AI drafting controls — mirrors the AI Assist sidebar so the user
            can refine the draft directly inside the compose modal. */}
        <div className="px-3 pt-2.5 pb-2 space-y-2 border-b border-[hsl(var(--email-border))] bg-card/40">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              AI draft
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10.5px] gap-1 px-2"
              onClick={handleRegenerate}
              disabled={aiLoading}
            >
              <RefreshCw className={cn('h-3 w-3', aiLoading && 'animate-spin')} />
              Regenerate
            </Button>
          </div>
          <div
            role="tablist"
            aria-label="Draft variants"
            className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-card/40 p-0.5"
          >
            {TONE_ORDER.map((tone) => {
              const isActive = aiTone === tone;
              const isRecommended = tone === 'balanced';
              return (
                <button
                  key={tone}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => handleSelectTone(tone)}
                  className={cn(
                    'h-6 px-2.5 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                  )}
                >
                  {TONE_LABELS[tone]}
                  {isRecommended && (
                    <span
                      className={cn('text-[10px] leading-none', isActive ? 'text-primary' : 'text-muted-foreground/60')}
                      aria-hidden
                    >★</span>
                  )}
                </button>
              );
            })}
          </div>
          <div
            className="flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden -mx-0.5 px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
              maskImage: 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
            }}
            role="group"
            aria-label="Refine draft"
          >
            {DRAFT_INTENT_OPTIONS.map((option) => {
              const isActive = aiActiveIntent === option.key;
              const disabled = aiLoading && !isActive;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleApplyIntent(option.key)}
                  disabled={disabled}
                  title={option.label}
                  className={cn(
                    'inline-flex items-center gap-1 h-6 px-2.5 rounded-full shrink-0 whitespace-nowrap',
                    'text-[11px] font-medium leading-none',
                    'border border-white/10 bg-white/5 backdrop-blur-sm',
                    'text-foreground/80 transition-colors',
                    'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                    'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    isActive && 'bg-primary/15 border-primary/30 text-primary',
                  )}
                >
                  {isActive && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

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
            const { width: pw, height: ph } = getParentBounds();
            setSize({
              width: Math.max(320, Math.min(pw - position.x - 8, startW + (ev.clientX - startX))),
              height: Math.max(280, Math.min(ph - position.y - 8, startH + (ev.clientY - startY))),
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
