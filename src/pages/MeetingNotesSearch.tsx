import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Search, Calendar as CalendarIcon, Users, Briefcase, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";

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

type DealLite = { id: string; deal_name: string | null };

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
          .select("id, deal_name")
          .in("id", dealIds);
        const map: Record<string, string> = {};
        (dealRows as DealLite[] | null)?.forEach((d) => { map[d.id] = d.deal_name ?? "Untitled deal"; });
        setDeals(map);
      } else {
        setDeals({});
      }
    }
    setLoading(false);
  }

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
          Search notes you've captured in End of Day — filter by attendee, date, or linked deal.
        </p>
      </header>

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
            <Card key={n.id} className="p-4 border-border/50 bg-card/60 hover:border-border transition-colors">
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