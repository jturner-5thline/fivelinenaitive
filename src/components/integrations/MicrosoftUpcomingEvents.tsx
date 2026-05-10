import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UpcomingEvent {
  event_id: string;
  title: string | null;
  start_time: string | null;
  location: string | null;
  meeting_url: string | null;
}

/**
 * Compact list of the next ~5 Microsoft (Outlook) calendar events for the
 * signed-in user. Reads directly from the unified `calendar_events` table —
 * no edge-function round trip — so it stays cheap and only shows what's
 * already been synced.
 */
export function MicrosoftUpcomingEvents() {
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("calendar_events")
        .select("event_id, title, start_time, location, meeting_url")
        .eq("user_id", user.id)
        .eq("provider", "microsoft")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(5);
      if (!cancelled) setEvents(data ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!events || events.length === 0) return null;

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-2 space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1">
        Upcoming Outlook events
      </div>
      {events.map((e) => (
        <div key={e.event_id} className="flex items-center gap-2 text-xs px-1">
          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-[3px] bg-[hsl(var(--outlook-blue))] text-[8px] font-bold text-white leading-none shrink-0">
            O
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {e.start_time ? new Date(e.start_time).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            }) : ""}
          </span>
          <span className="truncate">
            {e.meeting_url ? (
              <a href={e.meeting_url} target="_blank" rel="noreferrer" className="hover:underline">
                {e.title || "(no title)"}
              </a>
            ) : (
              e.title || "(no title)"
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
