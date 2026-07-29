import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Sparkles, Copy, ListChecks, ListTodo, Building2, UserPlus, Link2,
  StickyNote, Mail, FileText, Loader2, X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Structured commands surfaced from highlighted email-body text. Each
 * command maps to a deterministic downstream action — never a freeform
 * chat. Handlers consume the structured payload via
 * `window.addEventListener('naitive:email-selection-action', ...)`.
 */
export type SelectionCommand =
  | 'add_outstanding_item'
  | 'create_followup_task'
  | 'update_lender'
  | 'update_deal'
  | 'add_contact'
  | 'link_to_deal'
  | 'save_note'
  | 'draft_reply'
  | 'summarize'
  | 'copy';

export interface SelectionContext {
  threadId?: string;
  messageId?: string;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  toEmails?: string[];
  ccEmails?: string[];
  receivedAt?: string;
  dealId?: string | null;
  dealName?: string | null;
  contactId?: string | null;
  page?: string;
}

export interface SelectionActionPayload {
  command: SelectionCommand;
  selectedText: string;
  context: SelectionContext;
}

interface Props {
  children: ReactNode;
  context: SelectionContext;
  /**
   * Optional override. If omitted, commands other than `copy`/`summarize`/`draft_reply`
   * dispatch a `naitive:email-selection-action` CustomEvent that the existing
   * AI Assist infrastructure can pick up.
   */
  onAction?: (payload: SelectionActionPayload) => void;
  /** Disable the entire menu (e.g. inside a composer). */
  disabled?: boolean;
  className?: string;
}

const COMMANDS: Array<{
  id: SelectionCommand;
  label: string;
  Icon: typeof ListTodo;
  group: 'ai' | 'utility';
  hint?: string;
}> = [
  { id: 'summarize',            label: 'Summarize selection',     Icon: Sparkles, group: 'ai',      hint: 'Quick summary' },
  { id: 'draft_reply',          label: 'Draft reply from selection', Icon: Mail,    group: 'ai',      hint: 'Use selection as seed' },
  { id: 'add_outstanding_item', label: 'Add to Outstanding Items', Icon: ListChecks, group: 'ai' },
  { id: 'create_followup_task', label: 'Create follow-up task',    Icon: ListTodo,   group: 'ai' },
  { id: 'update_lender',        label: 'Update lender',            Icon: Building2,  group: 'ai' },
  { id: 'update_deal',          label: 'Update deal',              Icon: FileText,   group: 'ai' },
  { id: 'add_contact',          label: 'Add contact',              Icon: UserPlus,   group: 'ai' },
  { id: 'link_to_deal',         label: 'Link to deal',             Icon: Link2,      group: 'ai' },
  { id: 'save_note',            label: 'Save as deal note',        Icon: StickyNote, group: 'ai' },
  { id: 'copy',                 label: 'Copy selected text',       Icon: Copy,       group: 'utility' },
];

const FORBIDDEN_CLOSEST = '[contenteditable="true"], [contenteditable=""], textarea, input, [data-no-selection-menu]';

interface Anchor { x: number; y: number; placement: 'above' | 'below' }

/**
 * Wrap a message-body region to enable a contextual AI action menu on
 * text selection. Behaviors:
 *   • A floating mini-toolbar (AI / Copy) appears just above the selection
 *     rect — works on Mac/trackpad without needing a right click.
 *   • Right-click on a non-empty selection inside the region opens the full
 *     command menu at the cursor (replacing the native context menu).
 *   • The menu is scoped to the wrapped region — selecting in composers,
 *     inputs, or the AI Assist panel does nothing.
 *   • Closes when the selection collapses, the user clicks elsewhere,
 *     scrolls outside, or the thread context changes.
 */
