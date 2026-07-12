import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X as XIcon, CalendarRange } from 'lucide-react';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import {
  type LiveMetricPeriod,
  useInsightsLiveMetricValue,
  getMonthlyBreakdownPeriods,
} from '@/components/metrics/dashboards/qir/useInsightsLiveMetricValue';

/**
 * Tiptap block node that renders a KPI/widget inline inside the narrative
 * editor. KPI metadata is snapshotted into node attrs at insert time so the
 * HTML round-trips through save/load without any external state.
 */

function formatValue(raw: string, format: string): string {
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return raw || '—';
  if (format === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  }
  if (format === 'currencyPlain') {
    // Whole-dollar USD, no abbreviation (e.g. $4,417).
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
  }
  if (format === 'percent') return `${n}%`;
  return n.toLocaleString();
}

function inferMetricSourceId(label: string): string | undefined {
  const key = label.trim().toLowerCase();
  if (key === 'active client count') return 'finserv-active-client-count';
  if (key === 'total mrr') return 'finserv-total-mrr';
  return undefined;
}

function KpiEmbedValue({
  actual,
  format,
  metricSourceId,
  period,
}: {
  actual: string;
  format: string;
  metricSourceId?: string;
  period: LiveMetricPeriod | null;
}) {
  if (!metricSourceId) return <>{formatValue(actual, format)}</>;
  return <LiveKpiEmbedValue metricSourceId={metricSourceId} fallbackActual={actual} format={format} period={period} />;
}

function LiveKpiEmbedValue({
  metricSourceId,
  fallbackActual,
  format,
  period,
}: {
  metricSourceId: string;
  fallbackActual: string;
  format: string;
  period: LiveMetricPeriod | null;
}) {
  const resolution = useInsightsLiveMetricValue(metricSourceId, period);
  if (resolution.status === 'loading') return <>…</>;
  if (resolution.status === 'ready' && resolution.value !== undefined) {
    return <>{formatValue(String(resolution.value), format)}</>;
  }
  return <>{formatValue(fallbackActual, format)}</>;
}

