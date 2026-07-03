import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, subMonths, subQuarters } from 'date-fns';
import { QBO_ENTITIES, type QBOEntity } from '@/config/qboEntities';
import { formatUSD } from '@/lib/formatters/currency';

type Granularity = 'monthly' | 'quarterly';

export interface TtmInvoice {
  realm_id: string;
  txn_date: string | null;
  total_amt: number | null;
  metadata?: any;
}

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

const BORDER = 'rgba(120,170,255,0.16)';
const CELL_PAD = '8px 10px';

function Sparkline({
  values,
  labels,
  color = '#7cc8f0',
  height = 60,
  fill = true,
}: {
  values: number[];
  labels: string[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const width = Math.max(240, values.length * 44);
  const pad = { l: 8, r: 8, t: 8, b: 16 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = pad.l + (values.length > 1 ? i * stepX : innerW / 2);
    const y = pad.t + innerH - ((v - min) / span) * innerH;
    return { x, y, v };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = fill && pts.length > 0
    ? `${path} L${pts[pts.length - 1].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`
    : '';
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {fill && <path d={area} fill={color} opacity={0.14} />}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.2} fill={color} />
          <title>{`${labels[i]}: ${formatUSD(p.v)}`}</title>
        </g>
      ))}
      {labels.map((l, i) => (
        <text
          key={i}
          x={pts[i]?.x ?? 0}
          y={height - 3}
          textAnchor="middle"
          style={{ fontSize: 9, fill: 'rgba(160,200,255,0.55)' }}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

function buildBuckets(end: Date, granularity: Granularity): Bucket[] {
  if (granularity === 'monthly') {
    // 12 trailing months ending at TTM end.
    return Array.from({ length: 12 }, (_, i) => {
      const anchor = subMonths(end, 11 - i);
      const bStart = startOfMonth(anchor);
      const bEnd = endOfMonth(anchor);
      return { key: format(bStart, 'yyyy-MM'), label: format(bStart, "MMM ''yy"), start: bStart, end: bEnd };
    });
  }
  // 4 trailing quarters ending at TTM end.
  return Array.from({ length: 4 }, (_, i) => {
    const anchor = subQuarters(end, 3 - i);
    const bStart = startOfQuarter(anchor);
    const bEnd = endOfQuarter(anchor);
    return { key: format(bStart, "yyyy-'Q'Q"), label: format(bStart, "'Q'Q ''yy"), start: bStart, end: bEnd };
  });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Extract per-item product/service breakdown for an invoice. Returns list of { product, amount }. */
function extractLineItems(inv: TtmInvoice): Array<{ product: string; amount: number }> {
  const meta = inv.metadata as { Line?: any[] } | null | undefined;
  const lines = meta?.Line;
  if (!Array.isArray(lines) || lines.length === 0) {
    return [{ product: 'Unspecified', amount: Number(inv.total_amt || 0) }];
  }
  const out: Array<{ product: string; amount: number }> = [];
  let assigned = 0;
  for (const line of lines) {
    if (line?.DetailType !== 'SalesItemLineDetail') continue;
    const detail = line.SalesItemLineDetail || {};
    const itemName: string | undefined =
      detail?.ItemRef?.name || detail?.ItemAccountRef?.name;
    const amount = typeof line.Amount === 'number' ? line.Amount : 0;
    const product = (itemName && String(itemName).trim()) || 'Unspecified';
    out.push({ product, amount });
    assigned += amount;
  }
  // Reconcile discounts/adjustments: allocate remainder to "Adjustments" so entity totals match.
  const total = Number(inv.total_amt || 0);
  const diff = total - assigned;
  if (Math.abs(diff) > 0.5) {
    out.push({ product: diff < 0 ? 'Discounts / Adjustments' : 'Other', amount: diff });
  }
  return out.length > 0 ? out : [{ product: 'Unspecified', amount: total }];
}

interface Props {
  invoices: TtmInvoice[];
  ttmRange: { start: Date; end: Date };
}

export function TtmRevenueDrilldownBody({ invoices, ttmRange }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const buckets = useMemo(() => buildBuckets(ttmRange.end, granularity), [ttmRange.end, granularity]);
  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const invoicesInRange = useMemo(
    () =>
      invoices.filter(inv => {
        const d = parseDate(inv.txn_date);
        return d && d >= rangeStart && d <= rangeEnd;
      }),
    [invoices, rangeStart, rangeEnd],
  );

  const bucketIndexByDate = (d: Date): number => {
    for (let i = 0; i < buckets.length; i++) {
      if (d >= buckets[i].start && d <= buckets[i].end) return i;
    }
    return -1;
  };

  // Per-entity aggregation
  const entities = useMemo(() => {
    const knownRealms = new Set(QBO_ENTITIES.map(e => e.realmId));
    const byRealm = new Map<string, {
      entity: QBOEntity | { key: string; label: string; fullName: string; realmId: string };
      bucketTotals: number[];
      total: number;
      productMap: Map<string, { bucketTotals: number[]; total: number }>;
    }>();
    const ensure = (realmId: string) => {
      let row = byRealm.get(realmId);
      if (row) return row;
      const known = QBO_ENTITIES.find(e => e.realmId === realmId);
      const entity = known || { key: `realm-${realmId}`, label: `Realm ${realmId.slice(-4)}`, fullName: `QBO Realm ${realmId}`, realmId };
      row = { entity, bucketTotals: buckets.map(() => 0), total: 0, productMap: new Map() };
      byRealm.set(realmId, row);
      return row;
    };
    for (const inv of invoicesInRange) {
      const d = parseDate(inv.txn_date);
      if (!d) continue;
      const bi = bucketIndexByDate(d);
      if (bi < 0) continue;
      const row = ensure(inv.realm_id);
      const total = Number(inv.total_amt || 0);
      row.bucketTotals[bi] += total;
      row.total += total;
      for (const { product, amount } of extractLineItems(inv)) {
        let p = row.productMap.get(product);
        if (!p) {
          p = { bucketTotals: buckets.map(() => 0), total: 0 };
          row.productMap.set(product, p);
        }
        p.bucketTotals[bi] += amount;
        p.total += amount;
      }
      // Suppress unused-var warning
      void knownRealms;
    }
    return Array.from(byRealm.values())
      .map(r => ({
        ...r,
        products: Array.from(r.productMap.entries())
          .map(([product, v]) => ({ product, ...v }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicesInRange, buckets]);

  const grandBucketTotals = useMemo(() => {
    const totals = buckets.map(() => 0);
    for (const e of entities) {
      e.bucketTotals.forEach((v, i) => { totals[i] += v; });
    }
    return totals;
  }, [entities, buckets]);
  const grandTotal = grandBucketTotals.reduce((s, v) => s + v, 0);

  const toggle = (realmId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(realmId)) next.delete(realmId); else next.add(realmId);
      return next;
    });
  };

  const th: React.CSSProperties = {
    padding: CELL_PAD, fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
    textTransform: 'uppercase', color: 'rgba(160,200,255,0.55)',
    borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0,
    background: 'rgba(10,18,36,0.97)', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: CELL_PAD, fontSize: 12,
    borderBottom: '1px solid rgba(120,170,255,0.06)',
    fontVariantNumeric: 'tabular-nums',
  };

  const ToggleBtn = ({ value, label }: { value: Granularity; label: string }) => (
    <button
      type="button"
      onClick={() => setGranularity(value)}
      style={{
        padding: '4px 10px', fontSize: 11, fontWeight: 600,
        border: `1px solid ${BORDER}`,
        background: granularity === value ? 'rgba(120,170,255,0.22)' : 'transparent',
        color: granularity === value ? '#dde8f8' : 'rgba(200,225,245,0.7)',
        borderRadius: 6, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ fontSize: 11, color: 'rgba(200,225,245,0.7)' }}>
          TTM Revenue by entity · {format(rangeStart, 'MMM yyyy')} – {format(rangeEnd, 'MMM yyyy')}
          <span style={{ marginLeft: 8, color: 'rgba(160,200,255,0.55)' }}>
            Click an entity to see its product / service breakdown.
          </span>
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <ToggleBtn value="monthly" label="Monthly" />
          <ToggleBtn value="quarterly" label="Quarterly" />
        </div>
      </div>

      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Entity / Product</th>
              {buckets.map(b => (
                <th key={b.key} style={{ ...th, textAlign: 'right' }}>{b.label}</th>
              ))}
              <th style={{ ...th, textAlign: 'right' }}>TTM Total</th>
            </tr>
          </thead>
          <tbody>
            {entities.length === 0 && (
              <tr>
                <td colSpan={buckets.length + 2} style={{ ...td, textAlign: 'center', color: 'rgba(180,200,230,0.6)', padding: 24 }}>
                  No QuickBooks invoice activity for this trailing 12-month window.
                </td>
              </tr>
            )}
            {entities.map(row => {
              const isOpen = expanded.has(row.entity.realmId);
              return (
                <React.Fragment key={row.entity.realmId}>
                  <tr
                    onClick={() => toggle(row.entity.realmId)}
                    style={{ cursor: 'pointer', background: isOpen ? 'rgba(120,170,255,0.06)' : undefined }}
                  >
                    <td style={{ ...td, fontWeight: 600, color: '#dde8f8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {row.entity.fullName}
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(160,200,255,0.55)', fontWeight: 500 }}>
                          {row.entity.label}
                        </span>
                      </span>
                    </td>
                    {row.bucketTotals.map((v, i) => (
                      <td key={i} style={{ ...td, textAlign: 'right' }}>{v ? formatUSD(v) : '—'}</td>
                    ))}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatUSD(row.total)}</td>
                  </tr>
                  {isOpen && row.products.map(p => (
                    <tr key={`${row.entity.realmId}-${p.product}`} style={{ background: 'rgba(120,170,255,0.03)' }}>
                      <td style={{ ...td, paddingLeft: 32, color: 'rgba(220,235,255,0.85)' }}>
                        {p.product}
                      </td>
                      {p.bucketTotals.map((v, i) => (
                        <td key={i} style={{ ...td, textAlign: 'right', color: 'rgba(220,235,255,0.85)' }}>
                          {v ? formatUSD(v) : '—'}
                        </td>
                      ))}
                      <td style={{ ...td, textAlign: 'right', color: 'rgba(220,235,255,0.9)', fontWeight: 600 }}>
                        {formatUSD(p.total)}
                      </td>
                    </tr>
                  ))}
                  {isOpen && (
                    <tr style={{ background: 'rgba(120,170,255,0.04)' }}>
                      <td colSpan={buckets.length + 2} style={{ ...td, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(160,200,255,0.6)', marginBottom: 4 }}>
                              {row.entity.label} · Revenue trend
                            </div>
                            <Sparkline
                              values={row.bucketTotals}
                              labels={buckets.map(b => b.label)}
                              color="#7cc8f0"
                              height={72}
                            />
                          </div>
                          {row.products.length > 0 && (
                            <div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(160,200,255,0.6)', marginBottom: 4 }}>
                                Top products / services
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                {row.products.slice(0, 6).map((p, idx) => {
                                  const palette = ['#7cc8f0', '#a78bfa', '#f0a37c', '#7cf0b5', '#f07cb5', '#f0d97c'];
                                  const color = palette[idx % palette.length];
                                  return (
                                    <div
                                      key={p.product}
                                      style={{
                                        border: `1px solid ${BORDER}`,
                                        borderRadius: 6,
                                        padding: 8,
                                        background: 'rgba(10,18,36,0.4)',
                                      }}
                                    >
                                      <div style={{
                                        display: 'flex', justifyContent: 'space-between', gap: 8,
                                        fontSize: 11, color: '#dde8f8', marginBottom: 4,
                                      }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product}</span>
                                        <span style={{ fontWeight: 600, color }}>{formatUSD(p.total)}</span>
                                      </div>
                                      <Sparkline
                                        values={p.bucketTotals}
                                        labels={buckets.map(b => b.label)}
                                        color={color}
                                        height={56}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {entities.length > 0 && (
              <tr style={{ background: 'rgba(120,170,255,0.08)' }}>
                <td style={{ ...td, fontWeight: 700, color: '#dde8f8' }}>All entities</td>
                {grandBucketTotals.map((v, i) => (
                  <td key={i} style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{v ? formatUSD(v) : '—'}</td>
                ))}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#7cc8f0' }}>{formatUSD(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TtmRevenueDrilldownBody;