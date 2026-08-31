import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CalendarIcon, Loader2, UserCheck, Sun, Sunrise, CalendarDays, Flame, Repeat, Briefcase, Search, X, Sparkles } from 'lucide-react';
import { addDays, format, isSameDay, nextMonday } from 'date-fns';
import { cn } from '@/lib/utils';
import { type TeamMember } from '@/hooks/useTeamMembers';
import { useAssigneeOpenTaskCounts } from '@/hooks/useAssigneeOpenTaskCounts';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { Link } from 'react-router-dom';
import type { Deal } from '@/types/deal';
import { isActiveDeal } from '@/lib/deals';
import { toast } from 'sonner';

export interface QuickTaskInput {
  title: string;
  priority: 'urgent' | null;
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete';
  assigned_to: string;
  recurrence_rule: string | null;
  /** YYYY-MM-DD; if set, no new occurrence is generated past this date. */
  recurrence_end_date: string | null;
  /** Optional deal association — surfaces task under deal's Tasks tab. */
  deal_id: string | null;
  /** Optional contact and funding-source associations for meeting follow-ups. */
  contact_id: string | null;
  lender_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: QuickTaskInput) => Promise<void> | void;
  teamMembers: TeamMember[];
  currentUserId: string;
  /** Optional pre-fill values applied each time the dialog opens. */
  initialTitle?: string;
  initialDealId?: string | null;
  initialContactId?: string | null;
  initialLenderId?: string | null;
  initialDueDate?: Date | null;
  /**
   * When true, the dialog treats `initialDealId` as the authoritative
   * deal for this task. The title-based fuzzy auto-apply is suppressed
   * (suggestions stay visible as one-click chips, but never silently
   * overwrite the prefilled deal — and never invent a random deal when
   * none is prefilled). Used by meeting → Create task flows where the
   * caller has already resolved the explicit meeting→deal link.
   */
  lockInitialDeal?: boolean;
}

const JUNK_NAMES = ['test', 'asdf', 'aaa', 'abc', 'xxx', 'zzz', 'asd', 'qwe', 'foo', 'bar'];

const LAST_ASSIGNEE_KEY = 'quickCreateTask:lastAssigneeId';

const readLastAssignee = (fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(LAST_ASSIGNEE_KEY) || fallback;
  } catch {
    return fallback;
  }
};

// Mirrors calculateNextDueDate() in useTasks.ts so the modal can preview
// the next occurrence without round-tripping through the hook layer.
function previewNextOccurrence(anchor: Date, rule: string): Date | null {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  if (rule.startsWith('every:')) {
    const [, nStr, unit] = rule.split(':');
    const n = Math.max(1, Math.min(365, parseInt(nStr, 10) || 1));
    if (unit === 'days') { d.setDate(d.getDate() + n); return d; }
    if (unit === 'weeks') { d.setDate(d.getDate() + n * 7); return d; }
    if (unit === 'months') { d.setMonth(d.getMonth() + n); return d; }
    if (unit === 'years') { d.setFullYear(d.getFullYear() + n); return d; }
    return null;
  }
  switch (rule) {
    case 'daily':     d.setDate(d.getDate() + 1); return d;
    case 'weekdays':
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      return d;
    case 'weekly':    d.setDate(d.getDate() + 7); return d;
    case 'biweekly':  d.setDate(d.getDate() + 14); return d;
    case 'monthly':   d.setMonth(d.getMonth() + 1); return d;
    case 'quarterly': d.setMonth(d.getMonth() + 3); return d;
    default: return null;
  }
}