function KpiEmbedView({ node, deleteNode, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || 'KPI';
  const rawFormat = (node.attrs.format as string) || 'number';
  const actual = String(node.attrs.actual ?? '0');
  const metricSourceId = (node.attrs.metricSourceId as string | null) || inferMetricSourceId(label);
  // Avg. Revenue / Client — render whole-dollar currency (no K/MM abbrev).
  const format = metricSourceId === 'finserv-avg-revenue-per-client' ? 'currencyPlain' : rawFormat;
  const target = metricSourceId && String(node.attrs.target ?? '') === '0'
    ? ''
    : String(node.attrs.target ?? '');
  const periodStart = (node.attrs.periodStart as string | null) || '';
  const periodEnd = (node.attrs.periodEnd as string | null) || '';
  const periodLabel = (node.attrs.periodLabel as string | null) || '';
  // Default this widget to the per-month breakdown (April/May/June etc.).
  const showMonthly = node.attrs.showMonthlyBreakdown === undefined || node.attrs.showMonthlyBreakdown === null
    ? metricSourceId === 'finserv-avg-revenue-per-client'
    : !!node.attrs.showMonthlyBreakdown;
  const timeframe = useInsightsTimeframeOptional();
  const period: LiveMetricPeriod | null = periodStart && periodEnd
    ? { start: periodStart, end: periodEnd, label: periodLabel || `${periodStart} – ${periodEnd}` }
    : timeframe?.timeframe
      ? { start: timeframe.timeframe.start, end: timeframe.timeframe.end, label: timeframe.timeframe.label }
      : null;
  const canEdit = editor.isEditable;
  const monthly = getMonthlyBreakdownPeriods(period);
  const canToggleMonthly = !!metricSourceId && !!monthly;
  const renderMonthly = showMonthly && canToggleMonthly;
  return (
    <NodeViewWrapper
      as="div"
      data-kpi-embed
      className="qir-kpi-embed"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 4,
        minWidth: renderMonthly ? 220 : 140,
        maxWidth: renderMonthly ? 320 : 200,
        padding: '12px 14px',
        margin: '6px 6px 6px 0',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(120,170,255,0.22)',
        verticalAlign: 'middle',
        position: 'relative',
      }}
      contentEditable={false}
    >
      {canEdit && (
        <button
          type="button"
          aria-label="Remove widget"
          onClick={(e) => { e.stopPropagation(); deleteNode(); }}
          style={{
            position: 'absolute', top: 4, right: 4,
            background: 'transparent', border: 'none',
            color: 'rgba(160,200,255,0.55)', cursor: 'pointer',
            padding: 2, display: 'inline-flex',
          }}
        >
          <XIcon size={11} />
        </button>
      )}
      {canToggleMonthly && (
        <button
          type="button"
          aria-label={renderMonthly ? 'Show total' : 'Show monthly breakdown'}
          title={renderMonthly ? 'Show total' : 'Show monthly breakdown'}
          onClick={(e) => {
            e.stopPropagation();
            if (typeof (editor as any).chain === 'function') {
              (editor as any).chain().focus().updateAttributes('kpiEmbed', { showMonthlyBreakdown: !showMonthly }).run();
            }
          }}
          style={{
            position: 'absolute', top: 4, left: 4,
            background: renderMonthly ? 'rgba(120,170,255,0.18)' : 'transparent',
            border: 'none', borderRadius: 4,
            color: renderMonthly ? '#cfe2ff' : 'rgba(160,200,255,0.55)',
            cursor: 'pointer', padding: 2, display: 'inline-flex',
          }}
        >
          <CalendarRange size={11} />
        </button>
      )}
      <div style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'rgba(160,200,255,0.65)', maxWidth: '100%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      {renderMonthly ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 2, width: '100%', justifyContent: 'center' }}>
          {monthly!.map(m => (
            <div key={m.start} style={{
              flex: 1, minWidth: 0, textAlign: 'center',
              padding: '4px 4px', borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{
                fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.06em', color: 'rgba(160,200,255,0.6)',
              }}>{m.label.split(' ')[0]}</div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#f4f8ff',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <KpiEmbedValue actual={actual} format={format} metricSourceId={metricSourceId} period={m} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          fontSize: 22, fontWeight: 700, color: '#f4f8ff',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
        }}>
          <KpiEmbedValue actual={actual} format={format} metricSourceId={metricSourceId} period={period} />
        </div>
      )}
      {target && !renderMonthly && (
        <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
          Target {formatValue(target, format)}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const KpiEmbedNode = Node.create({
  name: 'kpiEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: 'KPI' },
      format: { default: 'number' },
      actual: { default: '0' },
      target: { default: '' },
      metricSourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-metric-source-id'),
        renderHTML: attributes => attributes.metricSourceId ? { 'data-metric-source-id': attributes.metricSourceId } : {},
      },
      sourceSurface: {
        default: null,
        parseHTML: element => element.getAttribute('data-source-surface'),
        renderHTML: attributes => attributes.sourceSurface ? { 'data-source-surface': attributes.sourceSurface } : {},
      },
      periodStart: {
        default: null,
        parseHTML: element => element.getAttribute('data-period-start'),
        renderHTML: attributes => attributes.periodStart ? { 'data-period-start': attributes.periodStart } : {},
      },
      periodEnd: {
        default: null,
        parseHTML: element => element.getAttribute('data-period-end'),
        renderHTML: attributes => attributes.periodEnd ? { 'data-period-end': attributes.periodEnd } : {},
      },
      periodLabel: {
        default: null,
        parseHTML: element => element.getAttribute('data-period-label'),
        renderHTML: attributes => attributes.periodLabel ? { 'data-period-label': attributes.periodLabel } : {},
      },
      showMonthlyBreakdown: {
        default: null,
        parseHTML: element => element.hasAttribute('data-show-monthly')
          ? element.getAttribute('data-show-monthly') === 'true'
          : null,
        renderHTML: attributes => attributes.showMonthlyBreakdown ? { 'data-show-monthly': 'true' } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-kpi-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-kpi-embed': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KpiEmbedView);
  },
});

export interface KpiEmbedAttrs {
  id: string | null;
  label: string;
  format: string;
  actual: string;
  target: string;
  metricSourceId?: string | null;
  sourceSurface?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
}