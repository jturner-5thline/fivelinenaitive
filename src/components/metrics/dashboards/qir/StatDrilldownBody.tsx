import React, { useMemo, useState } from 'react';
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';

export type DateRange = { start: Date; end: Date };
export type Granularity = 'monthly' | 'quarterly';

export interface StatEntity {
  id: string;
  label: string;
  compute: (r: DateRange) => number;
}

export interface StatDrilldownBodyProps {
  /** Metric label, e.g. "TTM Revenue". */
  label: string;
  /** Optional plain-language description. */
  explainer?: string;
  /** Aggregate metric value inside a date range. */
  compute: (r: DateRange) => number;
  /** Current reporting period range. */
  currentRange: DateRange;
  /** Prior comparable period range. */
  priorRange: DateRange;
  /** Anchor end date used to build the trailing series. */
  anchorEnd: Date;
  /** Optional target/plan for the current period. */
  target?: number | null;
  /** Optional per-entity breakdown (e.g. QBO realms). */
  entities?: StatEntity[];
  /** Value formatter. Defaults to a compact USD formatter. */
  formatValue?: (v: number) => string;
  /** Which granularity to start on. */
  initialGranularity?: Granularity;
  /** Disable the granularity toggle when only one view is meaningful. */
  granularities?: Granularity[];
  /** Optional current-period comparison basis label ("MoM", "QoQ", "YoY"). */
  comparisonBasisLabel?: string;
  /** Optional hint shown when there is no data. */
  emptyHint?: string;
}

const defaultFmt = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
};

function buildBuckets(anchorEnd: Date, g: Granularity): Array<{ key: string; label: string; range: DateRange }> {
  if (g === 'monthly') {
    const out: Array<{ key: string; label: string; range: DateRange }> = [];
    for (let i = 11; i >= 0; i--) {
      const s = startOfMonth(subMonths(anchorEnd, i));
      const e = endOfMonth(s);
      out.push({ key: format(s, 'yyyy-MM'), label: format(s, 'MMM-yy'), range: { start: startOfDay(s), end: endOfDay(e) } });
    }
    return out;
  }
  const out: Array<{ key: string; label: string; range: DateRange }> = [];
  for (let i = 7; i >= 0; i--) {
    const s = startOfQuarter(subQuarters(anchorEnd, i));
    const e = endOfQuarter(s);
    out.push({ key: format(s, 'yyyy-QQQ'), label: format(s, 'QQQ yy'), range: { start: startOfDay(s), end: endOfDay(e) } });
  }
  return out;
}

const POS = '#3de89a';
const NEG = '#ff6b7a';
const MUTED = 'rgba(255,255,255,0.55)';
const LINE = 'hsl(213,90%,70%)';

function StatCard({ label, value, tone = 'default', sub, title }: { label: string; value: string; tone?: 'default' | 'pos' | 'neg' | 'muted' | 'accent'; sub?: string; title?: string }) {
  const color = tone === 'pos' ? POS : tone === 'neg' ? NEG : tone === 'muted' ? MUTED : tone === 'accent' ? LINE : '#e8f6ff';
  return (
    <div title={title} style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '10px 12px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub ? <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{sub}</div> : null}
    </div>
  );
}

interface ChartProps {
  buckets: Array<{ key: string; label: string; range: DateRange }>;
  values: number[];
  formatValue: (v: number) => string;
  seriesLabel: string;
}

