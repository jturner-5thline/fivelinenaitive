import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Calendar as CalendarIcon, User as UserIcon, Briefcase, Building2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { syncTaskAfterCreate, retryAsanaSyncForTask } from '@/lib/asana/syncTaskAfterCreate';
import { useUiPreference } from '@/hooks/useUiPreference';
import { useContactBySenderEmail } from '@/hooks/useContactBySenderEmail';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface Props {
  dealId?: string | null;
  dealName?: string | null;
  threadId?: string | null;
  subject?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  /**
   * When true, the card renders fully expanded on mount (no collapsed
   * "Create Task" trigger). Used when the parent (e.g. the Quick Actions
   * toolbar) is itself the trigger and just wants the form to appear.
   */
  defaultOpen?: boolean;
  /** Called when the user dismisses the card (Cancel). */
  onCancel?: () => void;
}

function nextBusinessDay(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveDealManagerUserId(dealId: string): Promise<{ userId: string | null; label: string | null }> {
  const { data: deal } = await supabase
    .from('deals')
    .select('manager, deal_owner')
    .eq('id', dealId)
    .maybeSingle();
  const name = (deal?.manager || deal?.deal_owner || '').trim();
  if (!name) return { userId: null, label: null };
  const safe = name.replace(/[,()]/g, ' ').trim();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, first_name')
    .or(`display_name.ilike.%${safe}%,first_name.ilike.%${safe}%`)
    .limit(1)
    .maybeSingle();
  return { userId: profile?.id || null, label: name };
}

/**
 * Run an Asana sync in the background with a hard timeout and one retry,
 * never blocking the UI. On final failure, persist `asana_sync_status='failed'`
 * to the task row and surface a non-blocking toast with a Retry action.
 */
function fireBackgroundAsanaSync(opts: {
  taskId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  companyId: string | null;
  dealName: string | null;
}) {
  const TIMEOUT_MS = 7000;

  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Asana sync timed out')), TIMEOUT_MS);
      p.then((v) => { clearTimeout(t); resolve(v); })
       .catch((e) => { clearTimeout(t); reject(e); });
    });

  const markFailed = async (msg: string) => {
    try {
      await supabase
        .from('tasks')
        .update({ asana_sync_status: 'failed', asana_sync_error: msg } as any)
        .eq('id', opts.taskId);
    } catch { /* ignore */ }
  };

  const showFailureToast = (msg: string) => {
    toast.error('Asana sync failed', {
      description: msg,
      action: {
        label: 'Retry sync',
        onClick: () => {
          toast.message('Retrying Asana sync…');
          void retryAsanaSyncForTask(opts.taskId).then((r) => {
            if (r.ok) toast.success('Synced to Asana');
            else showFailureToast(r.error || 'Asana sync failed');
          });
        },
      },
    });
  };

  void (async () => {
    const attempt = async () =>
      withTimeout(syncTaskAfterCreate({
        taskId: opts.taskId,
        title: opts.title,
        description: opts.description,
        dueDate: opts.dueDate,
        assignedTo: opts.assignedTo,
        companyId: opts.companyId,
      }));

    try {
      const r = await attempt();
      if (r.ok) {
        if (!r.skipped) toast.success('Synced to Asana');
        return;
      }
      // Backoff + retry once
      await new Promise((res) => setTimeout(res, 1500));
      const r2 = await attempt();
      if (r2.ok) {
        if (!r2.skipped) toast.success('Synced to Asana');
        return;
      }
      await markFailed(r2.error || 'Asana sync failed');
      showFailureToast(r2.error || 'Asana sync failed');
    } catch (e: any) {
      const msg = e?.message || 'Asana sync failed';
      // One retry on timeout / unexpected error
      try {
        await new Promise((res) => setTimeout(res, 1500));
        const r2 = await attempt();
        if (r2.ok) {
          if (!r2.skipped) toast.success('Synced to Asana');
          return;
        }
        await markFailed(r2.error || msg);
        showFailureToast(r2.error || msg);
      } catch (e2: any) {
        const finalMsg = e2?.message || msg;
        await markFailed(finalMsg);
        showFailureToast(finalMsg);
      }
    }
  })();
}

