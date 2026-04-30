import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CalendarClock, Video, Check, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * MeetingSchedulerCard
 * --------------------
 * Inline scheduling workspace launched from the "Request a meeting" chip in
 * AiAssistSidebar. Reads the user's connected Google Calendar (via Nylas
 * `calendar-events`), proposes 3 free 45-minute slots over the next 5
 * business days, lets the user pick which ones to offer, choose attendees
 * from the 5th Line team list, and produce an insertable text block.
 *
 * Two-stage flow — never auto-creates a calendar event:
 *   Stage 1 (Propose): user picks slots + parties → "Insert proposal" puts
 *     a paragraph into the composer for the recipient to choose from.
 *   Stage 2 (Confirm): once the recipient replies with their pick, the user
 *     selects ONE slot and clicks "Confirm & create event" — only then do
 *     we hit Nylas `create` with attendees + Google Meet autocreate.
 */

interface Slot {
  start: Date;
  end: Date;
}

interface BusyEvent {
  start: string;
  end: string;
  all_day: boolean;
}

interface Props {
  /** Recipient email pulled from the latest message — added as attendee. */
  recipientEmail?: string;
  recipientName?: string;
  /** Subject line used for the calendar event title. */
  threadSubject?: string;
  /** Matched deal name, woven into the meeting title when available. */
  dealName?: string;
  /** Inserts text into the composer body. */
  onInsert: (text: string) => void;
  /** Closes the scheduler back to the chip row. */
  onClose: () => void;
}

const SLOT_MINUTES = 45;
const WORK_START_HOUR = 9;   // 9 AM local
const WORK_END_HOUR = 17;    // 5 PM local

