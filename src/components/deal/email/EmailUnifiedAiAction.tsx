import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Send,
  ListTodo,
  StickyNote,
  FolderOpen,
  Mail,
  MessageSquare,
  Briefcase,
  User,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNaitiveTaskParse,
  createTaskFromDraft,
  type TaskDraft,
} from '@/hooks/useNaitiveTaskParse';
import { TaskModeChips } from '@/components/dashboard/chat/TaskModeChips';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import type { EmailThread } from './mockEmailData';
import { inferLenderStatus } from './inferLenderStatus';

interface Props {
  thread: EmailThread;
  dealId?: string;
  dealName?: string;
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
  className?: string;
}

type Intent = 'ask' | 'task' | 'note' | 'data_room' | 'draft';

interface Suggestion {
  intent: Intent;
  title: string;
  body: string;
  rationale: string;
  /** Optional lender extraction returned by the edge function for note intent. */
  lender?: {
    name: string;
    status?: 'in-review' | 'terms-issued' | 'in-diligence' | 'closed-funded';
    note?: string;
  };
}

const INTENT_META: Record<
  Intent,
  { label: string; Icon: typeof ListTodo; cta: string }
> = {
  ask:       { label: 'Answer',         Icon: MessageSquare, cta: 'Got it' },
  task:      { label: 'Follow-up task', Icon: ListTodo,      cta: 'Create task' },
  note:      { label: 'Deal note',      Icon: StickyNote,    cta: 'Add note' },
  data_room: { label: 'Data room',      Icon: FolderOpen,    cta: 'Open data room' },
  draft:     { label: 'Draft reply',    Icon: Mail,          cta: 'Use as draft' },
};

/**
 * EmailUnifiedAiAction
 * --------------------
 * Single natural-language AI action input that replaces the separate
 * "Ask AI" and "Quick Task" boxes. Detects intent (ask / task / note /
 * data_room / draft) via the `email-unified-action` edge function and
 * renders a single confirm-first suggestion card. Deal/contact context
 * from the thread is preserved and forwarded to whichever action runs.
 */