/**
 * CreateTaskInlineCard
 * --------------------
 * Always-visible inline task creation card for the email AI Assist panel.
 * Replaces the legacy "Suggested Tasks" block. Pre-populated with the
 * matched deal, the sender (as contact), a sensible default title, next
 * business day due date, the deal manager as assignee, and an Asana sync
 * toggle that defaults to the user's profile preference.
 */
export function CreateTaskInlineCard({
  dealId,
  dealName,
  threadId,
  subject,
  senderEmail,
  senderName,
  defaultOpen = false,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [defaultAsanaSync] = useUiPreference<boolean>('default_asana_sync', true);

  const { data: senderContact } = useContactBySenderEmail(senderEmail);
  const teamMembers = useTeamMembers();

  const senderFirstName = useMemo(() => {
    const raw = (senderName || senderContact?.fullName || senderEmail || '').trim();
    if (!raw) return 'sender';
    return raw.split(/\s+/)[0];
  }, [senderName, senderContact?.fullName, senderEmail]);

  const defaultTitle = useMemo(() => {
    const subj = (subject || '').trim();
    return subj
      ? `Follow up with ${senderFirstName} re: ${subj}`
      : `Follow up with ${senderFirstName}`;
  }, [senderFirstName, subject]);

  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState<Date>(() => nextBusinessDay());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [asanaSync, setAsanaSync] = useState<boolean>(defaultAsanaSync);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ taskId: string; dealName: string | null } | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeLabel, setAssigneeLabel] = useState<string>('You');
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeUserTouched, setAssigneeUserTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-sync default title if the email/deal context shifts before opening.
  useEffect(() => {
    if (!open && !created) setTitle(defaultTitle);
  }, [defaultTitle, open, created]);

  // Resolve the deal manager once when opening, to display in the
  // assignee chip. Falls back to "You" (logged-in user) if unresolved.
  useEffect(() => {
    if (assigneeUserTouched) return;
    if (!open) return;
    if (!dealId) {
      setAssigneeId(user?.id || null);
      setAssigneeLabel('You');
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await resolveDealManagerUserId(dealId);
      if (cancelled) return;
      setAssigneeId(r.userId || user?.id || null);
      setAssigneeLabel(r.label || 'You');
    })();
    return () => { cancelled = true; };
  }, [open, dealId, user?.id, assigneeUserTouched]);

  const contactLabel = useMemo(() => {
    const name = senderContact?.fullName || senderName || senderEmail;
    const company = senderContact?.companyName;
    if (!name) return null;
    return company ? `${name} @ ${company}` : name;
  }, [senderContact, senderName, senderEmail]);

  const handleCreate = async () => {
    if (!user?.id) {
      setErrorMsg('Sign in required to create tasks');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Task name is required');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      let ownerId: string | null = assigneeId || user.id;
      let ownerLabel: string | null = assigneeLabel || 'You';
      if (!assigneeUserTouched && dealId && !assigneeId) {
        const r = await resolveDealManagerUserId(dealId);
        if (r.userId) {
          ownerId = r.userId;
          ownerLabel = r.label;
        } else if (r.label) {
          ownerLabel = `${r.label} (unresolved — assigned to you)`;
        }
      }

      const dueIso = toIsoDate(dueDate);
      const draft: TaskDraft = {
        title: title.trim(),
        description: subject ? `Email: ${subject}` : null,
        due_date: dueIso,
        due_time: null,
        priority: 'normal',
        type: 'follow_up',
        is_recurring: false,
        recurrence_rule: null,
        confidence: 1,
        owner_id: ownerId,
        owner_label: ownerLabel,
        owner_ambiguous: null,
        deal_id: dealId || null,
        deal_label: dealName || null,
        lender_id: null,
        lender_label: null,
        contact_id: senderContact?.id || null,
        contact_label: contactLabel,
        source_thread_id: threadId || null,
        hints: { owner: null, deal: null, lender: null, contact: null },
      };

      const result = await createTaskFromDraft(draft, user.id, company?.id || null, {
        syncSource: 'naitive_email_assist_create_task_button',
        sourceThreadId: threadId || null,
      });

      if (result?.id) {
        let asanaWarning: string | null = null;
        if (asanaSync) {
          try {
            const ctx = await getAsanaSyncContext(company?.id || null);
            if (!ctx) {
              asanaWarning =
                'Asana sync is not configured for this workspace — enable it in Integrations → Asana.';
            } else {
              const gid = await syncTaskToAsana(ctx, {
                id: result.id,
                title: draft.title,
                description: draft.description,
                due_date: draft.due_date,
              });
              if (!gid) {
                asanaWarning =
                  'Task created in Naitive but Asana sync failed. Check Integrations → Asana for the error.';
              }
            }
          } catch (e: any) {
            console.warn('[CreateTaskInlineCard] Asana sync failed:', e);
            asanaWarning = `Task created but Asana sync failed: ${e?.message || 'unknown error'}`;
          }
        }
        setCreated({ taskId: result.id, dealName: dealName || null });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        if (asanaWarning) {
          setErrorMsg(asanaWarning);
          toast.warning(asanaWarning);
        } else {
          toast.success(
            dealName
              ? `Task created and linked to ${dealName}`
              : 'Task created',
          );
        }
      }
    } catch (e: any) {
      console.error('[CreateTaskInlineCard] create failed', e);
      setErrorMsg('Failed to create task — try again.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.05] p-2.5 flex items-center gap-2 text-[12px]">
        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-emerald-300/90 truncate">
          Task created{created.dealName ? ` and linked to ${created.dealName}` : ''}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setTitle(defaultTitle);
            setDueDate(nextBusinessDay());
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          New task
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 h-8 text-[12px] font-semibold uppercase tracking-[0.12em]"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 text-primary" />
        <span className="text-muted-foreground">Create Task</span>
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-2.5 max-w-full min-w-0">
      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          New Task
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            if (defaultOpen) {
              // Parent owns visibility — let it close us.
              onCancel?.();
            } else {
              setOpen(false);
            }
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* Linked context chips */}
      <div className="flex flex-wrap gap-1.5">
        {dealName && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[11px] text-primary/90 max-w-full">
            <Briefcase className="h-3 w-3 shrink-0" />
            <span className="truncate">{dealName}</span>
          </span>
        )}
        {contactLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-foreground/80 max-w-full">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{contactLabel}</span>
          </span>
        )}
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task name"
        className="h-8 text-[12px]"
      />

      <div className="flex items-center gap-2">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-[11px] font-normal">
              <CalendarIcon className="h-3 w-3" />
              {format(dueDate, 'EEE, MMM d')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(d) => { if (d) { setDueDate(d); setDatePickerOpen(false); } }}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
        <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1.5 text-[11px] font-normal"
            >
              <UserIcon className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{assigneeLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0 pointer-events-auto" align="start">
            <Command>
              <CommandInput placeholder="Search teammates..." className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty>No teammates found.</CommandEmpty>
                <CommandGroup>
                  {user?.id && (
                    <CommandItem
                      key="self"
                      value="you me self"
                      onSelect={() => {
                        setAssigneeId(user.id);
                        setAssigneeLabel('You');
                        setAssigneeUserTouched(true);
                        setAssigneePickerOpen(false);
                      }}
                    >
                      <UserIcon className="h-3 w-3 mr-2" />
                      You
                      {assigneeId === user.id && <Check className="h-3 w-3 ml-auto" />}
                    </CommandItem>
                  )}
                  {teamMembers
                    .filter((m) => m.id !== user?.id)
                    .map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`${m.display_name} ${m.email || ''}`}
                        onSelect={() => {
                          setAssigneeId(m.id);
                          setAssigneeLabel(m.display_name);
                          setAssigneeUserTouched(true);
                          setAssigneePickerOpen(false);
                        }}
                      >
                        <UserIcon className="h-3 w-3 mr-2" />
                        <span className="truncate">{m.display_name}</span>
                        {assigneeId === m.id && <Check className="h-3 w-3 ml-auto" />}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground select-none">
          <Switch checked={asanaSync} onCheckedChange={setAsanaSync} />
          Sync to Asana
        </label>
        <Button
          type="button"
          size="sm"
          className="h-7 px-3 text-[11px] gap-1.5"
          disabled={busy || !title.trim()}
          onClick={handleCreate}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Create Task
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