function TrendChart({ buckets, values, formatValue, seriesLabel }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...values.map(v => v || 0));
  const min = Math.min(0, ...values.map(v => v || 0));
  const range = max - min || 1;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - ((v - min) / range) * innerH,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = points.length
    ? `${pathD} L ${points[points.length - 1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`
    : '';
  const gridLines = 4;
  const hoverIdx = hover !== null && hover >= 0 && hover < values.length ? hover : null;
  const hoverVal = hoverIdx !== null ? values[hoverIdx] : null;
  const hoverPrev = hoverIdx !== null && hoverIdx > 0 ? values[hoverIdx - 1] : null;
  const hoverDelta = hoverVal !== null && hoverPrev !== null ? hoverVal - hoverPrev : null;
  const hoverPct = hoverDelta !== null && hoverPrev !== null && hoverPrev !== 0 ? (hoverDelta / Math.abs(hoverPrev)) * 100 : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: 240, display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!values.length) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const idx = Math.round((relX - padL) / (stepX || 1));
          setHover(Math.max(0, Math.min(values.length - 1, idx)));
        }}
      >
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (innerH * i) / gridLines;
          const v = max - (range * i) / gridLines;
          return (
            <g key={i}>
              <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} fill="rgba(255,255,255,0.4)" fontSize={9} textAnchor="end">{formatValue(v)}</text>
            </g>
          );
        })}
        {areaD && <path d={areaD} fill="url(#stat-area-grad)" opacity={0.35} />}
        <defs>
          <linearGradient id="stat-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity={0.55} />
            <stop offset="100%" stopColor={LINE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={pathD} stroke={LINE} strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 3} fill={LINE}
            stroke={hoverIdx === i ? '#0b1220' : 'transparent'} strokeWidth={2}>
            <title>{`${buckets[i].label} · ${formatValue(values[i])}`}</title>
          </circle>
        ))}
        {buckets.map((b, i) => (
          <text key={b.key} x={padL + i * stepX} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={9}>
            {b.label}
          </text>
        ))}
        {hoverIdx !== null && (
          <line x1={points[hoverIdx].x} x2={points[hoverIdx].x} y1={padT} y2={padT + innerH}
            stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" strokeWidth={1} />
        )}
      </svg>
      {hoverIdx !== null && hoverVal !== null && (
        <div style={{
          position: 'absolute', top: 8, right: 12,
          background: 'rgba(11,18,32,0.92)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#e8f6ff', minWidth: 180,
        }}>
          <div style={{ fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>
            {buckets[hoverIdx].label} · {seriesLabel}
          </div>
          <div style={{ marginTop: 2, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatValue(hoverVal)}</div>
          <div style={{ marginTop: 2, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
            Δ vs prior:{' '}
            {hoverDelta === null ? '—' : (
              <span style={{ color: hoverDelta >= 0 ? POS : NEG, fontWeight: 600 }}>
                {hoverDelta >= 0 ? '+' : '−'}{formatValue(Math.abs(hoverDelta))}
                {hoverPct !== null ? ` (${hoverDelta >= 0 ? '+' : '−'}${Math.abs(hoverPct).toFixed(1)}%)` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function StatDrilldownBody(props: StatDrilldownBodyProps) {
  const {
    label, explainer, compute, currentRange, priorRange, anchorEnd,
    target = null, entities = [], formatValue = defaultFmt,
    initialGranularity = 'monthly',
    granularities = ['monthly', 'quarterly'],
    comparisonBasisLabel = 'prior period',
    emptyHint,
  } = props;

  const [gran, setGran] = useState<Granularity>(initialGranularity);
  const buckets = useMemo(() => buildBuckets(anchorEnd, gran), [anchorEnd, gran]);
  const values = useMemo(() => buckets.map(b => compute(b.range)), [buckets, compute]);
  const current = useMemo(() => compute(currentRange), [compute, currentRange]);
  const prior = useMemo(() => compute(priorRange), [compute, priorRange]);
  const delta = current - prior;
  const pct = prior === 0 ? null : (delta / Math.abs(prior)) * 100;
  const positive = delta >= 0;
  const targetDelta = target !== null && target !== undefined ? current - target : null;
  const targetPct = target && target !== 0 ? ((current - target) / Math.abs(target)) * 100 : null;

  const totalAll = values.reduce((s, v) => s + (v || 0), 0);

  const entityRows = useMemo(() => {
    if (!entities.length) return [] as Array<{ id: string; label: string; bucketValues: number[]; curr: number; prior: number }>;
    return entities.map(e => ({
      id: e.id,
      label: e.label,
      bucketValues: buckets.map(b => e.compute(b.range)),
      curr: e.compute(currentRange),
      prior: e.compute(priorRange),
    }));
  }, [entities, buckets, currentRange, priorRange]);

  const noData = totalAll === 0 && current === 0 && prior === 0;

  return (
    <div style={{ padding: '4px 2px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Headline KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${target !== null && target !== undefined ? 5 : 4}, minmax(0, 1fr))`, gap: 10 }}>
        <StatCard label="Actual" value={formatValue(current)} tone="accent" title={`${label} for the current reporting period`} />
        <StatCard label={`Prior ${comparisonBasisLabel}`} value={formatValue(prior)} title={`${label} for the ${comparisonBasisLabel}`} />
        <StatCard label="$ Change" value={`${positive ? '+' : '−'}${formatValue(Math.abs(delta))}`} tone={positive ? 'pos' : 'neg'} title={`Absolute change vs ${comparisonBasisLabel}`} />
        <StatCard label="% Change" value={pct === null ? '—' : `${positive ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`} tone={positive ? 'pos' : 'neg'} title={`Percent change vs ${comparisonBasisLabel}`} />
        {target !== null && target !== undefined && (
          <StatCard
            label="vs Target"
            value={targetDelta === null ? '—' : `${targetDelta >= 0 ? '+' : '−'}${formatValue(Math.abs(targetDelta))}`}
            sub={targetPct === null ? `Target ${formatValue(target)}` : `Target ${formatValue(target)} · ${targetPct >= 0 ? '+' : '−'}${Math.abs(targetPct).toFixed(1)}%`}
            tone={targetDelta === null ? 'muted' : targetDelta >= 0 ? 'pos' : 'neg'}
            title="Actual vs plan/target"
          />
        )}
      </div>

      {explainer && (
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{explainer}</div>
      )}

      {/* Granularity toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>
          Trend · {gran === 'monthly' ? 'trailing 12 months' : 'trailing 8 quarters'}
        </div>
        {granularities.length > 1 && (
          <div style={{ display: 'inline-flex', padding: 2, borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {granularities.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGran(g)}
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  color: gran === g ? 'hsl(228,22%,14%)' : 'rgba(255,255,255,0.75)',
                  background: gran === g ? 'linear-gradient(180deg, hsl(213,90%,75%), hsl(213,90%,70%))' : 'transparent',
                }}
              >
                {g === 'monthly' ? 'Monthly' : 'Quarterly'}
              </button>
            ))}
          </div>
        )}
      </div>

      {noData ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '18px 8px', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 10, textAlign: 'center' }}>
          {emptyHint ?? 'No activity found for this window.'}
        </div>
      ) : (
        <TrendChart buckets={buckets} values={values} formatValue={formatValue} seriesLabel={label} />
      )}

      {entityRows.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, fontWeight: 700, marginBottom: 6 }}>
            Breakdown by entity
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: MUTED, fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)', width: '22%' }}>Entity</th>
                  {buckets.slice(-6).map(b => (
                    <th key={b.key} title={`${format(b.range.start, 'MMM d, yyyy')} – ${format(b.range.end, 'MMM d, yyyy')}`}
                      style={{ padding: '6px 8px', textAlign: 'right', color: MUTED, fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {b.label}
                    </th>
                  ))}
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: MUTED, fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Current</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: MUTED, fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Δ vs prior</th>
                </tr>
              </thead>
              <tbody>
                {entityRows.map(row => {
                  const eDelta = row.curr - row.prior;
                  const ePct = row.prior === 0 ? null : (eDelta / Math.abs(row.prior)) * 100;
                  const ePos = eDelta >= 0;
                  const last6 = row.bucketValues.slice(-6);
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#e8f6ff', fontWeight: 500 }}>{row.label}</td>
                      {last6.map((v, i) => (
                        <td key={i} title={`${row.label} · ${formatValue(v)}`}
                          style={{ padding: '8px 8px', textAlign: 'right', color: v > 0 ? '#e8f6ff' : MUTED, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {formatValue(v)}
                        </td>
                      ))}
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#e8f6ff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{formatValue(row.curr)}</td>
                      <td title={`Δ vs prior ${comparisonBasisLabel}`}
                        style={{ padding: '8px 8px', textAlign: 'right', color: ePos ? POS : NEG, fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {`${ePos ? '+' : '−'}${formatValue(Math.abs(eDelta))}`}
                        {ePct !== null && (
                          <span style={{ opacity: 0.7, fontWeight: 500 }}> ({ePos ? '+' : '−'}{Math.abs(ePct).toFixed(1)}%)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default StatDrilldownBody;