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

// ── SectionHeader ──────────────────────────────────────
export function SectionHeader({ title, flags, className }: { title: string; flags?: number; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b-2 border-slate-800 pb-1 mb-4", className)}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">{title}</h2>
      {flags !== undefined && flags > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-sm">
          <AlertTriangle className="h-3 w-3" /> Flags: {flags}
        </span>
      )}
    </div>
  );
}

// ── MetricCard ─────────────────────────────────────────
export function MetricCard({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn("bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-sm", className)}>
      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{label}</p>
      <p className="text-lg font-bold text-slate-900 font-mono tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── SummaryTile ────────────────────────────────────────
export function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className="text-xs font-semibold text-slate-900">{value}</span>
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
          <tr className="border-b-2 border-slate-300">
            {headers.map((h, i) => (
              <th key={i} className={cn(
                "py-1.5 px-2 font-bold text-[10px] uppercase tracking-wider text-slate-600",
                i === 0 ? "text-left" : "text-right"
              )}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 hover:bg-slate-50/50">
              {row.map((cell, ci) => (
                <td key={ci} className={cn(
                  "py-1.5 px-2 font-mono tabular-nums text-slate-800",
                  ci === 0 ? "text-left font-sans font-medium" : "text-right",
                  typeof cell === 'string' && cell.startsWith('(') && "text-red-600",
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
    if (status === 'check') return <Check className="h-3.5 w-3.5 text-emerald-600" />;
    if (status === 'dash') return <Minus className="h-3.5 w-3.5 text-slate-400" />;
    return <span className="text-slate-300">—</span>;
  };

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b-2 border-slate-300">
          <th className="py-1.5 px-2 text-left font-bold text-[10px] uppercase tracking-wider text-slate-600">Item</th>
          <th className="py-1.5 px-2 text-center font-bold text-[10px] uppercase tracking-wider text-slate-600">Monthly</th>
          <th className="py-1.5 px-2 text-center font-bold text-[10px] uppercase tracking-wider text-slate-600">Quarterly</th>
          <th className="py-1.5 px-2 text-center font-bold text-[10px] uppercase tracking-wider text-slate-600">Annual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.item} className="border-b border-slate-100">
            <td className="py-1.5 px-2 font-medium text-slate-800">{row.item}</td>
            <td className="py-1.5 px-2 text-center"><div className="flex justify-center">{icon(row.monthly)}</div></td>
            <td className="py-1.5 px-2 text-center"><div className="flex justify-center">{icon(row.quarterly)}</div></td>
            <td className="py-1.5 px-2 text-center"><div className="flex justify-center">{icon(row.annual)}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── KpiGrid ────────────────────────────────────────────
export function KpiGrid({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white border border-slate-200 px-3 py-2.5 rounded-sm">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{t.label}</p>
          <div className="flex items-center gap-1.5">
            {t.icon && <span className="text-xs">{t.icon}</span>}
            <p className="text-base font-bold text-slate-900 font-mono tabular-nums leading-tight">{t.value}</p>
          </div>
          {t.delta && (
            <p className={cn(
              "text-[10px] font-medium mt-0.5",
              t.good ? "text-emerald-600" : "text-red-600"
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white border border-slate-200 px-3 py-2.5 rounded-sm">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{t.label}</p>
          <p className="text-base font-bold text-slate-900 font-mono tabular-nums leading-tight">{t.value}</p>
          {t.sub && <p className="text-[10px] text-slate-500 mt-0.5">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── NotesPanel ─────────────────────────────────────────
export function NotesPanel({ notes }: { notes: AnalystNote[] }) {
  return (
    <div className="space-y-3">
      {notes.map((note, i) => (
        <div key={i} className={cn(
          "px-4 py-3 rounded-sm border text-xs leading-relaxed",
          note.type === 'warning'
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-slate-50 border-slate-200 text-slate-800"
        )}>
          {note.type === 'warning' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              <span className="font-bold text-[10px] uppercase tracking-wider text-amber-700">Warning</span>
            </div>
          )}
          {note.type === 'commentary' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Analyst Commentary</span>
            </div>
          )}
          <p>{note.text}</p>
        </div>
      ))}
    </div>
  );
}

// ── BalanceSheetTable ──────────────────────────────────
export function BalanceSheetTable({ periods, rows }: { periods: string[]; rows: BalanceSheetRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-300">
            <th className="py-1.5 px-2 text-left font-bold text-[10px] uppercase tracking-wider text-slate-600">Item</th>
            {periods.map((p) => (
              <th key={p} className="py-1.5 px-2 text-right font-bold text-[10px] uppercase tracking-wider text-slate-600 whitespace-nowrap">{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="py-1.5 px-2 font-medium text-slate-800">{row.item}</td>
              {row.values.map((v, i) => (
                <td key={i} className={cn(
                  "py-1.5 px-2 text-right font-mono tabular-nums",
                  v < 0 ? "text-red-600" : "text-slate-800"
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
    { label: 'Company Prepared', active: quality.company_prepared },
    { label: 'CPA Reviewed', active: quality.cpa_reviewed },
    { label: 'Audited', active: quality.audited },
  ];
  return (
    <div className="flex gap-3">
      {items.map((item) => (
        <div key={item.label} className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-xs font-medium",
          item.active
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-slate-50 border-slate-200 text-slate-400"
        )}>
          {item.active ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ── PnlBlock ──────────────────────────────────────────
export function PnlBlock({ title, table, summaryMetrics, flags }: {
  title: string;
  table: { headers: string[]; rows: (string | number)[][] };
  summaryMetrics: { label: string; value: string }[];
  flags?: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
        {flags !== undefined && flags > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
            <AlertTriangle className="h-2.5 w-2.5" /> Flags: {flags}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] divide-x divide-slate-100">
        <div className="p-3">
          <DataTable headers={table.headers} rows={table.rows} />
        </div>
        <div className="p-3 space-y-2 bg-slate-50/50">
          {summaryMetrics.map((m) => (
            <div key={m.label} className="flex justify-between items-baseline">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{m.label}</span>
              <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">{m.value}</span>
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
    <div className="bg-slate-800 text-white rounded-sm p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">SaaS Facility</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Borrowing Capacity Today</p>
          <p className="text-lg font-bold font-mono tabular-nums">{fmtMM(facility.borrowing_capacity_today)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Borrowing Capacity (6M)</p>
          <p className="text-lg font-bold font-mono tabular-nums">{fmtMM(facility.borrowing_capacity_6m)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Deferred Revenue (Today)</p>
          <p className="text-sm font-bold font-mono tabular-nums">{fmtMM(facility.deferred_revenue_today)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Deferred Revenue (6M Proj.)</p>
          <p className="text-sm font-bold font-mono tabular-nums">{fmtMM(facility.deferred_revenue_6m)}</p>
        </div>
      </div>
      <div className="border-t border-slate-600 pt-3">
        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Facility Recommendation</p>
        <p className="text-xl font-bold font-mono tabular-nums text-emerald-400">{fmtMM(facility.facility_recommendation)}</p>
      </div>
    </div>
  );
}
