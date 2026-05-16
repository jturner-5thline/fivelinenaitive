import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2, X as XIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  InsightsDrilldownDrawer,
  type DrilldownColumn,
} from '../../insights/InsightsDrilldownDrawer';
import {
  combineSalesClientsStatus,
  type SalesClientsConfig,
} from './kpiTemplates';

/* ─── Styling tokens (mirrors QuarterlyInsightsReport.tsx) ─────────── */
const RADIUS = 8;
const RADIUS_PILL = 9999;
const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';

/* ─── Quarter parsing ─────────────────────────────────────────────── */
const QUARTER_MONTH_START: Record<string, number> = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 };
function parseQuarterLabel(label: string): { start: Date; end: Date } | null {
  const m = /^(Q[1-4])\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const monthStart = QUARTER_MONTH_START[m[1]];
  const year = parseInt(m[2], 10);
  if (monthStart == null || !Number.isFinite(year)) return null;
  const start = new Date(Date.UTC(year, monthStart, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthStart + 3, 1, 0, 0, 0));
  // exclusive end → make inclusive by subtracting 1 ms
  end.setUTCMilliseconds(-1);
  return { start, end };
}
function priorQuarterLabel(label: string): string | null {
  const m = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const q = parseInt(m[1], 10);
  const y = parseInt(m[2], 10);
  if (q === 1) return `Q4 ${y - 1}`;
  return `Q${q - 1} ${y}`;
}

/* ─── Exclusions (mirror executive KPI hook) ─────────────────────── */
const EXCLUDED_DEAL_NAMES = new Set(["Test-Niki's Store", 'Example Deal']);
function isExcludedDealName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (EXCLUDED_DEAL_NAMES.has(n)) return true;
  if (n.toLowerCase().startsWith('test ')) return true;
  return false;
}

interface PipelineStage { id: string; label: string }

/** Resolve the active (is_default) pipeline + entry stage id for the
 *  configured stage label (default "Final Credit Items"). */
function useActivePipelineEntryStage(stageLabel: string) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['kpi-sales-clients', 'active-pipeline', companyId, stageLabel],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { pipelineId: null as string | null, entryStageId: null as string | null };
      const stages: PipelineStage[] = Array.isArray(data.stages)
        ? (data.stages as unknown as PipelineStage[])
        : [];
      const match = stages.find(s => s?.label?.trim().toLowerCase() === stageLabel.toLowerCase());
      return {
        pipelineId: data.id as string,
        entryStageId: match?.id ?? null,
      };
    },
  });
}

interface PeriodDeals { deals: Array<{ deal_id: string; company: string; value: number; entered_at: string }>; count: number; signed: number }

/** Deals that entered the configured stage between [start,end] on the
 *  active pipeline, deduped to earliest entry per deal. */
function useSignedDealsForPeriod(
  pipelineId: string | null,
  stageId: string | null,
  start: Date | null,
  end: Date | null,
  cacheKey: string,
) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  return useQuery({
    queryKey: ['kpi-sales-clients', 'signed-deals', companyId, pipelineId, stageId, cacheKey],
    enabled: !!companyId && !!pipelineId && !!stageId && !!start && !!end,
    staleTime: 60_000,
    queryFn: async (): Promise<PeriodDeals> => {
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company, value)')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .eq('to_stage', stageId)
        .gte('changed_at', start!.toISOString())
        .lte('changed_at', end!.toISOString());
      if (error) throw error;
      const seen = new Map<string, { deal_id: string; company: string; value: number; entered_at: string }>();
      for (const row of (data ?? []) as Array<{
        deal_id: string;
        changed_at: string;
        deals: { company: string | null; value: number | null } | null;
      }>) {
        const co = row.deals?.company ?? '';
        if (isExcludedDealName(co)) continue;
        const v = Number(row.deals?.value);
        const cand = {
          deal_id: row.deal_id,
          company: co || '—',
          value: Number.isFinite(v) ? v : 0,
          entered_at: row.changed_at,
        };
        const prev = seen.get(row.deal_id);
        if (!prev || cand.entered_at < prev.entered_at) seen.set(row.deal_id, cand);
      }
      const deals = Array.from(seen.values());
      let signed = 0;
      for (const d of deals) signed += d.value;
      return { deals, count: deals.length, signed };
    },
  });
}

