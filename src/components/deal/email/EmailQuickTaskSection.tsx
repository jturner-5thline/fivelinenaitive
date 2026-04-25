import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, User, X, ListTodo, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useNaitiveTaskParse, createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { TaskModeChips } from '@/components/dashboard/chat/TaskModeChips';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { useQueryClient } from '@tanstack/react-query';
import type { EmailThread } from './mockEmailData';

interface Props {
  thread: EmailThread;
  dealId?: string;
  dealName?: string;
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
  className?: string;
}

/**
 * Inline NL task input for the AI Assist right-rail. At rest renders as a
 * single plain text input. On focus or typing, expands inline to show
 * pre-inferred deal/contact chips (resolved from the thread) and the
 * live TaskModeChips preview. All tasks are tagged with
 * sync_source='naitive_email_assist' and the source thread id is appended
 * to the description.
 */
export function EmailQuickTaskSection({
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

  const externalParticipant = useMemo(() => {
    const ext = thread.emails.find(
      (e) => e.from_name && e.from_name !== 'You' && !!e.from_email,
    );
    return ext
      ? { name: ext.from_name, email: ext.from_email }
      : { name: thread.latestEmail.from_name, email: thread.latestEmail.from_email };
  }, [thread]);

  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState<string | null>(externalParticipant.name || null);
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

  // Reset removal toggles when thread changes
  useEffect(() => {
    setDealRemoved(false);
    setContactRemoved(false);
  }, [thread.threadId]);

  const composerContext = useMemo(
    () => ({
      deal_id: dealRemoved ? null : resolvedDealId,
      contact_id: contactRemoved ? null : contactId,
      thread_id: thread.threadId,
    }),
    [resolvedDealId, contactId, thread.threadId, dealRemoved, contactRemoved],
  );

  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewSeen, setPreviewSeen] = useState(false);
  const taRef = useRef<HTMLInputElement>(null);

  const stableCtx = useMemo(
    () => composerContext,
    [composerContext.deal_id, composerContext.contact_id, composerContext.thread_id],
  );
  const { draft, setDraft, loading } = useNaitiveTaskParse(text, stableCtx);

  // Reset preview seen when user keeps editing
  useEffect(() => {
    setPreviewSeen(false);
  }, [text]);

  const showExpansion = focused || text.length > 0 || !!draft;
  const showDealChip = !!resolvedDealId && !!resolvedDealName && !dealRemoved;
  const showContactChip = !!contactLabel && !contactRemoved;

  const reset = () => {
    setText('');
    setDraft(null);
    setPreviewSeen(false);
    setFocused(false);
    setDealRemoved(false);
    setContactRemoved(false);
    taRef.current?.blur();
  };

  const doCreate = async (d: TaskDraft) => {
    if (!user) return;
    setCreating(true);
    try {
      let result: { id: string; assigned_to: string };
      try {
        result = (await createTaskFromDraft(d, user.id, company?.id || null, {
          syncSource: 'naitive_email_assist',
          sourceThreadId: thread.threadId,
        })) as any;
      } catch (err: any) {
        toast.error('Could not create task', { description: err?.message || 'Failed to create task' });
        return;
      }

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
            .eq('user_id', d.owner_id || user.id)
            .maybeSingle();
          await syncTaskToAsana(ctx, {
            id: result.id,
            title: d.title,
            assignee_email: profile?.email || null,
          });
        }
      } catch (e) {
        console.error('[EmailQuickTaskSection] Asana sync failed', e);
      }

      const dueLabel = d.due_date
        ? new Date(d.due_date + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'numeric',
            day: 'numeric',
          })
        : null;
      toast.success(`Task created: "${d.title}"${dueLabel ? ` — due ${dueLabel}` : ''}`, {
        action: {
          label: 'View task →',
          onClick: () => {
            window.location.href = `/tasks?task=${result.id}`;
          },
        },
      });
      reset();
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!text && !draft) {
        setFocused(false);
        taRef.current?.blur();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!draft || creating) return;
      if (e.metaKey || e.ctrlKey) {
        void doCreate(draft);
        return;
      }
      if (!previewSeen) {
        setPreviewSeen(true);
        return;
      }
      void doCreate(draft);
    }
  };

  const canCreate = !!draft && !creating;

  return (
    <div className={cn('min-w-0 max-w-full w-full space-y-2', className)}>
      <div className="relative">
        <ListTodo className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
        <Input
          type="text"
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Only collapse if there's nothing in flight
            if (!text && !draft) setFocused(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Quick task…"
          disabled={creating}
          className={cn(
            'pl-9 pr-9 h-9 text-[12px] rounded-md truncate',
            'bg-background/40 border-white/[0.06] placeholder:text-muted-foreground/70',
            'focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/30',
          )}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        />
        {showExpansion && canCreate && (
          <button
            type="button"
            onClick={() => {
              if (!draft) return;
              if (!previewSeen) setPreviewSeen(true);
              else void doCreate(draft);
            }}
            className="absolute right-1.5 top-1 h-7 w-7 inline-flex items-center justify-center rounded-md bg-primary/15 hover:bg-primary/25 text-primary transition-colors"
            title={previewSeen ? 'Create task' : 'Preview & create (Enter)'}
          >
            {creating || loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {showExpansion && (
        <div className="space-y-2 min-w-0 max-w-full">
          {(showDealChip || showContactChip) && (
            <div className="flex flex-wrap gap-1.5">
              {showDealChip && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                  <Briefcase className="h-3 w-3 opacity-80 shrink-0" />
                  <span className="font-medium leading-none" style={{ overflowWrap: 'anywhere' }}>
                    Deal: {resolvedDealName}
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
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                  <User className="h-3 w-3 opacity-80 shrink-0" />
                  <span className="font-medium leading-none" style={{ overflowWrap: 'anywhere' }}>
                    Contact: {contactLabel}
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

          {draft && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2 min-w-0 max-w-full">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] font-medium leading-snug" style={{ overflowWrap: 'anywhere' }}>
                  {draft.title}
                </div>
                {previewSeen && (
                  <Button
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={() => doCreate(draft)}
                    disabled={creating}
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create task'}
                  </Button>
                )}
              </div>
              <TaskModeChips draft={draft} onChange={setDraft} loading={loading} />
              <div className="text-[10px] text-muted-foreground pt-0.5">
                {previewSeen
                  ? 'Press ↵ again or click Create. ⌘↵ skips preview.'
                  : 'Press ↵ to preview, ⌘↵ to create immediately.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
