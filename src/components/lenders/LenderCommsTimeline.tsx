import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Video, Loader2, ExternalLink, ArrowRight, ArrowLeft as ArrowLeftIcon, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string;
  lenderName: string;
  /** UUID in master_lenders table — used to fetch contact emails for that lender. */
  masterLenderId?: string | null;
  /** Optional fallback emails (e.g., the dealLender's contact email). */
  fallbackContactEmails?: string[];
}

interface EmailItem {
  kind: "email";
  id: string;
  ts: string;
  subject: string;
  fromName: string | null;
  fromEmail: string;
  toEmails: string[];
  snippet: string | null;
  threadId: string | null;
  direction: "inbound" | "outbound";
}

interface CallItem {
  kind: "call";
  id: string;
  ts: string;
  title: string;
  url: string | null;
  organizerEmail: string | null;
  durationSeconds: number | null;
  summary: string | null;
  nextSteps: string[] | null;
  participants: string[];
}

type TimelineItem = EmailItem | CallItem;

function durationLabel(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function isOutboundFrom(currentUserEmails: Set<string>, fromEmail: string): "inbound" | "outbound" {
  return currentUserEmails.has(fromEmail.toLowerCase()) ? "outbound" : "inbound";
}

export function LenderCommsTimeline({ dealId, lenderName, masterLenderId, fallbackContactEmails = [] }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [filter, setFilter] = useState<"all" | "email" | "call">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1) Resolve lender contact emails
        const lenderEmails = new Set<string>(
          fallbackContactEmails.map(e => (e || "").toLowerCase().trim()).filter(Boolean)
        );
        if (masterLenderId) {
          const { data: contacts } = await supabase
            .from("lender_contacts")
            .select("email")
            .eq("lender_id", masterLenderId);
          for (const c of contacts || []) {
            if (c.email) lenderEmails.add(String(c.email).toLowerCase().trim());
          }
        }

        // 2) Resolve current user's email(s) for direction inference
        const userEmails = new Set<string>();
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user?.email) userEmails.add(auth.user.email.toLowerCase());

        // 3) Pull emails linked to this deal, then narrow to those touching the lender
        const { data: dealEmails } = await supabase
          .from("deal_emails")
          .select("gmail_message_id")
          .eq("deal_id", dealId);
        const messageIds = (dealEmails || []).map(e => e.gmail_message_id).filter(Boolean);

        let emails: EmailItem[] = [];
        if (messageIds.length > 0 && lenderEmails.size > 0) {
          // Fetch in chunks (Postgres `in` filter limit ≈ 1000)
          const chunks: string[][] = [];
          for (let i = 0; i < messageIds.length; i += 500) chunks.push(messageIds.slice(i, i + 500));
          const fetched: any[] = [];
          for (const ch of chunks) {
            const { data } = await supabase
              .from("gmail_messages")
              .select("id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at")
              .in("id", ch);
            if (data) fetched.push(...data);
          }
          for (const m of fetched) {
            const from = String(m.from_email || "").toLowerCase();
            const tos = (m.to_emails || []).map((t: string) => String(t).toLowerCase());
            const touchesLender =
              lenderEmails.has(from) ||
              tos.some((t: string) => lenderEmails.has(t)) ||
              // Domain fallback: match by lender contact email domains
              [...lenderEmails].some(le => {
                const dom = le.split("@")[1];
                return dom && (from.endsWith(`@${dom}`) || tos.some((t: string) => t.endsWith(`@${dom}`)));
              });
            if (!touchesLender) continue;
            emails.push({
              kind: "email",
              id: m.id,
              ts: m.received_at,
              subject: m.subject || "(no subject)",
              fromName: m.from_name,
              fromEmail: m.from_email,
              toEmails: m.to_emails || [],
              snippet: m.snippet,
              threadId: m.thread_id,
              direction: isOutboundFrom(userEmails, m.from_email || ""),
            });
          }
        }

        // 4) Pull Claap meetings for this deal that match the lender (matched_lender_id or organizer/participants)
        const calls: CallItem[] = [];
        const { data: meetings } = await supabase
          .from("claap_meetings")
          .select("id, title, recording_url, ai_summary, next_steps, organizer_email, duration_seconds, started_at, matched_lender_id")
          .eq("deal_id", dealId)
          .order("started_at", { ascending: false });

        if (meetings && meetings.length > 0) {
          const meetingIds = meetings.map(m => m.id);
          const { data: parts } = await supabase
            .from("claap_meeting_participants")
            .select("meeting_id, name, email, domain, is_internal")
            .in("meeting_id", meetingIds);
          const partsByMeeting = new Map<string, any[]>();
          for (const p of parts || []) {
            if (!partsByMeeting.has(p.meeting_id)) partsByMeeting.set(p.meeting_id, []);
            partsByMeeting.get(p.meeting_id)!.push(p);
          }
          for (const m of meetings) {
            const ps = partsByMeeting.get(m.id) || [];
            const externals = ps.filter(p => !p.is_internal);
            const matchesLender =
              (masterLenderId && m.matched_lender_id === masterLenderId) ||
              externals.some(p => lenderEmails.has(String(p.email || "").toLowerCase())) ||
              [...lenderEmails].some(le => {
                const dom = le.split("@")[1];
                return dom && externals.some(p => String(p.domain || "").toLowerCase() === dom);
              });
            if (!matchesLender) continue;
            calls.push({
              kind: "call",
              id: m.id,
              ts: m.started_at,
              title: m.title || "Untitled call",
              url: m.recording_url,
              organizerEmail: m.organizer_email,
              durationSeconds: m.duration_seconds,
              summary: m.ai_summary,
              nextSteps: Array.isArray(m.next_steps) ? m.next_steps as string[] : null,
              participants: externals.map(p => p.name || p.email).filter(Boolean),
            });
          }
        }

        const merged: TimelineItem[] = [...emails, ...calls]
          .filter(it => !!it.ts)
          .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

        if (!cancelled) setItems(merged);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (dealId && lenderName) load();
    return () => { cancelled = true; };
  }, [dealId, lenderName, masterLenderId, fallbackContactEmails.join("|")]);

  const filtered = useMemo(
    () => items.filter(i => filter === "all" || i.kind === filter),
    [items, filter]
  );

  const counts = useMemo(() => ({
    email: items.filter(i => i.kind === "email").length,
    call: items.filter(i => i.kind === "call").length,
  }), [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading communications…
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-destructive py-4">{error}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            All ({items.length})
          </FilterPill>
          <FilterPill active={filter === "email"} onClick={() => setFilter("email")}>
            <Mail className="h-3 w-3 mr-1" /> Emails ({counts.email})
          </FilterPill>
          <FilterPill active={filter === "call"} onClick={() => setFilter("call")}>
            <Video className="h-3 w-3 mr-1" /> Calls ({counts.call})
          </FilterPill>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-8 text-center">
          No {filter === "all" ? "" : filter} communications recorded with {lenderName} on this deal yet.
        </div>
      ) : (
        <ScrollArea className="h-[55vh] pr-2">
          <ol className="relative border-l border-border/60 ml-3 space-y-4 py-1">
            {filtered.map(item => (
              <li key={`${item.kind}-${item.id}`} className="ml-5 relative">
                <span className={cn(
                  "absolute -left-[26px] top-1 flex items-center justify-center h-5 w-5 rounded-full ring-4 ring-background",
                  item.kind === "email"
                    ? (item.direction === "outbound" ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400")
                    : "bg-violet-500/20 text-violet-400"
                )}>
                  {item.kind === "email"
                    ? (item.direction === "outbound" ? <ArrowRight className="h-3 w-3" /> : <ArrowLeftIcon className="h-3 w-3" />)
                    : <Video className="h-3 w-3" />}
                </span>
                {item.kind === "email"
                  ? <EmailRow item={item} />
                  : <CallRow item={item} />}
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-7 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function EmailRow({ item }: { item: EmailItem }) {
  const ts = parseISO(item.ts);
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5 text-[10px] capitalize">
              {item.direction}
            </Badge>
            <span className="text-sm font-medium truncate">{item.subject}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            <span className="font-medium text-foreground/80">{item.fromName || item.fromEmail}</span>
            {item.toEmails.length > 0 && <> → {item.toEmails.slice(0, 3).join(", ")}{item.toEmails.length > 3 && ` +${item.toEmails.length - 3}`}</>}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(ts, { addSuffix: true })}
            </span>
          </TooltipTrigger>
          <TooltipContent>{format(ts, "PP p")}</TooltipContent>
        </Tooltip>
      </div>
      {item.snippet && (
        <p className="text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
      )}
    </div>
  );
}

function CallRow({ item }: { item: CallItem }) {
  const ts = parseISO(item.ts);
  const dur = durationLabel(item.durationSeconds);
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5 text-[10px]">Call</Badge>
            {dur && <Badge variant="secondary" className="h-5 text-[10px]">{dur}</Badge>}
            <span className="text-sm font-medium truncate">{item.title}</span>
          </div>
          {item.participants.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {item.participants.slice(0, 4).join(", ")}{item.participants.length > 4 && ` +${item.participants.length - 4}`}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(ts, { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>{format(ts, "PP p")}</TooltipContent>
          </Tooltip>
          {item.url && (
            <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
              <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open recording">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>
      {item.summary && (
        <p className="text-xs text-muted-foreground line-clamp-3 flex gap-1.5">
          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{item.summary}</span>
        </p>
      )}
      {item.nextSteps && item.nextSteps.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Next steps: </span>
          {item.nextSteps.slice(0, 2).join(" · ")}
        </div>
      )}
    </div>
  );
}