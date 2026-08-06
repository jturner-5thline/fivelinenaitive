import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { useAuth } from '@/contexts/AuthContext';
import { startVisibilityAwareInterval } from '@/lib/visibilityAwareInterval';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  getHours,
  getMinutes,
  eachDayOfInterval,
  isAfter,
  isBefore,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Video,
  Users,
  MapPin,
  ExternalLink,
  X,
  Clock,
  List,
  Sparkles,
  Brain,
  FileText,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Search,
  Timer,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Keyboard,
  Globe,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useGoogleCalendar, CalendarEvent, Calendar } from '@/hooks/useGoogleCalendar';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Shared helpers ──────────────────────────────────────────
// Build a single Map<YYYY-MM-DD, CalendarEvent[]> once per event-list change.
// Replaces O(days × events) `events.filter(isSameDay(parseISO(...)))` loops
// inside Month/Agenda views, which were re-running parseISO on every event
// for every visible day on every render.
function useEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  return useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      // event.start can be ISO string or yyyy-MM-dd (all-day). Take first 10
      // chars when it already looks like a date; otherwise parse + format.
      let key: string;
      const s = e.start;
      if (typeof s === 'string' && s.length >= 10 && s[4] === '-' && s[7] === '-') {
        key = s.slice(0, 10);
      } else {
        try { key = format(parseISO(s as string), 'yyyy-MM-dd'); } catch { continue; }
      }
      const bucket = map.get(key);
      if (bucket) bucket.push(e); else map.set(key, [e]);
    }
    // Sort each bucket once so per-day renders don't re-sort on every paint.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const at = typeof a.start === 'string' ? a.start : '';
        const bt = typeof b.start === 'string' ? b.start : '';
        return at < bt ? -1 : at > bt ? 1 : 0;
      });
    }
    return map;
  }, [events]);
}
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
import ReactMarkdown from 'react-markdown';
import { CalendarEventDialog } from '@/components/integrations/CalendarEventDialog';
import { AgendaIntel } from './AgendaIntel';
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import { useTeammateList, useTeammateEvents } from '@/hooks/useTeammateCalendar';
import { UserCircle2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda' | 'intel';

interface FullCalendarViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;
const MIN_EVENT_HEIGHT = 24;

// Opaque gradient palette — calendar event chips must never be transparent.
// Each entry is a solid two-stop gradient so chips remain fully readable
// regardless of background, hover, or selected state.
const EVENT_PALETTE = [
  { bg: 'bg-gradient-to-br from-[#01696f] to-[#0c4e54] border-white/10', text: 'text-white', dot: 'bg-[#0c8a93]', label: 'Default', glow: '' },
  { bg: 'bg-gradient-to-br from-[#0f766e] to-[#134e4a] border-white/10', text: 'text-white', dot: 'bg-emerald-500', label: 'Green', glow: '' },
  { bg: 'bg-gradient-to-br from-[#b45309] to-[#78350f] border-white/10', text: 'text-white', dot: 'bg-amber-500', label: 'Amber', glow: '' },
  { bg: 'bg-gradient-to-br from-[#9f1239] to-[#5f0a22] border-white/10', text: 'text-white', dot: 'bg-rose-500', label: 'Rose', glow: '' },
  { bg: 'bg-gradient-to-br from-[#6d28d9] to-[#3b1568] border-white/10', text: 'text-white', dot: 'bg-violet-500', label: 'Violet', glow: '' },
  { bg: 'bg-gradient-to-br from-[#0e7490] to-[#155e75] border-white/10', text: 'text-white', dot: 'bg-cyan-500', label: 'Cyan', glow: '' },
  { bg: 'bg-gradient-to-br from-[#4338ca] to-[#1e1b4b] border-white/10', text: 'text-white', dot: 'bg-indigo-500', label: 'Indigo', glow: '' },
];

// ─── Google Calendar color resolution ────────────────────────
// Each connected calendar in Google has an assigned hex color (returned by
// Nylas as `hex_color` / surfaced as `background_color` on our Calendar type).
// We honor that hex so events on /dashboard match Google Calendar's web UI.
// Per-event color overrides (Banana, Sage, etc.) are not exposed by Nylas v3,
// so we fall back to the calendar's color, which matches Google's render
// hierarchy when no per-event color is set.
export interface CalendarColorInfo { background: string; foreground?: string }
export type CalendarColorMap = Map<string, CalendarColorInfo>;

/**
 * Google Calendar's per-event color palette (the "Tomato / Banana / Sage..."
 * swatches shown when you color an individual event in Gmail's calendar).
 * Keyed by Google's colorId.
 */
const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', // Lavender
  '2': '#33b679', // Sage
  '3': '#8e24aa', // Grape
  '4': '#e67c73', // Flamingo
  '5': '#f6bf26', // Banana
  '6': '#f4511e', // Tangerine
  '7': '#039be5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d50000', // Tomato
};

