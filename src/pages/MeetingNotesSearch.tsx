import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Search, Calendar as CalendarIcon, Users, Briefcase, FileText, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";

type NoteRow = {
  id: string;
  event_id: string;
  event_title: string | null;
  event_start: string | null;
  event_end: string | null;
  attendee_names: string[] | null;
  attendee_emails: string[] | null;
  note_text: string;
  linked_deal_id: string | null;
  updated_at: string;
};

type DealLite = { id: string; company: string | null };

type Citation = {
  n: number;
  id: string;
  event_title: string | null;
  event_start: string | null;
  attendee_names: string[];
  linked_deal_id: string | null;
  linked_deal_name: string | null;
  snippet: string;
};

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function MeetingNotesSearch() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [attendee, setAttendee] = useState("");
  const [dealFilter, setDealFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [deals, setDeals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Ask AI state
  const [askInput, setAskInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string>("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => void runSearch(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, attendee, dealFilter, startDate, endDate, user?.id]);

  async function runSearch() {
    if (!user?.id) return;
    setLoading(true);
    let q = supabase
      .from("user_meeting_notes")
      .select("id,event_id,event_title,event_start,event_end,attendee_names,attendee_emails,note_text,linked_deal_id,updated_at")
      .eq("user_id", user.id)
      .order("event_start", { ascending: false, nullsFirst: false })
      .limit(100);

    const term = query.trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(`note_text.ilike.${like},event_title.ilike.${like}`);
    }
    if (attendee.trim()) {
      const like = `%${attendee.trim()}%`;
      // array contains any match — fall back to text search on joined names
      q = q.or(`attendee_names.cs.{${attendee.trim()}},attendee_emails.cs.{${attendee.trim()}}`);
    }
    if (dealFilter) q = q.eq("linked_deal_id", dealFilter);
    if (startDate) q = q.gte("event_start", new Date(startDate).toISOString());
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      q = q.lte("event_start", end.toISOString());
    }

    const { data, error } = await q;
    if (error) {
      console.error("meeting-notes search failed", error);
      setNotes([]);
    } else {
      setNotes((data ?? []) as NoteRow[]);
      const dealIds = Array.from(new Set((data ?? []).map((n: any) => n.linked_deal_id).filter(Boolean))) as string[];
      if (dealIds.length) {
        const { data: dealRows } = await supabase
          .from("deals")
          .select("id, company")
          .in("id", dealIds);
        const map: Record<string, string> = {};
        (dealRows as DealLite[] | null)?.forEach((d) => { map[d.id] = d.company ?? "Untitled deal"; });
        setDeals(map);
      } else {
        setDeals({});
      }
    }
    setLoading(false);
  }

  async function askAi() {
    const q = askInput.trim();
    if (!q) return;
    setAsking(true);
    setAnswer("");
    setCitations([]);
    try {
      const { data, error } = await supabase.functions.invoke("ask-meeting-notes", {
        body: { question: q },
      });
      if (error) throw error;
      const payload = data as { answer: string; citations: Citation[] };
      setAnswer(payload.answer || "");
      setCitations(payload.citations || []);

      // Merge cited notes into the visible list so the anchors resolve.
      const missing = (payload.citations || []).filter((c) => !notes.some((n) => n.id === c.id));
      if (missing.length) {
        const { data: extra } = await supabase
          .from("user_meeting_notes")
          .select("id,event_id,event_title,event_start,event_end,attendee_names,attendee_emails,note_text,linked_deal_id,updated_at")
          .in("id", missing.map((m) => m.id));
        if (extra?.length) {
          setNotes((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...(extra as NoteRow[]).filter((e) => !ids.has(e.id)), ...prev];
          });
          const newDealIds = Array.from(new Set((extra as NoteRow[]).map((n) => n.linked_deal_id).filter(Boolean))) as string[];
          if (newDealIds.length) {
            const { data: dealRows } = await supabase.from("deals").select("id, company").in("id", newDealIds);
            setDeals((prev) => {
              const next = { ...prev };
              (dealRows as DealLite[] | null)?.forEach((d) => { next[d.id] = d.company ?? "Untitled deal"; });
              return next;
            });
          }
        }
      }
    } catch (e: any) {
      console.error("ask-meeting-notes failed", e);
      toast.error(e?.message || "Failed to ask AI");
    } finally {
      setAsking(false);
    }
  }

  function jumpToNote(id: string) {
    const el = noteRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(id);
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
    }
  }

  // Render an AI answer with [n] tokens replaced by clickable citation chips.
  const renderedAnswer = useMemo(() => {
    if (!answer) return null;
    const byN = new Map(citations.map((c) => [c.n, c]));
    const parts = answer.split(/(\[\d+\](?:\[\d+\])*)/g);
    return parts.map((chunk, i) => {
      if (!/^\[\d+\]/.test(chunk)) return <span key={i}>{chunk}</span>;
      const nums = Array.from(chunk.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
      return (
        <span key={i} className="inline-flex gap-0.5 align-baseline ml-0.5">
          {nums.map((n) => {
            const c = byN.get(n);
            if (!c) return <span key={n} className="text-muted-foreground text-xs">[{n}]</span>;
            return (
              <button
                key={n}
                type="button"
                onClick={() => jumpToNote(c.id)}
                title={`${c.event_title ?? "Note"}${c.event_start ? " · " + format(new Date(c.event_start), "MMM d, yyyy") : ""}`}
                className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded bg-primary/20 text-primary text-[10px] font-semibold hover:bg-primary/30 transition"
              >
                {n}
              </button>
            );
          })}
        </span>
      );
    });
  }, [answer, citations]);

  const groupedCount = notes.length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Helmet>
        <title>Meeting Notes Search | nAItive</title>
        <meta name="description" content="Search your personal meeting notes by keyword, attendee, date, or deal." />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Meeting Notes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask a question or search your notes captured in End of Day. AI answers cite the exact notes they came from.
        </p>
      </header>

      {/* Ask AI */}
      <Card className="p-4 mb-6 border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-card/60 backdrop-blur">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Ask your notes</div>
        </div>
        <div className="flex gap-2">
          <Input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !asking) askAi(); }}
            placeholder="e.g. When did I last talk with Jane Doe? What did we decide about Acme's pricing?"
          />
          <Button onClick={askAi} disabled={asking || !askInput.trim()}>
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
        </div>

        {answer && (
          <div className="mt-4 space-y-3">
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {renderedAnswer}
            </div>
            {citations.length > 0 && (
              <div className="pt-3 border-t border-border/50">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  Sources
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {citations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => jumpToNote(c.id)}
                      className="text-left rounded-md border border-border/50 bg-card/60 hover:bg-card p-2 transition group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                          {c.n}
                        </span>
                        <span className="text-xs font-medium truncate">
                          {c.event_title || "Untitled meeting"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mb-1">
                        {c.event_start ? format(new Date(c.event_start), "MMM d, yyyy · h:mm a") : "No date"}
                        {c.linked_deal_name ? ` · ${c.linked_deal_name}` : ""}
                      </div>
                      <div className="text-[11px] text-foreground/70 line-clamp-2">
                        {c.snippet}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 mb-6 space-y-3 border-border/50 bg-card/60 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes and meeting titles…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={attendee}
              onChange={(e) => setAttendee(e.target.value)}
              placeholder="Attendee name or email"
              className="pl-9"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="pl-9"
              aria-label="From date"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="pl-9"
              aria-label="To date"
            />
          </div>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={dealFilter}
              onChange={(e) => setDealFilter(e.target.value)}
              placeholder="Deal ID (optional)"
              className="pl-9"
            />
          </div>
        </div>
        {(query || attendee || dealFilter || startDate || endDate) && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(""); setAttendee(""); setDealFilter(""); setStartDate(""); setEndDate(""); }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          {loading ? "Searching…" : `${groupedCount} note${groupedCount === 1 ? "" : "s"}`}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-3">
        {!loading && notes.length === 0 && (
          <Card className="p-8 text-center border-dashed border-border/60 bg-transparent">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground">
              No notes match your filters. Notes are saved from End of Day.
            </div>
          </Card>
        )}

        {notes.map((n) => {
          const dealName = n.linked_deal_id ? deals[n.linked_deal_id] : null;
          const when = n.event_start ? new Date(n.event_start) : null;
          return (
            <Card
              key={n.id}
              ref={(el) => { noteRefs.current[n.id] = el as HTMLDivElement | null; }}
              className={`p-4 border-border/50 bg-card/60 hover:border-border transition-colors ${
                flashId === n.id ? "ring-2 ring-primary/60 border-primary/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {highlight(n.event_title || "Untitled meeting", query)}
                  </div>
                  {when && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(when, "MMM d, yyyy · h:mm a")}
                    </div>
                  )}
                </div>
                {n.linked_deal_id && (
                  <Link to={`/deals?dealId=${n.linked_deal_id}`}>
                    <Badge variant="secondary" className="gap-1">
                      <Briefcase className="h-3 w-3" />
                      {dealName ?? "Deal"}
                    </Badge>
                  </Link>
                )}
              </div>
              {n.attendee_names && n.attendee_names.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {n.attendee_names.slice(0, 6).map((name) => (
                    <Badge key={name} variant="outline" className="text-[10px] font-normal">
                      {highlight(name, attendee)}
                    </Badge>
                  ))}
                  {n.attendee_names.length > 6 && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      +{n.attendee_names.length - 6}
                    </Badge>
                  )}
                </div>
              )}
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {highlight(n.note_text, query)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}