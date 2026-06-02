import { useMemo, useState } from 'react';
import { Plus, Calendar as CalendarIcon, User as UserIcon, Loader2, Check, ChevronDown, Flag } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useUiPreference } from '@/hooks/useUiPreference';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import type { Deal } from '@/types/deal';
import { defaultDueDate } from '@/lib/dealNextBestAction';

interface Props {
  deal: Deal;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * AddTaskInlineForm
 * -----------------
 * Full task creator mounted by TasksMilestonesBand when the user clicks
 * "+" while the "Tasks" filter pill is active. Mirrors AddFollowupInlineForm
 * but exposes the fields a real task needs: multi-line description, due
 * date, single assignee picker (re-uses useTeamMembers), priority, and
 * Sync-to-Asana toggle. Title autofocuses; description is fully editable.
 */
export function AddTaskInlineForm({ deal, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const teamMembers = useTeamMembers();
  const [defaultAsanaSync] = useUiPreference<boolean>('default_asana_sync', true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date>(() => defaultDueDate());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(user?.id || null);
  const [assigneeLabel, setAssigneeLabel] = useState<string>('You');
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [asanaSync, setAsanaSync] = useState<boolean>(defaultAsanaSync);
  const [busy, setBusy] = useState(false);

  const dealLabel = useMemo(() => deal.company || deal.name || 'Deal', [deal]);

  const handleCreate = async () => {
    if (!user?.id) { toast.error('Sign in required to create tasks'); return; }
    if (!title.trim()) { toast.error('Task title is required'); return; }
    setBusy(true);
    try {
      const draft: TaskDraft = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: toIsoDate(dueDate),
        due_time: null,
        priority,
        type: 'task',
        is_recurring: false,
        recurrence_rule: null,
        confidence: 1,
        owner_id: assigneeId || user.id,
        owner_label: assigneeLabel,
        owner_ambiguous: null,
        deal_id: deal.id,
        deal_label: dealLabel,
        lender_id: null,
        lender_label: null,
        contact_id: null,
        contact_label: null,
        source_thread_id: null,
        hints: { owner: null, deal: null, lender: null, contact: null },
      };
      const result = await createTaskFromDraft(draft, user.id, company?.id || null, {
        syncSource: 'naitive_deal_rundown_task',
      });
      if (result?.id) {
        if (asanaSync) {
          try {
            const ctx = await getAsanaSyncContext(company?.id || null);
            if (ctx) {
              await syncTaskToAsana(ctx, {
                id: result.id,
                title: draft.title,
                description: draft.description,
                due_date: draft.due_date,
              });
            }
          } catch (e) {
            console.warn('[AddTaskInlineForm] Asana sync failed:', e);
          }
        }
        toast.success('Task created');
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-deal-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['deal-tasks'] });
        onCreated?.(result.id);
        onClose();
      }
    } catch (e) {
      console.error('[AddTaskInlineForm] create failed', e);
      const msg = e instanceof Error ? e.message : (e as any)?.message || 'try again';
      toast.error(`Failed to create task — ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const noTeammates = teamMembers.length === 0;

  return (
    <div
      className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2 mt-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          New task
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`Task title — e.g. Review ${dealLabel} financials`}
        className="h-8 text-[12px]"
      />

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional) — add context, links, next steps…"
        className="min-h-[64px] text-[12px] resize-y"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-[11px] font-normal">
              <CalendarIcon className="h-3 w-3" />
              {format(dueDate, 'EEE, MMM d')}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 z-[1400] pointer-events-auto"
            align="start"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
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
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-[11px] font-normal">
              <UserIcon className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{assigneeLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[240px] p-0 z-[1400] pointer-events-auto"
            align="start"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Command>
              <CommandInput placeholder="Search teammates..." className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty>
                  {noTeammates
                    ? 'No teammates available — check workspace access'
                    : 'No teammates found.'}
                </CommandEmpty>
                <CommandGroup>
                  {user?.id && (
                    <CommandItem
                      key="self"
                      value="you me self"
                      onSelect={() => {
                        setAssigneeId(user.id);
                        setAssigneeLabel('You');
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

        <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
          <SelectTrigger className="h-7 w-auto gap-1.5 px-2 text-[11px] font-normal">
            <Flag className="h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[1400]">
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
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
          Create
        </Button>
      </div>
    </div>
  );
}