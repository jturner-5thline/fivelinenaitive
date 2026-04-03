import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Check, Minus, FileText, AlertCircle } from 'lucide-react';
import type { ChecklistRow, KpiTile, SaasMetricTile, AnalystNote, BalanceSheetRow } from './types';

// ── Formatters ─────────────────────────────────────────
export function fmtMM(val: number): string {
  const abs = Math.abs(val);
  let formatted: string;
  if (abs >= 1_000_000_000) formatted = `$${(abs / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(1)}MM`;
  else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(0)}K`;
  else formatted = `$${abs.toFixed(0)}`;
  return val < 0 ? `(${formatted})` : formatted;
}

export function isNegativeValue(display: string): boolean {
  if (display.startsWith('(') && display.endsWith(')')) return true;
  if (/^-/.test(display.trim())) return true;
  return false;
}

export function isPositivePercent(display: string): boolean {
  const s = display.trim();
  return /^\+?\d/.test(s) && s.includes('%') && !isNegativeValue(s);
}

export function currencyColor(display: string, base = 'text-foreground'): string {
  if (isNegativeValue(display)) return 'text-destructive';
  if (isPositivePercent(display)) return 'text-success';
  return base;
}

// ── SectionDivider ─────────────────────────────────────
// Reference-style: title with extending line, optional flag count
export function SectionDivider({ title, flags, className }: { title: string; flags?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3.5 mt-8 mb-4 pt-2", className)}>
      <h2 className="text-base font-semibold tracking-tight text-foreground whitespace-nowrap">{title}</h2>
      {flags !== undefined && flags > 0 && (
        <span className="text-[11px] px-2.5 py-0.5 rounded bg-destructive/10 text-destructive font-semibold whitespace-nowrap">
          Flags: {flags}
        </span>
      )}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── SubHeader ──────────────────────────────────────────
export function SubHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-5 mb-3", className)}>
      {children}
    </p>
  );
}

// Keep old SectionHeader as alias for backward compat
export function SectionHeader({ title, flags, className }: { title: string; flags?: number; className?: string }) {
  return <SectionDivider title={title} flags={flags} className={className} />;
}

// ── PnlKpiCard ─────────────────────────────────────────
// Top-of-P&L large KPI card matching the reference
export function PnlKpiCard({ label, value, sub, ttmLabel, ttmValue, ttmColor }: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  ttmLabel?: string;
  ttmValue?: string;
  ttmColor?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 relative">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2.5">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", currencyColor(value))}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
      {ttmLabel && (
        <div className="absolute top-4 right-4 text-right">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium">{ttmLabel}</p>
          <p className={cn("text-[15px] font-semibold tabular-nums mt-0.5", ttmColor || 'text-foreground')}>{ttmValue}</p>
        </div>
      )}
    </div>
  );
}

// ── AnnualCard ─────────────────────────────────────────
// Reference-style annual breakdown card with table + footer
export function AnnualCard({ title, headers, rows, footerLabel, footerValue, footerSub }: {
  title: string;
  headers: string[];
  rows: { cells: string[]; colors?: string[] }[];
  footerLabel: string;
  footerValue: string;
  footerSub?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cn(
                "text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium px-4 py-1.5 border-b border-border",
                i === 0 ? "text-left" : "text-right"
              )}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.cells.map((cell, ci) => (
                <td key={ci} className={cn(
                  "px-4 py-2 text-xs tabular-nums border-b border-border/50",
                  ci === 0 ? "text-left font-medium text-foreground" : "text-right text-muted-foreground",
                  ci > 0 && row.colors?.[ci] ? row.colors[ci] : ci > 0 ? currencyColor(cell, 'text-muted-foreground') : '',
                )}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">{footerLabel}</span>
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tabular-nums text-foreground">{footerValue}</span>
          {footerSub && <span className="text-[11px] text-muted-foreground">{footerSub}</span>}
        </div>
      </div>
    </div>
  );
}

// ── MetricCard (operating-style) ──────────────────────
export function MetricCard({ label, value, sub, highlight, className }: {
  label: string; value: string; sub?: string; highlight?: boolean; className?: string;
}) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl px-4 py-3.5",
      highlight && "border-primary/25 bg-primary/[0.04]",
      className
    )}>
      <p className={cn("text-[9px] uppercase tracking-widest font-medium mb-2", highlight ? "text-primary" : "text-muted-foreground/60")}>{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", highlight ? "text-primary" : currencyColor(value))}>{value}</p>
      {sub && <p className={cn("text-[10px] mt-0.5", sub.includes('%') && !isNegativeValue(sub) ? "text-success" : "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}

// ── SummaryTile ────────────────────────────────────────
export function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

// ── DataTable (generic) ────────────────────────────────
export function DataTable({ headers, rows, className }: {
  headers: string[];
  rows: (string | number)[][];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className={cn(
                "py-1.5 px-2 font-bold text-[10px] uppercase tracking-wider text-muted-foreground",
                i === 0 ? "text-left" : "text-right"
              )}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/30">
              {row.map((cell, ci) => (
                <td key={ci} className={cn(
                  "py-1.5 px-2 font-mono tabular-nums",
                  ci === 0 ? "text-left font-sans font-medium text-foreground" : "text-right",
                  ci > 0 && typeof cell === 'string' ? currencyColor(cell) : ci > 0 ? "text-foreground" : "",
                )}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ChecklistMatrix ────────────────────────────────────
export function ChecklistMatrix({ rows }: { rows: ChecklistRow[] }) {
  const icon = (status: 'check' | 'blank' | 'dash') => {
    if (status === 'check') return <span className="text-success">✓</span>;
    if (status === 'dash') return <span className="text-muted-foreground/50">—</span>;
    return <span className="text-muted-foreground/50">—</span>;
  };

  return (
    <table className="w-full text-xs border-collapse mt-2">
      <thead>
        <tr>
          <th className="py-1.5 px-3 text-left font-medium text-[9px] uppercase tracking-widest text-muted-foreground/60">Item</th>
          <th className="py-1.5 px-3 text-center font-medium text-[9px] uppercase tracking-widest text-muted-foreground/60">Monthly</th>
          <th className="py-1.5 px-3 text-center font-medium text-[9px] uppercase tracking-widest text-muted-foreground/60">Quarterly</th>
          <th className="py-1.5 px-3 text-center font-medium text-[9px] uppercase tracking-widest text-muted-foreground/60">Annual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.item} className="border-b border-border/50 last:border-0">
            <td className="py-2 px-3 text-muted-foreground">{row.item}</td>
            <td className="py-2 px-3 text-center text-xs">{icon(row.monthly)}</td>
            <td className="py-2 px-3 text-center text-xs">{icon(row.quarterly)}</td>
            <td className="py-2 px-3 text-center text-xs">{icon(row.annual)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── KpiGrid ────────────────────────────────────────────
export function KpiGrid({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card border border-border rounded-xl px-4 py-3.5">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2">{t.label}</p>
          <div className="flex items-center gap-1.5">
            {t.icon && <span className="text-xs">{t.icon}</span>}
            <p className={cn("text-lg font-semibold tabular-nums", currencyColor(t.value))}>{t.value}</p>
          </div>
          {t.delta && (
            <p className={cn(
              "text-[10px] font-medium mt-1",
              t.good ? "text-success" : "text-destructive"
            )}>{t.delta}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── SaasMetricsGrid ────────────────────────────────────
export function SaasMetricsGrid({ tiles }: { tiles: SaasMetricTile[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card border border-border rounded-xl px-4 py-3.5">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2">{t.label}</p>
          <p className={cn("text-lg font-semibold tabular-nums", currencyColor(t.value))}>{t.value}</p>
          {t.sub && <p className="text-[10px] text-muted-foreground mt-1">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── NotesPanel (reference: 2-col analyst + warnings) ──
export function NotesPanel({ notes }: { notes: AnalystNote[] }) {
  const commentary = notes.filter(n => n.type === 'commentary');
  const warnings = notes.filter(n => n.type === 'warning');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
      {/* Commentary card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Analyst commentary
        </h3>
        {commentary.length > 0 ? (
          commentary.map((n, i) => (
            <p key={i} className="text-[13px] text-muted-foreground leading-relaxed">{n.text}</p>
          ))
        ) : (
          <p className="text-[13px] text-muted-foreground/50 italic">No commentary available.</p>
        )}
      </div>

      {/* Warnings card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          Warnings & red flags
          {warnings.length > 0 && (
            <span className="ml-auto text-[11px] px-2.5 py-0.5 rounded bg-destructive/10 text-destructive font-semibold">
              {warnings.length}
            </span>
          )}
        </h3>
        {warnings.length > 0 ? (
          <div className="space-y-0">
            {warnings.map((n, i) => (
              <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
                <div className="w-4.5 h-4.5 rounded bg-warning/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="h-2.5 w-2.5 text-warning" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{n.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">No warnings.</p>
        )}
      </div>
    </div>
  );
}

// ── BalanceSheetTable ──────────────────────────────────
export function BalanceSheetTable({ periods, rows }: { periods: string[]; rows: BalanceSheetRow[] }) {
  // Last actual period gets accent highlight (assume 2nd-to-last or last non-projected)
  const currentIdx = Math.max(0, periods.length - 3); // roughly the "current" period

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2.5 px-4 text-left font-medium text-[9px] uppercase tracking-widest text-muted-foreground/60 min-w-[170px]">Item</th>
            {periods.map((p, i) => (
              <th key={p} className={cn(
                "py-2.5 px-4 text-right font-medium text-[9px] uppercase tracking-widest whitespace-nowrap",
                i === currentIdx ? "text-primary relative" : i > currentIdx ? "text-muted-foreground/40 italic" : "text-muted-foreground/60"
              )}>
                {p}
                {i === currentIdx && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-sm" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item} className="border-b border-border/50 hover:bg-muted/20">
              <td className="py-2.5 px-4 font-medium text-foreground text-[13px]">{row.item}</td>
              {row.values.map((v, i) => (
                <td key={i} className={cn(
                  "py-2.5 px-4 text-right tabular-nums text-xs",
                  i === currentIdx ? "text-primary font-medium bg-primary/[0.03]" : i > currentIdx ? "text-muted-foreground/40" : "text-muted-foreground",
                  v < 0 && "text-destructive"
                )}>{fmtMM(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── FinancialQuality ──────────────────────────────────
export function FinancialQuality({ quality }: { quality: { company_prepared: boolean; cpa_reviewed: boolean; audited: boolean } }) {
  const items = [
    { label: 'Company prepared', active: quality.company_prepared },
    { label: 'CPA reviewed', active: quality.cpa_reviewed },
    { label: 'Audited', active: quality.audited },
  ];
  return (
    <div className="flex gap-2 flex-wrap mt-2.5">
      {items.map((item) => (
        <div key={item.label} className={cn(
          "px-3.5 py-1.5 rounded-md border text-[11px] font-medium",
          item.active
            ? "bg-success/10 border-success/20 text-success"
            : "border-border text-muted-foreground/50"
        )}>
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ── PnlBlock (kept for backward compat but no longer primary) ──
export function PnlBlock({ title, table, summaryMetrics, flags }: {
  title: string;
  table: { headers: string[]; rows: (string | number)[][] };
  summaryMetrics: { label: string; value: string }[];
  flags?: number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {flags !== undefined && flags > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded-sm">
            <AlertTriangle className="h-2.5 w-2.5" /> Flags: {flags}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] divide-x divide-border">
        <div className="p-3">
          <DataTable headers={table.headers} rows={table.rows} />
        </div>
        <div className="p-3 space-y-2 bg-muted/20">
          {summaryMetrics.map((m) => (
            <div key={m.label} className="flex justify-between items-baseline">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{m.label}</span>
              <span className={cn("text-sm font-bold font-mono tabular-nums", currencyColor(m.value))}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FacilityBox ───────────────────────────────────────
export function FacilityBox({ facility }: { facility: {
  borrowing_capacity_today: number;
  borrowing_capacity_6m: number;
  deferred_revenue_today: number;
  deferred_revenue_6m: number;
  facility_recommendation: number;
} }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      <MetricCard label="Borrowing capacity today" value={fmtMM(facility.borrowing_capacity_today)} />
      <MetricCard label="Borrowing capacity (6M)" value={fmtMM(facility.borrowing_capacity_6m)} />
      <MetricCard label="Deferred rev. (today)" value={fmtMM(facility.deferred_revenue_today)} />
      <MetricCard label="Deferred rev. (6M proj.)" value={fmtMM(facility.deferred_revenue_6m)} />
      <MetricCard label="Facility recommendation" value={fmtMM(facility.facility_recommendation)} highlight />
    </div>
  );
}
