import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface RespRow {
  resp_emails_sent: number | null;
  resp_replies_received: number | null;
  resp_reply_rate: number | null;
  resp_median_hours_to_reply: number | null;
  resp_reply_rate_excl_mass: number | null;
  resp_last_reply_date: string | null;
  resp_rating: string | null;
  resp_emails_sent_l12m: number | null;
  resp_reply_rate_l12m: number | null;
  resp_window_label: string | null;
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(Number(v) * 100)}%`);
const num = (v: number | null) => (v == null ? "—" : String(v));

function ratingVariant(r: string | null): "default" | "secondary" | "destructive" | "outline" {
  const s = (r || "").toLowerCase();
  if (s.startsWith("highly")) return "default";
  if (s.startsWith("moderately")) return "secondary";
  if (s.includes("un") || s.includes("low") || s.includes("no ")) return "destructive";
  return "outline";
}

export function LenderResponsivenessScorecard({ lenderId }: { lenderId?: string }) {
  const { data } = useQuery({
    queryKey: ["lender-responsiveness", lenderId],
    enabled: !!lenderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_lenders")
        .select(
          "resp_emails_sent,resp_replies_received,resp_reply_rate,resp_median_hours_to_reply,resp_reply_rate_excl_mass,resp_last_reply_date,resp_rating,resp_emails_sent_l12m,resp_reply_rate_l12m,resp_window_label",
        )
        .eq("id", lenderId!)
        .maybeSingle();
      if (error) throw error;
      return data as RespRow | null;
    },
  });

  if (!data || (data.resp_rating == null && data.resp_emails_sent == null)) return null;

  const stats: { label: string; value: string; sub?: string }[] = [
    { label: "Reply rate", value: pct(data.resp_reply_rate), sub: `excl. mass sends ${pct(data.resp_reply_rate_excl_mass)}` },
    { label: "Last 12 months", value: pct(data.resp_reply_rate_l12m), sub: `${num(data.resp_emails_sent_l12m)} emails sent` },
    { label: "Median reply time", value: data.resp_median_hours_to_reply == null ? "—" : `${data.resp_median_hours_to_reply}h` },
    { label: "Threads / replies", value: `${num(data.resp_emails_sent)} / ${num(data.resp_replies_received)}` },
    { label: "Last reply", value: data.resp_last_reply_date ?? "—" },
  ];

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Responsiveness</h3>
        {data.resp_rating && <Badge variant={ratingVariant(data.resp_rating)} className="text-xs">{data.resp_rating}</Badge>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-md border border-border/50 overflow-hidden bg-border/30">
        {stats.map((s) => (
          <div key={s.label} className="bg-card/60 px-3 py-2.5">
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div className="font-mono text-base text-foreground mt-0.5">{s.value}</div>
            {s.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>
      {data.resp_window_label && (
        <p className="text-[10px] text-muted-foreground mt-1.5">Email history: {data.resp_window_label}</p>
      )}
    </section>
  );
}
