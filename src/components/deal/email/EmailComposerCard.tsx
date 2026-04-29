import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Send, Paperclip, Loader2, X, Trash2, Maximize2, Check, AlertCircle, Cloud,
  Bold, Italic, Underline, Link as LinkIcon, List, ListOrdered, Edit3, ChevronDown,
  MoreHorizontal, Calendar as CalendarIcon, Image as ImageIcon, Archive, MailX,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { RecipientField } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import { SnippetPicker } from './SnippetPicker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ────────────────────────────────────────────────────────────────────────────
// Public surface
// ────────────────────────────────────────────────────────────────────────────

export interface ComposerRecipients {
  to: string[];
  cc: string[];
  bcc: string[];
}

export interface ComposerSendOptions {
  /** When true, archive the originating thread after a successful send. */
  archiveAfterSend?: boolean;
  /** Auto-link the resulting email to the matched deal (if any). */
  autoLinkDeal?: boolean;
  /** Track opens for this email. */
  trackOpens?: boolean;
  /**
   * If set, queue the email for delivery at this future time (ISO string)
   * instead of sending immediately. Parents are responsible for persisting
   * to `scheduled_emails`.
   */
  scheduledFor?: string;
}

export interface EmailComposerCardProps {
  /** Visible "Replying to {name}" anchor. Pass null for fresh compose. */
  replyToName?: string | null;
  /** Recipient state — controlled. */
  recipients: ComposerRecipients;
  onRecipientsChange: (next: ComposerRecipients) => void;
  /** Subject — controlled. */
  subject: string;
  onSubjectChange: (next: string) => void;
  /** Body — controlled. */
  body: string;
  onBodyChange: (next: string) => void;
  /** Attachments — controlled. */
  attachments: string[];
  onAttachmentsChange: (next: string[]) => void;

  /** Send handler. Returns a promise that resolves when send completes. */
  onSend: (opts: ComposerSendOptions) => Promise<void> | void;
  /** Discard handler (after user confirms). */
  onDiscard: () => void;
  /** Pop-out handler. When omitted the pop-out icon is hidden. */
  onPopOut?: () => void;
  /** Called on field blur — used by useEmailDraft to flush saves. */
  onFieldBlur?: () => void;

