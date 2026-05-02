import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, AlertTriangle, Clock, FileText, Target, TrendingUp, TrendingDown, Activity, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDealStages } from "@/contexts/DealStagesContext";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, parseISO } from "date-fns";

/* ---------- Types ---------- */

interface DealLenderRow {
  id: string;
  deal_id: string;
  name: string;
  stage: string | null;
  substage: string | null;
  pass_reason: string | null;
  tracking_status: string | null;
  notes: string | null;
  quote_amount: number | null;
  quote_rate: number | null;
  quote_term: string | null;
  score: number | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DealRow {
  id: string;
  company: string;
  stage: string | null;
  status: string | null;
  pipeline_id: string | null;
  total_fee: number | null;
  value: number | null;
  closing_date: string | null;
  manager: string | null;
  deal_owner: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneRow {
  id: string;
  deal_id: string;
  title: string;
  due_date: string | null;
  completed: boolean | null;
  completed_at: string | null;
  status: string | null;
}

interface WriteupRow {
  id: string;
  deal_id: string;
  status: string | null;
  updated_at: string;
}

interface DealRollup {
  deal: DealRow;
  link: DealLenderRow;
  milestonesTotal: number;
  milestonesCompleted: number;
  milestonesOverdue: number;
  writeup: WriteupRow | null;
  health: { score: number; label: "strong" | "watch" | "at-risk"; reasons: string[] };
  outcome: "won" | "lost" | "passed" | "active" | "on-hold";
}

/* ---------- Helpers ---------- */

const TEST_NAMES = new Set(["test-niki's store", "example deal"]);
const isTestDeal = (name: string) => {
  const l = (name || "").toLowerCase();
  return TEST_NAMES.has(l) || l.startsWith("test ");
};

function classifyOutcome(deal: DealRow, link: DealLenderRow): DealRollup["outcome"] {
  const ds = (deal.stage || "").toLowerCase();
  const ls = (link.stage || "").toLowerCase();
  const lt = (link.tracking_status || "").toLowerCase();
  if (lt === "passed" || ls === "passed" || ls === "not-a-fit" || ls === "unresponsive") return "passed";
  if (ds.includes("closed-won") || ls === "term-sheet" || ls === "term-sheets" || ls === "draft-terms") return "won";
  if (ds.includes("closed-lost")) return "lost";
  if (lt === "on-hold" || ds === "on-hold" || ds.includes("on-hold")) return "on-hold";
  return "active";
}

function computeHealth(deal: DealRow, link: DealLenderRow, ms: MilestoneRow[]): DealRollup["health"] {
  let score = 70;
  const reasons: string[] = [];

  // Staleness penalty
  const lastTouch = link.last_contact_at || link.updated_at || deal.updated_at;
  if (lastTouch) {
    const days = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
    if (days > 30) { score -= 20; reasons.push(`Stale ${days}d`); }
    else if (days > 14) { score -= 10; reasons.push(`Quiet ${days}d`); }
    else { score += 5; }
  }

  // Milestones
  const open = ms.filter(m => !m.completed);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter(m => m.due_date && m.due_date < today);
  if (overdue.length > 0) { score -= Math.min(25, overdue.length * 8); reasons.push(`${overdue.length} overdue`); }
  if (ms.length > 0) {
    const pct = ms.filter(m => m.completed).length / ms.length;
    score += Math.round(pct * 15);
  }

  // Tracking status
  const lt = (link.tracking_status || "").toLowerCase();
  if (lt === "active") score += 10;
  if (lt === "on-deck") score += 5;
  if (lt === "passed" || lt === "excluded") { score = Math.min(score, 30); reasons.push("Lender out"); }
  if (lt === "on-hold") { score -= 10; reasons.push("On hold"); }

  // Score boost from explicit lender score
  if (typeof link.score === "number") score = Math.round(score * 0.7 + link.score * 0.3);

  // Outcome boost
  const outcome = classifyOutcome(deal, link);
  if (outcome === "won") { score = Math.max(score, 90); reasons.unshift("Closed won"); }
  if (outcome === "lost" || outcome === "passed") { score = Math.min(score, 35); }

  score = Math.max(0, Math.min(100, score));
  const label: DealRollup["health"]["label"] =
    score >= 70 ? "strong" : score >= 45 ? "watch" : "at-risk";
  return { score, label, reasons: reasons.slice(0, 3) };
}

function outcomeBadge(outcome: DealRollup["outcome"]) {
  switch (outcome) {
    case "won":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Won</Badge>;
    case "lost":
      return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/20">Lost</Badge>;
    case "passed":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">Passed</Badge>;
    case "on-hold":
      return <Badge variant="outline" className="text-muted-foreground">On hold</Badge>;
    default:
      return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20">Active</Badge>;
  }
}

function healthBadge(health: DealRollup["health"]) {
  const cls =
    health.label === "strong" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    health.label === "watch" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
    "bg-rose-500/15 text-rose-400 border-rose-500/30";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn("border", cls)}>{health.score}</Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1">
          <div className="font-medium capitalize">{health.label}</div>
          {health.reasons.length > 0 && (
            <ul className="list-disc pl-4 text-muted-foreground">
              {health.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function writeupBadge(w: WriteupRow | null) {
  if (!w) return <span className="text-xs text-muted-foreground">—</span>;
  const status = (w.status || "draft").toLowerCase();
  const map: Record<string, string> = {
    final: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    sent: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    in_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    draft: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  return <Badge className={cn("border capitalize", map[status] || map.draft)}>{status.replace("_", " ")}</Badge>;
}

function fmtCurrency(n: number | null | undefined) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/* ---------- Page ---------- */

export default function LenderDealHistory() {
  const { lenderName: rawName } = useParams<{ lenderName: string }>();
  const navigate = useNavigate();
  const { stages } = useDealStages();
  const lenderName = useMemo(() => decodeURIComponent(rawName || ""), [rawName]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollups, setRollups] = useState<DealRollup[]>([]);

  const stageLabel = useMemo(() => {
    const map = new Map(stages.map(s => [s.id, s.label]));
    return (id: string | null) => (id ? map.get(id) || id : "—");
  }, [stages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: links, error: linkErr } = await supabase
          .from("deal_lenders")
          .select("id, deal_id, name, stage, substage, pass_reason, tracking_status, notes, quote_amount, quote_rate, quote_term, score, last_contact_at, created_at, updated_at")
          .eq("name", lenderName);
        if (linkErr) throw linkErr;
        const linkRows = (links || []) as DealLenderRow[];
        if (linkRows.length === 0) {
          if (!cancelled) { setRollups([]); setLoading(false); }
          return;
        }
        const dealIds = [...new Set(linkRows.map(l => l.deal_id))];
        const [dealsRes, msRes, wuRes] = await Promise.all([
          supabase.from("deals")
            .select("id, company, stage, status, pipeline_id, total_fee, value, closing_date, manager, deal_owner, created_at, updated_at")
            .in("id", dealIds),
          supabase.from("deal_milestones")
            .select("id, deal_id, title, due_date, completed, completed_at, status")
            .in("deal_id", dealIds),
          supabase.from("deal_writeups")
            .select("id, deal_id, status, updated_at")
            .in("deal_id", dealIds),
        ]);
        if (dealsRes.error) throw dealsRes.error;
        const deals = (dealsRes.data || []) as DealRow[];
        const ms = (msRes.data || []) as MilestoneRow[];
        const writeups = (wuRes.data || []) as WriteupRow[];

        const today = new Date().toISOString().slice(0, 10);
        const dealMap = new Map(deals.map(d => [d.id, d]));
        const msByDeal = new Map<string, MilestoneRow[]>();
        for (const m of ms) {
          if (!msByDeal.has(m.deal_id)) msByDeal.set(m.deal_id, []);
          msByDeal.get(m.deal_id)!.push(m);
        }
        const wuByDeal = new Map<string, WriteupRow>();
        for (const w of writeups) wuByDeal.set(w.deal_id, w);

        const built: DealRollup[] = [];
        for (const link of linkRows) {
          const deal = dealMap.get(link.deal_id);
          if (!deal) continue;
          if (isTestDeal(deal.company)) continue;
          const dealMs = msByDeal.get(deal.id) || [];
          const completed = dealMs.filter(m => m.completed).length;
          const overdue = dealMs.filter(m => !m.completed && m.due_date && m.due_date < today).length;
          built.push({
            deal,
            link,
            milestonesTotal: dealMs.length,
            milestonesCompleted: completed,
            milestonesOverdue: overdue,
            writeup: wuByDeal.get(deal.id) || null,
            health: computeHealth(deal, link, dealMs),
            outcome: classifyOutcome(deal, link),
          });
        }
        built.sort((a, b) => new Date(b.deal.updated_at).getTime() - new Date(a.deal.updated_at).getTime());
        if (!cancelled) setRollups(built);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load deal history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (lenderName) load();
    return () => { cancelled = true; };
  }, [lenderName]);

  /* ---------- Aggregates ---------- */

  const kpis = useMemo(() => {
    const total = rollups.length;
    const won = rollups.filter(r => r.outcome === "won").length;
    const lost = rollups.filter(r => r.outcome === "lost").length;
    const passed = rollups.filter(r => r.outcome === "passed").length;
    const active = rollups.filter(r => r.outcome === "active").length;
    const onHold = rollups.filter(r => r.outcome === "on-hold").length;
    const closed = won + lost + passed;
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : null;
    const avgHealth = total > 0 ? Math.round(rollups.reduce((s, r) => s + r.health.score, 0) / total) : 0;
    const totalFees = rollups.reduce((s, r) => s + (r.deal.total_fee || 0), 0);
    const wonFees = rollups.filter(r => r.outcome === "won").reduce((s, r) => s + (r.deal.total_fee || 0), 0);
    const overdueMilestones = rollups.reduce((s, r) => s + r.milestonesOverdue, 0);
    const completedMilestones = rollups.reduce((s, r) => s + r.milestonesCompleted, 0);
    const totalMilestones = rollups.reduce((s, r) => s + r.milestonesTotal, 0);
    const writeupsFinal = rollups.filter(r => {
      const s = (r.writeup?.status || "").toLowerCase();
      return s === "final" || s === "approved" || s === "sent";
    }).length;
    return {
      total, won, lost, passed, active, onHold, winRate, avgHealth,
      totalFees, wonFees, overdueMilestones, completedMilestones, totalMilestones, writeupsFinal,
    };
  }, [rollups]);

  /* ---------- Render ---------- */

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lenderName}</h1>
            <p className="text-sm text-muted-foreground">Deal history & outcomes across {kpis.total} engagement{kpis.total === 1 ? "" : "s"}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/lenders">All lenders</Link>
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && rollups.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No deal history found for <span className="font-medium text-foreground">{lenderName}</span>.
          </CardContent>
        </Card>
      )}

      {!loading && !error && rollups.length > 0 && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Total deals"
              value={String(kpis.total)}
              sub={`${kpis.active} active · ${kpis.onHold} on hold`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
              label="Win rate"
              value={kpis.winRate === null ? "—" : `${kpis.winRate}%`}
              sub={`${kpis.won} won · ${kpis.lost} lost · ${kpis.passed} passed`}
            />
            <KpiCard
              icon={<Target className="h-4 w-4" />}
              label="Avg. deal health"
              value={String(kpis.avgHealth)}
              sub={kpis.avgHealth >= 70 ? "Strong" : kpis.avgHealth >= 45 ? "Watch" : "At risk"}
              accent={kpis.avgHealth >= 70 ? "emerald" : kpis.avgHealth >= 45 ? "amber" : "rose"}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Realized fees"
              value={fmtCurrency(kpis.wonFees)}
              sub={`${fmtCurrency(kpis.totalFees)} total in pipeline`}
            />
            <KpiCard
              icon={<FileText className="h-4 w-4" />}
              label="Write-ups finalized"
              value={`${kpis.writeupsFinal}/${kpis.total}`}
              sub="Final, approved, or sent"
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              label="Milestones completed"
              value={`${kpis.completedMilestones}/${kpis.totalMilestones}`}
              sub={kpis.totalMilestones > 0 ? `${Math.round((kpis.completedMilestones / kpis.totalMilestones) * 100)}% done` : "—"}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
              label="Overdue milestones"
              value={String(kpis.overdueMilestones)}
              sub="Across all linked deals"
              accent={kpis.overdueMilestones > 0 ? "amber" : undefined}
            />
            <KpiCard
              icon={<TrendingDown className="h-4 w-4 text-rose-400" />}
              label="Pass rate"
              value={kpis.total > 0 ? `${Math.round((kpis.passed / kpis.total) * 100)}%` : "—"}
              sub={`${kpis.passed} passed of ${kpis.total}`}
            />
          </div>

          {/* Deal table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked deals</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Deal stage</TableHead>
                    <TableHead>Lender stage</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Write-up</TableHead>
                    <TableHead>Milestones</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollups.map(r => {
                    const lastTouch = r.link.last_contact_at || r.link.updated_at || r.deal.updated_at;
                    const milestonePct = r.milestonesTotal > 0
                      ? Math.round((r.milestonesCompleted / r.milestonesTotal) * 100)
                      : null;
                    return (
                      <TableRow key={r.link.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          <Link to={`/deal/${r.deal.id}`} className="hover:underline">
                            {r.deal.company}
                          </Link>
                          {r.deal.deal_owner && (
                            <div className="text-xs text-muted-foreground mt-0.5">{r.deal.deal_owner}</div>
                          )}
                        </TableCell>
                        <TableCell>{outcomeBadge(r.outcome)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{stageLabel(r.deal.stage)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {(r.link.stage || "—").replace(/-/g, " ")}
                          {r.link.pass_reason && (
                            <div className="text-xs text-rose-400 mt-0.5 truncate max-w-[200px]">
                              {r.link.pass_reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{healthBadge(r.health)}</TableCell>
                        <TableCell>{writeupBadge(r.writeup)}</TableCell>
                        <TableCell>
                          {r.milestonesTotal === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="space-y-1 min-w-[120px]">
                              <div className="flex items-center gap-2 text-xs">
                                <span>{r.milestonesCompleted}/{r.milestonesTotal}</span>
                                {r.milestonesOverdue > 0 && (
                                  <span className="text-amber-400">· {r.milestonesOverdue} overdue</span>
                                )}
                              </div>
                              <Progress value={milestonePct ?? 0} className="h-1.5" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lastTouch ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(parseISO(lastTouch), { addSuffix: true })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{format(parseISO(lastTouch), "PP p")}</TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtCurrency(r.deal.total_fee)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/deal/${r.deal.id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "amber" | "rose";
}) {
  const accentCls =
    accent === "emerald" ? "from-emerald-500/10 to-transparent border-emerald-500/20" :
    accent === "amber" ? "from-amber-500/10 to-transparent border-amber-500/20" :
    accent === "rose" ? "from-rose-500/10 to-transparent border-rose-500/20" :
    "from-primary/5 to-transparent border-border";
  return (
    <Card className={cn("bg-gradient-to-br", accentCls)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}