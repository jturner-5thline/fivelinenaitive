import { useMemo } from 'react';
import { addDays, addWeeks, addMonths, format, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';

interface Props {
  eventId: string;
  primaryAttendeeName?: string | null;
  primaryAttendeeEmail?: string | null;
  onOpenScheduler: (defaultDate?: Date) => void;
}

function parseCadence(text: string, from: Date = new Date()): Date | null {
  const lc = text.toLowerCase();
  // Specific weekday
  const weekdayMap: Record<string, (d: Date) => Date> = {
    monday: nextMonday, tuesday: nextTuesday, wednesday: nextWednesday,
    thursday: nextThursday, friday: nextFriday,
  };
  for (const [day, fn] of Object.entries(weekdayMap)) {
    if (new RegExp(`\\b(?:next |on )?${day}\\b`).test(lc)) return fn(from);
  }
  // "in N weeks/days/months"
  const inMatch = lc.match(/\bin (\d+)\s+(day|week|month)s?\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    if (unit === 'day') return addDays(from, n);
    if (unit === 'week') return addWeeks(from, n);
    if (unit === 'month') return addMonths(from, n);
  }
  if (/\b(next week|following week)\b/.test(lc)) return addWeeks(from, 1);
  if (/\b(two weeks|2 weeks|biweekly|bi-weekly|fortnight)\b/.test(lc)) return addWeeks(from, 2);
  if (/\b(next month|monthly|in a month)\b/.test(lc)) return addMonths(from, 1);
  if (/\b(quarterly|next quarter)\b/.test(lc)) return addMonths(from, 3);
  if (/\b(tomorrow)\b/.test(lc)) return addDays(from, 1);
  if (/\b(end of (the )?week)\b/.test(lc)) return nextFriday(from);
  return null;
}

export function MeetingScheduleInlineAction({
  eventId, primaryAttendeeName, primaryAttendeeEmail, onOpenScheduler,
}: Props) {
  const { data: ctx, isLoading } = useMeetingClaapContext(eventId);

  const suggestedDate = useMemo(() => {
    if (!ctx) return null;
    const corpus = [ctx.summary || '', ...ctx.nextSteps, ...ctx.keyDecisions].join('\n');
    if (!corpus.trim()) return null;
    return parseCadence(corpus);
  }, [ctx]);

  if (!suggestedDate) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-8 justify-start gap-2 text-xs"
        onClick={() => onOpenScheduler()}
        disabled={isLoading && !ctx}
      >
        <CalendarIcon className="h-3.5 w-3.5" /> Schedule next
      </Button>
    );
  }

  const who = primaryAttendeeName || primaryAttendeeEmail || 'attendees';

  return (
    <div className={cn(
      'rounded-md border px-2.5 py-1.5 flex items-center gap-2',
      'border-emerald-500/30 bg-emerald-500/[0.05]',
    )}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white">
        <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">▶ Suggested: {format(suggestedDate, 'EEE, MMM d')} follow-up with {who}</span>
      </div>
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI suggested
      </Badge>
      <Button
        size="sm" variant="ghost"
        className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10 shrink-0"
        onClick={() => onOpenScheduler(suggestedDate)}
      >
        Schedule
      </Button>
    </div>
  );
}