export function EmailSelectionActionMenu({
  children,
  context,
  onAction,
  disabled,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [toolbar, setToolbar] = useState<Anchor | null>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [summary, setSummary] = useState<{ loading: boolean; text?: string; error?: string } | null>(null);

  // Reset whenever the underlying thread/message changes.
  useEffect(() => {
    setSelectedText('');
    setToolbar(null);
    setMenu(null);
    setSummary(null);
  }, [context.threadId, context.messageId]);

  const readSelection = useCallback((): { text: string; rect: DOMRect | null } => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return { text: '', rect: null };
    const text = sel.toString().trim();
    if (!text || text.length < 2) return { text: '', rect: null };

    // Selection must originate inside the wrapped region AND not inside a forbidden element.
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = (node.nodeType === 1 ? node : node.parentElement) as Element | null;
    if (!el || !containerRef.current?.contains(el)) return { text: '', rect: null };
    if (el.closest(FORBIDDEN_CLOSEST)) return { text: '', rect: null };

    const rect = range.getBoundingClientRect();
    return { text, rect };
  }, []);

  // Update the floating toolbar after the user finishes selecting.
  const refreshToolbar = useCallback(() => {
    if (disabled) return;
    const { text, rect } = readSelection();
    if (!text || !rect) {
      setSelectedText('');
      setToolbar(null);
      return;
    }
    setSelectedText(text);
    const spaceAbove = rect.top;
    const placement: Anchor['placement'] = spaceAbove > 60 ? 'above' : 'below';
    setToolbar({
      x: Math.max(8, Math.min(window.innerWidth - 200, rect.left + rect.width / 2)),
      y: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      placement,
    });
  }, [disabled, readSelection]);

  useEffect(() => {
    if (disabled) return;
    const onPointerUp = () => setTimeout(refreshToolbar, 0);
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setToolbar(null);
        setSelectedText('');
      }
    };
    const onScroll = () => {
      // Hide toolbar/menu on scroll; user can re-select to reopen.
      setToolbar(null);
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setToolbar(null); setSummary(null); }
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [disabled, refreshToolbar]);

  // Right-click handler — opens the full command menu at cursor only when
  // the cursor is over a non-empty in-region selection.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    const { text } = readSelection();
    if (!text) return; // let the native context menu show normally
    e.preventDefault();
    setSelectedText(text);
    setMenu({ x: e.clientX, y: e.clientY, placement: 'below' });
    setToolbar(null);
  }, [disabled, readSelection]);

  const runAction = useCallback(async (command: SelectionCommand) => {
    const payload: SelectionActionPayload = { command, selectedText, context };
    setMenu(null);

    if (command === 'copy') {
      try {
        await navigator.clipboard.writeText(selectedText);
        toast.success('Selection copied');
      } catch {
        toast.error("Couldn't copy selection");
      }
      return;
    }

    if (command === 'summarize') {
      setSummary({ loading: true });
      try {
        // Previously invoked the `claude-ai` edge function directly. All
        // frontend Claude calls now flow through `sendClaudeMessage`, which
        // targets the `claude-gateway` edge function (server-side Anthropic
        // proxy — key never exposed to the browser).
        const result = await sendClaudeMessage({
          context: 'chat',
          system:
            'You summarize email excerpts. Reply with 2-4 crisp bullet points, plus a one-line "Why it matters" if relevant. No preamble, no markdown headers.',
          messages: [{
            role: 'user',
            content:
              `Summarize the following selection from an email.\n\n` +
              `Subject: ${context.subject || '(none)'}\n` +
              `From: ${context.fromName || context.fromEmail || '(unknown)'}\n` +
              `Deal: ${context.dealName || '(none)'}\n\n` +
              `--- Selection ---\n${selectedText}\n--- End selection ---`,
          }],
          temperature: 0.2,
          max_tokens: 400,
          usage: { feature_subtype: 'email_selection_summary' },
        });
        if (!result.success) throw new Error(result.error || 'No summary returned');
        const text = result.response;
        if (!text) throw new Error('No summary returned');
        setSummary({ loading: false, text });
      } catch (err: any) {
        setSummary({ loading: false, error: err?.message || 'Summary failed' });
      }
      return;
    }

    if (command === 'draft_reply') {
      // Seed the Outlook-style pop-out composer with the selection as a quote.
      // EmailListAndDetail already listens for `naitive:ai-assist:open-popout-draft`.
      const quoted = selectedText
        .split(/\r?\n/)
        .map((l) => `> ${l}`)
        .join('\n');
      const body =
        `${quoted}\n\n` +
        `(Drafted from highlighted selection — please review before sending.)`;
      try {
        window.dispatchEvent(new CustomEvent('naitive:ai-assist:open-popout-draft', {
          detail: { body, threadId: context.threadId, source: 'selection-menu' },
        }));
        toast.success('Draft opened from selection');
      } catch {
        toast.error("Couldn't open draft");
      }
      // Also fan out the structured payload so other listeners can react.
      try {
        window.dispatchEvent(new CustomEvent('naitive:email-selection-action', { detail: payload }));
      } catch { /* noop */ }
      return;
    }

    // All structured AI commands: hand off to the AI Assist infrastructure.
    if (onAction) {
      onAction(payload);
    } else {
      try {
        window.dispatchEvent(new CustomEvent('naitive:email-selection-action', { detail: payload }));
      } catch { /* noop */ }
    }
    toast.success(`Sent to AI Assist: ${commandLabel(command)}`);
  }, [selectedText, context, onAction]);

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      className={cn('relative', className)}
    >
      {children}

      {/* Floating toolbar above the selection (Mac/trackpad-friendly) */}
      {toolbar && !menu && selectedText && (
        <FloatingToolbar
          anchor={toolbar}
          onOpenMenu={(x, y) => setMenu({ x, y, placement: 'below' })}
          onCopy={() => runAction('copy')}
          onSummarize={() => runAction('summarize')}
        />
      )}

      {/* Full command menu (right-click or "AI" button) */}
      {menu && selectedText && (
        <CommandMenu
          anchor={menu}
          selectedText={selectedText}
          onClose={() => setMenu(null)}
          onRun={runAction}
        />
      )}

      {/* Inline summary result panel */}
      {summary && (
        <SummaryPanel
          state={summary}
          onClose={() => setSummary(null)}
          onCopy={async () => {
            if (!summary.text) return;
            try {
              await navigator.clipboard.writeText(summary.text);
              toast.success('Summary copied');
            } catch { /* noop */ }
          }}
        />
      )}
    </div>
  );
}

