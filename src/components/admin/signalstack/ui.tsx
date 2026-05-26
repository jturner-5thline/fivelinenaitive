import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

/**
 * Shared SignalStack visual primitives. Dark-first, teal-accented, calm.
 */

export const TEAL = "hsl(174 72% 48%)";
export const TEAL_SOFT = "hsl(174 60% 65%)";

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            {eyebrow}
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: "ok" | "warn" | "danger" | "info" | "neutral" | "teal";
  children: React.ReactNode;
  className?: string;
}) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    danger: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    info: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
    teal: "bg-teal-500/10 text-teal-300 ring-teal-500/20",
    neutral: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Trend({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const tone = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", tone)}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}{delta}{suffix}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  series,
  tone = "teal",
  hint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;
  series?: number[];
  tone?: "teal" | "warn" | "danger" | "ok";
  hint?: string;
}) {
  const stroke: Record<string, string> = {
    teal: TEAL,
    warn: "hsl(35 95% 60%)",
    danger: "hsl(0 75% 62%)",
    ok: "hsl(150 60% 50%)",
  };
  const data = (series ?? []).map((v, i) => ({ i, v }));
  return (
    <Card className="p-4 flex flex-col gap-2 min-h-[120px] justify-between">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {typeof delta === "number" && <Trend delta={delta} />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        {unit && <div className="text-sm text-muted-foreground">{unit}</div>}
      </div>
      {series && series.length > 0 && (
        <div className="h-9 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke[tone]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={stroke[tone]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={stroke[tone]}
                strokeWidth={1.5}
                fill={`url(#spark-${label})`}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ display: "none" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function SeverityDot({ severity }: { severity: "critical" | "high" | "medium" | "low" }) {
  const tone: Record<string, string> = {
    critical: "bg-rose-400 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]",
    high: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]",
    medium: "bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]",
    low: "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone[severity])} />;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { tone: Parameters<typeof StatusBadge>[0]["tone"]; label: string }> = {
    success: { tone: "ok", label: "Success" },
    edited: { tone: "info", label: "Edited" },
    overridden: { tone: "warn", label: "Overridden" },
    failed: { tone: "danger", label: "Failed" },
    pending_review: { tone: "neutral", label: "Pending" },
  };
  const m = map[outcome] ?? { tone: "neutral" as const, label: outcome };
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export function ConvergenceBar({
  signals,
}: {
  signals: { behavior: number; feedback: number; aiFailure: number; business: number };
}) {
  const total = signals.behavior + signals.feedback + signals.aiFailure + signals.business;
  const seg = (v: number, color: string) => (
    <div className={cn("h-full", color)} style={{ width: `${(v / total) * 100}%` }} />
  );
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
      {seg(signals.behavior, "bg-teal-500")}
      {seg(signals.feedback, "bg-amber-500")}
      {seg(signals.aiFailure, "bg-rose-500")}
      {seg(signals.business, "bg-sky-500")}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="text-xs mt-1 max-w-sm">{description}</div>}
    </div>
  );
}