function fmtSlot(s: Slot): string {
  const day = s.start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const start = s.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const end = s.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${day}, ${start}–${end} (${tz})`;
}

/** Build candidate working-hour slots across the next 5 business days. */
function buildCandidateSlots(now: Date): Slot[] {
  const slots: Slot[] = [];
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  let days = 0;
  while (days < 5) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    days += 1;
    for (let h = WORK_START_HOUR; h + SLOT_MINUTES / 60 <= WORK_END_HOUR; h += 1) {
      const start = new Date(d);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      slots.push({ start, end });
    }
  }
  return slots;
}

/** Filter out slots that overlap any busy event. */
function filterFreeSlots(candidates: Slot[], busy: BusyEvent[]): Slot[] {
  const busyRanges = busy
    .filter((b) => !b.all_day && b.start && b.end)
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  return candidates.filter((slot) => {
    const s = slot.start.getTime();
    const e = slot.end.getTime();
    return !busyRanges.some((b) => s < b.e && e > b.s);
  });
}

/** Pick 3 well-spaced free slots — prefer different days when possible. */
function pickThreeSpread(free: Slot[]): Slot[] {
  if (free.length <= 3) return free.slice(0, 3);
  const byDay = new Map<string, Slot[]>();
  for (const slot of free) {
    const k = slot.start.toDateString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(slot);
  }
  const out: Slot[] = [];
  // First pass: one per day, mid-morning preference (closest to 10am).
  for (const dayList of byDay.values()) {
    if (out.length >= 3) break;
    const preferred = dayList.reduce((best, cur) =>
      Math.abs(cur.start.getHours() - 10) < Math.abs(best.start.getHours() - 10) ? cur : best,
    );
    out.push(preferred);
  }
  // Backfill if fewer than 3 days had availability.
  for (const slot of free) {
    if (out.length >= 3) break;
    if (!out.includes(slot)) out.push(slot);
  }
  return out.slice(0, 3);
}

export function MeetingSchedulerCard({
  recipientEmail,
  recipientName,
  threadSubject,
  dealName,
  onInsert,
  onClose,
}: Props) {
  const { user } = useAuth();
  const teamMembers = useTeamMembers();

  const [loadingBusy, setLoadingBusy] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposedSlots, setProposedSlots] = useState<Slot[]>([]);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<Set<number>>(new Set([0, 1, 2]));

  const [partiesMode, setPartiesMode] = useState<'me' | 'me_plus'>('me');
  const [extraTeamMemberId, setExtraTeamMemberId] = useState<string | null>(null);

  const [stage, setStage] = useState<'propose' | 'confirm'>('propose');
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Load free/busy from connected Google Calendar (via Nylas) ───────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBusy(true);
      setErrorMsg(null);
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
        const { data, error } = await supabase.functions.invoke('calendar-events', {
          body: {
            action: 'list',
            time_min: now.toISOString(),
            time_max: horizon.toISOString(),
            max_results: 200,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const events: BusyEvent[] = (data?.events || []).map((e: any) => ({
          start: e.start,
          end: e.end,
          all_day: !!e.all_day,
        }));
        const candidates = buildCandidateSlots(now);
        const free = filterFreeSlots(candidates, events);
        const picked = pickThreeSpread(free);
        setProposedSlots(picked);
        setSelectedSlotIdx(new Set(picked.map((_, i) => i)));
      } catch (e: any) {
        console.error('[MeetingScheduler] free/busy load failed', e);
        setErrorMsg(e?.message || 'Could not read calendar. Reconnect your account in Settings.');
      } finally {
        if (!cancelled) setLoadingBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleSlot = (i: number) => {
    setSelectedSlotIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const extraMember: TeamMember | null = useMemo(
    () => teamMembers.find((m) => m.id === extraTeamMemberId) || null,
    [teamMembers, extraTeamMemberId],
  );

  const partiesLine = useMemo(() => {
    if (partiesMode === 'me_plus' && extraMember) {
      return `${extraMember.display_name} and I`;
    }
    return 'I';
  }, [partiesMode, extraMember]);

  // ── Stage 1: insert "here are 3 times" proposal text ────────────────────
  const insertProposal = useCallback(() => {
    const chosen = proposedSlots.filter((_, i) => selectedSlotIdx.has(i));
    if (chosen.length === 0) {
      toast.error('Pick at least one slot to offer.');
      return;
    }
    const lines = chosen.map((s) => `• ${fmtSlot(s)}`).join('\n');
    const block =
      `${partiesLine === 'I' ? 'I have' : `${partiesLine} have`} the following times available:\n` +
      `${lines}\n\n` +
      `Please reply with your preference and I will send a formal invite.`;
    onInsert(block);
    toast.success('Proposed times added to your reply.');
  }, [proposedSlots, selectedSlotIdx, partiesLine, onInsert]);

  // ── Stage 2: confirm one slot → create the calendar event ──────────────
  const confirmAndCreate = useCallback(async () => {
    if (confirmedIdx === null) {
      toast.error('Select the confirmed time slot first.');
      return;
    }
    const slot = proposedSlots[confirmedIdx];
    if (!slot) return;
    if (!recipientEmail) {
      toast.error('No recipient email available on this thread.');
      return;
    }
    setCreating(true);
    try {
      const attendees: { email: string; name?: string }[] = [
        { email: recipientEmail, name: recipientName },
      ];
      if (partiesMode === 'me_plus' && extraMember?.email) {
        attendees.push({ email: extraMember.email, name: extraMember.display_name });
      }
      const summary = dealName
        ? `${dealName} — Intro call`
        : threadSubject
          ? `Re: ${threadSubject}`
          : 'Intro call';
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: 'primary',
          event_data: {
            summary,
            description: dealName ? `Discussion re: ${dealName}` : undefined,
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            attendees,
            add_meet_link: true,
          },
        },
      });
      if (error) throw error;
      const meetLink: string | null = data?.event?.hangout_link || null;
      const lines = [
        `Confirmed for ${fmtSlot(slot)}.`,
        meetLink ? `Google Meet: ${meetLink}` : null,
        `Calendar invite sent — looking forward to it.`,
      ].filter(Boolean) as string[];
      onInsert(lines.join('\n'));
      toast.success(meetLink ? 'Event created with Meet link.' : 'Event created.');
      onClose();
    } catch (e: any) {
      console.error('[MeetingScheduler] create event failed', e);
      toast.error(e?.message || 'Could not create the event.');
    } finally {
      setCreating(false);
    }
  }, [confirmedIdx, proposedSlots, recipientEmail, recipientName, partiesMode, extraMember, dealName, threadSubject, onInsert, onClose]);

  return (
    <div className="rounded-lg border border-white/10 bg-card/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Schedule a meeting
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close scheduler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Slots list */}
      {loadingBusy ? (
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-11/12" />
          <div className="flex items-center gap-1.5 pt-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
            <span className="text-[10px] text-muted-foreground/70">
              Reading your calendar…
            </span>
          </div>
        </div>
      ) : errorMsg ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : proposedSlots.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          No open slots in the next 5 business days. Try again later or block off less time.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
            {stage === 'propose' ? 'Pick which slots to offer' : 'Pick the confirmed slot'}
          </div>
          {proposedSlots.map((slot, i) => {
            const checked = stage === 'propose' ? selectedSlotIdx.has(i) : confirmedIdx === i;
            return (
              <label
                key={i}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-[11.5px]',
                  'border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors',
                  checked && 'border-primary/40 bg-primary/10',
                )}
              >
                {stage === 'propose' ? (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSlot(i)}
                    className="h-3.5 w-3.5"
                  />
                ) : (
                  <input
                    type="radio"
                    name="confirmed-slot"
                    checked={checked}
                    onChange={() => setConfirmedIdx(i)}
                    className="h-3 w-3 accent-primary"
                  />
                )}
                <span className="text-foreground/85">{fmtSlot(slot)}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Parties */}
      {!loadingBusy && !errorMsg && proposedSlots.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
            Who's attending from our side
          </div>
          <RadioGroup
            value={partiesMode}
            onValueChange={(v) => setPartiesMode(v as 'me' | 'me_plus')}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="me" id="parties-me" className="h-3.5 w-3.5" />
              <Label htmlFor="parties-me" className="text-[11.5px] font-normal cursor-pointer">
                Just me
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="me_plus" id="parties-plus" className="h-3.5 w-3.5" />
              <Label htmlFor="parties-plus" className="text-[11.5px] font-normal cursor-pointer">
                Me + teammate
              </Label>
            </div>
          </RadioGroup>
          {partiesMode === 'me_plus' && (
            <Select value={extraTeamMemberId ?? ''} onValueChange={setExtraTeamMemberId}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Pick a 5th Line teammate" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers
                  .filter((m) => m.id !== user?.id)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-[11.5px]">
                      {m.display_name}
                      {m.email ? <span className="text-muted-foreground"> · {m.email}</span> : null}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Actions */}
      {!loadingBusy && !errorMsg && proposedSlots.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          {stage === 'propose' ? (
            <>
              <Button
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={insertProposal}
              >
                Insert proposal
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  // Pre-select the first slot for confirmation.
                  const firstChecked = proposedSlots.findIndex((_, i) => selectedSlotIdx.has(i));
                  setConfirmedIdx(firstChecked >= 0 ? firstChecked : 0);
                  setStage('confirm');
                }}
              >
                They confirmed →
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 text-[11px] flex-1 gap-1"
                onClick={confirmAndCreate}
                disabled={creating || confirmedIdx === null}
              >
                {creating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Video className="h-3 w-3" />
                )}
                Confirm & create event
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={() => setStage('propose')}
                disabled={creating}
              >
                Back
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}