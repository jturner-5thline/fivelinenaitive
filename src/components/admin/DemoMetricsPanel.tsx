import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Sparkles, LogIn, Briefcase, Clock } from "lucide-react";

interface CompanyRow {
  id: string;
  name: string;
  account_type: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  created_at: string;
}

interface AggRow {
  company_id: string | null;
  user_id: string;
  event_type: string;
  created_at: string;
}

const isDemoLike = (t?: string | null) =>
  !!t && ["demo", "pilot", "trial", "partner"].includes(t.toLowerCase());

export const DemoMetricsPanel = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-demo-metrics"],
    queryFn: async () => {
      // 1. Fetch demo / pilot companies.
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("id, name, account_type, trial_ends_at, subscription_status, created_at")
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;

      const demos = (companies ?? []).filter((c: any) => isDemoLike(c.account_type)) as CompanyRow[];
      if (demos.length === 0) return { rows: [] as Array<CompanyRow & {
        sessions: number; signIns: number; aiQueries: number; deals: number;
        lastEvent: string | null; pageViews: number;
      }> };

      const ids = demos.map((d) => d.id);

      // 2. Pull last 5000 activity events scoped to these companies.
      const { data: events } = await supabase
        .from("user_activity_log")
        .select("company_id, user_id, event_type, event_data, created_at")
        .in("company_id", ids)
        .order("created_at", { ascending: false })
        .limit(5000);

      // 3. Count deals per company (single grouped fetch).
      const { data: deals } = await supabase
        .from("deals")
        .select("id, company_id")
        .in("company_id", ids);

      const dealsByCompany = new Map<string, number>();
      (deals ?? []).forEach((d: any) => {
        dealsByCompany.set(d.company_id, (dealsByCompany.get(d.company_id) ?? 0) + 1);
      });

      const rows = demos.map((c) => {
        const own = (events ?? []).filter((e: any) => e.company_id === c.id) as AggRow[];
        const signIns = own.filter((e) => e.event_type === "sign_in").length;
        const pageViews = own.filter((e) => e.event_type === "page_view").length;
        const aiQueries = own.filter(
          (e) => e.event_type === "feature_used" &&
                 ((e as any).event_data?.feature === "ai_query"),
        ).length;
        const sessions = new Set(
          own
            .filter((e) => e.event_type === "sign_in")
            .map((e) => `${e.user_id}-${e.created_at.slice(0, 10)}`),
        ).size;
        return {
          ...c,
          sessions,
          signIns,
          aiQueries,
          pageViews,
          deals: dealsByCompany.get(c.id) ?? 0,
          lastEvent: own[0]?.created_at ?? null,
        };
      });

      return { rows };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No demo or pilot accounts yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((c) => {
        const trialDays = c.trial_ends_at
          ? differenceInDays(new Date(c.trial_ends_at), new Date())
          : null;
        const trialTone =
          trialDays === null ? "bg-white/10 text-white/60 border-white/20"
          : trialDays < 0    ? "bg-red-500/20 text-red-400 border-red-500/30"
          : trialDays <= 7   ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                             : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
        const trialLabel =
          trialDays === null ? "No trial set"
          : trialDays < 0    ? `Expired ${Math.abs(trialDays)}d ago`
                             : `${trialDays}d remaining`;

        return (
          <Card key={c.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{c.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {c.account_type ?? "Demo"} ·{" "}
                    {c.subscription_status === "revoked"
                      ? <span className="text-red-400">revoked</span>
                      : (c.subscription_status ?? "trialing")}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={trialTone}>{trialLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={LogIn}     label="Sign-ins"   value={c.signIns} />
                <Stat icon={Users}     label="Sessions"   value={c.sessions} />
                <Stat icon={Sparkles}  label="AI queries" value={c.aiQueries} />
                <Stat icon={Briefcase} label="Deals"      value={c.deals} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                <Clock className="h-3 w-3" />
                <span>
                  {c.lastEvent
                    ? `Last activity ${formatDistanceToNow(new Date(c.lastEvent), { addSuffix: true })}`
                    : "No activity recorded yet"}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: number }) => (
  <div className="rounded-lg border bg-card/50 p-3">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </div>
    <div className="text-xl font-semibold tabular-nums mt-1">{value.toLocaleString()}</div>
  </div>
);