function commandLabel(c: SelectionCommand): string {
  return COMMANDS.find(x => x.id === c)?.label || c;
}

/* ───────────────────────── Floating toolbar ───────────────────────── */

function FloatingToolbar({
  anchor, onOpenMenu, onCopy, onSummarize,
}: {
  anchor: Anchor;
  onOpenMenu: (x: number, y: number) => void;
  onCopy: () => void;
  onSummarize: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      // Suppress mousedown so clicking the toolbar doesn't collapse the selection
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        transform: anchor.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 70,
      }}
      className="flex items-center gap-0.5 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-0.5"
    >
      <button
        type="button"
        onClick={onSummarize}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-muted/60"
      >
        <Sparkles className="h-3 w-3 text-primary" /> Summarize
      </button>
      <button
        type="button"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenMenu(rect.left, rect.bottom + 4);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-muted/60"
      >
        <Sparkles className="h-3 w-3" /> AI actions
      </button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-muted/60"
        aria-label="Copy selection"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>,
    document.body,
  );
}

/* ───────────────────────── Command menu ───────────────────────── */

function CommandMenu({
  anchor, selectedText, onClose, onRun,
}: {
  anchor: Anchor;
  selectedText: string;
  onClose: () => void;
  onRun: (c: SelectionCommand) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const left = Math.min(anchor.x, window.innerWidth - 280);
  const top = Math.min(anchor.y, window.innerHeight - 360);

  const preview = selectedText.length > 180 ? selectedText.slice(0, 180) + '…' : selectedText;
  const aiCmds = COMMANDS.filter(c => c.group === 'ai');
  const utilCmds = COMMANDS.filter(c => c.group === 'utility');

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Selection AI actions"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', left, top, zIndex: 75, width: 268 }}
      className="rounded-md border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden"
    >
      <div className="px-3 pt-2.5 pb-2 border-b border-border/60 bg-muted/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Selected text</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="text-[11px] leading-snug text-foreground/85 line-clamp-3">{preview}</p>
      </div>
      <div className="py-1">
        {aiCmds.map((c) => (
          <MenuItem key={c.id} onClick={() => onRun(c.id)} Icon={c.Icon} label={c.label} hint={c.hint} />
        ))}
      </div>
      <div className="border-t border-border/60 py-1">
        {utilCmds.map((c) => (
          <MenuItem key={c.id} onClick={() => onRun(c.id)} Icon={c.Icon} label={c.label} hint={c.hint} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function MenuItem({
  Icon, label, hint, onClick,
}: { Icon: typeof ListTodo; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/* ───────────────────────── Inline summary panel ───────────────────────── */

function SummaryPanel({
  state, onClose, onCopy,
}: {
  state: { loading: boolean; text?: string; error?: string };
  onClose: () => void;
  onCopy: () => void;
}) {
  return createPortal(
    <div
      role="dialog"
      aria-label="Selection summary"
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 80, width: 360 }}
      className="rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium">Summary of selection</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 max-h-[280px] overflow-y-auto text-[12px] leading-relaxed">
        {state.loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating summary…
          </div>
        )}
        {state.error && (
          <div className="text-destructive">{state.error}</div>
        )}
        {state.text && (
          <div className="whitespace-pre-wrap text-foreground/90">{state.text}</div>
        )}
      </div>
      {state.text && (
        <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-t border-border/60 bg-muted/20">
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-muted/60"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
