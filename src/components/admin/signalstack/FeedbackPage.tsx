import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader, StatusBadge } from "./ui";
import { feedbackItems, themePulse } from "./mockData";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Search } from "lucide-react";

const SOURCES = ["NPS", "Support", "Interview", "In-app", "Call notes"] as const;

export function FeedbackPage() {
  const [query, setQuery] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<string | null>(null);
  const [themeFilter, setThemeFilter] = React.useState<string | null>(null);

  const themes = Array.from(new Set(feedbackItems.map(f => f.theme)));

  const filtered = feedbackItems.filter(f => {
    if (sourceFilter && f.source !== sourceFilter) return false;
    if (themeFilter && f.theme !== themeFilter) return false;
    if (query && !`${f.quote} ${f.author} ${f.account}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const counts = {
    requests: feedbackItems.filter(f => f.type === "feature_request").length,
    bugs: feedbackItems.filter(f => f.type === "bug").length,
    usability: feedbackItems.filter(f => f.type === "usability").length,
    praise: feedbackItems.filter(f => f.type === "praise").length,
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Voice of customer"
        title="Feedback intelligence"
        description="Theme-clustered, sentiment-scored, traceable to workflows and issue clusters."
        right={
          <div className="relative w-[260px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search feedback…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TypeStat label="Feature requests" value={counts.requests} tone="info" />
        <TypeStat label="Bugs" value={counts.bugs} tone="danger" />
        <TypeStat label="Usability issues" value={counts.usability} tone="warn" />
        <TypeStat label="Praise" value={counts.praise} tone="ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <SectionHeader title="Theme volume × sentiment" eyebrow="Themes" />
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={themePulse} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="theme" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="volume" radius={[3, 3, 0, 0]} onClick={(d: { theme: string }) => setThemeFilter(d.theme)}>
                  {themePulse.map((t, i) => (
                    <Cell
                      key={i}
                      fill={t.sentiment < -0.3 ? "hsl(0 75% 62%)" : t.sentiment > 0.2 ? "hsl(150 60% 50%)" : "hsl(35 95% 60%)"}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1 mt-3">
            <FilterChip active={themeFilter === null} onClick={() => setThemeFilter(null)}>All themes</FilterChip>
            {themes.map(t => (
              <FilterChip key={t} active={themeFilter === t} onClick={() => setThemeFilter(t)}>{t}</FilterChip>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Source mix" eyebrow="Where it came from" />
          <div className="space-y-2">
            <FilterChip active={sourceFilter === null} onClick={() => setSourceFilter(null)}>All sources</FilterChip>
            {SOURCES.map(s => {
              const v = feedbackItems.filter(f => f.source === s).length;
              return (
                <div key={s} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    onClick={() => setSourceFilter(sourceFilter === s ? null : s)}
                    className={`text-left hover:text-foreground transition-colors ${sourceFilter === s ? "text-teal-300" : "text-muted-foreground"}`}
                  >
                    {s}
                  </button>
                  <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                    <div className="h-1 flex-1 bg-muted/40 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-400" style={{ width: `${(v / feedbackItems.length) * 100}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-5 text-right">{v}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionHeader
          title="Quotes & evidence"
          eyebrow={`${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(f => (
            <div key={f.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{f.source}</StatusBadge>
                  <StatusBadge
                    tone={f.sentiment === "negative" ? "danger" : f.sentiment === "positive" ? "ok" : "warn"}
                  >
                    {f.sentiment}
                  </StatusBadge>
                  <StatusBadge tone="info">{f.theme}</StatusBadge>
                </div>
                <span className="text-[10px] text-muted-foreground">{f.date}</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">"{f.quote}"</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{f.author} · {f.account}</span>
                <span className="text-teal-300/80">→ {f.workflow}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TypeStat({ label, value, tone }: { label: string; value: number; tone: "info" | "danger" | "warn" | "ok" }) {
  const tint: Record<string, string> = {
    info: "text-sky-300",
    danger: "text-rose-300",
    warn: "text-amber-300",
    ok: "text-emerald-300",
  };
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tint[tone]}`}>{value}</div>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset transition-colors ${
        active
          ? "bg-teal-500/15 text-teal-200 ring-teal-500/30"
          : "bg-muted/30 text-muted-foreground ring-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}