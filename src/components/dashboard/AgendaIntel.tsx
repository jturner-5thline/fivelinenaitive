import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  format,
  startOfDay,
  endOfDay,
  addDays,
  parseISO,
  differenceInMinutes,
  isSameDay,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Video,
  MapPin,
  Users,
  ExternalLink,
  Sparkles,
  Loader2,
  Briefcase,
  Plus,
  StickyNote,
  CheckSquare,
  Mail,
  RefreshCw,
  ChevronLeft,
  Inbox,
  X,
  Pencil,
  Sparkle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { QuickCreateTaskDialog } from '@/components/tasks/QuickCreateTaskDialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from '@/components/deal/email/EmailComposerCard';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { useAuth } from '@/contexts/AuthContext';
import { isActiveDeal } from '@/lib/deals';
import { extractEmailDomain } from '@/lib/extractEmailDomain';

// ── Types ─────────────────────────────────────────────────────
type RangeKey = 'today' | '3d' | '7d';
type AudienceKey = 'all' | 'external' | 'internal';

interface DealRow {
  id: string;
  name: string;
  stage: string;
  status?: string | null;
  owner?: string | null;
  crm_company_id?: string | null;
  company_id?: string | null;
  updated_at?: string | null;
  category?: DealCategory;
}

type DealCategory = 'active' | 'on-hold' | 'prospect' | 'closed-lost' | 'closed-won' | 'other';

interface PrepCacheEntry {
  bullets: string;
  generatedAt: number;
  signature: string;
}

const PREP_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const PREP_CACHE_KEY = 'agendaIntel.prepCache.v1';
const INTERNAL_DOMAIN = '5thline.co';
const PERSONAL_TITLE_RE = /\b(gym|lunch|dinner|breakfast|home|errand|workout|personal|focus|block|ooo|pto|vacation|haircut|doctor|dentist|drive|commute)\b/i;

