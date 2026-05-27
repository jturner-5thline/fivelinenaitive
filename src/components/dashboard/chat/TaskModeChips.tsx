import { useState } from 'react';
import { X, Calendar as CalendarIcon, Briefcase, Building2, User, AlertTriangle, Tag, Repeat, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  draft: TaskDraft;
  onChange: (next: TaskDraft) => void;
  loading?: boolean;
}

const PRIORITY_LABEL: Record<string, string> = { low: 'Low', normal: 'Normal', medium: 'Normal', high: 'High', urgent: 'Urgent' };
const TYPE_LABEL: Record<string, string> = {
  follow_up: 'Follow-up', call: 'Call', email: 'Email', review: 'Review',
  send_doc: 'Send doc', meeting: 'Meeting', general: 'Task',
};

function formatDue(d: string | null, t: string | null): string {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  const wk = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  return t ? `${wk} ${md} ${t}` : `${wk} ${md}`;
}

function Chip({
  icon: Icon,
  label,
  onRemove,
  onClick,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  tone?: 'default' | 'warn';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors',
        tone === 'warn'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          : 'bg-primary/10 border-primary/30 text-foreground/90 hover:bg-primary/15',
        onClick ? 'cursor-pointer' : ''
      )}
      onClick={onClick}
    >
      <Icon className="h-3 w-3 opacity-80" />
      <span className="font-medium leading-none">{label}</span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Remove"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

export function TaskModeChips({ draft, onChange, loading }: Props) {
  const [dateOpen, setDateOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const { user } = useAuth();
  const teamMembers = useTeamMembers();

  const ownerPickerContent = (
    <PopoverContent className="w-[240px] p-0 z-[80] pointer-events-auto" align="start">
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
                  onChange({ ...draft, owner_id: user.id, owner_label: 'You', owner_ambiguous: null });
                  setOwnerOpen(false);
                }}
              >
                <User className="h-3 w-3 mr-2" />
                You
                {draft.owner_id === user.id && <Check className="h-3 w-3 ml-auto" />}
              </CommandItem>
            )}
            {teamMembers
              .filter((m) => m.id !== user?.id)
              .map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.display_name} ${m.email || ''}`}
                  onSelect={() => {
                    onChange({ ...draft, owner_id: m.id, owner_label: m.display_name, owner_ambiguous: null });
                    setOwnerOpen(false);
                  }}
                >
                  <User className="h-3 w-3 mr-2" />
                  <span className="truncate">{m.display_name}</span>
                  {draft.owner_id === m.id && <Check className="h-3 w-3 ml-auto" />}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  );

  const dot =
    draft.confidence >= 0.8 ? 'bg-emerald-500'
    : draft.confidence >= 0.5 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        {loading ? 'parsing…' : `confidence ${Math.round(draft.confidence * 100)}%`}
        {draft.confidence < 0.5 && <span className="text-red-300">— please confirm details before creating</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {/* Type */}
        <Chip icon={Tag} label={TYPE_LABEL[draft.type] || 'Task'} />

        {/* Deal */}
        {draft.deal_label ? (
          <Chip icon={Briefcase} label={`Deal: ${draft.deal_label}`} onRemove={() => onChange({ ...draft, deal_id: null, deal_label: null })} />
        ) : draft.hints.deal ? (
          <Chip icon={Briefcase} label={`Deal: "${draft.hints.deal}" — no match`} tone="warn" />
        ) : null}

        {/* Lender */}
        {draft.lender_label ? (
          <Chip icon={Building2} label={`Lender: ${draft.lender_label}`} onRemove={() => onChange({ ...draft, lender_id: null, lender_label: null })} />
        ) : draft.hints.lender ? (
          <Chip icon={Building2} label={`Lender: "${draft.hints.lender}" — no match`} tone="warn" />
        ) : null}

        {/* Contact */}
        {draft.contact_label ? (
          <Chip icon={User} label={`Contact: ${draft.contact_label}`} onRemove={() => onChange({ ...draft, contact_id: null, contact_label: null })} />
        ) : draft.hints.contact ? (
          <Chip icon={User} label={`Contact: "${draft.hints.contact}" — no match`} tone="warn" />
        ) : null}

        {/* Assignee — always editable via teammate picker */}
        <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
          <PopoverTrigger asChild>
            <span>
              <Chip
                icon={User}
                label={
                  draft.owner_label
                    ? `Assignee: ${draft.owner_label}${draft.owner_ambiguous && draft.owner_ambiguous.length > 0 ? ' (suggested)' : ''}`
                    : draft.hints.owner
                      ? `Assignee: "${draft.hints.owner}" — pick`
                      : 'Assignee: pick'
                }
                onClick={() => setOwnerOpen(true)}
                tone={!draft.owner_id ? 'warn' : 'default'}
              />
            </span>
          </PopoverTrigger>
          {ownerPickerContent}
        </Popover>

        {/* Due date */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <span>
              <Chip
                icon={CalendarIcon}
                label={draft.due_date ? `Due: ${formatDue(draft.due_date, draft.due_time)}` : 'Due: set date'}
                onRemove={draft.due_date ? () => onChange({ ...draft, due_date: null, due_time: null }) : undefined}
                onClick={() => setDateOpen(true)}
                tone={!draft.due_date ? 'warn' : 'default'}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={draft.due_date ? new Date(draft.due_date + 'T00:00:00') : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                onChange({ ...draft, due_date: iso });
                setDateOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <span>
              <Chip
                icon={AlertTriangle}
                label={draft.priority ? `Priority: ${PRIORITY_LABEL[draft.priority]}` : 'Priority'}
                onRemove={draft.priority ? () => onChange({ ...draft, priority: null }) : undefined}
                onClick={() => {}}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-1" align="start">
            <button
              key="none"
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 text-muted-foreground"
              onClick={() => onChange({ ...draft, priority: null })}
            >
              None (clear)
            </button>
            {(['low','normal','high','urgent'] as const).map((p) => (
              <button
                key={p}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10"
                onClick={() => onChange({ ...draft, priority: p })}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Recurrence */}
        {draft.is_recurring && (
          <Chip
            icon={Repeat}
            label={`Recurring${draft.recurrence_rule ? ` · ${draft.recurrence_rule.replace('FREQ=', '').replace(';BYDAY=', ' ').toLowerCase()}` : ''}`}
            onRemove={() => onChange({ ...draft, is_recurring: false, recurrence_rule: null })}
          />
        )}
      </div>
    </div>
  );
}