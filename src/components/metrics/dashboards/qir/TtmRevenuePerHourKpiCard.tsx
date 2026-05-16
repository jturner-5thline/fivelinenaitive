import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2, X as XIcon, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { QBO_ENTITIES } from '@/config/qboEntities';
import {
  InsightsDrilldownDrawer,
  type DrilldownColumn,
} from '../../insights/InsightsDrilldownDrawer';
import type { TtmRevPerHourConfig } from './kpiTemplates';

/* ─── Visual tokens (mirror QuarterlyInsightsReport) ─────────────── */
const RADIUS = 8;
const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';

/* ─── Formatters ─────────────────────────────────────────────────── */
function fmtUsd0(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(Math.trunc(n || 0));
}
function fmtUsdCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(0)}K`;
  return fmtUsd0(n);
}
function fmtHours(n: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n || 0)} hrs`;
}
function fmtDollarsPerHour(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${fmtUsd0(n)} / hr`;
}

/* ─── Trailing-12-month window from reporting date ──────────────── */
function ttmWindow(reportingDate: Date): { start: Date; end: Date } {
  const end = new Date(reportingDate);
  const start = new Date(reportingDate);
  start.setMonth(start.getMonth() - 12);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/* ─── Numerator: TTM Income for realm from QBO P&L cache ────────── */
function useTtmRevenue(realmId: string, start: Date, end: Date) {
  const { user } = useAuth();
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['kpi-ttm-rev-per-hour', 'revenue', realmId, startStr, endStr, user?.id],
    enabled: !!user && !!realmId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Try cached P&L report.
      const tryCache = async () => {
        const { data } = await supabase
          .from('quickbooks_reports')
          .select('report_data')
          .eq('report_type', 'profit_and_loss')
          .eq('realm_id', realmId)
          .eq('period_start', startStr)
          .eq('period_end', endStr)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return data?.report_data ?? null;
      };
      let report: any = await tryCache();
      if (!report) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.functions.invoke('quickbooks-sync', {
              body: {
                syncType: 'profit_and_loss',
                realmId,
                start_date: startStr,
                end_date: endStr,
              },
            });
            report = await tryCache();
          }
        } catch (e) {
          console.warn('[useTtmRevenue] QBO sync failed', e);
        }
      }
      if (!report) return { revenue: null as number | null };
      const rows: any[] = report?.Rows?.Row ?? [];
      for (const row of rows) {
        if (row?.type === 'Section' && row?.group === 'Income') {
          const v = parseFloat(row?.Summary?.ColData?.[1]?.value ?? '0');
          return { revenue: Number.isFinite(v) ? v : null };
        }
      }
      return { revenue: null };
    },
  });
}

/* ─── Denominator: hours logged in last 12 months on qualifying deals ─── */
interface DealHourRow { deal_id: string; company: string; hours: number; pipeline: string }
function useTtmDealHours(pipelineNames: string[], start: Date, end: Date) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const lcNames = useMemo(() => pipelineNames.map(n => n.trim().toLowerCase()), [pipelineNames]);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['kpi-ttm-rev-per-hour', 'hours', companyId, lcNames.join('|'), startStr, endStr],
    enabled: !!companyId && lcNames.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // 1) Resolve qualifying pipeline IDs.
      const { data: pipelines, error: pErr } = await supabase
        .from('deal_pipelines')
        .select('id, name')
        .eq('company_id', companyId);
      if (pErr) throw pErr;
      const includedPipelines = (pipelines ?? []).filter(
        p => lcNames.includes((p.name ?? '').trim().toLowerCase()),
      );
      const pipelineIdSet = new Set(includedPipelines.map(p => p.id));
      if (pipelineIdSet.size === 0) {
        return { totalHours: 0, byDeal: [] as DealHourRow[] };
      }
      const pipelineNameById = new Map(includedPipelines.map(p => [p.id, p.name as string]));

      // 2) Fetch weekly_time_entries in window, joined to deals (company,
      //    pipeline). RLS scopes to current company already.
      const { data: entries, error: eErr } = await supabase
        .from('weekly_time_entries')
        .select('deal_id, hours, week_start_date, deals!inner(company, pipeline_id, company_id)')
        .gte('week_start_date', startStr)
        .lte('week_start_date', endStr);
      if (eErr) throw eErr;

      const agg = new Map<string, DealHourRow>();
      let totalHours = 0;
      for (const row of (entries ?? []) as Array<{
        deal_id: string;
        hours: number | null;
        deals: { company: string | null; pipeline_id: string | null; company_id: string | null } | null;
      }>) {
        const pid = row.deals?.pipeline_id ?? null;
        if (!pid || !pipelineIdSet.has(pid)) continue;
        const co = (row.deals?.company ?? '').trim();
        const lc = co.toLowerCase();
        if (!co) continue;
        if (co === "Test-Niki's Store" || co === 'Example Deal' || lc.startsWith('test ')) continue;
        const h = Number(row.hours);
        if (!Number.isFinite(h) || h <= 0) continue;
        totalHours += h;
        const prev = agg.get(row.deal_id);
        if (prev) {
          prev.hours += h;
        } else {
          agg.set(row.deal_id, {
            deal_id: row.deal_id,
            company: co,
            hours: h,
            pipeline: pipelineNameById.get(pid) ?? '—',
          });
        }
      }
      const byDeal = Array.from(agg.values()).sort((a, b) => b.hours - a.hours);
      return { totalHours, byDeal };
    },
  });
}

/* ─── Card props ─────────────────────────────────────────────────── */
export interface TtmRevenuePerHourKpiCardProps {
  kpiId: string;
  title: string;
  config: TtmRevPerHourConfig;
  /** Reporting date for the trailing-12-month window. Defaults to "now". */
  reportingDate?: Date;
  reportLabel: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onPatchTitle: (next: string) => void;
  onPatchConfig: (next: TtmRevPerHourConfig) => void;
  onRemove: () => void;
}

export function TtmRevenuePerHourKpiCard({
  kpiId, title, config, reportingDate, reportLabel,
  isEditing, onToggleEdit, onClose, onPatchTitle, onPatchConfig, onRemove,
}: TtmRevenuePerHourKpiCardProps) {
  const refDate = reportingDate ?? new Date();
  const { start, end } = useMemo(() => ttmWindow(refDate), [refDate.getTime()]);

  const revQ = useTtmRevenue(config.revenueRealmId, start, end);
  const hoursQ = useTtmDealHours(config.pipelineNames, start, end);

  const revenue = revQ.data?.revenue ?? null;
  const totalHours = hoursQ.data?.totalHours ?? 0;
  const byDeal = hoursQ.data?.byDeal ?? [];
  const perHour = revenue != null && totalHours > 0 ? revenue / totalHours : null;

  const loading = revQ.isLoading || hoursQ.isLoading;
  const noHours = !loading && totalHours <= 0;

  const formulaHint = `TTM Revenue / ${config.pipelineNames.join(' + ')} Deal Hours (Last 12 Months)`;

  /* ─── Drilldown ─── */
  const [drillOpen, setDrillOpen] = useState(false);
  const columns: DrilldownColumn<DealHourRow>[] = [
    { key: 'company', label: 'Deal' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'hours', label: 'Hours (TTM)', align: 'right', render: r => fmtHours(r.hours) },
  ];
  const drillSummary = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      <Stat label={`TTM Revenue · ${config.entityLabel}`} value={revenue == null ? '—' : fmtUsd0(revenue)} />
      <Stat label={config.denominatorLabel} value={fmtHours(totalHours)} />
      <Stat label="Revenue per Hour" value={fmtDollarsPerHour(perHour)} accent />
    </div>
  );
  const drillContext = {
    sourceId: `kpi:${kpiId}`,
    sourceLabel: `KPI · ${title}`,
    periodLabel: `Trailing 12 months ending ${end.toLocaleDateString()}`,
    filters: [
      { label: 'Entity (revenue)', value: config.entityLabel },
      { label: 'Pipelines (hours)', value: config.pipelineNames.join(', ') },
      { label: 'Hours source', value: config.hoursSource },
    ],
  };

  return (
    <>
      <div
        data-comment-source="kpi"
        data-comment-source-id={kpiId}
        data-comment-source-label={`KPI · ${title}`}
        role="button"
        tabIndex={0}
        title={formulaHint}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('input, select, textarea, button, [data-kpi-edit]')) return;
          setDrillOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const t = e.target as HTMLElement;
          if (t.closest('input, select, textarea, button, [data-kpi-edit]')) return;
          e.preventDefault();
          setDrillOpen(true);
        }}
        style={{
          position: 'relative',
          gridColumn: 'span 2',
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 14, borderRadius: RADIUS,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          cursor: 'pointer', minHeight: 168,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.08em', color: TEXT_LABEL,
            }}>Revenue Efficiency · Template</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{config.entityLabel} · trailing 12 months</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Edit KPI"
            onClick={(e) => { e.stopPropagation(); onToggleEdit(); }}
            style={{
              background: 'transparent', border: 'none', color: TEXT_LABEL,
              cursor: 'pointer', padding: 4, borderRadius: 6, display: 'inline-flex',
            }}
          >
            <Pencil size={12} />
          </button>
        </div>

        {/* Primary metric */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{
            fontSize: 28, fontWeight: 700, color: TEXT_PRIMARY,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.05,
          }}>
            {loading ? '…' : fmtDollarsPerHour(perHour)}
          </div>
          {noHours && (
            <div style={{ fontSize: 10, color: TEXT_MUTED }}>
              No qualifying deal hours in trailing 12 months
            </div>
          )}
        </div>

        {/* Supporting metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SubMetric label="TTM Revenue" value={loading ? '…' : (revenue == null ? '—' : fmtUsdCompact(revenue))} />
          <SubMetric label={config.denominatorLabel} value={loading ? '…' : fmtHours(totalHours)} />
        </div>

        {/* Formula footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 9.5, color: TEXT_MUTED, marginTop: 'auto', paddingTop: 4,
        }}>
          <Info size={10} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formulaHint}</span>
        </div>

        {/* Inline editor */}
        {isEditing && (
          <div
            data-kpi-edit
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(12,18,28,0.96)',
              border: '1px solid rgba(120,170,255,0.25)',
              borderRadius: RADIUS, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8, zIndex: 2, overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>
                Edit · TTM Revenue per Deal Hour
              </span>
              <button type="button" aria-label="Close editor" onClick={onClose}
                style={{ background: 'transparent', border: 'none', color: TEXT_LABEL, cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
                <XIcon size={12} />
              </button>
            </div>
            <Field label="Title">
              <input value={title} onChange={e => onPatchTitle(e.target.value)} style={inputStyleEditor} />
            </Field>
            <Field label="Revenue entity (QBO realm)">
              <select
                value={config.revenueRealmId}
                onChange={e => {
                  const ent = QBO_ENTITIES.find(x => x.realmId === e.target.value);
                  onPatchConfig({
                    ...config,
                    revenueRealmId: e.target.value,
                    entityLabel: ent?.fullName ?? config.entityLabel,
                  });
                }}
                style={inputStyleEditor}
              >
                {QBO_ENTITIES.map(ent => (
                  <option key={ent.realmId} value={ent.realmId}>{ent.fullName}</option>
                ))}
              </select>
            </Field>
            <Field label="Included pipeline names (comma-separated)">
              <input
                value={config.pipelineNames.join(', ')}
                onChange={e => onPatchConfig({
                  ...config,
                  pipelineNames: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })}
                style={inputStyleEditor}
                placeholder="Active Pipeline, In Development"
              />
            </Field>
            <Field label="Denominator label">
              <input
                value={config.denominatorLabel}
                onChange={e => onPatchConfig({ ...config, denominatorLabel: e.target.value })}
                style={inputStyleEditor}
              />
            </Field>
            <Field label="Hours source (locked)">
              <input value={config.hoursSource} readOnly
                style={{ ...inputStyleEditor, opacity: 0.6, cursor: 'not-allowed' }} />
            </Field>
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => { onRemove(); onClose(); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)',
                  color: '#fca5a5', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                }}>
                <Trash2 size={12} /> Remove
              </button>
              <button type="button" onClick={onClose}
                style={{
                  background: 'transparent', border: '1px solid rgba(120,170,255,0.3)',
                  color: TEXT_PRIMARY, padding: '6px 10px', borderRadius: 6, fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                }}>Done</button>
            </div>
          </div>
        )}
      </div>

      <InsightsDrilldownDrawer<DealHourRow>
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        context={drillOpen ? drillContext : null}
        columns={columns}
        rows={byDeal}
        summary={drillSummary}
        emptyHint="No qualifying hours logged in the trailing 12 months."
      />
    </>
  );
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6,
      background: accent ? 'rgba(120,170,255,0.1)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(120,170,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyleEditor: React.CSSProperties = {
  background: 'rgba(10,18,36,0.6)',
  border: '1px solid rgba(120,170,255,0.18)',
  color: TEXT_PRIMARY,
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  outline: 'none',
  width: '100%',
};