/** Resolves the event's own Google color (hex) if one was set on the event. */
function getEventOwnHex(event: CalendarEvent): string | null {
  const raw = (event as CalendarEvent & { hex_color?: string | null }).hex_color;
  if (raw && /^#?[0-9a-f]{3,8}$/i.test(raw)) return raw.startsWith('#') ? raw : `#${raw}`;
  if (event.color_id && GOOGLE_EVENT_COLORS[String(event.color_id)]) {
    return GOOGLE_EVENT_COLORS[String(event.color_id)];
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return `rgba(99,102,241,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return '#0c4e54';
  const f = 1 - Math.min(Math.max(amount, 0), 1);
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

/** Inline style derived from the event's owning calendar's Google hex color. */
export function getEventColorStyle(
  event: CalendarEvent,
  calendarColors: CalendarColorMap,
): React.CSSProperties | null {
  // Per-event color set in Google wins over the calendar's default color.
  const bg = getEventOwnHex(event) || calendarColors.get(event.calendar_id)?.background;
  if (!bg) return null;
  return {
    // Opaque gradient — never transparent. Mirrors the teal palette
    // treatment while preserving the user's per-calendar color identity.
    background: `linear-gradient(135deg, ${bg} 0%, ${darkenHex(bg, 0.45)} 100%)`,
    backgroundColor: bg,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    color: '#ffffff',
    opacity: 1,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  };
}

const TIMEZONE_OPTIONS = [
  { label: 'EST', value: 'America/New_York' },
  { label: 'CST', value: 'America/Chicago' },
  { label: 'MST', value: 'America/Denver' },
  { label: 'PST', value: 'America/Los_Angeles' },
  { label: 'UTC', value: 'UTC' },
  { label: 'GMT', value: 'Europe/London' },
  { label: 'CET', value: 'Europe/Berlin' },
  { label: 'JST', value: 'Asia/Tokyo' },
];

const KEYBOARD_SHORTCUTS = [
  { key: 'N', description: 'New Event' },
  { key: 'T', description: 'Jump to Today' },
  { key: '←/→', description: 'Navigate period' },
  { key: 'D', description: 'Day view' },
  { key: 'W', description: 'Week view' },
  { key: 'M', description: 'Month view' },
  { key: 'A', description: 'Agenda view' },
  { key: 'Esc', description: 'Close modal/popover' },
];

function getColorIndex(event: CalendarEvent, idx: number): number {
  if (event.color_id) return parseInt(event.color_id, 10) % EVENT_PALETTE.length;
  return idx % EVENT_PALETTE.length;
}

function getEventColorClass(event: CalendarEvent, idx: number): string {
  const c = EVENT_PALETTE[getColorIndex(event, idx)];
  return `${c.bg} ${c.text} ${c.glow}`;
}

/**
 * Returns the dot style + class for the small color swatch shown next to
 * events in agenda/upcoming/search lists. Prefers the calendar's Google
 * hex color; falls back to the palette dot class.
 */
function getEventDot(
  event: CalendarEvent,
  idx: number,
  calendarColors: CalendarColorMap,
): { className: string; style?: React.CSSProperties } {
  const bg = getEventOwnHex(event) || calendarColors.get(event.calendar_id)?.background;
  if (bg) return { className: '', style: { backgroundColor: bg } };
  return { className: EVENT_PALETTE[getColorIndex(event, idx)].dot };
}

function getLocalTimezoneAbbr(): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' });
    const parts = fmt.formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || 'Local';
  } catch { return 'Local'; }
}

function getVideoProvider(url: string): { icon: string; label: string } | null {
  if (!url) return null;
  if (url.includes('zoom.us')) return { icon: '📹', label: 'Zoom' };
  if (url.includes('meet.google.com')) return { icon: '🟢', label: 'Google Meet' };
  if (url.includes('teams.microsoft.com')) return { icon: '🟣', label: 'Teams' };
  if (url.includes('webex.com')) return { icon: '🔵', label: 'Webex' };
  return null;
}

// ─── Deal matching for event tagging ─────────────────────────
interface DealMatch {
  id: string;
  name: string;
  stage: string;
}

function useDealMatches(events: CalendarEvent[]) {
  const [deals, setDeals] = useState<{ id: string; name: string; stage: string; contacts: string[] }[]>([]);

  useEffect(() => {
    const fetchDeals = async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, company, stage, pipeline_id')
        .limit(200);
      if (naitivePipelineId) {
        query = query.neq('pipeline_id', naitivePipelineId);
      }
      const { data } = await query;
      if (data) {
        setDeals(data.map(d => ({ id: d.id, name: d.company, stage: d.stage, contacts: [] as string[] })));
      }
    };
    fetchDeals();
  }, []);

  const matchEventToDeal = useCallback((event: CalendarEvent): DealMatch | null => {
    if (!deals.length) return null;
    const summaryLower = event.summary.toLowerCase();
    const descLower = (event.description || '').toLowerCase();

    for (const deal of deals) {
      const dealNameLower = deal.name.toLowerCase();
      if (dealNameLower.length > 3 && (summaryLower.includes(dealNameLower) || descLower.includes(dealNameLower))) {
        return { id: deal.id, name: deal.name, stage: deal.stage };
      }
    }
    return null;
  }, [deals]);

  return { matchEventToDeal };
}

// ─── Mock events ─────────────────────────────────────────────
// (Mock/sample events were removed. The Calendar widget now always renders
// the live calendar — with an explicit loading / empty / error state — so
// users never see fake events flash in.)

// ─── Event Detail Popover with AI Research ──────────────────
function EventDetailPopover({
  event,
  colorClass,
  onClose,
  dealMatch,
  onEdit,
}: {
  event: CalendarEvent;
  colorClass: string;
  onClose: () => void;
  dealMatch?: DealMatch | null;
  onEdit?: (event: CalendarEvent) => void;
}) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const hasVideo = !!(event.hangout_link || event.conference_data);
  const attendees = event.attendees?.filter(a => !a.self) || [];
  const [showResearch, setShowResearch] = useState(false);
  const [research, setResearch] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const videoLink = event.hangout_link || '';
  const videoProvider = getVideoProvider(videoLink);

  const runResearch = async () => {
    setShowResearch(true);
    setIsResearching(true);
    setResearch(null);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-event-research', {
        body: {
          event: {
            summary: event.summary,
            description: event.description,
            location: event.location,
            start: event.start,
            end: event.end,
            attendees: event.attendees?.map(a => ({
              name: a.display_name,
              email: a.email,
              status: a.response_status,
              is_organizer: a.organizer,
              is_self: a.self,
            })),
            has_video: hasVideo,
          },
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        setResearch(data.result);
      }
    } catch (err: any) {
      console.error('Research error:', err);
      toast.error('Failed to generate research briefing');
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60" onClick={onClose}>
      <div
        className={cn(
          "popup-shell-surface glass-border-soft absolute z-[61] rounded-2xl border-transparent shadow-2xl shadow-black/20 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden transition-all",
          showResearch ? "w-[680px] max-h-[80vh]" : "w-[340px]"
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className={cn('h-2 w-full', colorClass)} />
        <div className="flex">
          {/* Left: Event Details */}
          <div className={cn("p-4 space-y-3", showResearch ? "w-[300px] border-r shrink-0" : "w-full")}>
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-foreground pr-6">{event.summary}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1 -mr-1" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {dealMatch && (
              <Badge variant="secondary" className="gap-1.5 text-[10px] h-5 w-fit bg-primary/10 text-primary border-primary/20">
                <Briefcase className="h-3 w-3" />
                {dealMatch.name} · {dealMatch.stage}
              </Badge>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {event.all_day ? (
                <span>All day · {format(start, 'EEEE, MMMM d')}</span>
              ) : (
                <span>{format(start, 'EEEE, MMMM d')} · {format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
              )}
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{event.location}</span>
              </div>
            )}
            {hasVideo && (
              <Button size="sm" className="w-full gap-2 text-xs" onClick={() => window.open(videoLink || '', '_blank')}>
                {videoProvider ? (
                  <span className="text-sm">{videoProvider.icon}</span>
                ) : (
                  <Video className="h-3.5 w-3.5" />
                )}
                {videoProvider ? `Join ${videoProvider.label}` : 'Join video call'}
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>
            )}
            {attendees.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" />{attendees.length} guest{attendees.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {attendees.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                        {(a.display_name || a.email).charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{a.display_name || a.email}</span>
                      {a.response_status === 'tentative' && <Badge variant="outline" className="text-[9px] h-4 px-1">Maybe</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {event.description && (
              <>
                <Separator />
                <div className="relative">
                  <p className={cn(
                    "text-xs text-muted-foreground whitespace-pre-wrap",
                    !descriptionExpanded && "line-clamp-3"
                  )}>
                    {event.description}
                  </p>
                  {event.description.length > 150 && !descriptionExpanded && (
                    <button
                      onClick={() => setDescriptionExpanded(true)}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Show more
                    </button>
                  )}
                  {descriptionExpanded && event.description.length > 150 && (
                    <button
                      onClick={() => setDescriptionExpanded(false)}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Action Buttons */}
            <Separator />
            <div className="flex gap-2">
              {onEdit && (
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => onEdit(event)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="flex-1 gap-2 text-xs"
                      onClick={runResearch}
                      disabled={isResearching}
                    >
                      {isResearching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Brain className="h-3.5 w-3.5" />
                      )}
                      {isResearching ? 'Researching...' : showResearch ? 'Refresh' : 'AI Intel'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                    Search email history for attendee and company context. Find who introduced you, prior conversations, related threads, and internal context tied to meeting participants and their company.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Right: AI Research Panel */}
          {showResearch && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="p-3 border-b bg-muted/30 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Meeting Intelligence</span>
              </div>
              <ScrollArea className="h-[calc(80vh-90px)]">
                <div className="p-4">
                  {isResearching ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Searching email history & researching attendees…</p>
                      <p className="text-xs text-muted-foreground/60">Scanning your inbox for prior threads, intros, and adjacent context</p>
                    </div>
                  ) : research ? (
                    <div className="prose prose-sm max-w-none text-foreground/90 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5 [&_li]:text-xs [&_p]:my-1 [&_p]:text-xs [&_strong]:text-foreground [&_hr]:my-3">
                      <ReactMarkdown>{research}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                      <Brain className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Click "AI Meeting Intel" to research</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Time-grid event block ───────────────────────────────────
function TimeGridEvent({
  event,
  colorClass,
  colorStyle,
  onClick,
  style,
}: {
  event: CalendarEvent;
  colorClass: string;
  colorStyle?: React.CSSProperties | null;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const durationMin = differenceInMinutes(end, start);
  const hasVideo = !!(event.hangout_link || event.conference_data);

  const tooltipContent = (
    <div className="space-y-1 max-w-[220px]">
      <p className="font-semibold text-xs">{event.summary}</p>
      <p className="text-[10px] text-muted-foreground">
        {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
      </p>
      {event.location && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{event.location}</p>
      )}
      {event.attendees && event.attendees.filter(a => !a.self).length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Users className="h-2.5 w-2.5" />{event.attendees.filter(a => !a.self).map(a => a.display_name || a.email).slice(0, 3).join(', ')}
          {event.attendees.filter(a => !a.self).length > 3 && ` +${event.attendees.filter(a => !a.self).length - 3}`}
        </p>
      )}
      {hasVideo && (
        <p className="text-[10px] text-primary flex items-center gap-1"><Video className="h-2.5 w-2.5" />Video call</p>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'absolute left-1 right-1 rounded-[2px] px-2 py-1 text-left overflow-hidden cursor-pointer transition-all z-[2]',
              'border shadow-lg',
              'hover:shadow-xl hover:scale-[1.02] hover:brightness-110',
              !colorStyle && colorClass,
            )}
            style={{
              ...style,
              ...(colorStyle || {}),
              background: undefined,
            }}
          >
            <p className="text-[11px] font-semibold leading-tight truncate">{event.summary}</p>
            {durationMin >= 45 && (
              <p className="text-[10px] opacity-80 leading-tight mt-0.5">
                {format(start, 'h:mm')} – {format(end, 'h:mm a')}
              </p>
            )}
            {durationMin >= 60 && hasVideo && (
              <div className="flex items-center gap-1 mt-0.5">
                <Video className="h-2.5 w-2.5 opacity-70" />
                <span className="text-[9px] opacity-70">Video call</span>
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-2.5">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Current time indicator ──────────────────────────────────
function CurrentTimeIndicator() {
  const [, setTick] = useState(0);
  // Visibility-aware: don't tick while the tab is hidden.
  useVisibilityAwareInterval(() => setTick((t) => t + 1), 60000);

  const nowTime = new Date();
  const minutes = getHours(nowTime) * 60 + getMinutes(nowTime);
  const top = (minutes / 60) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-[5] pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full bg-destructive -ml-1.5 shadow-[0_0_6px_hsl(var(--destructive)/0.5)]" />
        <div className="flex-1 h-[2px] bg-destructive shadow-[0_0_4px_hsl(var(--destructive)/0.3)]" />
      </div>
    </div>
  );
}

// ─── Mini Calendar Sidebar ───────────────────────────────────
function MiniCalendar({
  currentDate,
  onDateSelect,
  events,
  calendars,
  calendarColors,
  hiddenCalendarIds,
  onToggleCalendar,
  onOnlyCalendar,
  onShowAllCalendars,
}: {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
  calendars: Calendar[];
  calendarColors: CalendarColorMap;
  hiddenCalendarIds: Set<string>;
  onToggleCalendar: (id: string) => void;
  onOnlyCalendar: (id: string) => void;
  onShowAllCalendars: () => void;
}) {
  const [miniMonth, setMiniMonth] = useState(startOfMonth(currentDate));

  useEffect(() => {
    setMiniMonth(startOfMonth(currentDate));
  }, [currentDate]);

  const calStart = startOfWeek(startOfMonth(miniMonth));
  const calEnd = endOfWeek(endOfMonth(miniMonth));
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const getEventCountForDay = (day: Date) => events.filter(e => isSameDay(parseISO(e.start), day)).length;

  const getDensityClass = (count: number) => {
    if (count === 0) return '';
    if (count === 1) return 'bg-primary/20';
    if (count === 2) return 'bg-primary/35';
    if (count <= 4) return 'bg-primary/50';
    return 'bg-primary/70';
  };

  return (
    <div className="space-y-3">
      {/* Mini month header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{format(miniMonth, 'MMMM yyyy')}</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Days */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map(day => {
            const inMonth = isSameMonth(day, miniMonth);
            const selected = isSameDay(day, currentDate);
            const today = isToday(day);
            const eventCount = getEventCountForDay(day);
            const densityClass = getDensityClass(eventCount);

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  'h-7 w-7 mx-auto flex flex-col items-center justify-center rounded-full text-[11px] transition-all relative',
                  !inMonth && 'opacity-30',
                  selected && 'bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary)/0.4)]',
                  !selected && today && 'text-primary font-bold',
                  !selected && !today && eventCount > 0 && densityClass,
                  !selected && !today && 'text-foreground hover:bg-muted',
                )}
              >
                {format(day, 'd')}
                {eventCount > 0 && !selected && (
                  <div className="absolute -bottom-0.5 flex items-center gap-px">
                    {Array.from({ length: Math.min(eventCount, 3) }).map((_, i) => (
                      <div key={i} className={cn('h-[3px] w-[3px] rounded-full', eventCount >= 4 ? 'bg-primary' : 'bg-primary/70')} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}

      <Separator />

      {/* Calendar legend — connected calendars with their Google-assigned colors */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Calendars</p>
          {hiddenCalendarIds.size > 0 && (
            <button
              type="button"
              onClick={onShowAllCalendars}
              className="text-[10px] text-primary hover:underline"
            >
              Show all
            </button>
          )}
        </div>
        <div className="space-y-1">
          {calendars.length > 0 ? (
            calendars.map(cal => {
              const hex = calendarColors.get(cal.id)?.background;
              const hidden = hiddenCalendarIds.has(cal.id);
              return (
                <div key={cal.id} className="group flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleCalendar(cal.id)}
                    title={hidden ? `Show ${cal.summary}` : `Hide ${cal.summary}`}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left rounded px-1 py-0.5 hover:bg-muted/60 transition-colors"
                  >
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full shrink-0 border',
                        !hex && !hidden && 'bg-primary',
                        hidden ? 'bg-transparent border-muted-foreground/60' : 'border-transparent',
                      )}
                      style={hex && !hidden ? { backgroundColor: hex } : undefined}
                    />
                    <span
                      className={cn(
                        'text-[11px] truncate',
                        hidden ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground',
                      )}
                      title={cal.summary}
                    >
                      {cal.primary ? `${cal.summary} · Primary` : cal.summary}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOnlyCalendar(cal.id)}
                    className="shrink-0 text-[9px] uppercase tracking-wide text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                    title="Show only this calendar"
                  >
                    Only
                  </button>
                </div>
              );
            })
          ) : (
            EVENT_PALETTE.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={cn('h-2.5 w-2.5 rounded-full', c.dot)} />
                <span className="text-[11px] text-muted-foreground">{c.label}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day Column ──────────────────────────────────────────────
function DayColumn({
  date,
  events: dayEvents,
  onEventClick,
  showDayLabel,
  onSlotClick,
  calendarColors,
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  showDayLabel: boolean;
  onSlotClick?: (date: Date, hour: number) => void;
  calendarColors: CalendarColorMap;
}) {
  const timedEvents = dayEvents.filter(e => !e.all_day);
  const today = isToday(date);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT);
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 2) * 30;
    const clickedHour = Math.max(0, Math.min(23, hour));
    onSlotClick(date, clickedHour + minutes / 60);
  };

  return (
    <div className={cn(
      'relative flex-1 min-w-0 cal-grid-l first:border-l-0',
      today && 'bg-primary/[0.04]',
    )}>
      {showDayLabel && (
        <div className={cn(
          'sticky top-0 z-10 backdrop-blur-sm cal-grid-b text-center py-2',
          today ? 'bg-primary/[0.06]' : 'bg-background/95',
        )}>
          <p className={cn(
            'text-[10px] uppercase tracking-wider font-medium',
            today ? 'text-primary' : 'text-muted-foreground',
          )}>{format(date, 'EEE')}</p>
          <p className={cn('text-lg font-semibold leading-tight', today ? 'text-primary' : 'text-foreground')}>
            {format(date, 'd')}
          </p>
          {/* Reserve identical vertical space across all day headers so today does not push the grid down */}
          <div className="mx-auto mt-0.5 h-1 w-1 rounded-full" aria-hidden style={{ background: today ? 'hsl(var(--primary))' : 'transparent' }} />
        </div>
      )}
      <div className="relative cursor-pointer" style={{ height: HOURS.length * HOUR_HEIGHT }} onClick={handleGridClick}>
        {HOURS.map(h => (
          <div
            key={h}
            className={cn(
              'absolute left-0 right-0 hover:bg-primary/5 transition-colors',
              h !== 0 && 'cal-grid-t',
            )}
            style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          />
        ))}
        {today && <CurrentTimeIndicator />}
        {timedEvents.map((event, idx) => {
          const start = parseISO(event.start);
          const end = parseISO(event.end);
          const startMin = getHours(start) * 60 + getMinutes(start);
          const endMin = getHours(end) * 60 + getMinutes(end);
          const duration = Math.max(endMin - startMin, 15);
          const top = (startMin / 60) * HOUR_HEIGHT;
          const height = (duration / 60) * HOUR_HEIGHT;

          return (
            <TimeGridEvent
              key={event.id}
              event={event}
              colorClass={getEventColorClass(event, idx)}
              colorStyle={getEventColorStyle(event, calendarColors)}
              onClick={() => onEventClick(event)}
              style={{ top, height: Math.max(height, MIN_EVENT_HEIGHT), minHeight: MIN_EVENT_HEIGHT }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────
function MonthView({
  currentDate,
  events: allEvents,
  onEventClick,
  onDayClick,
  calendarColors,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
  calendarColors: CalendarColorMap;
}) {
  const [morePopoverDay, setMorePopoverDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const eventsByDay = useEventsByDay(allEvents);
  const getEventsForDay = (day: Date) => eventsByDay.get(dayKey(day)) ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 cal-grid-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-rows-[repeat(auto-fill,1fr)]">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 cal-grid-b last:border-b-0 min-h-[80px]">
            {week.map(day => {
              const dayEvents = getEventsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const isMoreOpen = morePopoverDay && isSameDay(morePopoverDay, day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn('cal-grid-r last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-muted/30', !inMonth && 'opacity-40')}
                  onClick={() => onDayClick(day)}
                >
                  <p className={cn(
                    'text-xs font-medium mb-0.5 h-6 w-6 flex items-center justify-center rounded-full mx-auto',
                    isToday(day) && 'bg-primary text-primary-foreground',
                    !isToday(day) && 'text-foreground',
                  )}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event, idx) => (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        className={cn(
                          'w-full text-left rounded-[2px] px-1 py-0.5 text-[10px] leading-tight truncate border',
                          !calendarColors.get(event.calendar_id)?.background && getEventColorClass(event, idx),
                        )}
                        style={getEventColorStyle(event, calendarColors) || undefined}
                      >
                        {!event.all_day && <span className="opacity-80">{format(parseISO(event.start), 'h:mm')} </span>}
                        {event.summary}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <Popover open={!!isMoreOpen} onOpenChange={(open) => setMorePopoverDay(open ? day : null)}>
                        <PopoverTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMorePopoverDay(day); }}
                            className="text-[9px] text-primary hover:underline text-center w-full"
                          >
                            +{dayEvents.length - 3} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start" side="bottom" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-foreground mb-2">{format(day, 'EEEE, MMMM d')}</p>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {dayEvents.map((event, idx) => (
                              <button
                                key={event.id}
                                onClick={() => { onEventClick(event); setMorePopoverDay(null); }}
                                className={cn(
                                  'w-full text-left rounded-[2px] px-2 py-1.5 text-xs truncate hover:brightness-110 border',
                                  !calendarColors.get(event.calendar_id)?.background && getEventColorClass(event, idx),
                                )}
                                style={getEventColorStyle(event, calendarColors) || undefined}
                              >
                                {!event.all_day && <span className="opacity-80 mr-1">{format(parseISO(event.start), 'h:mm a')}</span>}
                                {event.summary}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agenda View ─────────────────────────────────────────────
function AgendaView({
  currentDate,
  events: allEvents,
  onEventClick,
  calendarColors,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  calendarColors: CalendarColorMap;
}) {
  const agendaDays = eachDayOfInterval({
    start: currentDate,
    end: addDays(currentDate, 13),
  });

  const eventsByDay = useEventsByDay(allEvents);

  return (
    <ScrollArea className="flex-1">
      <div>
        {agendaDays.map((day, dayIdx) => {
          const dayEvents = eventsByDay.get(dayKey(day)) ?? [];

          return (
            <div key={day.toISOString()}>
              {/* Full-width day divider */}
              <div className={cn(
                "flex items-center gap-3 px-4 py-2.5 cal-grid-b bg-muted/30",
                isToday(day) && "bg-primary/5"
              )}>
                <div className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                  isToday(day) ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  <span className="text-sm font-bold">{format(day, 'd')}</span>
                </div>
                <div>
                  <p className={cn(
                    'text-sm font-semibold',
                    isToday(day) ? 'text-primary' : 'text-foreground'
                  )}>
                    {format(day, 'EEEE')}
                    {isToday(day) && <span className="text-xs font-normal ml-2 text-primary/80">Today</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(day, 'MMMM d, yyyy')}</p>
                </div>
                {dayEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">{dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}</Badge>
                )}
              </div>

              {/* Events */}
              <div className="py-1 px-3">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 py-3 pl-14">No events</p>
                ) : (
                  dayEvents.map((event, idx) => {
                    const start = parseISO(event.start);
                    const end = parseISO(event.end);
                    const dot = getEventDot(event, idx, calendarColors);
                    const hasVideo = !!(event.hangout_link || event.conference_data);
                    const attendeeCount = event.attendees?.filter(a => !a.self).length || 0;

                    return (
                      <button
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className={cn('h-full w-1 rounded-full self-stretch min-h-[36px]', dot.className)} style={dot.style} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {event.summary}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {event.all_day ? (
                              <span>All day</span>
                            ) : (
                              <span>{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />{event.location}
                              </span>
                            )}
                            {hasVideo && (
                              <span className="flex items-center gap-1">
                                <Video className="h-3 w-3" />Video
                              </span>
                            )}
                            {attendeeCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />{attendeeCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ─── All-day events bar ──────────────────────────────────────
function AllDayBar({
  events,
  onEventClick,
  calendarColors,
}: {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  calendarColors: CalendarColorMap;
}) {
  if (events.length === 0) return null;
  return (
    <div className="cal-grid-b px-14 py-1.5 flex flex-wrap gap-1">
      {events.map((event, idx) => (
        <button
          key={event.id}
          onClick={() => onEventClick(event)}
          className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-[2px] truncate max-w-[180px] border',
            !calendarColors.get(event.calendar_id)?.background && getEventColorClass(event, idx),
          )}
          style={getEventColorStyle(event, calendarColors) || undefined}
        >
          {event.summary}
        </button>
      ))}
    </div>
  );
}

// ─── AI Insights Panel ──────────────────────────────────────
type AIAction = 'daily_summary' | 'meeting_prep' | 'smart_schedule' | 'conflict_check';

const AI_ACTIONS: { id: AIAction; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'daily_summary', label: 'Day Summary', icon: <FileText className="h-3.5 w-3.5" />, description: 'AI overview of your day' },
  { id: 'meeting_prep', label: 'Meeting Prep', icon: <Brain className="h-3.5 w-3.5" />, description: 'Briefings for meetings' },
  { id: 'smart_schedule', label: 'Schedule Tips', icon: <Lightbulb className="h-3.5 w-3.5" />, description: 'Optimization suggestions' },
  { id: 'conflict_check', label: 'Conflicts', icon: <AlertTriangle className="h-3.5 w-3.5" />, description: 'Detect scheduling issues' },
];

function CalendarAIPanel({
  events,
  currentDate,
}: {
  events: CalendarEvent[];
  currentDate: Date;
}) {
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAI = async (action: AIAction) => {
    setActiveAction(action);
    setIsLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-ai', {
        body: {
          action,
          events: events.map(e => ({
            summary: e.summary,
            start: e.start,
            end: e.end,
            location: e.location,
            all_day: e.all_day,
            attendees: e.attendees?.map(a => ({ name: a.display_name, email: a.email, status: a.response_status })),
            has_video: !!(e.hangout_link || e.conference_data),
            description: e.description,
          })),
          current_date: format(currentDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setResult(null);
      } else {
        setResult(data.result);
      }
    } catch (err: any) {
      console.error('Calendar AI error:', err);
      toast.error('Failed to generate insights');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Insights</p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {AI_ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => runAI(a.id)}
            disabled={isLoading}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-colors',
              activeAction === a.id && result ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
              isLoading && activeAction === a.id && 'opacity-70',
            )}
          >
            {isLoading && activeAction === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.icon}
            <span className="text-[10px] font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
          <ScrollArea className="max-h-[280px]">
            <div className="prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed text-foreground/90 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_ul]:my-0.5 [&_ul]:pl-3 [&_li]:my-0 [&_p]:my-0.5 [&_strong]:text-foreground">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Keyboard Shortcuts Overlay ──────────────────────────────
function KeyboardShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[320px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {KEYBOARD_SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.description}</span>
              <kbd className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded border text-foreground">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export function FullCalendarView({ open, onOpenChange }: FullCalendarViewProps) {
  const {
    events: liveEvents,
    status: calendarStatus,
    isStatusLoading,
    listEvents,
    isLoading: calendarLoading,
    error: calendarError,
    createEvent,
    updateEvent,
    deleteEvent,
    calendars: liveCalendars,
    listCalendars,
    checkStatus,
  } = useGoogleCalendar();
  const { user } = useAuth();
  const is5thLineUser = !!user?.email && user.email.toLowerCase().endsWith('@5thline.co');
  const [view, setView] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [slotDefaults, setSlotDefaults] = useState<{ start: string; end: string } | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [displayTimezone, setDisplayTimezone] = useState(getLocalTimezoneAbbr());
  const [showTzDropdown, setShowTzDropdown] = useState(false);

  // ─── Teammate calendar viewer ──────────────────────────────
  // When set, we render this teammate's events (read-only) instead of
  // the signed-in user's calendar.
  const [viewingTeammateId, setViewingTeammateId] = useState<string | null>(null);
  const [teammatePickerOpen, setTeammatePickerOpen] = useState(false);
  const { data: teammates = [], isLoading: teammatesLoading } = useTeammateList(open);
  const viewingTeammate = useMemo(
    () => teammates.find((t) => t.user_id === viewingTeammateId) || null,
    [teammates, viewingTeammateId],
  );

  const timeGridScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount / view change
  useEffect(() => {
    if (!open) return;
    if (view !== 'day' && view !== 'week') return;

    const timer = setTimeout(() => {
      const scrollEl = timeGridScrollRef.current;
      if (!scrollEl) return;
      // Find the Radix ScrollArea viewport
      const viewport = scrollEl.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      const target = viewport || scrollEl;
      const nowHour = new Date();
      const currentMinutes = getHours(nowHour) * 60 + getMinutes(nowHour);
      const scrollTo = (currentMinutes / 60) * HOUR_HEIGHT - target.clientHeight / 2;
      target.scrollTop = Math.max(0, scrollTo);
    }, 100);
    return () => clearTimeout(timer);
  }, [open, view, currentDate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault();
          handleNewEvent();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          navigate('today');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          navigate('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigate('next');
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          setView('day');
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          setView('week');
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setView('month');
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          setView('agenda');
          break;
        case 'Escape':
          if (showShortcuts) { setShowShortcuts(false); break; }
          if (selectedEvent) { setSelectedEvent(null); break; }
          if (eventDialogOpen) { setEventDialogOpen(false); break; }
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(s => !s);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, showShortcuts, selectedEvent, eventDialogOpen]);

  const refreshEvents = useCallback(() => {
    if (!calendarStatus?.connected) return;
    let timeMin: Date, timeMax: Date;
    if (view === 'day') { timeMin = startOfDay(currentDate); timeMax = endOfDay(currentDate); }
    else if (view === 'week') { timeMin = startOfWeek(currentDate); timeMax = endOfWeek(currentDate); }
    else if (view === 'agenda') { timeMin = startOfDay(currentDate); timeMax = endOfDay(addDays(currentDate, 13)); }
    else { timeMin = startOfWeek(startOfMonth(currentDate)); timeMax = endOfWeek(endOfMonth(currentDate)); }
    listEvents({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), maxResults: 200 });
  }, [calendarStatus?.connected, view, currentDate, listEvents]);

  useEffect(() => {
    if (!open) return;
    refreshEvents();
    // Visibility-gated 3-min refresh: skips ticks when the tab is hidden,
    // re-fires on focus so a backgrounded dialog doesn't keep hitting the
    // calendar API.
    return startVisibilityAwareInterval(refreshEvents, 3 * 60 * 1000);
  }, [open, refreshEvents]);

  // Fetch the user's connected calendars once when the dialog opens so we
  // can color events using each calendar's Google-assigned hex color.
  useEffect(() => {
    if (!open || !calendarStatus?.connected) return;
    if (liveCalendars.length === 0) {
      listCalendars();
    }
  }, [open, calendarStatus?.connected, liveCalendars.length, listCalendars]);

  // Build a calendar_id -> {background, foreground} hex map. When events come
  // from Google via Nylas, each event's calendar_id resolves to that
  // calendar's color (matches Google Calendar's default render hierarchy).
  const calendarColors = useMemo<CalendarColorMap>(() => {
    const map: CalendarColorMap = new Map();
    liveCalendars.forEach(c => {
      if (c.background_color) {
        map.set(c.id, {
          background: c.background_color,
          foreground: c.foreground_color,
        });
      }
    });
    return map;
  }, [liveCalendars]);

  const handleSaveEvent = useCallback(async (eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  }) => {
    setIsMutating(true);
    try {
      if (editingEvent?.id) {
        await updateEvent(editingEvent.id, eventData, editingEvent.calendar_id);
        toast.success('Event updated');
      } else {
        await createEvent(eventData);
        toast.success('Event created');
      }
      setEventDialogOpen(false);
      setEditingEvent(null);
      refreshEvents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save event');
    } finally {
      setIsMutating(false);
    }
  }, [editingEvent, createEvent, updateEvent, refreshEvents]);

  const handleDeleteEvent = useCallback(async () => {
    if (!editingEvent?.id) return;
    setDeleteConfirmOpen(true);
  }, [editingEvent]);

  const confirmDelete = useCallback(async () => {
    if (!editingEvent?.id) return;
    setIsMutating(true);
    try {
      await deleteEvent(editingEvent.id, editingEvent.calendar_id);
      toast.success('Event deleted');
      setEventDialogOpen(false);
      setEditingEvent(null);
      setSelectedEvent(null);
      setDeleteConfirmOpen(false);
      refreshEvents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete event');
    } finally {
      setIsMutating(false);
    }
  }, [editingEvent, deleteEvent, refreshEvents]);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    if (viewingTeammateId) {
      toast.info("You're viewing a teammate's calendar (read-only).");
      return;
    }
    setEditingEvent(event);
    setEventDialogOpen(true);
    setSelectedEvent(null);
  }, [viewingTeammateId]);

  const handleNewEvent = useCallback(() => {
    if (viewingTeammateId) {
      toast.info("You're viewing a teammate's calendar (read-only).");
      return;
    }
    setEditingEvent(null);
    setSlotDefaults(null);
    setEventDialogOpen(true);
  }, [viewingTeammateId]);

  const handleSlotClick = useCallback((date: Date, hour: number) => {
    if (!calendarStatus?.connected) return;
    if (viewingTeammateId) {
      toast.info("You're viewing a teammate's calendar (read-only).");
      return;
    }
    const startHour = Math.floor(hour);
    const startMin = (hour % 1) >= 0.5 ? 30 : 0;
    const startDate = new Date(date);
    startDate.setHours(startHour, startMin, 0, 0);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    setEditingEvent(null);
    setSlotDefaults({
      start: format(startDate, "yyyy-MM-dd'T'HH:mm:ss"),
      end: format(endDate, "yyyy-MM-dd'T'HH:mm:ss"),
    });
    setEventDialogOpen(true);
  }, [calendarStatus?.connected, viewingTeammateId]);

  // Compute the visible time range so we can fetch a teammate's calendar
  // for the same window when the user picks one in the selector.
  const teammateRange = useMemo(() => {
    let tMin: Date, tMax: Date;
    if (view === 'day') { tMin = startOfDay(currentDate); tMax = endOfDay(currentDate); }
    else if (view === 'week') { tMin = startOfWeek(currentDate); tMax = endOfWeek(currentDate); }
    else if (view === 'agenda' || view === 'intel') {
      tMin = startOfDay(currentDate); tMax = endOfDay(addDays(currentDate, 13));
    } else { tMin = startOfWeek(startOfMonth(currentDate)); tMax = endOfWeek(endOfMonth(currentDate)); }
    return { timeMin: tMin.toISOString(), timeMax: tMax.toISOString() };
  }, [view, currentDate]);

  const {
    data: teammateData,
    isFetching: teammateLoading,
    error: teammateError,
  } = useTeammateEvents({
    userId: viewingTeammateId,
    timeMin: teammateRange.timeMin,
    timeMax: teammateRange.timeMax,
    enabled: open && !!viewingTeammateId,
  });

  // Always render the live calendar — never fall back to mock/sample events.
  // The empty / loading / error states below handle the no-data case
  // explicitly so users never see fake events flash in.
  const allEvents: CalendarEvent[] = viewingTeammateId
    ? (teammateData?.events ?? [])
    : liveEvents;

  // Overlay state machine. We show the overlay when:
  //  • we're still resolving auth/status, OR
  //  • the calendar is connected, we have no cached events yet, and a
  //    request is in flight, OR
  //  • we hit a hard error with no cached data to fall back to, OR
  //  • the user is not connected at all (prompt to connect).
  const showInitialLoading =
    (isStatusLoading && liveEvents.length === 0) ||
    (calendarStatus?.connected && calendarLoading && liveEvents.length === 0);
  const showError = !!calendarError && liveEvents.length === 0 && !calendarLoading;
  const showNotConnected =
    !isStatusLoading && !calendarStatus?.connected && !calendarLoading && !calendarError;
  const { matchEventToDeal } = useDealMatches(allEvents);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allEvents.filter(e =>
      e.summary.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.attendees?.some(a => a.display_name?.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    ).sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime()).slice(0, 10);
  }, [allEvents, searchQuery]);

  // Upcoming events (next 10 from now)
  const upcomingEvents = useMemo(() => {
    const nowDate = new Date();
    return allEvents
      .filter(e => !e.all_day && isAfter(parseISO(e.start), nowDate))
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
      .slice(0, 10);
  }, [allEvents]);

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') { setCurrentDate(new Date()); return; }
    const delta = direction === 'next' ? 1 : -1;
    setCurrentDate(d => {
      if (view === 'day') return delta > 0 ? addDays(d, 1) : subDays(d, 1);
      if (view === 'week') return delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      if (view === 'agenda') return delta > 0 ? addDays(d, 14) : subDays(d, 14);
      return delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    });
  }, [view]);

  const headerLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'EEEE, MMMM d, yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return ws.getMonth() === we.getMonth()
        ? `${format(ws, 'MMMM d')} – ${format(we, 'd, yyyy')}`
        : `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    if (view === 'agenda') {
      const end = addDays(currentDate, 13);
      return `${format(currentDate, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [currentDate, view]);

  const viewEvents = useMemo(() => {
    let start: Date, end: Date;
    if (view === 'day') { start = startOfDay(currentDate); end = endOfDay(currentDate); }
    else if (view === 'week') { start = startOfWeek(currentDate); end = endOfWeek(currentDate); }
    else if (view === 'agenda') { start = startOfDay(currentDate); end = endOfDay(addDays(currentDate, 13)); }
    else { start = startOfWeek(startOfMonth(currentDate)); end = endOfWeek(endOfMonth(currentDate)); }
    return allEvents.filter(e => {
      const es = parseISO(e.start);
      return es >= start && es <= end;
    });
  }, [allEvents, currentDate, view]);

  const allDayEvents = viewEvents.filter(e => e.all_day);
  const timedEvents = viewEvents.filter(e => !e.all_day);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [currentDate]);

  const getEventsForDay = useCallback((date: Date) =>
    timedEvents.filter(e => isSameDay(parseISO(e.start), date)),
  [timedEvents]);

  const handleDayClick = (date: Date) => { setCurrentDate(date); setView('day'); };

  const handleMiniDateSelect = (date: Date) => {
    setCurrentDate(date);
    // Always switch to day view when clicking mini calendar
    setView('day');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(useCarouselSwipeClass(), "popup-shell-surface max-w-[98vw] w-[1600px] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20")}>
        {/* ─── Toolbar ─── */}
        <div className="flex items-center gap-3 px-4 pr-12 py-3 glass-divider-b bg-background/60 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold text-foreground">Calendar</span>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => navigate('today')}>Today</Button>
          {calendarStatus?.connected && !viewingTeammateId && (
            <Button variant="liquid-glass" size="sm" className="gap-2" onClick={handleNewEvent}>
              <Plus className="h-4 w-4" />
              New Event
            </Button>
          )}

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('prev')}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('next')}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          <h2 className="text-sm font-medium text-foreground min-w-[200px]">{headerLabel}</h2>

          <div className="flex-1" />

          {/* Teammate calendar selector */}
          {calendarStatus?.connected && (
            <Popover open={teammatePickerOpen} onOpenChange={setTeammatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 gap-1.5 text-xs',
                    viewingTeammateId && 'border-primary/50 bg-primary/10 text-foreground',
                  )}
                  title="View a teammate's calendar"
                >
                  <UserCircle2 className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">
                    {viewingTeammate
                      ? `Viewing ${viewingTeammate.display_name || viewingTeammate.email}`
                      : 'My calendar'}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  View calendar
                </div>
                <div className="max-h-[320px] overflow-y-auto py-1">
                  <button
                    type="button"
                    onClick={() => { setViewingTeammateId(null); setTeammatePickerOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60',
                      !viewingTeammateId && 'bg-muted/40',
                    )}
                  >
                    <UserCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">My calendar</p>
                      <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    {!viewingTeammateId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                  <Separator className="my-1" />
                  {teammatesLoading && (
                    <div className="px-3 py-3 text-[11px] text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading teammates…
                    </div>
                  )}
                  {!teammatesLoading && teammates.length === 0 && (
                    <div className="px-3 py-3 text-[11px] text-muted-foreground">
                      No teammates with a connected calendar.
                    </div>
                  )}
                  {!teammatesLoading && teammates.map((t) => {
                    const active = viewingTeammateId === t.user_id;
                    return (
                      <button
                        key={t.user_id}
                        type="button"
                        onClick={() => { setViewingTeammateId(t.user_id); setTeammatePickerOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60',
                          active && 'bg-muted/40',
                        )}
                      >
                        <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {t.display_name || t.email}
                          </p>
                          {t.email && t.display_name && (
                            <p className="text-[10px] text-muted-foreground truncate">{t.email}</p>
                          )}
                        </div>
                        {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/60">
                  Read-only. Showing teammates in your organization who have connected their calendar.
                </div>
              </PopoverContent>
            </Popover>
          )}

          {viewingTeammateId && (
            <Badge variant="outline" className="text-[10px] h-5 border-primary/40 bg-primary/10 text-foreground">
              {teammateLoading ? 'Loading…' : teammateError ? 'Error' : 'Read-only'}
            </Badge>
          )}

          {/* Search */}
          {showSearch ? (
            <div className="relative">
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-48 text-xs pr-7"
                autoFocus
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute right-1 top-1" onClick={() => { setSearchQuery(''); setShowSearch(false); }}>
                <X className="h-3 w-3" />
              </Button>
              {searchQuery && searchResults.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-[300px] overflow-y-auto">
                  {searchResults.map((event, idx) => {
                    const start = parseISO(event.start);
                    const dealMatch = matchEventToDeal(event);
                    const dot = getEventDot(event, idx, calendarColors);
                    return (
                      <button
                        key={event.id}
                        className="w-full flex items-start gap-2 p-2.5 hover:bg-muted/50 text-left border-b border-border/50 last:border-b-0"
                        onClick={() => { setCurrentDate(start); setView('day'); setSelectedEvent(event); setSearchQuery(''); setShowSearch(false); }}
                      >
                        <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', dot.className)} style={dot.style} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
                          <p className="text-[10px] text-muted-foreground">{format(start, 'EEE, MMM d · h:mm a')}</p>
                          {event.location && <p className="text-[10px] text-muted-foreground truncate">{event.location}</p>}
                          {dealMatch && <p className="text-[10px] text-primary truncate">🏢 {dealMatch.name}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {searchQuery && searchResults.length === 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground">No events found</p>
                </div>
              )}
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSearch(true)}>
              <Search className="h-4 w-4" />
            </Button>
          )}

          {/* Connection-state badge — replaces the old "Demo Data" badge.
              We never render fake events anymore, so the only state worth
              communicating here is "not connected". */}
          {!isStatusLoading && !calendarStatus?.connected && (
            <Badge variant="outline" className="text-[10px] h-5 mr-2 border-transparent glass-border-soft">
              Not connected
            </Badge>
          )}

          {/* Keyboard shortcuts button */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowShortcuts(true)}>
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['day', 'week', 'month', 'agenda', 'intel'] as CalendarViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                  view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'agenda' ? (
                  <span className="flex items-center gap-1"><List className="h-3 w-3" />Agenda</span>
                ) : v === 'intel' ? (
                  <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />Agenda + Intel</span>
                ) : (
                  v
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Body with sidebar ─── */}
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* Mini calendar sidebar */}
          <div className="w-56 shrink-0 cal-grid-r bg-background/50 p-3 overflow-y-auto hidden md:block">
            <MiniCalendar
              currentDate={currentDate}
              onDateSelect={handleMiniDateSelect}
              events={allEvents}
              calendars={liveCalendars}
              calendarColors={calendarColors}
            />

            {/* Upcoming Events Widget */}
            {upcomingEvents.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Coming Up</p>
                  </div>
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                    {upcomingEvents.map((event, idx) => {
                      const start = parseISO(event.start);
                      const minutesUntil = differenceInMinutes(start, new Date());
                      const eventIsToday = isToday(start);
                      const timeLabel = eventIsToday
                        ? (minutesUntil <= 0 ? 'Now' : minutesUntil < 60 ? `in ${minutesUntil}m` : `in ${Math.floor(minutesUntil / 60)}h`)
                        : null;
                      const dot = getEventDot(event, idx, calendarColors);

                      return (
                        <button
                          key={event.id}
                          onClick={() => { setCurrentDate(start); setView('day'); setSelectedEvent(event); }}
                          className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', dot.className)} style={dot.style} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-foreground truncate">{event.summary}</p>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[10px] text-muted-foreground">
                                {eventIsToday
                                  ? format(start, 'h:mm a')
                                  : `${format(start, 'EEE')} · ${format(start, 'h:mm a')}`
                                }
                              </p>
                              {timeLabel && (
                                <Badge variant={minutesUntil <= 15 ? 'destructive' : 'secondary'} className="text-[9px] h-4 px-1">
                                  {timeLabel}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Separator className="my-3" />
            {is5thLineUser && (
              <CalendarAIPanel events={viewEvents} currentDate={currentDate} />
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col relative">
            {/* Loading / error / not-connected overlay. Sits above the grid
                but inside the main content area so the carousel chrome,
                modal header, sidebar, and close button stay fully usable. */}
            {(showInitialLoading || showError || showNotConnected) && (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-md"
                role="status"
                aria-live="polite"
              >
                {showInitialLoading && (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                    <p className="text-sm text-muted-foreground">Loading calendar…</p>
                  </>
                )}
                {showError && (
                  <>
                    <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
                    <p className="text-sm text-foreground">Couldn’t load your calendar.</p>
                    <p className="text-xs text-muted-foreground max-w-xs text-center">
                      {calendarError}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={() => {
                        checkStatus();
                        refreshEvents();
                      }}
                    >
                      Retry
                    </Button>
                  </>
                )}
                {showNotConnected && (
                  <>
                    <CalendarIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-foreground">Calendar isn’t connected yet.</p>
                    <p className="text-xs text-muted-foreground max-w-xs text-center">
                      Connect a calendar to see your real events here.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Empty state — connected, finished loading, but no events in
                the visible window. Rendered inline (not as overlay) so the
                date header / view switcher remain in place. */}
            {!showInitialLoading && !showError && !showNotConnected &&
              calendarStatus?.connected && allEvents.length === 0 && !calendarLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
                  <CalendarIcon className="h-6 w-6 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm text-muted-foreground">No events in this view.</p>
                </div>
              )}

            {view === 'intel' ? (
              <div className="flex-1 min-h-0 px-4 pt-3 pb-2 overflow-hidden">
                <AgendaIntel />
              </div>
            ) : view === 'month' ? (
              <MonthView currentDate={currentDate} events={allEvents} onEventClick={setSelectedEvent} onDayClick={handleDayClick} calendarColors={calendarColors} />
            ) : view === 'agenda' ? (
              <AgendaView currentDate={currentDate} events={allEvents} onEventClick={setSelectedEvent} calendarColors={calendarColors} />
            ) : (
              <>
                <AllDayBar
                  events={allDayEvents.filter(e => view === 'day' ? isSameDay(parseISO(e.start), currentDate) : true)}
                  onEventClick={setSelectedEvent}
                  calendarColors={calendarColors}
                />
                <ScrollArea className="flex-1" ref={timeGridScrollRef}>
                  <div className="flex min-h-0">
                    <div className="shrink-0 w-14 cal-grid-r">
                      {/* Header spacer to match day column headers */}
                      {view === 'week' ? (
                        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm cal-grid-b py-2">
                          <Popover open={showTzDropdown} onOpenChange={setShowTzDropdown}>
                            <PopoverTrigger asChild>
                              <button className="w-full text-center text-[9px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium flex items-center justify-center gap-0.5 py-1">
                                <Globe className="h-2.5 w-2.5" />
                                {displayTimezone}
                                <ChevronDown className="h-2 w-2" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-36 p-1" align="start">
                              {TIMEZONE_OPTIONS.map(tz => (
                                <button
                                  key={tz.value}
                                  onClick={() => { setDisplayTimezone(tz.label); setShowTzDropdown(false); }}
                                  className={cn(
                                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50 flex items-center justify-between',
                                    displayTimezone === tz.label && 'text-primary font-medium'
                                  )}
                                >
                                  {tz.label}
                                  {displayTimezone === tz.label && <Check className="h-3 w-3" />}
                                </button>
                              ))}
                            </PopoverContent>
                          </Popover>
                        </div>
                      ) : (
                        <Popover open={showTzDropdown} onOpenChange={setShowTzDropdown}>
                          <PopoverTrigger asChild>
                            <button className="w-full text-center py-1 text-[9px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium cal-grid-b flex items-center justify-center gap-0.5">
                              <Globe className="h-2.5 w-2.5" />
                              {displayTimezone}
                              <ChevronDown className="h-2 w-2" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-36 p-1" align="start">
                            {TIMEZONE_OPTIONS.map(tz => (
                              <button
                                key={tz.value}
                                onClick={() => { setDisplayTimezone(tz.label); setShowTzDropdown(false); }}
                                className={cn(
                                  'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50 flex items-center justify-between',
                                  displayTimezone === tz.label && 'text-primary font-medium'
                                )}
                              >
                                {tz.label}
                                {displayTimezone === tz.label && <Check className="h-3 w-3" />}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        {HOURS.map(h => (
                          <div key={h} className="absolute left-0 right-0 flex items-center justify-end pr-2 text-[10px] text-muted-foreground font-medium" style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                            <span className="-mt-[0.6em]">{h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {view === 'day' ? (
                      <DayColumn date={currentDate} events={getEventsForDay(currentDate)} onEventClick={setSelectedEvent} showDayLabel={false} onSlotClick={handleSlotClick} calendarColors={calendarColors} />
                    ) : (
                      <div className="flex flex-1">
                        {weekDays.map(day => (
                          <DayColumn key={day.toISOString()} date={day} events={getEventsForDay(day)} onEventClick={setSelectedEvent} showDayLabel={true} onSlotClick={handleSlotClick} calendarColors={calendarColors} />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>

        {selectedEvent && (
          <EventDetailPopover
            event={selectedEvent}
            colorClass={getEventColorClass(selectedEvent, 0)}
            onClose={() => setSelectedEvent(null)}
            dealMatch={matchEventToDeal(selectedEvent)}
            onEdit={calendarStatus?.connected ? handleEditEvent : undefined}
          />
        )}

        <CalendarEventDialog
          open={eventDialogOpen}
          onOpenChange={(open) => {
            setEventDialogOpen(open);
            if (!open) { setEditingEvent(null); setSlotDefaults(null); }
          }}
          event={editingEvent ? {
            id: editingEvent.id,
            summary: editingEvent.summary,
            description: editingEvent.description || undefined,
            location: editingEvent.location || undefined,
            start: editingEvent.start,
            end: editingEvent.end,
            all_day: editingEvent.all_day,
          } : slotDefaults ? {
            summary: '',
            start: slotDefaults.start,
            end: slotDefaults.end,
            all_day: false,
          } : null}
          onSave={handleSaveEvent}
          onDelete={editingEvent?.id ? handleDeleteEvent : undefined}
          isLoading={isMutating}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Event</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this event? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      </DialogContent>
    </Dialog>
  );
}
