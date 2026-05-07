import { useEffect, useState, type ReactNode } from 'react';
import {
  FolderUp,
  Building2,
  Sparkles as SparklesIcon,
  ListPlus,
  CalendarClock,
  AlignLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';
import { SaveToDealCard } from './SaveToDealCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { UpdateLenderStatusInlineCard } from './UpdateLenderStatusInlineCard';
import type { EmailThread } from './mockEmailData';
import type { DealAttachmentCategory } from '@/hooks/useDealAttachments';

type QuickActionKey = 'save_dr' | 'lender' | 'draft' | 'task' | 'meeting' | 'summarize';

interface ActionDef {
  key: QuickActionKey;
  label: string;
  icon: ReactNode;
  /** Optional accent color class for the icon. */
  iconClass?: string;
}

const ALL_ACTIONS: ActionDef[] = [
  { key: 'save_dr', label: 'Save to Data Room', icon: <FolderUp className="h-3 w-3" />, iconClass: 'text-amber-300' },
  { key: 'lender', label: 'Update Lender Status', icon: <Building2 className="h-3 w-3" />, iconClass: 'text-emerald-300' },
  { key: 'draft', label: 'Draft Reply', icon: <SparklesIcon className="h-3 w-3" />, iconClass: 'text-primary' },
  { key: 'task', label: 'Create Task', icon: <ListPlus className="h-3 w-3" />, iconClass: 'text-sky-300' },
  { key: 'meeting', label: 'Schedule Meeting', icon: <CalendarClock className="h-3 w-3" />, iconClass: 'text-violet-300' },
  { key: 'summarize', label: 'Summarize this thread', icon: <AlignLeft className="h-3 w-3" />, iconClass: 'text-cyan-300' },
];

interface Props {
  thread: EmailThread;
  dealId?: string | null;
  dealName?: string | null;
  /** AI-suggested lender (e.g. workflow analysis likely_lender_firm.name). */
  likelyLenderName?: string | null;
  /** Attachments resolved for the latest message (for Save to Data Room). */
  attachments: any[];
  latestMessageId?: string | null;
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
  /** Trigger Draft Reply expansion + ensure draft is generated. */
  onOpenDraft: () => void;
  /** Insert text into the composer (used by the meeting scheduler). */
  onInsertDraft: (body: string) => void;
}

/**
 * EmailQuickActionsToolbar
 * ------------------------
 * Always-visible row of 5 icon+label pills consolidating the panel's
 * primary actions. Clicking a pill toggles an inline expansion panel
 * directly below the toolbar. Only one panel is expanded at a time —
 * selecting another collapses the previous. Draft Reply and Schedule
 * Meeting delegate to existing panel-level state so behavior stays
 * consistent with the rest of the sidebar.
 */
export function EmailQuickActionsToolbar({
  thread,
  dealId,
  dealName,
  likelyLenderName,
  attachments,
  latestMessageId,
  fallbackDealId,
  fallbackDealName,
  onOpenDraft,
  onInsertDraft,
}: Props) {
  const [active, setActive] = useState<QuickActionKey | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Reset summary if thread changes
  useEffect(() => {
    setSummary(null);
  }, [thread?.threadId]);

  // Only show "Save to Data Room" when the currently viewed message has at
  // least one non-inline attachment with an id. Guard against null/undefined.
  const uploadableCount = (attachments || []).filter(
    (a) => a && !a.is_inline && !!a.id,
  ).length;
  const actions = ALL_ACTIONS.filter(
    (a) => a.key !== 'save_dr' || uploadableCount > 0,
  );

  // If the active panel is "save_dr" but no uploadable attachments remain
  // (e.g. user navigated to a different message), collapse it.
  useEffect(() => {
    if (active === 'save_dr' && uploadableCount === 0) setActive(null);
  }, [active, uploadableCount]);

  const handleClick = (key: QuickActionKey) => {
    if (key === 'draft') {
      // Draft Reply expands the existing Draft Reply module (panel-level
      // state). The toolbar pill itself doesn't render an inline panel.
      onOpenDraft();
      setActive(null);
      return;
    }
    if (key === 'summarize') {
      // Toggle: collapse if already showing
      if (active === 'summarize') {
        setActive(null);
        return;
      }
      setActive('summarize');
      void runSummarize();
      return;
    }
    setActive((prev) => (prev === key ? null : key));
  };

  const runSummarize = async () => {
    if (summarizing) return;
    const emails = thread?.emails || [];
    if (emails.length === 0) {
      toast.error('No messages to summarize');
      return;
    }
    setSummarizing(true);
    try {
      const threadText = emails
        .map((em) => {
          const who = em.from_name || em.from_email || 'Unknown';
          const when = em.received_at || '';
          const body = (em.body_preview || em.snippet || '').substring(0, 600);
          const atts = em.has_attachments ? ' [has attachments]' : '';
          return `From: ${who} (${when})${atts}\n${body}`;
        })
        .join('\n---\n');

      const prompt = `You are summarizing an email thread for a deal team. Produce 3–8 short, participant-aware bullets describing what actually happened in the thread (who said what, what was shared, confirmations, scheduling, attachments, decisions, next steps). Use first names when available. Use natural timing phrases like "earlier today", "this morning", "ahead of tomorrow's call" only when supported by the timestamps. End with a final bullet for current status or next expected step when applicable. Avoid filler like "The thread discusses…". Return ONLY a JSON array of strings, no markdown fences.\n\nThread:\n${threadText}`;

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            context: { type: 'thread_summary', threadId: thread.threadId, dealId, dealName },
          }),
        },
      );

      let fullText = '';
      const reader = resp.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const d = line.slice(6);
              if (d === '[DONE]') continue;
              try {
                const p = JSON.parse(d);
                const delta = p.choices?.[0]?.delta?.content;
                if (delta) fullText += delta;
              } catch {}
            }
          }
        }
      }

      const arrMatch = fullText.match(/\[[\s\S]*\]/);
      let bullets: string[] = [];
      if (arrMatch) {
        try {
          const parsed = JSON.parse(arrMatch[0]);
          if (Array.isArray(parsed)) bullets = parsed.map((b) => String(b));
        } catch {}
      }
      if (bullets.length === 0) {
        bullets = fullText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('-') || l.startsWith('•') || l.startsWith('*'))
          .map((l) => l.replace(/^[-•*]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 8);
      }
      if (bullets.length === 0) {
        throw new Error('Empty summary');
      }
      setSummary(bullets);
    } catch (err) {
      console.warn('[EmailQuickActionsToolbar] summarize failed', err);
      toast.error("Couldn't summarize thread — try again");
      setActive(null);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Pill row — single horizontally scrollable line. Pills never wrap;
          edge-fade masks hint at additional pills when overflowing. */}
      <div
        className="grid grid-cols-2 gap-1.5"
        role="toolbar"
        aria-label="Email quick actions"
      >
        {actions.map((a) => {
          const isActive = active === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => handleClick(a.key)}
              title={a.label}
              aria-pressed={isActive}
              className={cn(
                'inline-flex w-full items-center justify-start gap-1.5 min-h-[32px] px-3 py-1 rounded-lg text-left',
                'text-[11px] font-medium leading-tight',
                'border border-white/10 bg-white/5 backdrop-blur-sm',
                'text-foreground/80 transition-colors',
                'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                isActive && 'bg-primary/15 border-primary/30 text-primary',
              )}
            >
              <span className={cn('shrink-0', !isActive && a.iconClass)}>{a.icon}</span>
              <span className="truncate">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Inline expansion area. Only one action's panel renders at a time. */}
      {active === 'save_dr' && (
        <SaveToDealCard
          thread={thread}
          attachments={attachments}
          messageId={latestMessageId}
          matchedDealId={dealId}
          matchedDealName={dealName}
          fallbackDealId={fallbackDealId}
          fallbackDealName={fallbackDealName}
        />
      )}
      {active === 'lender' && (
        <UpdateLenderStatusInlineCard
          dealId={dealId || fallbackDealId}
          preselectLenderName={likelyLenderName}
          onClose={() => setActive(null)}
        />
      )}
      {active === 'task' && (
        <CreateTaskInlineCard
          dealId={dealId || fallbackDealId || null}
          dealName={dealName || fallbackDealName || null}
          threadId={thread.threadId}
          subject={thread.subject}
          senderEmail={thread.latestEmail?.from_email}
          senderName={thread.latestEmail?.from_name || undefined}
          defaultOpen
          onCancel={() => setActive(null)}
        />
      )}
      {active === 'meeting' && (
        <MeetingSchedulerCard
          recipientEmail={thread.latestEmail?.from_email}
          recipientName={thread.latestEmail?.from_name || undefined}
          threadSubject={thread.subject}
          dealName={dealName || fallbackDealName || undefined}
          onInsert={(text) => onInsertDraft(text)}
          onClose={() => setActive(null)}
        />
      )}
      {active === 'summarize' && (
        <div className="rounded-xl border border-[hsl(195_85%_60%/0.35)] bg-[hsl(200_75%_55%/0.08)] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlignLeft className="h-3 w-3 text-cyan-300" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90">
              Thread summary
            </span>
            {summarizing && <Loader2 className="h-3 w-3 animate-spin text-cyan-200/80 ml-1" />}
          </div>
          {summarizing && !summary && (
            <div className="text-[11.5px] text-foreground/60">Reading the thread…</div>
          )}
          {summary && (
            <ul className="space-y-1">
              {summary.map((bullet, i) => (
                <li key={i} className="text-[12px] leading-snug text-foreground/85 flex gap-1.5">
                  <span className="text-cyan-300 shrink-0 leading-snug">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {summary && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => { setSummary(null); void runSummarize(); }}
                disabled={summarizing}
                className="text-[10.5px] text-cyan-200/80 hover:text-cyan-100 transition-colors disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}