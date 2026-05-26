import * as React from "react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import {
  KpiCard,
  SectionHeader,
  StatusBadge,
  SeverityDot,
  OutcomeBadge,
  ConvergenceBar,
  PriorityScore,
  TEAL,
} from "./ui";
import {
  overviewKpis,
  convergenceSeries,
  issueClusters,
  feedbackItems,
  themePulse,
  promptVersions,
  aiActions,
  execInsight,
  weeklyChanges,
  clusterPromptLinks,
} from "./mockData";
import {
  ArrowUpRight,
  AlertTriangle,
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  CircleDot,
} from "lucide-react";

export function OverviewPage({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const ranked = [...issueClusters].sort((a, b) => b.score - a.score).slice(0, 5);
  const recentActions = aiActions.slice(0, 4);
  const quotes = feedbackItems.filter(f => f.sentiment === "negative").slice(0, 3);

  return (
    <div className="space-y-5">
      {/* WHAT CHANGED THIS WEEK — plain-language executive brief */}
      <Card className="relative overflow-hidden p-5 bg-gradient-to-br from-[hsl(220_25%_10%)] via-[hsl(220_22%_8%)] to-[hsl(174_30%_10%)] border-teal-500/10">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-teal-400/70" />
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-teal-300/80">What changed this week</span>
              <span className="text-[10px] text-muted-foreground">· May 19 – May 25</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{weeklyChanges.headline}</h2>
            <p className="mt-1.5 text-sm text-foreground/75 leading-relaxed">{weeklyChanges.body}</p>
          </div>
          <button
            onClick={() => onNavigate?.("issue-clusters")}
            className="shrink-0 hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-teal-200 hover:text-teal-100 px-2.5 py-1.5 rounded-md ring-1 ring-teal-500/30 bg-teal-500/5"
          >
            Open prioritization <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {weeklyChanges.bullets.map((b, i) => {
            const Icon = b.tone === "up" ? TrendingUp : b.tone === "down" ? TrendingDown : Minus;
            const tone = b.tone === "up" ? "text-rose-300" : b.tone === "down" ? "text-emerald-300" : "text-muted-foreground";
            return (
              <div key={i} className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${tone}`}>
                  <Icon className="h-3 w-3" /> {b.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{b.detail}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Journey Health"
          value={overviewKpis.journeyHealth.value}
          unit="/100"
          delta={overviewKpis.journeyHealth.delta}
          series={overviewKpis.journeyHealth.trend}
          tone="warn"
          hint="Onboarding drag pulling score down"
        />
        <KpiCard
          label="Feedback Risk"
          value={overviewKpis.feedbackRisk.value}
          unit="/100"
          delta={overviewKpis.feedbackRisk.delta}
          series={overviewKpis.feedbackRisk.trend}
          tone="danger"
          hint="Negative themes rising 4w"
        />
        <KpiCard
          label="Training Freshness"
          value={overviewKpis.trainingFreshness.value}
          unit="/100"
          delta={overviewKpis.trainingFreshness.delta}
          series={overviewKpis.trainingFreshness.trend}
          tone="ok"
          hint="2 prompts > 30d stale"
        />
        <KpiCard
          label="AI Action Success"
          value={`${overviewKpis.actionSuccess.value}%`}
          delta={overviewKpis.actionSuccess.delta}
          series={overviewKpis.actionSuccess.trend}
          tone="teal"
          hint="13% override rate"
        />
      </div>

      {/* CONVERGENCE + RANKED CLUSTERS — primary executive surface */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3 p-5">
          <SectionHeader
            eyebrow="Signal convergence"
            title="Where signals are converging"
            description="Behavior, feedback, AI failure, and business impact — last 7 days."
            right={
              <StatusBadge tone="warn">
                <CircleDot className="h-3 w-3" /> 3 hotspots
              </StatusBadge>
            }
          />
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={convergenceSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-beh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(174 72% 48%)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(174 72% 48%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-fb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(35 95% 60%)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(35 95% 60%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-ai" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0 75% 62%)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(0 75% 62%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-biz" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(210 90% 60%)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(210 90% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area name="Behavior" dataKey="behavior" stroke="hsl(174 72% 48%)" fill="url(#g-beh)" strokeWidth={1.5} />
                <Area name="Feedback" dataKey="feedback" stroke="hsl(35 95% 60%)" fill="url(#g-fb)" strokeWidth={1.5} />
                <Area name="AI failure" dataKey="aiFailure" stroke="hsl(0 75% 62%)" fill="url(#g-ai)" strokeWidth={1.5} />
                <Area name="Business" dataKey="business" stroke="hsl(210 90% 60%)" fill="url(#g-biz)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2 p-5">
          <SectionHeader
            eyebrow="Priority queue"
            title="Top issue clusters"
            right={
              <button
                onClick={() => onNavigate?.("issue-clusters")}
                className="text-xs font-medium text-teal-300 hover:text-teal-200 inline-flex items-center gap-1"
              >
                All <ArrowUpRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="space-y-2">
            {ranked.map(c => {
              const promptCount = clusterPromptLinks[c.id]?.length ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => onNavigate?.("issue-clusters")}
                  className="w-full text-left flex items-center gap-3 rounded-md border border-border/40 bg-background/40 hover:bg-muted/20 hover:border-teal-500/30 transition p-2.5"
                >
                  <PriorityScore score={c.score} size={44} showLabel={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <SeverityDot severity={c.severity} />
                      <span className="text-sm font-medium truncate">{c.title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {c.workflow} · {c.impactedUsers} users · {c.feedbackCount} fb · {c.aiFailures} ai · {promptCount} prompt
                    </div>
                    <div className="mt-1.5"><ConvergenceBar signals={c.signals} /></div>
                  </div>
                  <ClusterStatus status={c.status} />
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* EXECUTIVE INSIGHT STRIP — risks / opportunities / next */}
      <Card className="p-5">
        <SectionHeader
          eyebrow="Executive read"
          title="Risks, opportunities, next actions"
          right={<StatusBadge tone="teal"><Sparkles className="h-3 w-3" /> AI-synthesized</StatusBadge>}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InsightList icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-400" />} title="Top risks" items={execInsight.risks} />
          <InsightList icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />} title="Top opportunities" items={execInsight.opportunities} />
          <InsightList icon={<Target className="h-3.5 w-3.5 text-teal-400" />} title="Recommended next" items={execInsight.next} />
        </div>
      </Card>

      {/* FEEDBACK + TRAINING + ACTIONS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-5">
          <SectionHeader
            eyebrow="Voice of customer"
            title="Feedback pulse"
            right={
              <button onClick={() => onNavigate?.("feedback")} className="text-xs text-teal-300 inline-flex items-center gap-1">
                Detail <ArrowUpRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="h-[120px] mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={themePulse} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="theme" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} interval={0} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
                  {themePulse.map((t, i) => (
                    <Cell key={i} fill={t.sentiment < -0.3 ? "hsl(0 75% 62%)" : t.sentiment > 0.2 ? "hsl(150 60% 50%)" : "hsl(35 95% 60%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {quotes.map(q => (
              <div key={q.id} className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                <p className="text-xs italic text-foreground/90 leading-relaxed">"{q.quote}"</p>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {q.author} · {q.account} · {q.source}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader
            eyebrow="AI readiness"
            title="Training & coverage"
            right={
              <button onClick={() => onNavigate?.("ai-training")} className="text-xs text-teal-300 inline-flex items-center gap-1">
                Detail <ArrowUpRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="space-y-3">
            {promptVersions.slice(0, 5).map(p => {
              const stale = p.corpusFreshnessDays > 30;
              const lowCov = p.coverage < 70;
              return (
                <div key={p.id} className="text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        v{p.version} · {p.workflow}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {stale && <StatusBadge tone="warn">Stale {p.corpusFreshnessDays}d</StatusBadge>}
                      {lowCov && <StatusBadge tone="danger">Coverage {p.coverage}%</StatusBadge>}
                      {!stale && !lowCov && <StatusBadge tone="ok">Healthy</StatusBadge>}
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${p.coverage}%`,
                        background: lowCov ? "hsl(0 75% 62%)" : TEAL,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader
            eyebrow="Autonomy"
            title="Recent AI actions"
            right={
              <button onClick={() => onNavigate?.("ai-actions")} className="text-xs text-teal-300 inline-flex items-center gap-1">
                Detail <ArrowUpRight className="h-3 w-3" />
              </button>
            }
          />
          <div className="space-y-2">
            {recentActions.map(a => (
              <div key={a.id} className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.actionType}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.workflow} · {a.account}
                    </div>
                  </div>
                  <OutcomeBadge outcome={a.outcome} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                  <span>conf {(a.confidence * 100).toFixed(0)}%</span>
                  <span>{a.humanOverride ? "Human override" : "Autonomous"}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InsightList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {title}
      </div>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="text-xs text-foreground/85 leading-relaxed pl-4 relative">
            <span className="absolute left-0 top-1.5 h-1 w-1 rounded-full bg-muted-foreground/60" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClusterStatus({ status }: { status: string }) {
  const map: Record<string, { tone: Parameters<typeof StatusBadge>[0]["tone"]; label: string }> = {
    open: { tone: "danger", label: "Open" },
    in_progress: { tone: "info", label: "In progress" },
    monitoring: { tone: "warn", label: "Monitoring" },
    resolved: { tone: "ok", label: "Resolved" },
  };
  const m = map[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}