export function EmailUnifiedAiAction({
  thread,
  dealId,
  dealName,
  fallbackDealId,
  fallbackDealName,
  className,
}: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const resolvedDealId = dealId || fallbackDealId || null;
  const resolvedDealName = dealName || fallbackDealName || null;

  // ─── thread-derived contact context (mirrors EmailQuickTaskSection) ──
  const externalParticipant = useMemo(() => {
    const ext = thread.emails.find(
      (e) => e.from_name && e.from_name !== 'You' && !!e.from_email,
    );
    return ext
      ? { name: ext.from_name, email: ext.from_email }
      : { name: thread.latestEmail.from_name, email: thread.latestEmail.from_email };
  }, [thread]);

  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState<string | null>(
    externalParticipant.name || null,
  );
  const [contactRemoved, setContactRemoved] = useState(false);
  const [dealRemoved, setDealRemoved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!externalParticipant.email) return;
    (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email')
        .ilike('email', externalParticipant.email)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setContactId(data.id);
        setContactLabel(
          data.full_name ||
            [data.first_name, data.last_name].filter(Boolean).join(' ') ||
            externalParticipant.name ||
            data.email,
        );
      } else {
        setContactLabel(externalParticipant.name || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalParticipant.email, externalParticipant.name]);

  useEffect(() => {
    setDealRemoved(false);
    setContactRemoved(false);
    setSuggestion(null);
    setText('');
  }, [thread.threadId]);

  // ─── input + suggestion state ────────────────────────────────────────
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [routing, setRouting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showExpansion = focused || text.length > 0 || !!suggestion;
  const showDealChip = !!resolvedDealId && !!resolvedDealName && !dealRemoved;
  const showContactChip = !!contactLabel && !contactRemoved;

  // Live task parse used only when the suggestion is a task — wired off the
  // suggested title so chips still work like the old Quick Task flow.
  const taskCtx = useMemo(
    () => ({
      deal_id: dealRemoved ? null : resolvedDealId,
      contact_id: contactRemoved ? null : contactId,
      thread_id: thread.threadId,
    }),
    [resolvedDealId, contactId, thread.threadId, dealRemoved, contactRemoved],
  );
  const taskParseInput =
    suggestion?.intent === 'task' ? suggestion.title : '';
  const { draft: taskDraft, setDraft: setTaskDraft, loading: taskLoading } =
    useNaitiveTaskParse(taskParseInput, taskCtx);

  const reset = () => {
    setText('');
    setSuggestion(null);
    setFocused(false);
    setDealRemoved(false);
    setContactRemoved(false);
    inputRef.current?.blur();
  };

  // ─── route prompt → intent suggestion ────────────────────────────────
  const route = async () => {
    const q = text.trim();
    if (!q || routing) return;
    setRouting(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'email-unified-action',
        {
          body: {
            prompt: q,
            dealId: resolvedDealId,
            dealName: resolvedDealName,
            threadData: {
              subject: thread.subject,
              threadId: thread.threadId,
              latestEmail: thread.latestEmail,
              emails: thread.emails.slice(0, 6).map((e) => ({
                from_name: e.from_name,
                from_email: e.from_email,
                received_at: e.received_at,
                body_preview: (e.body_preview || '').substring(0, 1500),
                snippet: e.snippet,
              })),
            },
          },
        },
      );
      if (error) throw error;
      const r = data?.result as Suggestion | undefined;
      if (!r?.intent) throw new Error('No suggestion returned');
      setSuggestion(r);
    } catch (err: any) {
      console.warn('[EmailUnifiedAiAction] route failed', err);
      toast.error("Couldn't reach AI — try again");
    } finally {
      setRouting(false);
    }
  };

  // ─── confirm a suggestion → run the right action ────────────────────
  const confirm = async () => {
    if (!suggestion || creating) return;
    setCreating(true);
    try {
      switch (suggestion.intent) {
        case 'task': {
          if (!user) {
            toast.error('You must be signed in to create tasks');
            return;
          }
          const draftToCreate: TaskDraft = (taskDraft as TaskDraft) || {
            title: suggestion.title,
            description: suggestion.body,
            owner_id: user.id,
            due_date: null,
            priority: 'medium',
            entity_type: resolvedDealId ? 'deal' : null,
            entity_id: resolvedDealId || null,
          } as any;
          const result = (await createTaskFromDraft(
            draftToCreate,
            user.id,
            company?.id || null,
            {
              syncSource: 'naitive_email_assist',
              sourceThreadId: thread.threadId,
            },
          )) as any;
          queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['contact-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['crm-company-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['deal-tasks'] });
          try {
            const ctx = await getAsanaSyncContext(company?.id || null);
            if (ctx) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('user_id', draftToCreate.owner_id || user.id)
                .maybeSingle();
              await syncTaskToAsana(ctx, {
                id: result.id,
                title: draftToCreate.title,
                assignee_email: profile?.email || null,
              });
            }
          } catch (e) {
            console.error('[EmailUnifiedAiAction] Asana sync failed', e);
          }
          toast.success(`Task created: "${draftToCreate.title}"`, {
            action: {
              label: 'View task →',
              onClick: () => {
                window.location.href = `/tasks?task=${result.id}`;
              },
            },
          });
          reset();
          return;
        }
        case 'draft': {
          // Hand the draft body off to the inline composer flow if available;
          // otherwise stash on the clipboard and tell the user.
          try {
            await navigator.clipboard.writeText(suggestion.body);
            toast.success('Draft copied to clipboard', {
              description: 'Paste it into the reply composer.',
            });
          } catch {
            toast.success('Draft ready', { description: suggestion.body.slice(0, 120) });
          }
          reset();
          return;
        }
        case 'data_room': {
          if (resolvedDealId) {
            toast.success('Opening data room', {
              description: 'Drop the file or note into the right section.',
              action: {
                label: 'Open →',
                onClick: () => {
                  window.location.href = `/deals/${resolvedDealId}?tab=documents`;
                },
              },
            });
          } else {
            toast.error('Link a deal first to use the data room');
          }
          reset();
          return;
        }
        case 'note': {
          if (!resolvedDealId) {
            toast.error('Link a deal first to add a note');
            return;
          }
          if (!user) {
            toast.error('You must be signed in to add notes');
            return;
          }

          const noteContent = suggestion.body || suggestion.title;
          const noteTitle =
            suggestion.title?.slice(0, 120) || 'AI-suggested note';

          // Telemetry: capture the full request → write trace so we can
          // diagnose silent failures (the user reported a "success but no
          // change persisted" case where the AI omitted lender.status).
          const traceId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const trace = (step: string, payload: Record<string, unknown> = {}) =>
            console.info('[EmailUnifiedAiAction:note]', traceId, step, payload);

          trace('start', {
            dealId: resolvedDealId,
            dealName: resolvedDealName,
            threadId: thread.threadId,
            promptText: text,
            suggestion,
          });

          // Effective lender block (AI-extracted + client fallback)
          let effectiveLender = suggestion.lender
            ? { ...suggestion.lender }
            : undefined;
          if (effectiveLender && !effectiveLender.status) {
            const inferred = inferLenderStatus(text, suggestion.body, suggestion.title);
            if (inferred) {
              effectiveLender.status = inferred;
              trace('status:inferred-client-side', { inferred });
            }
          }

          // Step 1: resolve a matching deal_lenders row (if the AI extracted one)
          let matchedLender: { id: string; name: string; notes: string | null } | null = null;
          if (effectiveLender?.name) {
            try {
              const { data: lenderRows, error: lenderFetchErr } = await supabase
                .from('deal_lenders')
                .select('id, name, notes')
                .eq('deal_id', resolvedDealId);
              if (lenderFetchErr) throw lenderFetchErr;
              const target = (effectiveLender.name || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
              matchedLender =
                (lenderRows || []).find((r) => {
                  const n = (r.name || '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, ' ')
                    .trim();
                  return (
                    n === target ||
                    n.startsWith(target) ||
                    target.startsWith(n)
                  );
                }) || null;
              trace('lender:lookup', {
                requestedName: effectiveLender.name,
                candidateCount: lenderRows?.length || 0,
                matchedLenderId: matchedLender?.id || null,
                matchedLenderName: matchedLender?.name || null,
              });
            } catch (e: any) {
              console.error('[EmailUnifiedAiAction] lender lookup failed', e);
              trace('lender:lookup-error', { message: e?.message });
              toast.error("Couldn't load lenders for this deal", {
                description: e?.message || 'Try again in a moment.',
              });
              return;
            }

            if (!matchedLender) {
              trace('lender:not-on-deal', { requestedName: effectiveLender.name });
              toast.error(
                `Lender "${effectiveLender.name}" isn't on this deal`,
                {
                  description:
                    'Add the lender to the deal first, then re-run "Add note".',
                },
              );
              return;
            }
          }

          // Step 2: insert deal note (linked to the lender if matched)
          const { data: noteRow, error: noteErr } = await supabase
            .from('deal_space_notes')
            .insert({
              deal_id: resolvedDealId,
              user_id: user.id,
              title: noteTitle,
              content: noteContent,
              linked_lender_id: matchedLender?.id || null,
              tags: ['ai-assist'],
            })
            .select('id')
            .single();

          if (noteErr || !noteRow?.id) {
            console.error('[EmailUnifiedAiAction] note insert failed', noteErr);
            trace('note:insert-error', { message: noteErr?.message });
            toast.error('Failed to save deal note', {
              description: noteErr?.message || 'Please try again.',
            });
            return;
          }
          trace('note:inserted', { noteId: noteRow.id });

          // Step 3: if we matched a lender, update lender record + history.
          // Best-effort rollback of the note if either lender write fails.
          let appliedLenderStatus: string | null = null;
          let lenderNotesChanged = false;
          if (matchedLender) {
            const lenderNoteText =
              effectiveLender?.note?.trim() || noteContent;
            const lenderUpdates: Record<string, any> = {
              notes: lenderNoteText,
              tracking_status: 'active',
              updated_at: new Date().toISOString(),
            };
            // Map LENDER_STATUS_CONFIG ids onto deal_lenders.substage —
            // the lender "status" concept persists on substage in this schema.
            if (effectiveLender?.status) {
              lenderUpdates.substage = effectiveLender.status;
            }
            trace('lender:update-attempt', {
              dealLenderId: matchedLender.id,
              updates: lenderUpdates,
            });

            const { data: updatedLenderRows, error: lenderUpdateErr } =
              await supabase
                .from('deal_lenders')
                .update(lenderUpdates)
                .eq('id', matchedLender.id)
                .eq('deal_id', resolvedDealId)
                .select('id, substage, notes, tracking_status, updated_at');

            if (
              lenderUpdateErr ||
              !updatedLenderRows ||
              updatedLenderRows.length === 0
            ) {
              console.error(
                '[EmailUnifiedAiAction] lender update failed — rolling back note',
                lenderUpdateErr,
              );
              trace('lender:update-failed-rolling-back-note', {
                message: lenderUpdateErr?.message,
                rowsUpdated: updatedLenderRows?.length || 0,
              });
              // Rollback the note insert so we don't silently half-succeed
              await supabase
                .from('deal_space_notes')
                .delete()
                .eq('id', noteRow.id);
              toast.error('Failed to update lender — note was rolled back', {
                description:
                  lenderUpdateErr?.message ||
                  'No lender row was updated. Please try again.',
              });
              return;
            }
            const verified = updatedLenderRows[0] as any;
            appliedLenderStatus = verified?.substage || null;
            lenderNotesChanged =
              (matchedLender.notes || '') !== (verified?.notes || '');
            trace('lender:update-verified', {
              dealLenderId: matchedLender.id,
              row: verified,
              lenderNotesChanged,
            });

            // History row is best-effort — we already verified the lender update
            const { error: historyErr } = await supabase
              .from('lender_notes_history')
              .insert({
                deal_lender_id: matchedLender.id,
                user_id: user.id,
                text: lenderNoteText,
              });
            if (historyErr) {
              console.warn(
                '[EmailUnifiedAiAction] lender_notes_history insert failed (non-fatal)',
                historyErr,
              );
              trace('lender_notes_history:insert-error', { message: historyErr.message });
            } else {
              trace('lender_notes_history:inserted');
            }
          }

          // Step 4: refresh deal-related caches so UI reflects both writes
          queryClient.invalidateQueries({ queryKey: ['deal', resolvedDealId] });
          queryClient.invalidateQueries({ queryKey: ['deals'] });
          queryClient.invalidateQueries({ queryKey: ['deal-notes', resolvedDealId] });
          queryClient.invalidateQueries({ queryKey: ['deal-space-notes', resolvedDealId] });
          queryClient.invalidateQueries({ queryKey: ['deal-lenders', resolvedDealId] });
          // Lender notes side-panel cache (keyed by lender NAME, not deal id)
          if (matchedLender?.name) {
            queryClient.invalidateQueries({ queryKey: ['lender-notes', matchedLender.name] });
            queryClient.invalidateQueries({ queryKey: ['lender-note-count', matchedLender.name] });
          }

          if (matchedLender) {
            // Spell out exactly what changed so the user can immediately
            // verify the persistence and not assume the toast is "simulated".
            const changedBits: string[] = [];
            if (appliedLenderStatus) {
              changedBits.push(`status → ${appliedLenderStatus.replace(/-/g, ' ')}`);
            }
            if (lenderNotesChanged) changedBits.push('notes updated');
            changedBits.push('history entry added');
            const description = changedBits.length
              ? changedBits.join(' · ')
              : 'Lender record refreshed.';
            trace('done', { matchedLenderId: matchedLender.id, appliedLenderStatus, lenderNotesChanged });
            toast.success(
              `Note added & ${matchedLender.name} updated on ${resolvedDealName || 'deal'}`,
              {
                description,
                action: {
                  label: 'Open deal →',
                  onClick: () => {
                    window.location.href = `/deals/${resolvedDealId}?tab=lenders`;
                  },
                },
              },
            );
          } else {
            trace('done', { matchedLenderId: null });
            toast.success('Note added to deal', {
              description:
                noteContent.length > 120
                  ? noteContent.slice(0, 117) + '…'
                  : noteContent,
              action: {
                label: 'Open deal →',
                onClick: () => {
                  window.location.href = `/deals/${resolvedDealId}?tab=notes`;
                },
              },
            });
          }
          reset();
          return;
        }
        case 'ask':
        default: {
          // Answer is already shown in the suggestion card — confirm just clears.
          reset();
          return;
        }
      }
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!text && !suggestion) {
        setFocused(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (suggestion && (e.metaKey || e.ctrlKey)) {
        void confirm();
        return;
      }
      void route();
    }
  };

  const meta = suggestion ? INTENT_META[suggestion.intent] : null;
  const Icon = meta?.Icon;

  return (
    <div className={cn('min-w-0 max-w-full w-full space-y-2 -mt-1', className)}>
      <div className="space-y-2">
        <div
          className={cn(
            'relative rounded-xl p-1',
            // Soft cyan/blue tinted surface — color-driven contrast, no glow.
            'bg-[hsl(200_75%_55%/0.10)] border border-[hsl(195_85%_60%/0.40)]',
            'transition-colors focus-within:border-[hsl(195_90%_65%/0.65)] focus-within:bg-[hsl(200_80%_55%/0.14)]',
          )}
        >
          <Input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              if (!text && !suggestion) setFocused(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI about this email..."
            disabled={routing || creating}
            className={cn(
              'pr-9 h-9 text-[12.5px] rounded-lg border-0 bg-transparent',
              'placeholder:text-foreground/45',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
            )}
          />
          <button
            type="button"
            onClick={() => void route()}
            disabled={!text.trim() || routing || creating}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md bg-[hsl(195_85%_55%/0.35)] hover:bg-[hsl(195_90%_60%/0.55)] border border-[hsl(195_90%_65%/0.55)] hover:border-[hsl(195_95%_70%/0.8)] text-[hsl(190_100%_92%)] transition-colors disabled:opacity-40 disabled:hover:bg-[hsl(195_85%_55%/0.35)] disabled:hover:border-[hsl(195_90%_65%/0.55)]"
            aria-label="Route request"
            title="Route request (Enter)"
          >
            {routing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </button>
        </div>

        {showExpansion && (showDealChip || showContactChip) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {showDealChip && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                <Briefcase className="h-3 w-3 opacity-80 shrink-0" />
                <span className="font-medium leading-none truncate">
                  {resolvedDealName}
                </span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 shrink-0"
                  onClick={() => setDealRemoved(true)}
                  aria-label="Remove deal"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {showContactChip && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                <User className="h-3 w-3 opacity-80 shrink-0" />
                <span className="font-medium leading-none truncate">
                  {contactLabel}
                </span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 shrink-0"
                  onClick={() => setContactRemoved(true)}
                  aria-label="Remove contact"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
        )}

        {suggestion && meta && Icon && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3 w-3 text-primary" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-primary/90">
                {meta.label}
              </span>
            </div>
            <div
              className="text-[12px] font-medium leading-snug text-foreground"
              style={{ overflowWrap: 'anywhere' }}
            >
              {suggestion.title}
            </div>
            {suggestion.body && suggestion.body !== suggestion.title && (
              <div
                className="text-[11.5px] leading-relaxed text-foreground/85 whitespace-pre-wrap"
                style={{ overflowWrap: 'anywhere' }}
              >
                {suggestion.body}
              </div>
            )}
            {suggestion.intent === 'task' && taskDraft && (
              <TaskModeChips
                draft={taskDraft}
                onChange={setTaskDraft}
                loading={taskLoading}
              />
            )}
            {suggestion.intent === 'note' && suggestion.lender?.name && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.04] px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                  Also updates lender
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-foreground/90">
                  {suggestion.lender.name}
                </span>
                {suggestion.lender.status && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-foreground/90">
                    Status: {suggestion.lender.status.replace(/-/g, ' ')}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-muted-foreground italic">
                {suggestion.rationale}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={reset}
                  disabled={creating}
                >
                  Dismiss
                </Button>
                {suggestion.intent !== 'ask' && (
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={confirm}
                    disabled={creating || (suggestion.intent === 'task' && !taskDraft)}
                  >
                    {creating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                    {meta.cta}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
