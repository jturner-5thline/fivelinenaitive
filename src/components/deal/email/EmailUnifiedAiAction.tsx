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
          if (resolvedDealId) {
            toast.success('Note suggestion ready', {
              description:
                suggestion.body.length > 120
                  ? suggestion.body.slice(0, 117) + '…'
                  : suggestion.body,
              action: {
                label: 'Open deal →',
                onClick: () => {
                  window.location.href = `/deals/${resolvedDealId}?tab=notes`;
                },
              },
            });
          } else {
            toast.error('Link a deal first to add a note');
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
    <div className={cn('min-w-0 max-w-full w-full space-y-2', className)}>
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            AI action
          </span>
        </div>
        <div className="relative">
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
            placeholder="Ask, draft, create a task, add a note…"
            disabled={routing || creating}
            className={cn(
              'pr-9 h-8 text-[12px] rounded-md',
              'bg-background/40 border-white/[0.06] placeholder:text-muted-foreground/70',
              'focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/30',
            )}
          />
          <button
            type="button"
            onClick={() => void route()}
            disabled={!text.trim() || routing || creating}
            className="absolute right-1 top-1 h-6 w-6 inline-flex items-center justify-center rounded-md bg-primary/15 hover:bg-primary/25 text-primary transition-colors disabled:opacity-40"
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