// ── Helpers ───────────────────────────────────────────────────
function loadPrepCache(): Record<string, PrepCacheEntry> {
  try {
    const raw = localStorage.getItem(PREP_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function savePrepCache(c: Record<string, PrepCacheEntry>) {
  try {
    localStorage.setItem(PREP_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
function emailDomain(email: string | null | undefined): string {
  if (!email) return '';
  const idx = email.lastIndexOf('@');
  return idx >= 0 ? email.slice(idx + 1).toLowerCase() : '';
}
function isInternalAttendee(email: string | null | undefined): boolean {
  return emailDomain(email) === INTERNAL_DOMAIN;
}
function eventSignature(ev: CalendarEvent): string {
  return [
    ev.id,
    ev.updated || '',
    (ev.attendees || []).map(a => a.email).sort().join('|'),
  ].join('::');
}

// ── Deal categorization / badges ──────────────────────────────
function classifyDeal(d: Pick<DealRow, 'stage' | 'status'>): DealCategory {
  const status = String(d.status ?? '').toLowerCase().trim();
  const stage = String(d.stage ?? '').toLowerCase().replace(/[-_]+/g, ' ').trim();
  if (status === 'archived' || stage.includes('archived')) return 'closed-lost';
  if (stage.includes('won')) return 'closed-won';
  if (stage.includes('closed') && stage.includes('lost')) return 'closed-lost';
  if (stage === 'passed' || stage.startsWith('passed') || stage.includes('not a fit')) return 'closed-lost';
  if (stage.includes('dead') || stage.includes('do not contact')) return 'closed-lost';
  if (status === 'on hold' || stage.includes('hold') || stage.includes('paused')) return 'on-hold';
  if (stage.startsWith('prospect')) return 'prospect';
  if (stage.includes('unqualified') || stage.includes('dormant')) return 'prospect';
  if (isActiveDeal(d as any)) return 'active';
  return 'other';
}

const CATEGORY_RANK: Record<DealCategory, number> = {
  active: 0,
  prospect: 1,
  'on-hold': 2,
  other: 3,
  'closed-won': 4,
  'closed-lost': 5,
};

const CATEGORY_BADGE: Record<DealCategory, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'border-green-500/30 bg-green-500/10 text-green-300' },
  prospect: { label: 'Prospect', cls: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  'on-hold': { label: 'On hold', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  'closed-won': { label: 'Won', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  'closed-lost': { label: 'Closed lost', cls: 'border-white/15 bg-white/[0.05] text-white/60' },
  other: { label: '—', cls: 'border-white/15 bg-white/[0.05] text-white/60' },
};

function highlightMatch(text: string, q: string): React.ReactNode {
  const term = q.trim();
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-white rounded px-0.5">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}

// ── Card ──────────────────────────────────────────────────────
// Compact left-pane list item — title, time, lightweight context only.
// All actions and rich detail live in the right-side detail pane.
function AgendaListItem({
  event,
  deal,
  isPersonal,
  isInternalOnly,
  active,
  onClick,
}: {
  event: CalendarEvent;
  deal: DealRow | null;
  isPersonal: boolean;
  isInternalOnly: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const duration = Math.max(0, differenceInMinutes(end, start));
  const attendeeCount = (event.attendees || []).filter(a => !a.self).length;
  const hasVideo = !!event.hangout_link
    || !!(event.location && /^https?:\/\//.test(event.location));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border px-2.5 py-2 transition-colors',
        active
          ? 'border-primary/40 bg-primary/[0.08]'
          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.05]',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] text-white/70">
        <span>{format(start, 'h:mm a')} · {duration}m</span>
        <div className="flex items-center gap-1.5 text-white/60">
          {hasVideo && <Video className="h-3 w-3" />}
          {attendeeCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="h-3 w-3" />{attendeeCount}
            </span>
          )}
        </div>
      </div>
      <div className="mt-0.5 text-xs font-medium text-white truncate">
        {event.summary || '(no title)'}
      </div>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        {deal && (
          <Badge
            variant="outline"
            className="text-[9px] font-normal border-primary/30 bg-primary/10 text-primary px-1.5 py-0"
          >
            <Briefcase className="h-2.5 w-2.5 mr-0.5" />{deal.name}
          </Badge>
        )}
        {isPersonal && (
          <Badge variant="outline" className="text-[9px] font-normal border-white/15 text-white/60 px-1.5 py-0">
            Personal
          </Badge>
        )}
        {isInternalOnly && (
          <Badge variant="outline" className="text-[9px] font-normal border-white/15 text-white/60 px-1.5 py-0">
            Internal
          </Badge>
        )}
      </div>
    </button>
  );
}

function MeetingCard({
  event,
  dealMatch,
  onLinkDeal,
  onUnlinkDeal,
  onPickSuggested,
  suggestions,
  linkBusy,
  isPersonal,
  isInternalOnly,
  prep,
  prepLoading,
  onRegenerate,
  onCreateTask,
  onEmail,
}: {
  event: CalendarEvent;
  dealMatch: DealRow | null;
  onLinkDeal: () => void;
  onUnlinkDeal: () => void;
  onPickSuggested: (deal: DealRow) => void;
  suggestions: DealRow[];
  linkBusy: boolean;
  isPersonal: boolean;
  isInternalOnly: boolean;
  prep: PrepCacheEntry | null;
  prepLoading: boolean;
  onRegenerate: () => void;
  onCreateTask: () => void;
  onEmail: () => void;
}) {
  const navigate = useNavigate();
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const duration = Math.max(0, differenceInMinutes(end, start));
  const videoLink =
    event.hangout_link ||
    (event.location && /^https?:\/\//.test(event.location) ? event.location : null);
  const externalAttendees = (event.attendees || []).filter(a => !isInternalAttendee(a.email) && !a.self);

  const handleAddNote = () => {
    if (!dealMatch) return;
    window.open(`/deals?deal=${dealMatch.id}&action=add-note`, '_blank', 'noopener,noreferrer');
  };
  const handleCreateTask = () => onCreateTask();
  const handleEmail = () => onEmail();

  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.025] hover:bg-white/[0.04] transition-colors p-4 space-y-3">
      {/* Section 1 — Meeting details */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-white/75">
            <CalendarIcon className="h-3 w-3 text-white/80" />
            <span>{format(start, 'EEE, MMM d · h:mm a')}</span>
            <span className="opacity-50">•</span>
            <span>{duration}m</span>
            {event.html_link && (
              <a
                href={event.html_link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 text-white/70 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white mt-1 truncate">
            {event.summary || '(no title)'}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-white/75">
            {videoLink && (
              <a
                href={videoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white hover:underline"
              >
                <Video className="h-3 w-3 text-white" /> Join video
              </a>
            )}
            {event.location && !videoLink && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-white/85" /> {event.location}
              </span>
            )}
            {event.attendees && event.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3 text-white/85" /> {event.attendees.length} attendee
                {event.attendees.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Attendees list */}
      {externalAttendees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {externalAttendees.slice(0, 6).map(a => (
            <Badge
              key={a.email}
              variant="outline"
              className="text-[10px] font-normal border-white/20 bg-white/[0.05] text-white"
            >
              {a.display_name || a.email}
              <span className="ml-1 text-white/65">@{emailDomain(a.email)}</span>
            </Badge>
          ))}
          {externalAttendees.length > 6 && (
            <Badge variant="outline" className="text-[10px] font-normal border-white/20 text-white">
              +{externalAttendees.length - 6} more
            </Badge>
          )}
        </div>
      )}

      {/* Section 2 — Deal link */}
      {!isPersonal && (
        <div className="space-y-1.5">
          {dealMatch ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary text-xs font-medium pl-2 pr-1 py-1">
                <button
                  type="button"
                  onClick={() => window.open(`/deals?deal=${dealMatch.id}`, '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Briefcase className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{dealMatch.name}</span>
                  {dealMatch.category && (
                    <Badge
                      variant="outline"
                      className={cn('text-[9px] font-normal px-1.5 py-0 ml-1', CATEGORY_BADGE[dealMatch.category].cls)}
                    >
                      {CATEGORY_BADGE[dealMatch.category].label}
                    </Badge>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onUnlinkDeal}
                  disabled={linkBusy}
                  aria-label="Unlink deal"
                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-primary/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-white/80 hover:text-white"
                onClick={onLinkDeal}
                disabled={linkBusy}
              >
                <Pencil className="h-3 w-3 mr-1" /> Change
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-white/70 flex-wrap">
              <span>No linked deal</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-white hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors"
                onClick={onLinkDeal}
                disabled={linkBusy}
              >
                {linkBusy ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3 mr-1 text-white" />
                )}
                Link deal
              </Button>
            </div>
          )}
          {!dealMatch && suggestions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-white/55 inline-flex items-center gap-1">
                <Sparkle className="h-3 w-3" /> Suggested
              </span>
              {suggestions.slice(0, 3).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickSuggested(s)}
                  disabled={linkBusy}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors"
                >
                  <Briefcase className="h-3 w-3" />
                  <span className="truncate max-w-[160px]">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 3 — AI prep notes */}
      {!isPersonal && !isInternalOnly && (
        <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/90">
              <Sparkles className="h-3 w-3 text-white" />
              AI Prep
              {prep && (
                <span className="text-white/60 normal-case tracking-normal">
                  — generated {format(new Date(prep.generatedAt), 'MMM d, h:mm a')}
                </span>
              )}
            </div>
            {prep && !prepLoading && (
              <button
                onClick={onRegenerate}
                className="text-white/70 hover:text-white"
                aria-label="Regenerate prep"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
          {prepLoading && !prep ? (
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating prep...
            </div>
          ) : prep ? (
            <div className="prose prose-invert prose-xs max-w-none text-xs text-white [&_ul]:my-0 [&_li]:my-0.5 [&_p]:text-white [&_li]:text-white">
              <ReactMarkdown>{prep.bullets}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-xs text-white/70">No prep available.</div>
          )}
        </div>
      )}

      {/* Claap link if present in description */}
      {event.description && /claap\.io\/[^\s)]+/i.test(event.description) && (
        <a
          href={event.description.match(/https?:\/\/(?:www\.)?claap\.io\/[^\s)]+/i)?.[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-white hover:underline"
        >
          <Video className="h-3 w-3 text-white" /> Claap recording
        </a>
      )}

      {/* Section 4 — Quick actions */}
      {!isPersonal && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white hover:text-white"
            onClick={handleAddNote}
            disabled={!dealMatch}
          >
            <StickyNote className="h-3 w-3 mr-1 text-white" /> Add note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white hover:text-white"
            onClick={handleCreateTask}
          >
            <CheckSquare className="h-3 w-3 mr-1 text-white" /> Create task
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white hover:text-white"
            onClick={handleEmail}
            disabled={(event.attendees || []).filter(a => !a.self).length === 0}
          >
            <Mail className="h-3 w-3 mr-1 text-white" /> Send follow-up
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function AgendaIntel() {
  const { listEvents, status } = useGoogleCalendar();
  const [range, setRange] = useState<RangeKey>('today');
  const [audience, setAudience] = useState<AudienceKey>('all');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [dealLinkOverrides, setDealLinkOverrides] = useState<Record<string, string>>({});
  const [linkPickerEventId, setLinkPickerEventId] = useState<string | null>(null);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const [persistedLinks, setPersistedLinks] = useState<Record<string, { id: string; dealId: string }>>({});
  const [orgCompanyId, setOrgCompanyId] = useState<string | null>(null);
  const [crmCompanies, setCrmCompanies] = useState<Array<{ id: string; name: string; domains: string[] }>>([]);
  const [linkBusyEventId, setLinkBusyEventId] = useState<string | null>(null);
  const [prepCache, setPrepCache] = useState<Record<string, PrepCacheEntry>>(() =>
    loadPrepCache(),
  );
  const [prepLoading, setPrepLoading] = useState<Record<string, boolean>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  // Master/detail selection — mirrors the End of Day tab's interaction
  // model: a left list of compact items and a right detail/actions panel.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  // Quick-action modals anchored to the selected meeting.
  const [taskDialogEvent, setTaskDialogEvent] = useState<CalendarEvent | null>(null);
  const [emailDialogEvent, setEmailDialogEvent] = useState<CalendarEvent | null>(null);
  const { user } = useAuth();
  const teamMembers = useTeamMembers();
  const { createTask } = useMyTasks();
  const signature = useUserEmailSignature();
  const { sendEmail } = useGmail();
  const emailDefaults = useMemo(() => {
    if (!emailDialogEvent) return null;
    const toList = (emailDialogEvent.attendees || [])
      .filter(a => !a.self && a.email && a.email.trim())
      .map(a => a.email);
    return {
      to: Array.from(new Set(toList)),
      subject: `Re: ${emailDialogEvent.summary || '(no title)'}`,
      label: toList.length === 1 ? toList[0] : `${toList.length} attendee${toList.length === 1 ? '' : 's'}`,
    };
  }, [emailDialogEvent]);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fetch deals once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, company, stage, status, deal_owner, manager, crm_company_id, company_id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (data) {
        setDeals(
          data.map(d => {
            const cat = classifyDeal({ stage: d.stage, status: d.status });
            return {
              id: d.id,
              name: d.company,
              stage: d.stage,
              status: d.status,
              owner: d.deal_owner || d.manager,
              crm_company_id: d.crm_company_id,
              company_id: d.company_id,
              updated_at: d.updated_at,
              category: cat,
            };
          }),
        );
      }
    })();
  }, []);

  // Resolve current user's primary org_company_id (for meeting_deal_links scoping)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      setOrgCompanyId(data?.company_id ?? null);
    })();
  }, [user]);

  // Fetch CRM company domains (for attendee-domain suggestions)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('crm_companies')
        .select('id, name, domain, additional_domains')
        .limit(2000);
      if (data) {
        setCrmCompanies(
          data.map((c: any) => ({
            id: c.id,
            name: c.name,
            domains: [c.domain, ...(c.additional_domains || [])]
              .filter(Boolean)
              .map((d: string) => d.toLowerCase()),
          })),
        );
      }
    })();
  }, []);

  // Load persisted meeting→deal links once we know the org
  useEffect(() => {
    if (!orgCompanyId) return;
    (async () => {
      const { data } = await supabase
        .from('meeting_deal_links')
        .select('id, meeting_external_id, deal_id')
        .eq('org_company_id', orgCompanyId)
        .is('deleted_at', null);
      if (data) {
        const map: Record<string, { id: string; dealId: string }> = {};
        for (const r of data as any[]) {
          map[r.meeting_external_id] = { id: r.id, dealId: r.deal_id };
        }
        setPersistedLinks(map);
      }
    })();
  }, [orgCompanyId]);

  // Fetch events whenever range changes
  const rangeDays = range === 'today' ? 0 : range === '3d' ? 3 : 7;
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const timeMin = startOfDay(new Date()).toISOString();
      const timeMax = endOfDay(addDays(new Date(), rangeDays)).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: 100 });
      if (!cancelled) {
        setEvents(res?.events || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeDays, status?.connected, listEvents]);

  // Match deals to events
  const matchDeal = useCallback(
    (event: CalendarEvent): DealRow | null => {
      const persisted = persistedLinks[event.id]?.dealId;
      if (persisted) {
        const d = deals.find(x => x.id === persisted);
        if (d) return d;
      }
      const override = dealLinkOverrides[event.id];
      if (override) {
        const d = deals.find(x => x.id === override);
        if (d) return d;
      }
      if (!deals.length) return null;
      const summary = (event.summary || '').toLowerCase();
      const desc = (event.description || '').toLowerCase();
      // Title/description name match
      for (const deal of deals) {
        const n = deal.name.toLowerCase();
        if (n.length > 3 && (summary.includes(n) || desc.includes(n))) return deal;
      }
      return null;
    },
    [deals, dealLinkOverrides, persistedLinks],
  );

  // Attendee-domain → suggested active deals
  const suggestionsByEvent = useMemo(() => {
    const out: Record<string, DealRow[]> = {};
    if (!crmCompanies.length || !deals.length) return out;
    for (const ev of events) {
      const externals = (ev.attendees || []).filter(
        a => a.email && !isInternalAttendee(a.email) && !a.self,
      );
      const domains = new Set(
        externals.map(a => extractEmailDomain(a.email)).filter((d): d is string => !!d),
      );
      if (!domains.size) continue;
      const matchedCompanyIds = new Set<string>();
      for (const c of crmCompanies) {
        if (c.domains.some(d => domains.has(d))) matchedCompanyIds.add(c.id);
      }
      if (!matchedCompanyIds.size) continue;
      const matchedDeals = deals
        .filter(d => d.crm_company_id && matchedCompanyIds.has(d.crm_company_id))
        .filter(d => d.category === 'active' || d.category === 'prospect')
        .sort((a, b) => (CATEGORY_RANK[a.category!] - CATEGORY_RANK[b.category!]));
      if (matchedDeals.length) out[ev.id] = matchedDeals.slice(0, 3);
    }
    return out;
  }, [events, crmCompanies, deals]);

  // Classify events
  const classified = useMemo(() => {
    return events
      .filter(e => !e.all_day)
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
      .map(event => {
        const externals = (event.attendees || []).filter(
          a => !isInternalAttendee(a.email) && !a.self,
        );
        const deal = matchDeal(event);
        const isInternalOnly =
          (event.attendees || []).length > 0 && externals.length === 0;
        const isPersonal =
          externals.length === 0 &&
          !deal &&
          (PERSONAL_TITLE_RE.test(event.summary || '') ||
            (event.attendees || []).filter(a => !a.self).length === 0);
        return { event, deal, isInternalOnly, isPersonal };
      });
  }, [events, matchDeal]);

  // Filter by range (today only) + audience
  const today = new Date();
  const visible = useMemo(() => {
    return classified.filter(({ event, isInternalOnly, isPersonal }) => {
      if (range === 'today' && !isSameDay(parseISO(event.start), today)) return false;
      if (audience === 'internal' && !isInternalOnly) return false;
      if (audience === 'external' && isInternalOnly) return false;
      // Personal cards always show in 'all'
      if (audience === 'external' && isPersonal) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classified, range, audience]);

  // Lazy-fetch prep notes for visible non-personal/non-internal cards
  useEffect(() => {
    visible.forEach(({ event, deal, isInternalOnly, isPersonal }) => {
      if (isPersonal || isInternalOnly) return;
      const sig = eventSignature(event);
      const existing = prepCache[event.id];
      if (existing && existing.signature === sig && Date.now() - existing.generatedAt < PREP_TTL_MS) {
        return;
      }
      if (inflightRef.current.has(event.id)) return;
      inflightRef.current.add(event.id);
      setPrepLoading(p => ({ ...p, [event.id]: true }));
      (async () => {
        try {
          const payload = {
            title: event.summary,
            start: event.start,
            end: event.end,
            attendees: (event.attendees || []).map(a => ({
              email: a.email,
              name: a.display_name,
              self: a.self,
              internal: isInternalAttendee(a.email),
            })),
            location: event.location,
            video_link: event.hangout_link,
            description: (event.description || '').slice(0, 1500),
            linked_deal: deal ? { name: deal.name, stage: deal.stage } : null,
          };
          const { data, error } = await supabase.functions.invoke('calendar-ai', {
            body: { action: 'meeting_intel_card', events: payload, current_date: format(new Date(), 'yyyy-MM-dd') },
          });
          if (error) throw error;
          const bullets: string = data?.result || '';
          if (bullets) {
            const entry: PrepCacheEntry = {
              bullets,
              generatedAt: Date.now(),
              signature: sig,
            };
            setPrepCache(prev => {
              const next = { ...prev, [event.id]: entry };
              savePrepCache(next);
              return next;
            });
          }
        } catch (e) {
          console.error('AgendaIntel prep error', e);
        } finally {
          inflightRef.current.delete(event.id);
          setPrepLoading(p => {
            const next = { ...p };
            delete next[event.id];
            return next;
          });
        }
      })();
    });
  }, [visible, prepCache]);

  const handleRegenerate = (eventId: string) => {
    setPrepCache(prev => {
      const next = { ...prev };
      delete next[eventId];
      savePrepCache(next);
      return next;
    });
  };

  const handleLinkDeal = (eventId: string) => {
    if (!eventId) return;
    setLinkPickerQuery('');
    setLinkPickerEventId(eventId);
  };

  const persistLink = useCallback(
    async (eventId: string, deal: DealRow) => {
      if (!user || !orgCompanyId) {
        toast.error('Workspace not ready — try again in a moment.');
        return false;
      }
      setLinkBusyEventId(eventId);
      try {
        // Soft-delete any existing active link for this meeting first.
        const existing = persistedLinks[eventId];
        if (existing) {
          await supabase
            .from('meeting_deal_links')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
        const { data, error } = await supabase
          .from('meeting_deal_links')
          .insert({
            meeting_external_id: eventId,
            deal_id: deal.id,
            org_company_id: orgCompanyId,
            linked_by_user_id: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        setPersistedLinks(prev => ({ ...prev, [eventId]: { id: data!.id, dealId: deal.id } }));
        toast.success(`Linked to ${deal.name}`, {
          action: { label: 'View deal', onClick: () => navigate(`/deals?deal=${deal.id}`) },
        });
        return true;
      } catch (e: any) {
        toast.error(e?.message || 'Could not link deal');
        return false;
      } finally {
        setLinkBusyEventId(null);
      }
    },
    [user, orgCompanyId, persistedLinks, navigate],
  );

  const handlePickDeal = async (dealId: string) => {
    if (!linkPickerEventId || !dealId) return;
    const match = deals.find(d => d.id === dealId);
    if (!match) return;
    const eventId = linkPickerEventId;
    setLinkPickerEventId(null);
    setLinkPickerQuery('');
    await persistLink(eventId, match);
  };

  const handleUnlinkDeal = useCallback(
    async (eventId: string) => {
      const existing = persistedLinks[eventId];
      if (!existing) {
        // Fall back to clearing in-memory override.
        setDealLinkOverrides(prev => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
        return;
      }
      const deal = deals.find(d => d.id === existing.dealId);
      setLinkBusyEventId(eventId);
      try {
        const { error } = await supabase
          .from('meeting_deal_links')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
        setPersistedLinks(prev => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
        let undone = false;
        toast.success(`Unlinked from ${deal?.name || 'deal'}`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: async () => {
              if (undone || !deal) return;
              undone = true;
              await persistLink(eventId, deal);
            },
          },
        });
      } catch (e: any) {
        toast.error(e?.message || 'Could not unlink');
      } finally {
        setLinkBusyEventId(null);
      }
    },
    [persistedLinks, deals, persistLink],
  );

  // ── Render ─────────────────────────────────────────────────
  // Keep selection valid as the filter set changes — clear if the
  // selected event is no longer visible. Auto-select the first item on
  // desktop so the detail pane is never empty when there's content.
  const selectedRecord = visible.find(v => v.event.id === selectedId) || null;
  useEffect(() => {
    if (selectedId && !visible.some(v => v.event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visible]);
  useEffect(() => {
    if (!isNarrow && !selectedId && visible.length > 0) {
      setSelectedId(visible[0].event.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow, visible.length]);

  // Group the visible list by calendar day for the left pane.
  const groupedByDay = useMemo(() => {
    const groups: { key: string; label: string; items: typeof visible }[] = [];
    const byKey = new Map<string, typeof visible>();
    for (const rec of visible) {
      const d = parseISO(rec.event.start);
      const key = format(d, 'yyyy-MM-dd');
      if (!byKey.has(key)) byKey.set(key, [] as typeof visible);
      byKey.get(key)!.push(rec);
    }
    for (const [key, items] of byKey) {
      const d = parseISO(items[0].event.start);
      const label = isSameDay(d, new Date())
        ? `Today · ${format(d, 'EEE, MMM d')}`
        : format(d, 'EEEE, MMM d');
      groups.push({ key, label, items });
    }
    return groups;
  }, [visible]);

  // Early return AFTER all hooks above so React sees the same hook
  // count/order on every render (fixes "Rendered more hooks than during
  // the previous render" when Google Calendar connection state flips).
  if (!status?.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <CalendarIcon className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Connect Google Calendar to see your agenda.</p>
      </div>
    );
  }

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border/30">
      <div className="inline-flex items-center bg-muted/40 rounded-lg p-0.5">
        {(['today', '3d', '7d'] as RangeKey[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              range === r
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r === 'today' ? 'Today' : r === '3d' ? 'Next 3 days' : 'Next 7 days'}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center bg-muted/40 rounded-lg p-0.5">
        {(['all', 'external', 'internal'] as AudienceKey[]).map(a => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors',
              audience === a
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {a === 'all' ? 'All' : a === 'external' ? 'External' : 'Internal'}
          </button>
        ))}
      </div>
      <div className="ml-auto text-[10px] text-muted-foreground/70">
        {visible.length} meeting{visible.length === 1 ? '' : 's'}
      </div>
    </div>
  );

  const masterPane = (
    <div className="flex flex-col h-full min-w-0 rounded-xl border border-white/10 bg-background/40">
      <ScrollArea className="flex-1 min-h-0 px-2 py-2">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading agenda...
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <CalendarIcon className="h-6 w-6 mb-2 opacity-40" />
            <p className="text-sm">No meetings in this view.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {groupedByDay.map(g => (
              <div key={g.key}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/80">
                  {g.label}
                  <span className="text-muted-foreground/60"> · {g.items.length}</span>
                </div>
                <div className="space-y-1 mt-1">
                  {g.items.map(({ event, deal, isInternalOnly, isPersonal }) => (
                    <AgendaListItem
                      key={event.id}
                      event={event}
                      deal={deal}
                      isPersonal={isPersonal}
                      isInternalOnly={isInternalOnly}
                      active={selectedId === event.id}
                      onClick={() => setSelectedId(event.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const detailPane = (
    <div className="flex flex-col h-full min-w-0 rounded-xl border border-white/10 bg-background/40">
      {selectedRecord ? (
        <>
          {isNarrow && (
            <div className="px-3 pt-3">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-white/80 hover:text-white"
                onClick={() => setSelectedId(null)}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back to agenda
              </Button>
            </div>
          )}
          <ScrollArea className="flex-1 min-h-0 px-3 py-3">
            <MeetingCard
              event={selectedRecord.event}
              dealMatch={selectedRecord.deal}
              isPersonal={selectedRecord.isPersonal}
              isInternalOnly={selectedRecord.isInternalOnly}
              onLinkDeal={() => handleLinkDeal(selectedRecord.event.id)}
              prep={prepCache[selectedRecord.event.id] || null}
              prepLoading={!!prepLoading[selectedRecord.event.id]}
              onRegenerate={() => handleRegenerate(selectedRecord.event.id)}
              onCreateTask={() => setTaskDialogEvent(selectedRecord.event)}
              onEmail={() => {
                const hasRecipients = (selectedRecord.event.attendees || []).some(
                  a => !a.self && a.email && a.email.trim(),
                );
                if (!hasRecipients) {
                  toast.error('No attendee email addresses available.');
                  return;
                }
                setEmailDialogEvent(selectedRecord.event);
              }}
            />
          </ScrollArea>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
          <div className="h-14 w-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-white">Nothing selected</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">
            Select a meeting from the left to view notes, tasks, AI prep, and attendees.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {filterBar}
      <div className="flex gap-2 min-h-0 flex-1 pt-3 h-[calc(100vh-260px)] min-h-[520px]">
        {isNarrow ? (
          <div className="flex-1 min-w-0">
            {selectedRecord ? detailPane : masterPane}
          </div>
        ) : (
          <>
            <div className="w-[340px] shrink-0 min-w-0">{masterPane}</div>
            <div className="flex-1 min-w-0">{detailPane}</div>
          </>
        )}
      </div>
      <CommandDialog
        open={!!linkPickerEventId}
        onOpenChange={(open) => {
          if (!open) {
            setLinkPickerEventId(null);
            setLinkPickerQuery('');
          }
        }}
      >
        <CommandInput
          placeholder="Search deals to link..."
          value={linkPickerQuery}
          onValueChange={setLinkPickerQuery}
        />
        <CommandList>
          <CommandEmpty>
            {deals.length === 0 ? 'No deals available.' : 'No matching deals.'}
          </CommandEmpty>
          <CommandGroup heading="Deals">
            {deals.map(d => (
              <CommandItem
                key={d.id}
                value={`${d.name} ${d.stage}`}
                onSelect={() => handlePickDeal(d.id)}
              >
                <Briefcase className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.stage}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <QuickCreateTaskDialog
        open={!!taskDialogEvent}
        onClose={() => setTaskDialogEvent(null)}
        teamMembers={teamMembers}
        currentUserId={user?.id || ''}
        initialTitle={taskDialogEvent ? `Follow up: ${taskDialogEvent.summary || '(no title)'}` : ''}
        initialDealId={taskDialogEvent ? (matchDeal(taskDialogEvent)?.id ?? null) : null}
        initialDueDate={taskDialogEvent ? parseISO(taskDialogEvent.start) : null}
        onCreate={async (input) => {
          await createTask.mutateAsync({
            title: input.title,
            priority: input.priority,
            due_date: input.due_date || undefined,
            status: input.status,
            assigned_to: input.assigned_to,
            recurrence_rule: input.recurrence_rule,
            recurrence_end_date: input.recurrence_end_date,
            deal_id: input.deal_id || undefined,
          });
          toast.success(`Task created: "${input.title}"`);
          setTaskDialogEvent(null);
        }}
      />
      <FollowUpEmailDialog
        open={!!emailDialogEvent}
        onClose={() => setEmailDialogEvent(null)}
        defaults={emailDefaults}
        signature={signature}
        sendEmail={sendEmail}
      />
    </div>
  );
}

export default AgendaIntel;

// ── Follow-up email dialog ──────────────────────────────────
// Compact compose modal anchored to a selected meeting. Pre-fills recipients
// from the meeting attendees and a sensible subject, but everything remains
// editable before the user sends.
function FollowUpEmailDialog({
  open,
  onClose,
  defaults,
  signature,
  sendEmail,
}: {
  open: boolean;
  onClose: () => void;
  defaults: { to: string[]; subject: string; label: string } | null;
  signature: string;
  sendEmail: ReturnType<typeof useGmail>['sendEmail'];
}) {
  const [recipients, setRecipients] = useState<ComposerRecipients>({ to: [], cc: [], bcc: [] });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open && defaults) {
      setRecipients({ to: defaults.to, cc: [], bcc: [] });
      setSubject(defaults.subject);
      setBody('');
      setAttachments([]);
      setFiles([]);
    }
  }, [open, defaults]);

  const handleSend = useCallback(async (_o: ComposerSendOptions) => {
    if (recipients.to.length === 0) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    try {
      const result = await sendEmail({
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
        subject: subject.trim(),
        bodyHtml: body,
        body: body.replace(/<[^>]+>/g, ''),
        attachments: files.length > 0 ? files : undefined,
      });
      if (!result) throw new Error('Send failed');
      toast.success(`Follow-up sent to ${defaults?.label || 'attendees'}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      toast.error(msg);
    }
  }, [recipients, subject, body, files, sendEmail, onClose, defaults]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-[640px] p-0 border"
        style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <DialogTitle className="text-[15px] font-semibold tracking-tight text-white">
            Send follow-up
          </DialogTitle>
        </DialogHeader>
        <div className="p-3">
          <EmailComposerCard
            replyToName={defaults?.label || ''}
            hideReplyAnchor
            recipients={recipients}
            onRecipientsChange={setRecipients}
            subject={subject}
            onSubjectChange={setSubject}
            body={body}
            onBodyChange={setBody}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onFilesChange={setFiles}
            onSend={handleSend}
            onDiscard={() => { onClose(); toast.info('Draft discarded'); }}
            signature={signature}
            variant="inline"
            showSubject
            className="rounded-lg border border-white/10 shadow-none mx-0 my-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}