export function QuickCreateTaskDialog({
  open,
  onClose,
  onCreate,
  teamMembers,
  currentUserId,
  initialTitle,
  initialDealId,
  initialContactId,
  initialLenderId,
  initialDueDate,
  lockInitialDeal = false,
}: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<QuickTaskInput['priority']>(null);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<QuickTaskInput['status']>('not_started');
  const [assignedTo, setAssignedTo] = useState<string>(() => readLastAssignee(currentUserId));
  const [recurrence, setRecurrence] = useState<string | null>(null);
  // Custom "Every N days/weeks" — only applies when the Custom chip is active.
  const [customN, setCustomN] = useState<number>(3);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('days');
  // When true, day-based recurrences (daily/weekdays/weekly) anchor to the
  // selected due date. If no due date is set when this is enabled, today is
  // used as the anchor.
  const [startFromDueDate, setStartFromDueDate] = useState(false);
  // End conditions for the recurring series.
  const [endMode, setEndMode] = useState<'never' | 'on_date' | 'after_n'>('never');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endAfterN, setEndAfterN] = useState<number>(5);
  const [warning, setWarning] = useState('');
  const [confirmedJunk, setConfirmedJunk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Deal association — optional. Auto-suggested from the title via fuzzy
  // matching against deal name / company / lender / contact, then overridable
  // through a type-ahead picker that respects RLS (deals already filtered
  // server-side via DealsContext).
  const { deals: allDeals } = useDealsContext();
  // Active-pipeline scoping: restrict the picker to deals whose pipeline_id
  // is on the company's currently-active pipelines — i.e. the default
  // pipeline ("Active Pipeline") plus any pipeline named "In Development" /
  // "Development Pipeline". Other pipelines (Archived, Guided, sandbox)
  // and stage-level dead/closed deals are excluded so the picker matches
  // the deals surfaced in /deals.
  const { pipelines: companyPipelines } = usePipelineContext();
  const activePipelineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of companyPipelines) {
      const n = (p.name || '').toLowerCase();
      if (p.isDefault || n.includes('development')) ids.add(p.id);
    }
    return ids;
  }, [companyPipelines]);
  const pipelineNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of companyPipelines) m.set(p.id, p.name);
    return m;
  }, [companyPipelines]);
  const stageOrderByPipeline = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const p of companyPipelines) {
      const inner = new Map<string, number>();
      p.stages.forEach((s, i) => inner.set(s.id, i));
      m.set(p.id, inner);
    }
    return m;
  }, [companyPipelines]);
  const [dealId, setDealId] = useState<string | null>(null);
  const [dealPickerOpen, setDealPickerOpen] = useState(false);
  const [dealQuery, setDealQuery] = useState('');
  const [debouncedTitle, setDebouncedTitle] = useState('');

  // Active-deal predicate sourced from src/lib/deals.ts — same helper used by
  // the /deals "Active Deals" KPI so both surfaces stay in lockstep.

  // Track open transitions so we only reset state on false→true. Previously
  // this effect re-ran whenever any `initial*` prop identity changed (e.g.
  // parents passing `initialDueDate={new Date()}` on every render), which
  // wiped the user's typed task name mid-edit.
  const prevOpenRef = useRef(false);
  // Once the user edits the title, ignore any subsequent prop-driven resets
  // until the dialog closes and reopens.
  const userEditedTitleRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      setTitle(initialTitle || '');
      userEditedTitleRef.current = false;
      setPriority(null);
      setDueDate(initialDueDate || undefined);
      setStatus('not_started');
      const remembered = readLastAssignee(currentUserId);
      const isValid = remembered === currentUserId || teamMembers.some(m => m.id === remembered);
      setAssignedTo(isValid ? remembered : currentUserId);
      setRecurrence(null);
      setCustomN(3);
      setCustomUnit('days');
      setStartFromDueDate(false);
      setEndMode('never');
      setEndDate(undefined);
      setEndAfterN(5);
      setWarning('');
      setConfirmedJunk(false);
      setSubmitting(false);
      setDealId(initialDealId ?? null);
      setDealPickerOpen(false);
      setDealQuery('');
      setDebouncedTitle('');
    }
  }, [open, currentUserId, teamMembers, initialTitle, initialDealId, initialDueDate]);

  // In locked mode (meeting → Create task), keep `dealId` mirrored to the
  // explicit `initialDealId` for as long as the dialog stays open. The
  // open-transition effect above only fires on false→true, so without
  // this we'd miss the case where the caller re-resolves the linked deal
  // (e.g. the user switches the link from Deal A to Deal B and clicks
  // Create task again) between reopens. Unlocked callers keep the
  // existing "set once on open" behavior so manual picks aren't clobbered.
  useEffect(() => {
    if (!open || !lockInitialDeal) return;
    setDealId(initialDealId ?? null);
  }, [open, lockInitialDeal, initialDealId]);

  // Collapse the inline deal results list when the user clicks anywhere
  // outside [data-deal-picker]. Clears query but preserves selection.
  useEffect(() => {
    if (!dealPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest('[data-deal-picker]')) {
        setDealPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dealPickerOpen]);

  // ─── One-click presets ────────────────────────────────────────────────
  // Combo presets snap several fields at once (priority + due + status).
  // Applying a combo also clears conflicting state: any prior recurrence
  // rule (the combo redefines the schedule) and stale validation warnings.
  // Single one-click shortcut. Toggles on/off: applying sets priority=urgent
  // and due=today; re-clicking clears those two overrides.
  const urgentToday = {
    id: 'urgent_today',
    label: 'Urgent · Today',
    tone: '#e57373',
  };
  const urgentActive = priority === 'urgent' && !!dueDate && isSameDay(dueDate, new Date());
  const toggleUrgent = () => {
    if (urgentActive) {
      setPriority(null);
      setDueDate(undefined);
    } else {
      setPriority('urgent');
      setDueDate(new Date());
      setRecurrence(null);
      setStartFromDueDate(false);
      setEndMode('never');
      setEndDate(undefined);
    }
    setWarning('');
    setConfirmedJunk(false);
  };

  // Per-field due-date presets
  const datePresets = [
    { id: 'today',    label: 'Today',    icon: <Sun className="h-3 w-3" />,         value: new Date() },
    { id: 'tomorrow', label: 'Tomorrow', icon: <Sunrise className="h-3 w-3" />,     value: addDays(new Date(), 1) },
    { id: 'monday',   label: 'Next Mon', icon: <CalendarDays className="h-3 w-3" />, value: nextMonday(new Date()) },
    { id: 'week',     label: '+1 week',  icon: <CalendarDays className="h-3 w-3" />, value: addDays(new Date(), 7) },
  ];
  const dateMatches = (preset: Date) => !!dueDate && isSameDay(dueDate, preset);


  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setWarning('Task name is required.');
      return;
    }
    if (!confirmedJunk && (trimmed.length < 3 || JUNK_NAMES.includes(trimmed.toLowerCase()))) {
      setWarning('Please enter a descriptive task name (at least 3 characters). Click Create again to confirm.');
      setConfirmedJunk(true);
      return;
    }
    setSubmitting(true);
    try {
      // Resolve the series end date based on the chosen end condition.
      // For "after_n" we step the recurrence engine N times from the anchor.
      let resolvedEndDate: string | null = null;
      if (recurrence) {
        const anchor = dueDate ?? new Date();
        if (endMode === 'on_date' && endDate) {
          resolvedEndDate = format(endDate, 'yyyy-MM-dd');
        } else if (endMode === 'after_n') {
          const safeN = Math.max(1, Math.min(365, Math.floor(endAfterN)));
          // The first task counts as occurrence #1, so we advance N-1 times
          // and use that date as the inclusive end-of-series boundary.
          let cursor: Date | null = new Date(anchor);
          for (let i = 1; i < safeN; i++) {
            const next = previewNextOccurrence(cursor!, recurrence);
            if (!next) { cursor = null; break; }
            cursor = next;
          }
          if (cursor) resolvedEndDate = format(cursor, 'yyyy-MM-dd');
        }
      }
      await onCreate({
        title: trimmed,
        priority,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        status,
        assigned_to: assignedTo,
        recurrence_rule: recurrence,
        recurrence_end_date: resolvedEndDate,
        deal_id: dealId,
        contact_id: initialContactId ?? null,
        lender_id: initialLenderId ?? null,
      });
      try {
        window.localStorage.setItem(LAST_ASSIGNEE_KEY, assignedTo);
      } catch {
        /* ignore storage errors */
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const assignee = teamMembers.find(m => m.id === assignedTo);
  const { data: openCounts = {} } = useAssigneeOpenTaskCounts(open);
  const assigneeCount = openCounts[assignedTo] ?? 0;
  const workloadTone = (n: number) =>
    n >= 15 ? '#e57373' : n >= 8 ? '#e89b6c' : n >= 3 ? '#d4a45a' : '#7fc89a';

  // ─── Deal suggestion engine ─────────────────────────────────────────
  // Debounce title so suggestion scoring doesn't run on every keystroke.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedTitle(title), 250);
    return () => clearTimeout(h);
  }, [title]);

  const stopWords = useMemo(() => new Set([
    'a','an','the','to','for','with','and','or','of','on','at','in','from','by',
    'follow','followup','follow-up','call','email','send','review','update',
    'task','about','re','please','need','needs','next','today','tomorrow','asap',
  ]), []);

  // Token similarity: deal scores higher when its name/company/lender/contact
  // tokens overlap with words from the task title. Multi-word deal names
  // (e.g. "SoLo Funds", "LAGO Innovation Fund") get a substring boost so
  // exact phrase mentions reliably win over single-word collisions.
  const scoreDeal = (deal: Deal, text: string): number => {
    if (!text) return 0;
    const haystackParts = [deal.name, deal.company, deal.lender, deal.contact]
      .filter(Boolean)
      .map(s => String(s).toLowerCase());
    const lower = text.toLowerCase();
    let score = 0;
    for (const part of haystackParts) {
      if (!part) continue;
      // Phrase match (e.g. "lago innovation") — strong signal.
      if (part.length >= 4 && lower.includes(part)) score += 100;
      // Token-level overlap.
      const tokens = part.split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !stopWords.has(t));
      const titleTokens = lower.split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !stopWords.has(t));
      for (const tk of tokens) {
        if (titleTokens.includes(tk)) score += 25;
      }
    }
    // Tie-breaker: recently updated deals slightly preferred.
    const ageDays = deal.updatedAt
      ? (Date.now() - new Date(deal.updatedAt).getTime()) / 86400000
      : 365;
    score += Math.max(0, 5 - Math.min(5, ageDays / 30));
    return score;
  };

  const suggestions = useMemo(() => {
    if (!debouncedTitle || debouncedTitle.trim().length < 3) return [];
    return allDeals
      .filter(isActiveDeal)
      .map(d => ({ deal: d, score: scoreDeal(d, debouncedTitle) }))
      .filter(x => x.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, allDeals]);

  // Auto-fill ONLY when there's a single high-confidence match and the user
  // hasn't already chosen a deal. Never override an explicit selection.
  useEffect(() => {
    if (dealId) return;
    // Meeting → Create task flow: the caller owns the deal field via the
    // explicit meeting→deal link. Suggestions stay visible as one-click
    // chips, but never silently auto-apply — that's the bug where a
    // title like "Follow Up: SoLo Sync" would pick up an unrelated deal
    // (e.g. Censys) just because its name happened to overlap.
    if (lockInitialDeal) return;
    if (suggestions.length === 1 && suggestions[0].score >= 100) {
      setDealId(suggestions[0].deal.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const selectedDeal = dealId ? allDeals.find(d => d.id === dealId) : null;

  // Scoped, ordered deal list: company's Active Pipeline + Development
  // Pipeline only, with stage-level dead deals excluded. Sorted by pipeline
  // (default first, then development), stage order within the pipeline, then
  // alpha by deal name. Search filters across name/company/lender/contact
  // but preserves the ordering.
  const dealPickerResults = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    const matches = (d: Deal) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      (d.company || '').toLowerCase().includes(q) ||
      (d.lender || '').toLowerCase().includes(q) ||
      (d.contact || '').toLowerCase().includes(q);
    const defaultPipelineId =
      companyPipelines.find(p => p.isDefault)?.id ?? null;
    const pipelineRank = (pid?: string) => {
      if (!pid) return 99;
      if (pid === defaultPipelineId) return 0;
      return 1;
    };
    const filtered = allDeals.filter(d => {
      if (!d.pipelineId || !activePipelineIds.has(d.pipelineId)) return false;
      if (!isActiveDeal(d)) return false;
      return matches(d);
    });
    filtered.sort((a, b) => {
      const pr = pipelineRank(a.pipelineId) - pipelineRank(b.pipelineId);
      if (pr !== 0) return pr;
      const stageMap = stageOrderByPipeline.get(a.pipelineId || '');
      const sa = stageMap?.get(a.stage as string) ?? 999;
      const sb = stageMap?.get(b.stage as string) ?? 999;
      if (sa !== sb) return sa - sb;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return filtered.slice(0, 100);
  }, [allDeals, dealQuery, activePipelineIds, companyPipelines, stageOrderByPipeline]);
  const dealResultsEmpty = dealPickerResults.length === 0;

  const dealStageTone = (stage?: string) => {
    switch (stage) {
      case 'closed-won': return '#7fc89a';
      case 'closed-lost': return '#e57373';
      case 'in-due-diligence':
      case 'term-sheet': return '#7eb8f7';
      case 'nda':
      case 'initial-review': return '#d4a45a';
      default: return '#9aa3b6';
    }
  };
  const formatStage = (s?: string) =>
    s ? s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-[480px] p-0 border"
        style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.06)' }}
        // Ignore outside-interaction events that originate from Radix-portaled
        // children (Popover, Select, Calendar). Without this, clicking the
        // deal picker's search input or any row inside the portaled
        // PopoverContent is treated as a click outside the Dialog and
        // immediately dismisses the modal.
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest('[data-radix-popper-content-wrapper], [data-radix-popover-content], [data-radix-select-content], [role="listbox"], [role="option"], [data-deal-picker], [cmdk-root]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest('[data-radix-popper-content-wrapper], [data-radix-popover-content], [data-radix-select-content], [role="listbox"], [role="option"], [data-deal-picker], [cmdk-root]')) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <DialogTitle className="text-[15px] font-semibold tracking-tight" style={{ color: '#eef1f6' }}>
            New Task
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* One-click shortcut — toggles Urgent + Today on/off */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={toggleUrgent}
              aria-pressed={urgentActive}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors hover:brightness-110"
              style={{
                color: urgentToday.tone,
                borderColor: urgentActive ? `${urgentToday.tone}99` : `${urgentToday.tone}33`,
                backgroundColor: urgentActive ? `${urgentToday.tone}26` : `${urgentToday.tone}10`,
              }}
              title={urgentActive ? 'Clear Urgent · Today' : 'Apply Urgent · Today'}
            >
              <Flame className="h-3 w-3" />
              {urgentToday.label}
            </button>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>
              Task name
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => { userEditedTitleRef.current = true; setTitle(e.target.value); setWarning(''); setConfirmedJunk(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="What needs to be done?"
              className="h-9 text-sm text-white placeholder:text-[#7a8194]"
              style={{ backgroundColor: 'rgba(20,24,32,0.65)', border: '1px solid rgba(255,255,255,0.07)' }}
            />
            {warning && <p className="text-[11px]" style={{ color: '#e57373' }}>{warning}</p>}
          </div>

          {/* Quick due-date presets + full picker fallback */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Due date</label>
            <div className="flex flex-wrap gap-1.5">
              {datePresets.map(p => {
                const active = dateMatches(p.value);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDueDate(active ? undefined : p.value)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors"
                    style={{
                      color: active ? '#cfe3ff' : '#9aa3b6',
                      borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                      backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                    }}
                  >
                    {p.icon}
                    {p.label}
                  </button>
                );
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="inline-flex items-center gap-1 px-2 py-1 h-auto rounded-md text-[11px] font-normal border"
                    style={{
                      color: dueDate && !datePresets.some(p => isSameDay(p.value, dueDate)) ? '#cfe3ff' : '#9aa3b6',
                      borderColor: 'rgba(255,255,255,0.08)',
                      backgroundColor: 'rgba(20,24,32,0.65)',
                    }}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    {dueDate && !datePresets.some(p => isSameDay(p.value, dueDate))
                      ? format(dueDate, 'MMM d')
                      : 'Pick…'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate(undefined)}
                  className="inline-flex items-center px-2 py-1 rounded-md text-[11px] border transition-colors hover:text-[#e57373]"
                  style={{ color: '#7a8194', borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'transparent' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Recurrence */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] uppercase tracking-wide font-medium flex items-center gap-1" style={{ color: '#7a8194' }}>
                <Repeat className="h-3 w-3" /> Repeat
              </label>
              {recurrence && (() => {
                const anchor = dueDate ?? new Date();
                const next = previewNextOccurrence(anchor, recurrence);
                if (!next) return null;
                return (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                    style={{
                      color: '#cfe3ff',
                      borderColor: 'rgba(126,184,247,0.35)',
                      backgroundColor: 'rgba(126,184,247,0.10)',
                    }}
                    title={`After completion, the next task will be due ${format(next, 'EEE, MMM d, yyyy')}${dueDate ? '' : ' (anchored to today since no due date is set)'}`}
                  >
                    Next: {format(next, 'EEE, MMM d')}
                    {!dueDate && (
                      <span style={{ color: '#7a8194' }}>· from today</span>
                    )}
                  </span>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { value: null, label: 'None' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'biweekly', label: 'Biweekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'custom', label: 'Custom…' },
              ].map(opt => {
                const isCustomChip = opt.value === 'custom';
                const isCustomRule = !!recurrence && recurrence.startsWith('every:');
                const active = isCustomChip
                  ? isCustomRule
                  : recurrence === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (isCustomChip) {
                        setRecurrence(`every:${customN}:${customUnit}`);
                      } else {
                        setRecurrence(opt.value);
                        // Clearing recurrence also disables the anchor toggle
                        // so it can't apply when there's nothing to anchor.
                        if (!opt.value) setStartFromDueDate(false);
                      }
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
                    style={{
                      color: active ? '#cfe3ff' : '#9aa3b6',
                      borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                      backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {recurrence && recurrence.startsWith('every:') && (
              <div
                className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded-md border"
                style={{ borderColor: 'rgba(126,184,247,0.25)', backgroundColor: 'rgba(126,184,247,0.06)' }}
              >
                <span className="text-[11px]" style={{ color: '#9aa3b6' }}>Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={customN}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1));
                    setCustomN(n);
                    setRecurrence(`every:${n}:${customUnit}`);
                  }}
                  className="w-14 h-7 px-1.5 rounded border text-[12px] text-center"
                  style={{
                    backgroundColor: 'rgba(20,24,32,0.85)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: '#cfe3ff',
                  }}
                />
                <div className="flex gap-1">
                  {(['days', 'weeks', 'months', 'years'] as const).map(u => {
                    const uActive = customUnit === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setCustomUnit(u);
                          setRecurrence(`every:${customN}:${u}`);
                        }}
                        className="px-2 py-1 rounded text-[11px] font-medium border transition-colors"
                        style={{
                          color: uActive ? '#cfe3ff' : '#9aa3b6',
                          borderColor: uActive ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                          backgroundColor: uActive ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                        }}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] ml-auto" style={{ color: '#7a8194' }}>
                  Next task generated on completion
                </span>
              </div>
            )}
            {recurrence && (recurrence === 'daily' || recurrence === 'weekdays' || recurrence === 'weekly' || recurrence.startsWith('every:')) && (
              <label
                className="flex items-center gap-2 text-[11px] cursor-pointer select-none mt-1"
                style={{ color: startFromDueDate ? '#cfe3ff' : '#9aa3b6' }}
                title="Anchor the recurring cycle to the selected due date"
              >
                <input
                  type="checkbox"
                  checked={startFromDueDate}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setStartFromDueDate(next);
                    // If turning on without a due date, anchor to today
                    if (next && !dueDate) setDueDate(new Date());
                  }}
                  className="h-3 w-3 accent-[#7eb8f7]"
                />
                <span>
                  Starting from due date
                  {startFromDueDate && dueDate && (
                    <span className="ml-1" style={{ color: '#7a8194' }}>
                      · anchored to {format(dueDate, 'MMM d')}
                    </span>
                  )}
                </span>
              </label>
            )}
            {recurrence && !dueDate && (
              <p className="text-[10px]" style={{ color: '#e89b6c' }}>
                Tip: set a due date — the next task is generated when this one is completed.
              </p>
            )}
            {recurrence && (
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide font-medium mr-1" style={{ color: '#7a8194' }}>
                    Ends
                  </span>
                  {([
                    { v: 'never',    l: 'Never' },
                    { v: 'on_date',  l: 'On date' },
                    { v: 'after_n',  l: 'After…' },
                  ] as const).map(opt => {
                    const active = endMode === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          setEndMode(opt.v);
                          if (opt.v === 'on_date' && !endDate) {
                            // Sensible default: 90 days out from anchor
                            setEndDate(addDays(dueDate ?? new Date(), 90));
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors"
                        style={{
                          color: active ? '#cfe3ff' : '#9aa3b6',
                          borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                          backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                        }}
                      >
                        {opt.l}
                      </button>
                    );
                  })}
                  {endMode === 'on_date' && (
                    <input
                      type="date"
                      value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
                      min={dueDate ? format(dueDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEndDate(v ? new Date(v + 'T00:00:00') : undefined);
                      }}
                      className="h-7 px-2 rounded border text-[11px]"
                      style={{
                        backgroundColor: 'rgba(20,24,32,0.85)',
                        borderColor: 'rgba(255,255,255,0.08)',
                        color: '#cfe3ff',
                        colorScheme: 'dark',
                      }}
                    />
                  )}
                  {endMode === 'after_n' && (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={endAfterN}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1));
                          setEndAfterN(n);
                        }}
                        className="w-14 h-7 px-1.5 rounded border text-[12px] text-center"
                        style={{
                          backgroundColor: 'rgba(20,24,32,0.85)',
                          borderColor: 'rgba(255,255,255,0.08)',
                          color: '#cfe3ff',
                        }}
                      />
                      <span className="text-[11px]" style={{ color: '#9aa3b6' }}>occurrences</span>
                    </div>
                  )}
                </div>
                {(() => {
                  if (endMode === 'never' || !recurrence) return null;
                  const anchor = dueDate ?? new Date();
                  let resolved: Date | null = null;
                  if (endMode === 'on_date' && endDate) resolved = endDate;
                  if (endMode === 'after_n') {
                    let cursor: Date | null = new Date(anchor);
                    const safeN = Math.max(1, Math.min(365, Math.floor(endAfterN)));
                    for (let i = 1; i < safeN; i++) {
                      const next = previewNextOccurrence(cursor!, recurrence);
                      if (!next) { cursor = null; break; }
                      cursor = next;
                    }
                    resolved = cursor;
                  }
                  if (!resolved) return null;
                  return (
                    <p className="text-[10px]" style={{ color: '#7a8194' }}>
                      Series ends on <span style={{ color: '#cfe3ff' }}>{format(resolved, 'EEE, MMM d, yyyy')}</span>
                      {endMode === 'after_n' && <> · {endAfterN} occurrence{endAfterN === 1 ? '' : 's'}</>}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Deal — optional association with smart suggestions */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wide font-medium flex items-center gap-1" style={{ color: '#7a8194' }}>
                <Briefcase className="h-3 w-3" /> Deal
              </label>
              {selectedDeal && (
                <button
                  type="button"
                  onClick={() => setDealId(null)}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded hover:bg-[rgba(229,115,115,0.1)] transition-colors"
                  style={{ color: '#e57373' }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Inline AI suggestion chips above the picker */}
            {!selectedDeal && suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#9aa3b6' }}>
                  <Sparkles className="h-2.5 w-2.5" /> Suggested
                </span>
                {suggestions.map(({ deal: d }) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDealId(d.id)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors hover:brightness-110"
                    style={{
                      color: '#cfe3ff',
                      borderColor: 'rgba(126,184,247,0.35)',
                      backgroundColor: 'rgba(126,184,247,0.10)',
                    }}
                    title={`${d.company || d.name}${d.stage ? ' · ' + formatStage(d.stage) : ''}`}
                  >
                    {d.name}
                    {d.stage && (
                      <span
                        className="inline-block px-1 rounded text-[9px] font-semibold"
                        style={{
                          color: dealStageTone(d.stage),
                          backgroundColor: `${dealStageTone(d.stage)}1f`,
                        }}
                      >
                        {formatStage(d.stage)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Inline, non-portaled deal picker. A single input expands the
                results list directly below it; selecting a deal collapses
                the list and shows a pill that the user can clear with X.
                Avoiding Radix Popover here sidesteps all the focus / outside
                -click coordination problems with the parent Dialog. */}
            <div data-deal-picker="true" className="relative">
              {selectedDeal ? (
                <div
                  className="w-full h-9 px-3 rounded-md border text-sm flex items-center gap-2"
                  style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)', color: '#eef1f6' }}
                >
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold"
                    style={{ backgroundColor: 'rgba(30,58,95,0.6)', color: '#93c5fd' }}
                  >
                    {selectedDeal.name}
                  </span>
                  {selectedDeal.company && selectedDeal.company !== selectedDeal.name && (
                    <span className="text-[11px] truncate" style={{ color: '#7a8194' }}>
                      · {selectedDeal.company}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Clear deal"
                    onClick={() => { setDealId(null); setDealPickerOpen(true); setDealQuery(''); }}
                    className="ml-auto inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[rgba(255,255,255,0.06)]"
                  >
                    <X className="h-3 w-3" style={{ color: '#9aa3b6' }} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: '#7a8194' }} />
                  <Input
                    value={dealQuery}
                    onChange={(e) => { setDealQuery(e.target.value); if (!dealPickerOpen) setDealPickerOpen(true); }}
                    onFocus={() => setDealPickerOpen(true)}
                    onClick={() => setDealPickerOpen(true)}
                    placeholder={dealPickerOpen ? 'Search by name, company, lender, contact…' : 'Search deals'}
                    className="h-9 pl-8 text-sm"
                    style={{ backgroundColor: 'rgba(20,24,32,0.65)', border: '1px solid rgba(255,255,255,0.07)', color: '#eef1f6' }}
                  />
                </div>
              )}
              {!selectedDeal && dealPickerOpen && (
                <div
                  className="mt-1 rounded-md border max-h-[260px] overflow-y-auto py-1"
                  style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  {dealResultsEmpty && (
                    <div className="px-3 py-4 text-[11px] text-center space-y-1" style={{ color: '#7a8194' }}>
                      <div>
                        {dealQuery.trim()
                          ? 'No active deals match your search.'
                          : 'No active deals in your pipeline.'}
                      </div>
                      {!dealQuery.trim() && (
                        <Link
                          to="/deals"
                          onClick={() => setDealPickerOpen(false)}
                          className="inline-block text-[11px] font-medium hover:underline"
                          style={{ color: '#7eb8f7' }}
                        >
                          Add a deal →
                        </Link>
                      )}
                    </div>
                  )}
                  {dealPickerResults.map(d => {
                    const commit = () => {
                      setDealId(d.id);
                      setDealPickerOpen(false);
                      setDealQuery('');
                    };
                    const pipelineLabel = d.pipelineId
                      ? pipelineNameById.get(d.pipelineId)
                      : undefined;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="option"
                        aria-selected={dealId === d.id}
                        onMouseDown={(e) => { e.preventDefault(); commit(); }}
                        onClick={(e) => { e.preventDefault(); commit(); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[rgba(126,184,247,0.08)]"
                        style={{ color: dealId === d.id ? '#cfe3ff' : '#eef1f6' }}
                      >
                        <span className="flex-1 truncate">
                          <span className="font-medium">{d.name}</span>
                          {d.company && d.company !== d.name && (
                            <span className="ml-2" style={{ color: '#7a8194' }}>· {d.company}</span>
                          )}
                        </span>
                        {pipelineLabel && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              color: '#93c5fd',
                              backgroundColor: 'rgba(30,58,95,0.6)',
                            }}
                          >
                            {pipelineLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Assignee</label>
              {assignedTo !== currentUserId && (
                <button
                  type="button"
                  onClick={() => {
                    setAssignedTo(currentUserId);
                    toast.success('Assigned to you');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded hover:bg-[rgba(126,184,247,0.1)] transition-colors"
                  style={{ color: '#7eb8f7' }}
                  title="Assign this task to me"
                >
                  <UserCheck className="h-2.5 w-2.5" />
                  Assign to me
                </button>
              )}
            </div>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-9 text-sm text-white" style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2 truncate w-full">
                  {assignee && (
                    <Avatar className="h-5 w-5">
                      {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                      <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                        {assignee.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="truncate">{assignee?.display_name || 'Select…'}</span>
                  {assignee && (
                    <span
                      className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        color: workloadTone(assigneeCount),
                        backgroundColor: `${workloadTone(assigneeCount)}1a`,
                        border: `1px solid ${workloadTone(assigneeCount)}33`,
                      }}
                      title={`${assigneeCount} open task${assigneeCount === 1 ? '' : 's'}`}
                    >
                      {assigneeCount}
                    </span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {[...teamMembers]
                  .sort((a, b) => (openCounts[a.id] ?? 0) - (openCounts[b.id] ?? 0))
                  .map(m => {
                    const n = openCounts[m.id] ?? 0;
                    const tone = workloadTone(n);
                    return (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span className="inline-flex items-center gap-2 w-full">
                          <span className="truncate">
                            {m.display_name}{m.id === currentUserId ? ' (me)' : ''}
                          </span>
                          <span
                            className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              color: tone,
                              backgroundColor: `${tone}1a`,
                              border: `1px solid ${tone}33`,
                            }}
                            title={`${n} open task${n === 1 ? '' : 's'}`}
                          >
                            {n} open
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter className="px-5 py-3 border-t flex items-center justify-between gap-2 sm:justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(15,18,22,0.6)' }}>
          <span className="text-[10px]" style={{ color: '#5b6173' }}>⌘↵ to create</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-md font-semibold border"
              style={{
                background: 'linear-gradient(180deg, rgba(126,184,247,0.22) 0%, rgba(80,135,210,0.22) 100%)',
                color: '#eaf2ff',
                borderColor: 'rgba(126,184,247,0.35)',
              }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Create task
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}