  /** Auto-link / open-tracking metadata. */
  dealName?: string | null;
  dealId?: string | null;
  /** Signature shown as ghost text below the cursor. */
  signature?: string;
  /** Save status indicator. */
  saveStatus?: DraftSaveStatus;
  /** Token context for SnippetPicker. */
  tokenContext?: TokenContext;
  /** When true, render as floating popout (no border-t / accent edge). */
  variant?: 'inline' | 'popout' | 'panel';
  /** Whether to show the subject row by default (compose vs reply). */
  showSubject?: boolean;
  /** Hide the "Replying to" anchor pill (used for fresh compose). */
  hideReplyAnchor?: boolean;
  /** Optional className applied to the outer card. */
  className?: string;
  /** Enable drag-to-resize on the top edge (inline only). */
  resizable?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// AI Assist event channel
// Lightweight, decoupled bridge between this card and AiAssistSidebar.
// The sidebar listens for "naitive:ai-assist:request-draft" and responds
// with "naitive:ai-assist:draft-ready" when it has one available.
// ────────────────────────────────────────────────────────────────────────────

export const AI_ASSIST_REQUEST_EVENT = 'naitive:ai-assist:request-draft';
export const AI_ASSIST_READY_EVENT = 'naitive:ai-assist:draft-ready';

export interface AiAssistDraftReadyDetail {
  body: string;
  source?: string;
}

function dispatchAiAssistRequest() {
  try { window.dispatchEvent(new CustomEvent(AI_ASSIST_REQUEST_EVENT)); } catch {}
}

// ────────────────────────────────────────────────────────────────────────────
// Draft status indicator
// ────────────────────────────────────────────────────────────────────────────

function DraftStatus({ status }: { status: DraftSaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      role="status"
      className={cn(
        'flex items-center gap-1 text-[10px] transition-opacity duration-300',
        status === 'saving' && 'text-muted-foreground',
        status === 'saved' && 'text-success',
        status === 'error' && 'text-destructive',
      )}
    >
      {status === 'saving' && <><Cloud className="h-2.5 w-2.5 animate-pulse" />Saving…</>}
      {status === 'saved' && <><Check className="h-2.5 w-2.5" />Draft saved</>}
      {status === 'error' && <><AlertCircle className="h-2.5 w-2.5" />Save failed</>}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Toolbar zone wrapper
// ────────────────────────────────────────────────────────────────────────────

function ToolbarZone({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-border/60 mx-1.5" aria-hidden />;
}

// ────────────────────────────────────────────────────────────────────────────
// Recipient initial avatar (placeholder until contact avatar pipeline lands)
// ────────────────────────────────────────────────────────────────────────────

function RecipientAvatar({ name, email, size = 6 }: { name?: string | null; email?: string | null; size?: number }) {
  const display = (name || email || '').trim();
  const initial = display.charAt(0).toUpperCase() || '?';
  return (
    <div
      className="rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0"
      style={{ height: size * 4, width: size * 4 }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main card
// ────────────────────────────────────────────────────────────────────────────

export function EmailComposerCard(props: EmailComposerCardProps) {
  const {
    replyToName,
    recipients, onRecipientsChange,
    subject, onSubjectChange,
    body, onBodyChange,
    attachments, onAttachmentsChange,
    onSend, onDiscard, onPopOut, onFieldBlur,
    dealName, dealId,
    signature,
    saveStatus = 'idle',
    tokenContext,
    variant = 'inline',
    showSubject: showSubjectInitial = false,
    hideReplyAnchor = false,
    className,
    resizable = false,
  } = props;

  const { search } = useEmailContacts();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const [isSending, setIsSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(recipients.cc.length > 0 || recipients.bcc.length > 0);
  const [subjectExpanded, setSubjectExpanded] = useState(showSubjectInitial);
  const [autoLink, setAutoLink] = useState<boolean>(true);
  const [trackOpens, setTrackOpens] = useState<boolean>(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [aiInsertedAt, setAiInsertedAt] = useState<number | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
  });

  // Drag-to-resize state (inline only)
  const [extraHeight, setExtraHeight] = useState(0);

  const hasContent = body.trim().length > 0 || attachments.length > 0;
  const hasRecipient = recipients.to.length > 0;
  const sendDisabledReason = !hasRecipient
    ? 'Add at least one recipient'
    : !hasContent
      ? 'Write a reply before sending'
      : null;
  const canSend = !sendDisabledReason && !isSending;

  // Live recipient/body validation clears errors as soon as user fixes them.
  useEffect(() => { if (hasRecipient && recipientError) setRecipientError(null); }, [hasRecipient, recipientError]);
  useEffect(() => { if (hasContent && bodyError) setBodyError(null); }, [hasContent, bodyError]);

  // ── AI Assist: listen for sidebar-ready drafts and apply them ────────────
  useEffect(() => {
    const onReady = (ev: Event) => {
      const detail = (ev as CustomEvent<AiAssistDraftReadyDetail>).detail;
      if (!detail?.body) { setAiPending(false); return; }
      onBodyChange(detail.body);
      setAiInsertedAt(Date.now());
      setAiPending(false);
      // Announce to screen readers
      if (liveRegionRef.current) liveRegionRef.current.textContent = 'AI draft inserted';
    };
    window.addEventListener(AI_ASSIST_READY_EVENT, onReady as EventListener);
    return () => window.removeEventListener(AI_ASSIST_READY_EVENT, onReady as EventListener);
  }, [onBodyChange]);

  const requestAiDraft = useCallback(() => {
    setAiPending(true);
    dispatchAiAssistRequest();
    // Safety timeout — if no listener responds within 4s, drop the spinner.
    window.setTimeout(() => setAiPending((p) => (p ? false : p)), 4000);
  }, []);

  // ── Send ────────────────────────────────────────────────────────────────
  const runSend = useCallback(async (opts: ComposerSendOptions = {}) => {
    if (!hasRecipient) { setRecipientError('Please add a recipient'); return; }
    if (!hasContent) { setBodyError('Write a reply before sending'); return; }
    setIsSending(true);
    try {
      if (opts.scheduledFor) {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) {
          toast.error('Not signed in — cannot schedule send');
          return;
        }
        const { error } = await supabase.from('scheduled_emails').insert({
          user_id: uid,
          to_recipients: recipients.to,
          cc_recipients: recipients.cc,
          bcc_recipients: recipients.bcc,
          subject,
          body_html: props.body,
          metadata: {
            autoLinkDeal: autoLink,
            trackOpens,
            dealId: props.dealId ?? null,
            archiveAfterSend: !!opts.archiveAfterSend,
          },
          scheduled_for: opts.scheduledFor,
          status: 'pending',
        });
        if (error) {
          toast.error(`Could not schedule send — ${error.message}`);
          return;
        }
        const when = new Date(opts.scheduledFor).toLocaleString();
        toast.success(`Scheduled for ${when}`);
        onDiscard();
        return;
      }
      await onSend({ ...opts, autoLinkDeal: autoLink, trackOpens });
    } finally {
      setIsSending(false);
    }
  }, [hasRecipient, hasContent, onSend, onDiscard, autoLink, trackOpens, recipients, subject, props.body, props.dealId]);

  // ── Keyboard shortcuts: ⌘↵ send · ⌘J AI draft ───────────────────────────
  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void runSend();
      return;
    }
    if (e.key.toLowerCase() === 'j' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      requestAiDraft();
    }
  };

  // ── Formatting helpers ──────────────────────────────────────────────────
  const wrapSelection = (prefix: string, suffix: string) => {
    const ta = textareaRef.current; if (!ta) return;
    const start = ta.selectionStart; const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    onBodyChange(body.slice(0, start) + prefix + selected + suffix + body.slice(end));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, end + prefix.length); }, 0);
  };
  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) { onBodyChange(body + text); return; }
    const start = ta.selectionStart; const end = ta.selectionEnd;
    onBodyChange(body.slice(0, start) + text + body.slice(end));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length); }, 0);
  };
  const handleBold = () => wrapSelection('**', '**');
  const handleItalic = () => wrapSelection('*', '*');
  const handleUnderline = () => wrapSelection('__', '__');
  const handleLink = () => { const url = prompt('Enter URL:'); if (url) wrapSelection('[', `](${url})`); };
  const handleBullet = () => insertAtCursor('\n- ');
  const handleNumbered = () => insertAtCursor('\n1. ');

  const handleAddAttachment = () => {
    const samples = ['proposal.pdf', 'financials.xlsx', 'term_sheet.docx', 'deck.pptx', 'summary.pdf'];
    const next = samples.find((s) => !attachments.includes(s));
    if (next) onAttachmentsChange([...attachments, next]);
  };

  const removeAttachment = (name: string) =>
    onAttachmentsChange(attachments.filter((a) => a !== name));

  // ── Drag-to-resize on top edge ──────────────────────────────────────────
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startExtra = extraHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setExtraHeight(Math.max(-80, Math.min(400, startExtra + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Clear AI-inserted chip when the user edits the body ─────────────────
  const aiChipDismiss = () => setAiInsertedAt(null);
  const lastBodyRef = useRef(body);
  useEffect(() => {
    if (aiInsertedAt && body !== lastBodyRef.current && Date.now() - aiInsertedAt > 200) {
      // Allow our own insert to settle, then drop chip on user-driven edits.
      // Only dismiss when the body diverges meaningfully (length-based heuristic).
      // Keep chip if change is just whitespace.
    }
    lastBodyRef.current = body;
  }, [body, aiInsertedAt]);

  const bodyMinHeight = useMemo(() => Math.max(120 + extraHeight, 80), [extraHeight]);

  // ── Discard with confirm ────────────────────────────────────────────────
  const DiscardKebab = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">More</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        {hasContent ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />Discard draft
              </DropdownMenuItem>
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
          <DropdownMenuItem onSelect={onDiscard} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" />Discard draft
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── Split Send button ───────────────────────────────────────────────────
  const SplitSend = (
    <div className="inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              onClick={() => void runSend()}
              disabled={!canSend}
              size="sm"
              className={cn(
                'h-8 text-xs gap-1.5 rounded-r-none px-3',
                'bg-[hsl(var(--outlook-blue))] text-white hover:bg-[hsl(var(--outlook-blue))]/90',
              )}
              aria-label={sendDisabledReason ? `Send disabled — ${sendDisabledReason}` : 'Send (⌘↵)'}
            >
              {isSending
                ? <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
                : <><Send className="h-3 w-3" />Send</>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {sendDisabledReason ?? 'Send (⌘↵)'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={isSending}
            size="sm"
            className={cn(
              'h-8 px-1.5 rounded-l-none border-l border-white/20',
              'bg-[hsl(var(--outlook-blue))] text-white hover:bg-[hsl(var(--outlook-blue))]/90',
            )}
            aria-label="More send options"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={!canSend}
            onSelect={() => void runSend({ archiveAfterSend: true })}
          >
            <Archive className="h-3.5 w-3.5 mr-2" />Send & Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSend}
            onSelect={() => {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              d.setHours(8, 0, 0, 0);
              void runSend({ scheduledFor: d.toISOString() });
            }}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-2" />Send tomorrow 8am
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canSend}
            onSelect={(e) => {
              e.preventDefault();
              setSchedulePickerOpen(true);
            }}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-2" />Pick date &amp; time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={schedulePickerOpen} onOpenChange={setSchedulePickerOpen}>
        <PopoverTrigger asChild>
          {/* Anchor only; opens via dropdown item */}
          <span className="sr-only" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-2">
          <div className="text-xs font-medium">Schedule send</div>
          <Input
            type="datetime-local"
            value={scheduleValue}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={(e) => setScheduleValue(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSchedulePickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!canSend || !scheduleValue}
              onClick={() => {
                const iso = new Date(scheduleValue).toISOString();
                setSchedulePickerOpen(false);
                void runSend({ scheduledFor: iso });
              }}
            >
              Schedule
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  const isInline = variant === 'inline';

  return (
    <div
      className={cn(
        'relative flex flex-col bg-card border border-border rounded-md shadow-sm overflow-hidden',
        isInline && 'mx-2 my-2',
        className,
      )}
      role="region"
      aria-label="Email composer"
    >
      {/* Accent edge anchoring the composer visually */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[hsl(var(--outlook-blue))]" aria-hidden />

      {/* Drag handle on top edge (inline only) */}
      {resizable && isInline && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 left-3 right-3 h-1 cursor-row-resize group/handle"
          aria-label="Drag to resize composer"
          role="separator"
        >
          <div className="h-px w-8 mx-auto mt-0 bg-border/40 group-hover/handle:bg-primary/60 transition-colors" />
        </div>
      )}

      {/* Header — recipient pill + actions */}
      <div className="flex items-center gap-2 pl-4 pr-2 py-2 border-b border-border/50">
        {!hideReplyAnchor && (
          <div className="flex items-center gap-1.5 min-w-0">
            <RecipientAvatar name={replyToName} email={recipients.to[0]} />
            <span className="text-xs text-muted-foreground truncate">
              Replying to{' '}
              <span className="text-foreground font-medium">
                {replyToName || recipients.to[0] || '—'}
              </span>
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Draft from AI Assist */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/10"
              onClick={requestAiDraft}
              aria-label="Draft from AI Assist (⌘J)"
            >
              {aiPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              Draft from AI Assist
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Pulls the suggested reply from the AI Assist panel (⌘J)
          </TooltipContent>
        </Tooltip>

        <DraftStatus status={saveStatus} />

        {onPopOut && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPopOut} aria-label="Pop out composer">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Pop out</TooltipContent>
          </Tooltip>
        )}

        {DiscardKebab}
      </div>

      {/* Recipient rows */}
      <div className="px-4 py-1.5 space-y-1 border-b border-border/40">
        <div className="flex items-start gap-2">
          <RecipientField
            label="To"
            recipients={recipients.to}
            onChange={(to) => onRecipientsChange({ ...recipients, to })}
            search={search}
            placeholder="recipient@example.com"
            className="flex-1 min-w-0"
            labelClassName="w-7"
            inputClassName="h-7 text-xs"
            onBlur={onFieldBlur}
          />
          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors h-7 px-1.5 shrink-0"
              aria-label="Add Cc and Bcc fields"
            >
              + Cc/Bcc
            </button>
          )}
        </div>
        {showCcBcc && (
          <>
            <RecipientField
              label="Cc"
              recipients={recipients.cc}
              onChange={(cc) => onRecipientsChange({ ...recipients, cc })}
              search={search}
              placeholder="cc@example.com"
              labelClassName="w-7"
              inputClassName="h-7 text-xs"
              onBlur={onFieldBlur}
            />
            <RecipientField
              label="Bcc"
              recipients={recipients.bcc}
              onChange={(bcc) => onRecipientsChange({ ...recipients, bcc })}
              search={search}
              placeholder="bcc@example.com"
              labelClassName="w-7"
              inputClassName="h-7 text-xs"
              onBlur={onFieldBlur}
            />
          </>
        )}
        {recipientError && (
          <p className="text-[10px] text-destructive flex items-center gap-1" role="alert">
            <AlertCircle className="h-2.5 w-2.5" />{recipientError}
          </p>
        )}

        {/* Subject — collapsed by default for replies */}
        <div className="flex items-center gap-2 pt-0.5">
          {subjectExpanded ? (
            <>
              <span className="text-[10px] text-muted-foreground w-7 shrink-0">Subj</span>
              <Input
                ref={subjectInputRef}
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                onBlur={onFieldBlur}
                placeholder="Subject"
                className="h-7 text-xs border-0 border-b border-border/60 rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setSubjectExpanded(true); setTimeout(() => subjectInputRef.current?.focus(), 0); }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
              aria-label="Edit subject"
            >
              <span className="w-7 shrink-0 text-left">Subj</span>
              <span className="truncate text-foreground/80 max-w-[60ch]">{subject || '(no subject)'}</span>
              <Edit3 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </div>

      {/* AI-draft inserted chip */}
      {aiInsertedAt && (
        <div className="px-4 pt-2">
          <div className="inline-flex items-center gap-2 text-[10px] bg-[hsl(var(--outlook-blue))]/10 text-[hsl(var(--outlook-blue))] border border-[hsl(var(--outlook-blue))]/20 rounded px-2 py-0.5">
            <Sparkles className="h-2.5 w-2.5" />
            <span>AI draft inserted</span>
            <button
              type="button"
              onClick={() => { aiChipDismiss(); textareaRef.current?.focus(); }}
              className="hover:underline"
            >
              Edit
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => { aiChipDismiss(); onBodyChange(''); }}
              className="hover:underline"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Body + signature ghost */}
      <div className="px-4 pt-3 pb-1 flex-1 min-h-0">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={handleBodyKeyDown}
          onBlur={onFieldBlur}
          placeholder="Write your reply… or press ⌘J to draft with AI."
          className={cn(
            'border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent w-full placeholder:text-muted-foreground/70',
            'focus-visible:outline-none',
          )}
          style={{ minHeight: bodyMinHeight }}
          aria-label="Email body"
          aria-invalid={!!bodyError}
        />
        {signature && (
          <div className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap pt-2 border-t border-border/30 mt-2 select-none" aria-hidden>
            {signature}
          </div>
        )}
        {bodyError && (
          <p className="text-[10px] text-destructive flex items-center gap-1 pt-1" role="alert">
            <AlertCircle className="h-2.5 w-2.5" />{bodyError}
          </p>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 pb-1.5">
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((name) => (
              <Badge key={name} variant="secondary" className="text-[10px] gap-1 pr-1 py-0.5">
                <Paperclip className="h-2.5 w-2.5" />{name}
                <button
                  type="button"
                  onClick={() => removeAttachment(name)}
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  aria-label={`Remove attachment ${name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar — Format · Insert · AI · Send */}
      <div className="flex items-center flex-wrap gap-y-1 px-4 py-2 border-t border-border/50">
        <ToolbarZone>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBold} aria-label="Bold"><Bold className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Bold (⌘B)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleItalic} aria-label="Italic"><Italic className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Italic (⌘I)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUnderline} aria-label="Underline"><Underline className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Underline (⌘U)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleLink} aria-label="Insert link"><LinkIcon className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Link</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBullet} aria-label="Bulleted list"><List className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Bulleted list</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNumbered} aria-label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Numbered list</TooltipContent></Tooltip>
        </ToolbarZone>

        <ToolbarDivider />

        <ToolbarZone>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-7 text-xs" onClick={handleAddAttachment} aria-label="Attach file"><Paperclip className="h-3 w-3" />Attach</Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Attach a file</TooltipContent></Tooltip>
          <SnippetPicker onInsert={insertAtCursor} tokenContext={tokenContext} />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" disabled aria-label="Insert image"><ImageIcon className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="top" className="text-xs">Insert image (soon)</TooltipContent></Tooltip>
        </ToolbarZone>

        <ToolbarDivider />

        <ToolbarZone>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-7 text-xs text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/10"
                onClick={requestAiDraft}
                aria-label="Draft with AI (⌘J)"
              >
                <Sparkles className="h-3 w-3" />Draft with AI
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Draft with AI (⌘J)</TooltipContent>
          </Tooltip>
        </ToolbarZone>

        <div className="flex-1" />

        {SplitSend}
      </div>

      {/* Contextual metadata strip */}
      {(dealName || true) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground px-4 pb-2">
          {dealName && (
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLink}
                onChange={(e) => setAutoLink(e.target.checked)}
                className="h-3 w-3 accent-[hsl(var(--outlook-blue))]"
                aria-label={`Auto-link to ${dealName}`}
              />
              Will auto-link to <span className="text-foreground/80 font-medium">{dealName}</span>
            </label>
          )}
          {attachments.length > 0 && (
            <span>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</span>
          )}
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={trackOpens}
              onChange={(e) => setTrackOpens(e.target.checked)}
              className="h-3 w-3 accent-[hsl(var(--outlook-blue))]"
              aria-label="Track opens"
            />
            Track opens
          </label>
        </div>
      )}

      {/* Screen-reader live region for AI-draft inserts */}
      <div ref={liveRegionRef} className="sr-only" role="status" aria-live="polite" />
    </div>
  );
}