/* ─── Formatting helpers ─────────────────────────────────────────── */
function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(Math.trunc(n || 0));
}
function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n || 0);
}
function deltaPct(curr: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) return null;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

/* ─── Status pill (shared visual language) ───────────────────────── */
function StatusPill({ status }: { status: 'On Track' | 'At Risk' }) {
  const pos = status === 'On Track';
  const bg = pos ? 'rgba(74,222,128,0.14)' : 'rgba(248,113,113,0.16)';
  const border = pos ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.5)';
  const fg = pos ? '#86efac' : '#fca5a5';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: RADIUS_PILL,
      background: bg, border: `1px solid ${border}`, color: fg,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.08em', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

function DeltaChip({ curr, prior, kind }: { curr: number; prior: number; kind: 'count' | 'usd' }) {
  const diff = curr - prior;
  const pct = deltaPct(curr, prior);
  const pos = diff >= 0;
  const fg = pos ? '#86efac' : '#fca5a5';
  const sign = pos ? '+' : '−';
  const mag = Math.abs(diff);
  const magStr = kind === 'usd' ? fmtUsd(mag) : fmtInt(mag);
  return (
    <span style={{ color: fg, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {sign}{magStr}{pct == null ? '' : ` (${pos ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

/* ─── Card props ─────────────────────────────────────────────────── */
export interface SalesClientsKpiCardProps {
  kpiId: string;
  title: string;
  config: SalesClientsConfig;
  /** Reporting state of the report; the template defaults to s.quarter. */
  reportQuarter: string;
  reportLabel: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onPatchTitle: (next: string) => void;
  onPatchConfig: (next: SalesClientsConfig) => void;
  onRemove: () => void;
}

export function SalesClientsKpiCard({
  kpiId, title, config, reportQuarter, reportLabel,
  isEditing, onToggleEdit, onClose, onPatchTitle, onPatchConfig, onRemove,
}: SalesClientsKpiCardProps) {
  // Resolve reporting quarter (config override > report state quarter).
  const currentQuarterLabel = (config.reportingQuarter || reportQuarter || '').trim();
  const currentRange = useMemo(() => parseQuarterLabel(currentQuarterLabel), [currentQuarterLabel]);
  const priorQuarterLbl = priorQuarterLabel(currentQuarterLabel);
  const priorRange = useMemo(
    () => (priorQuarterLbl ? parseQuarterLabel(priorQuarterLbl) : null),
    [priorQuarterLbl],
  );

  const pipelineQ = useActivePipelineEntryStage(config.entryStageLabel);
  const pipelineId = pipelineQ.data?.pipelineId ?? null;
  const entryStageId = pipelineQ.data?.entryStageId ?? null;

  const currentQ = useSignedDealsForPeriod(
    pipelineId, entryStageId,
    currentRange?.start ?? null, currentRange?.end ?? null,
    `cur:${currentQuarterLabel}`,
  );
  const priorQ = useSignedDealsForPeriod(
    pipelineId, entryStageId,
    priorRange?.start ?? null, priorRange?.end ?? null,
    `pri:${priorQuarterLbl ?? ''}`,
  );

  const currCount = currentQ.data?.count ?? 0;
  const currSigned = currentQ.data?.signed ?? 0;
  const priorCount = priorQ.data?.count ?? 0;
  const priorSigned = priorQ.data?.signed ?? 0;
  const status = combineSalesClientsStatus(currCount >= priorCount, currSigned >= priorSigned);

  const loading = pipelineQ.isLoading || currentQ.isLoading || priorQ.isLoading;
  const missingStage = !pipelineQ.isLoading && (!pipelineId || !entryStageId);

  /* ─── Drilldown ─── */
  const [drillOpen, setDrillOpen] = useState(false);
  const columns: DrilldownColumn[] = [
    { key: 'company', label: 'Company' },
    { key: 'entered_at', label: 'Entered Stage', render: r => r.entered_at ? new Date(r.entered_at).toLocaleDateString() : '—' },
    { key: 'value', label: 'Signed Value', align: 'right', render: r => fmtUsd(Number(r.value) || 0) },
  ];
  const drillRows = currentQ.data?.deals ?? [];
  const drillContext = {
    sourceId: `kpi:${kpiId}`,
    sourceLabel: `KPI · ${title}`,
    periodLabel: currentQuarterLabel || reportLabel,
    filters: [
      { label: 'Pipeline', value: 'Active (default)' },
      { label: 'Stage entered', value: config.entryStageLabel },
    ],
  };

  /* ─── Render ─── */
  return (
    <>
      <div
        data-comment-source="kpi"
        data-comment-source-id={kpiId}
        data-comment-source-label={`KPI · ${title}`}
        role="button"
        tabIndex={0}
        title="View contributing deals"
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.08em', color: TEXT_LABEL,
            }}>Sales & Clients · Template</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED }}>
              {currentQuarterLabel || '—'}{priorQuarterLbl ? ` vs ${priorQuarterLbl}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusPill status={status} />
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
        </div>

        {/* Metrics */}
        {missingStage ? (
          <div style={{ fontSize: 12, color: TEXT_MUTED }}>
            Stage "{config.entryStageLabel}" not found on the active pipeline.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Metric
              label="New deals"
              valueStr={loading ? '…' : fmtInt(currCount)}
              priorStr={`Prior ${fmtInt(priorCount)}`}
              chip={loading ? null : <DeltaChip curr={currCount} prior={priorCount} kind="count" />}
            />
            <Metric
              label="Dollars signed"
              valueStr={loading ? '…' : fmtUsd(currSigned)}
              priorStr={`Prior ${fmtUsd(priorSigned)}`}
              chip={loading ? null : <DeltaChip curr={currSigned} prior={priorSigned} kind="usd" />}
            />
          </div>
        )}

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
                Edit · Sales & Clients
              </span>
              <button type="button" aria-label="Close editor" onClick={onClose}
                style={{ background: 'transparent', border: 'none', color: TEXT_LABEL, cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
                <XIcon size={12} />
              </button>
            </div>
            <Field label="Title">
              <input value={title} onChange={e => onPatchTitle(e.target.value)} style={inputStyleEditor} />
            </Field>
            <Field label="Reporting quarter (blank = report's quarter)">
              <input
                value={config.reportingQuarter ?? ''}
                onChange={e => onPatchConfig({ ...config, reportingQuarter: e.target.value || undefined })}
                placeholder={reportQuarter}
                style={inputStyleEditor}
              />
            </Field>
            <Field label="Entry stage label">
              <input
                value={config.entryStageLabel}
                onChange={e => onPatchConfig({ ...config, entryStageLabel: e.target.value })}
                style={inputStyleEditor}
              />
            </Field>
            <Field label="Signed dollars field (locked)">
              <input value={config.signedField} readOnly style={{ ...inputStyleEditor, opacity: 0.6, cursor: 'not-allowed' }} />
            </Field>
            <Field label="Comparison">
              <select
                value={config.comparison ?? 'prior-quarter'}
                onChange={e => onPatchConfig({ ...config, comparison: e.target.value as 'prior-quarter' })}
                style={inputStyleEditor}
              >
                <option value="prior-quarter">Prior quarter</option>
              </select>
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

      <InsightsDrilldownDrawer
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        context={drillOpen ? drillContext : null}
        columns={columns}
        rows={drillRows}
        emptyHint="No deals entered this stage during the reporting period."
      />
    </>
  );
}

function Metric({ label, valueStr, priorStr, chip }: {
  label: string; valueStr: string; priorStr: string; chip: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{valueStr}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>{priorStr}</span>
        {chip}
      </div>
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