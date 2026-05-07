import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Edit3, ChevronDown,
  MoreHorizontal, Calendar as CalendarIcon, Image as ImageIcon, Archive,
  Link2, Database,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { RecipientField } from './RecipientField';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import { SnippetPicker } from './SnippetPicker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { shouldShowSignatureGhost } from './signatureGhost';
import { EmailRichTextEditor } from './EmailRichTextEditor';
import {
  signatureToHtml,
  signatureToPlainText,
  signatureFirstLine,
  bodyContainsSignature,
} from './signatureHtml';
import { PolishWithAiDialog } from './PolishWithAiDialog';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

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
  /** Attachments — controlled (filename list, persisted in drafts). */
  attachments: string[];
  onAttachmentsChange: (next: string[]) => void;
  /**
   * Optional richer attachments callback. When provided, the composer will
   * surface a real file picker (paperclip) and forward the selected `File`
   * objects so the parent can attach them to the outgoing message.
   * The `attachments` (string[]) prop continues to mirror filenames so existing
   * draft-persistence stays intact.
   */
  onFilesChange?: (files: File[]) => void;
  /** Maximum total attachment size in bytes. Defaults to 25 MB (Gmail limit). */
  maxAttachmentBytes?: number;
  /** Optional FLEx data-room URL. Surfaces a 'View Data Room' shortcut. */
  dataRoomUrl?: string | null;

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

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    onFilesChange,
    maxAttachmentBytes = 25 * 1024 * 1024,
    dataRoomUrl,
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
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  // Resolve the FLEx data-room URL for the linked deal (if any) so the
  // editor's link popover and the toolbar can offer the "Data Room" shortcut.
  // Falls back to an explicit `dataRoomUrl` prop when provided.
  const [resolvedDataRoomUrl, setResolvedDataRoomUrl] = useState<string | null>(dataRoomUrl ?? null);
  useEffect(() => {
    if (dataRoomUrl) { setResolvedDataRoomUrl(dataRoomUrl); return; }
    if (!dealId) { setResolvedDataRoomUrl(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deal_writeups')
        .select('data_room_url, updated_at')
        .eq('deal_id', dealId)
        .not('data_room_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const url = data?.[0]?.data_room_url as string | null | undefined;
      setResolvedDataRoomUrl(url ?? null);
    })();
    return () => { cancelled = true; };
  }, [dealId, dataRoomUrl]);

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
  const [polishOpen, setPolishOpen] = useState(false);

  // The Polish button surfaces only once the user has typed something
  // meaningful. 60 chars ≈ ~10 words — enough to be worth polishing.
  // Hidden while an AI draft is pending or just inserted (that flow has
  // its own review chip).
  const plainBodyLength = useMemo(() => {
    const plain = /<[a-z][\s\S]*>/i.test(body || '') ? htmlToPlainText(body || '') : (body || '');
    return plain.replace(/\s+/g, ' ').trim().length;
  }, [body]);
  const canPolish = plainBodyLength >= 60 && !aiInsertedAt && !aiPending;

  // In-place polish: replaces the body with a polished version and exposes
  // a 10-second Undo affordance. We keep `polishOpen` for the legacy dialog
  // path (kept to avoid breaking external callers), but the toolbar button
  // now polishes in place.
  const [polishPending, setPolishPending] = useState(false);
  const [prePolishBody, setPrePolishBody] = useState<string | null>(null);
  const [polishTooltipOpen, setPolishTooltipOpen] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  }, []);

  const escapeHtmlLocal = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const handlePolishInPlace = useCallback(async () => {
    const plain = /<[a-z][\s\S]*>/i.test(body || '')
      ? htmlToPlainText(body || '')
      : (body || '');
    const trimmed = plain.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 1) {
      // Empty body — show inline tooltip nudge
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      setPolishTooltipOpen(true);
      tooltipTimerRef.current = setTimeout(() => setPolishTooltipOpen(false), 2500);
      return;
    }
    if (polishPending) return;
    setPolishPending(true);
    try {
      const draftText = /<[a-z][\s\S]*>/i.test(body || '')
        ? htmlToPlainText(body || '')
        : (body || '');
      const { data, error } = await supabase.functions.invoke('polish-email-draft', {
        body: {
          draft: draftText,
          subject: subject || '',
          recipientName: replyToName || '',
        },
      });
      if (error) throw error;
      const polished: string | undefined = data?.polished;
      if (!polished) throw new Error(data?.error || 'No polished draft returned');

      // Snapshot for undo, then replace body with HTML-wrapped polished text.
      setPrePolishBody(body || '');
      const html = polished
        .split(/\n{2,}/)
        .map(par => `<p>${par.split(/\n/).map(escapeHtmlLocal).join('<br />')}</p>`)
        .join('');
      onBodyChange(html);
      toast.success('Polished draft applied');
      try {
        const { logUsage } = await import('@/lib/usageLogger');
        logUsage({ feature_type: 'EMAIL_DRAFT', feature_subtype: 'polished' });
      } catch { /* ignore */ }

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setPrePolishBody(null), 10000);
    } catch (e: any) {
      console.error('polish-in-place error', e);
      toast.error(e?.message || 'Could not polish draft');
    } finally {
      setPolishPending(false);
    }
  }, [body, subject, replyToName, polishPending, onBodyChange]);

  const handleUndoPolish = useCallback(() => {
    if (prePolishBody === null) return;
    onBodyChange(prePolishBody);
    setPrePolishBody(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    toast.success('Reverted to your original draft');
  }, [prePolishBody, onBodyChange]);
  const [scheduleValue, setScheduleValue] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
  });

  // Drag-to-resize state (inline only)
  const [extraHeight, setExtraHeight] = useState(0);

  // First-visit CTA: nudge users who haven't configured an email signature.
  // Dismissible per-user, then suppressed for the rest of the browser session.
  const { user: composerUser } = useAuth();
  const sigCtaStorageKey = composerUser?.id ? `naitive:sig-cta-dismissed:${composerUser.id}` : null;
  const [sigCtaDismissed, setSigCtaDismissed] = useState<boolean>(() => {
    try {
      return sigCtaStorageKey ? sessionStorage.getItem(sigCtaStorageKey) === '1' : false;
    } catch {
      return false;
    }
  });
  const [hasSavedSignature, setHasSavedSignature] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!composerUser?.id) {
      setHasSavedSignature(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('email_signature')
        .eq('user_id', composerUser.id)
        .maybeSingle();
      if (cancelled) return;
      const sig = (data?.email_signature as string | null) ?? '';
      setHasSavedSignature(!!(sig && sig.trim()));
    })();
    return () => { cancelled = true; };
  }, [composerUser?.id]);
  const showSignatureCta = hasSavedSignature === false && !sigCtaDismissed;
  const dismissSignatureCta = useCallback(() => {
    setSigCtaDismissed(true);
    try {
      if (sigCtaStorageKey) sessionStorage.setItem(sigCtaStorageKey, '1');
    } catch {}
  }, [sigCtaStorageKey]);

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

  // Snippets / AI drafts append at end of body (rich text editor manages its
  // own caret).
  const insertAtCursor = useCallback((text: string) => {
    onBodyChange((body || '') + text);
  }, [body, onBodyChange]);

  // ── Attachments — real File picker, capped at maxAttachmentBytes total ──
  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback((picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const incoming = Array.from(picked);
    const merged = [...files];
    let runningTotal = totalBytes;
    const skipped: string[] = [];
    for (const f of incoming) {
      if (merged.some((m) => m.name === f.name && m.size === f.size)) continue;
      if (runningTotal + f.size > maxAttachmentBytes) {
        skipped.push(f.name);
        continue;
      }
      merged.push(f);
      runningTotal += f.size;
    }
    if (skipped.length > 0) {
      const cap = Math.round(maxAttachmentBytes / (1024 * 1024));
      toast.error(
        `Couldn't attach ${skipped.length} file${skipped.length === 1 ? '' : 's'} — total over ${cap}MB cap.`,
      );
    }
    setFiles(merged);
    onFilesChange?.(merged);
    onAttachmentsChange(merged.map((f) => f.name));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [files, totalBytes, maxAttachmentBytes, onFilesChange, onAttachmentsChange]);

  const removeAttachment = useCallback((name: string) => {
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    onFilesChange?.(next);
    // Mirror the filename list. If the user is removing a legacy filename-only
    // attachment (no backing File), drop it from the names list directly.
    if (next.length === files.length) {
      onAttachmentsChange(attachments.filter((a) => a !== name));
    } else {
      onAttachmentsChange(next.map((f) => f.name));
    }
  }, [files, attachments, onFilesChange, onAttachmentsChange]);

  // ── Drag-and-drop attachments ──────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  // ── Signature auto-append on first mount when body is empty ─────────────
  // Honors the long-standing rule of not splicing into in-progress drafts:
  // we only inject the signature when the editor opens with no body content.
  const signatureInjectedRef = useRef(false);
  useEffect(() => {
    if (signatureInjectedRef.current) return;
    if (!signature || !signature.trim()) return;
    if (body && body.trim().length > 0) {
      signatureInjectedRef.current = true;
      return;
    }
    // Signatures may be plain-text (legacy) OR rich HTML (RTE). signatureToHtml
    // sanitizes HTML and escapes/wraps plain text — so the editor renders the
    // signature exactly the way the recipient will see it, never as raw markup.
    const sigHtml = signatureToHtml(signature);
    onBodyChange(`<p></p><p></p>${sigHtml}`);
    signatureInjectedRef.current = true;
    // We intentionally don't react to subsequent body/signature updates — this
    // is a one-shot prefill. Subsequent edits are owned by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

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
                'h-8 text-xs gap-1.5 rounded-r-none px-3.5 font-medium',
                'bg-gradient-to-b from-[hsl(180_72%_45%)] to-[hsl(190_82%_38%)] text-white shadow-[0_1px_0_hsl(0_0%_100%/0.12)_inset,0_1px_2px_hsl(190_60%_15%/0.4)] hover:from-[hsl(180_72%_50%)] hover:to-[hsl(190_82%_42%)] disabled:opacity-50',
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
              'bg-gradient-to-b from-[hsl(180_72%_45%)] to-[hsl(190_82%_38%)] text-white hover:from-[hsl(180_72%_50%)] hover:to-[hsl(190_82%_42%)]',
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
        'relative flex flex-col bg-[hsl(var(--card))] border border-white/10 rounded-lg shadow-lg overflow-hidden',
        isInline && 'mx-3 my-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        isDragOver && 'ring-2 ring-[hsl(var(--outlook-blue))] ring-offset-0',
        className,
      )}
      role="region"
      aria-label="Email composer"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Accent edge anchoring the composer visually */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[hsl(var(--outlook-blue))]" aria-hidden />

      {/* Drag-over overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-[hsl(var(--outlook-blue))]/10 backdrop-blur-[1px] pointer-events-none"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-md border border-dashed border-[hsl(var(--outlook-blue))]/60 bg-card/80">
            <Paperclip className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
            <span className="text-xs font-medium text-foreground">Drop files to attach</span>
            <span className="text-[10px] text-muted-foreground">
              Up to {Math.round(maxAttachmentBytes / (1024 * 1024))}MB total
            </span>
          </div>
        </div>
      )}

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
      <div className="flex items-center gap-2 pl-4 pr-2 py-2 border-b border-white/10 bg-white/[0.02]">
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

      {/* First-visit signature CTA — surfaces once per user/session when no
          email_signature has been saved yet. */}
      {showSignatureCta && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-[hsl(var(--outlook-blue))]/8"
          role="status"
        >
          <Edit3 className="h-3.5 w-3.5 text-[hsl(var(--outlook-blue))] shrink-0" aria-hidden />
          <span className="text-[11px] text-foreground/90 flex-1 min-w-0">
            <span className="font-medium">Configure your email signature</span>{' '}
            <span className="text-muted-foreground">
              so it's automatically appended to outgoing replies.
            </span>
          </span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/15"
          >
            <Link to="/settings?tab=email" onClick={dismissSignatureCta}>
              Set up signature
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={dismissSignatureCta}
            aria-label="Dismiss signature reminder"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Recipient rows */}
      <div className="px-4 py-2 space-y-1 border-b border-white/10">
        <div className="flex items-start gap-2">
          <RecipientField
            label="To"
            recipients={recipients.to}
            onChange={(to) => onRecipientsChange({ ...recipients, to })}
            search={search}
            placeholder="recipient@example.com"
            className="flex-1 min-w-0"
            labelClassName="w-8 text-[11px] text-foreground/50"
            inputClassName="h-8 text-[13px] bg-transparent text-foreground placeholder:text-foreground/30"
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
              labelClassName="w-8 text-[11px] text-foreground/50"
              inputClassName="h-8 text-[13px] bg-transparent text-foreground placeholder:text-foreground/30"
              onBlur={onFieldBlur}
            />
            <RecipientField
              label="Bcc"
              recipients={recipients.bcc}
              onChange={(bcc) => onRecipientsChange({ ...recipients, bcc })}
              search={search}
              placeholder="bcc@example.com"
              labelClassName="w-8 text-[11px] text-foreground/50"
              inputClassName="h-8 text-[13px] bg-transparent text-foreground placeholder:text-foreground/30"
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
              <span className="text-[11px] text-foreground/50 w-8 shrink-0">Subj</span>
              <Input
                ref={subjectInputRef}
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                onBlur={onFieldBlur}
                placeholder="Subject"
                className="h-8 text-[13px] border-0 border-b border-white/10 rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium text-foreground placeholder:text-foreground/30"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setSubjectExpanded(true); setTimeout(() => subjectInputRef.current?.focus(), 0); }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
              aria-label="Edit subject"
            >
              <span className="w-8 shrink-0 text-left text-foreground/50">Subj</span>
              <span className="truncate text-foreground/85 max-w-[60ch] text-[13px]">{subject || '(no subject)'}</span>
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
              onClick={() => { aiChipDismiss(); }}
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

      {/* Body — rich text editor */}
      <div
        className="px-4 pt-3 pb-1 flex-1 min-h-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void runSend();
            return;
          }
          if (e.key.toLowerCase() === 'j' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            requestAiDraft();
          }
        }}
        onBlur={onFieldBlur}
      >
        <EmailRichTextEditor
          content={body}
          onChange={onBodyChange}
          dataRoomUrl={resolvedDataRoomUrl}
          minHeight={bodyMinHeight}
          className="border-0 shadow-none"
          toolbarTrailing={
            canPolish ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/10"
                    onClick={() => setPolishOpen(true)}
                    aria-label="Polish with AI"
                  >
                    <Sparkles className="h-3 w-3" />
                    Polish with AI
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Rewrite your draft in 5th Line voice — facts preserved
                </TooltipContent>
              </Tooltip>
            ) : null
          }
        />
        {shouldShowSignatureGhost(signatureToPlainText(signature), signatureToPlainText(body)) && (
          <div
            className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap pt-2 border-t border-border/30 mt-2 select-none"
            aria-hidden
            data-testid="signature-ghost"
          >
            {signatureToPlainText(signature)}
          </div>
        )}
        {/* Deal-link preview — mirrors what the outgoing message will reference.
            Updates live with dealName/dealId and the Auto-link toggle below. */}
        {dealName && autoLink && (
          <div
            className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2 text-[11px] text-muted-foreground select-none"
            data-testid="deal-link-preview"
            aria-label={`This message will be linked to ${dealName}`}
          >
            <Link2 className="h-3 w-3 text-[hsl(var(--outlook-blue))] shrink-0" aria-hidden />
            <span className="truncate">
              Linked to{' '}
              <span className="text-foreground/80 font-medium">{dealName}</span>
              {dealId && (
                <span className="ml-1 text-muted-foreground/60 font-mono text-[10px]">
                  · /deals/{String(dealId).slice(0, 8)}
                </span>
              )}
            </span>
          </div>
        )}
        {dealName && !autoLink && (
          <div
            className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2 text-[11px] text-muted-foreground/60 italic select-none"
            data-testid="deal-link-preview-off"
          >
            <Link2 className="h-3 w-3 shrink-0" aria-hidden />
            <span>Auto-link to {dealName} is off — message will not be associated with the deal.</span>
          </div>
        )}
        {bodyError && (
          <p className="text-[10px] text-destructive flex items-center gap-1 pt-1" role="alert">
            <AlertCircle className="h-2.5 w-2.5" />{bodyError}
          </p>
        )}
      </div>

      {/* Attachments */}
      {(files.length > 0 || attachments.length > 0) && (
        <div className="px-4 pb-1.5">
          <div className="flex flex-wrap gap-1.5">
            {(files.length > 0 ? files.map((f) => ({ name: f.name, size: f.size })) : attachments.map((n) => ({ name: n, size: 0 }))).map((a) => (
              <Badge key={a.name} variant="secondary" className="text-[10px] gap-1 pr-1 py-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                <span className="max-w-[14rem] truncate">{a.name}</span>
                {a.size > 0 && (
                  <span className="text-muted-foreground/70">{formatBytes(a.size)}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.name)}
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  aria-label={`Remove attachment ${a.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          {files.length > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)} of {formatBytes(maxAttachmentBytes)}
            </div>
          )}
        </div>
      )}

      {/* Hidden file input wired to the paperclip */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Toolbar — Insert · AI · Send (formatting lives in the editor toolbar) */}
      <div className="flex items-center flex-wrap gap-y-1 px-4 py-2 border-t border-white/10 bg-white/[0.02]">
        <ToolbarZone>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground h-7 text-xs"
                onClick={triggerFilePicker}
                aria-label="Attach file"
              >
                <Paperclip className="h-3 w-3" />Attach
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Attach a file (max {Math.round(maxAttachmentBytes / (1024 * 1024))}MB total)
            </TooltipContent>
          </Tooltip>
          {resolvedDataRoomUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground h-7 text-xs"
                  onClick={() => insertAtCursor(`<p><a href="${resolvedDataRoomUrl}" target="_blank" rel="noopener noreferrer">View Data Room</a></p>`)}
                  aria-label="Insert Data Room link"
                >
                  <Database className="h-3 w-3" />Data Room
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Insert FLEx data room link
              </TooltipContent>
            </Tooltip>
          )}
          <SnippetPicker onInsert={insertAtCursor} tokenContext={tokenContext} />
          <Tooltip open={polishTooltipOpen || undefined}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 h-7 text-xs text-muted-foreground hover:text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/10"
                onClick={handlePolishInPlace}
                onMouseEnter={() => { if (polishTooltipOpen) setPolishTooltipOpen(false); }}
                disabled={polishPending}
                aria-label="Polish with AI"
              >
                {polishPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Polish ✨
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {polishTooltipOpen
                ? 'Type your draft first, then polish it'
                : 'Rewrite your draft in 5th Line voice — facts preserved'}
            </TooltipContent>
          </Tooltip>
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

      {prePolishBody !== null && (
        <div className="flex items-center justify-end gap-2 px-4 pb-2 -mt-1 text-[11px] text-muted-foreground animate-in fade-in-0 slide-in-from-top-1">
          <span>Polished with AI.</span>
          <button
            type="button"
            onClick={handleUndoPolish}
            className="text-[hsl(var(--outlook-blue))] hover:underline font-medium"
          >
            Undo polish
          </button>
        </div>
      )}

      <PolishWithAiDialog
        open={polishOpen}
        onOpenChange={setPolishOpen}
        draftBody={body || ''}
        subject={subject}
        recipientName={replyToName}
        onAccept={(finalBody) => {
          // finalBody is plain text with newlines preserved.
          // Wrap in <p> blocks so the rich-text editor renders paragraphs.
          const html = finalBody
            .split(/\n{2,}/)
            .map(par => `<p>${par.split(/\n/).map(escapeHtml).join('<br />')}</p>`)
            .join('');
          onBodyChange(html);
          toast.success('Polished draft applied');
        }}
      />

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
          {/* Signature indicator — shows the saved signature's first line, or a
              link to configure one if the user hasn't set one yet. */}
          {hasSavedSignature === true && props.signature ? (
            <span
              className="inline-flex items-center gap-1 truncate max-w-[260px]"
              title={signatureToPlainText(props.signature)}
            >
              <Edit3 className="h-2.5 w-2.5 opacity-60" aria-hidden />
              <span className="opacity-70">Signature:</span>
              <span className="text-foreground/80 truncate">
                {signatureFirstLine(props.signature)}
              </span>
            </span>
          ) : hasSavedSignature === false ? (
            <Link
              to="/settings?tab=email"
              className="inline-flex items-center gap-1 text-[hsl(var(--outlook-blue))] hover:underline"
              onClick={dismissSignatureCta}
            >
              <Edit3 className="h-2.5 w-2.5" aria-hidden />
              No signature set — Add one in Settings
            </Link>
          ) : null}
        </div>
      )}

      {/* Screen-reader live region for AI-draft inserts */}
      <div ref={liveRegionRef} className="sr-only" role="status" aria-live="polite" />
    </div>
  );
}
