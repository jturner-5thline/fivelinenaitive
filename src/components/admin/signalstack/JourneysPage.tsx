import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader, StatusBadge, TEAL } from "./ui";
import { journeys } from "./mockData";
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
import { PlayCircle, Filter } from "lucide-react";

export function JourneysPage() {
  const [segment, setSegment] = React.useState<string>("all");
  const [selectedJourney, setSelectedJourney] = React.useState(journeys[0].id);
  const j = journeys.find(x => x.id === selectedJourney)!;
  const data = j.steps.map(s => ({
    name: s.name,
    completion: Math.round(s.completionRate * 100),
    friction: s.frictionScore,
    users: s.users,
    duration: s.avgDurationMin,
  }));
  const worst = [...j.steps].sort((a, b) => b.frictionScore - a.frictionScore).slice(0, 3);

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Workflow analytics"
        title="Journeys"
        description="Funnel, drop-off, and friction hotspots across the workflows that matter."
        right={
          <div className="flex items-center gap-2">
            <Select value={selectedJourney} onValueChange={setSelectedJourney}>
              <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {journeys.map(jj => (
                  <SelectItem key={jj.id} value={jj.id}>{jj.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All segments</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="mid">Mid-market</SelectItem>
                <SelectItem value="smb">SMB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <SmallStat label="Entered" value={j.steps[0].users.toLocaleString()} />
        <SmallStat label="Completed" value={j.steps[j.steps.length - 1].users.toLocaleString()} />
        <SmallStat
          label="End-to-end completion"
          value={`${Math.round((j.steps[j.steps.length - 1].users / j.steps[0].users) * 100)}%`}
          tone="warn"
        />
        <SmallStat
          label="Worst friction step"
          value={worst[0].name}
          tone="danger"
          hint={`Friction ${worst[0].frictionScore}/100`}
        />
      </div>

      <Card className="p-5">
        <SectionHeader title="Step completion vs friction" eyebrow="Funnel" />
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} width={150} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n) => [`${v}${n === "completion" || n === "friction" ? "%" : ""}`, n]}
              />
              <Bar dataKey="completion" name="Completion %" radius={[0, 3, 3, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.completion >= 90 ? "hsl(150 60% 50%)" : d.completion >= 75 ? TEAL : "hsl(35 95% 60%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <SectionHeader title="Friction hotspots" eyebrow="Where to look first" />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <th className="py-2 font-medium">Step</th>
                <th className="py-2 font-medium">Users</th>
                <th className="py-2 font-medium">Avg duration</th>
                <th className="py-2 font-medium">Friction</th>
                <th className="py-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {j.steps.map((s, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 font-medium">{s.name}</td>
                  <td className="py-2.5 tabular-nums">{s.users}</td>
                  <td className="py-2.5 tabular-nums">{s.avgDurationMin} min</td>
                  <td className="py-2.5">
                    <FrictionBar value={s.frictionScore} />
                  </td>
                  <td className="py-2.5">
                    <button className="inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200">
                      <PlayCircle className="h-3.5 w-3.5" /> View sessions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Segment filter" eyebrow="Filters" right={<Filter className="h-3.5 w-3.5 text-muted-foreground" />} />
          <div className="space-y-2 text-sm">
            <FilterRow label="Customer segment" />
            <FilterRow label="Account size" />
            <FilterRow label="Workflow" />
            <FilterRow label="Owner" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Date range</div>
              <Input type="text" placeholder="Last 30 days" className="h-8 text-xs" />
            </div>
            <StatusBadge tone="info">Linked to 2 issue clusters</StatusBadge>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SmallStat({ label, value, tone, hint }: { label: string; value: string; tone?: "warn" | "danger"; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tracking-tight mt-1 ${tone === "danger" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : ""}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

function FrictionBar({ value }: { value: number }) {
  const color = value > 70 ? "bg-rose-500" : value > 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

function FilterRow({ label }: { label: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <Select>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}