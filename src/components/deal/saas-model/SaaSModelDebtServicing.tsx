import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { LenderConfig, LenderComputedResults } from './types';
import { calculateLenderResults, createDefaultLenderConfig } from './calculations';
import { fmtCurrency, fmtPct, fmtNum } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download } from 'lucide-react';

interface Props {
  lenders: LenderConfig[];
  updateLender: (index: number, config: LenderConfig) => void;
}

// ── Colors ───────────────────────────────────────────────
const TEAL = '#2ED3B7';
const BLUE = '#4C6FFF';
const AMBER = '#FFB547';
const RED = '#F97373';
const GRID = 'rgba(255,255,255,0.06)';
const TEXT_SEC = '#8B8FA3';

// ── Amortization Chart ──────────────────────────────────
function AmortizationChart({ schedule, config }: { schedule: LenderComputedResults['schedule']; config: LenderConfig }) {
  const [hoveredPeriod, setHoveredPeriod] = useState<number | null>(null);
  if (schedule.length === 0) return null;

  const w = 480, h = 180, pad = { t: 20, b: 30, l: 50, r: 10 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const maxBal = Math.max(...schedule.map(r => r.startingBalance), 1);
  const toX = (i: number) => pad.l + (i / (schedule.length - 1 || 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - (v / maxBal) * plotH;

  const balanceLine = schedule.map((r, i) => `${toX(i)},${toY(r.endingBalance)}`).join(' ');
  const areaPath = `${toX(0)},${toY(schedule[0].startingBalance)} ${balanceLine} ${toX(schedule.length - 1)},${pad.t + plotH} ${toX(0)},${pad.t + plotH}`;

  // IO boundary
  const ioPayments = config.ioPeriodYears * (config.paymentFrequency === 'Monthly' ? 12 : config.paymentFrequency === 'Quarterly' ? 4 : 1);

  const hovered = hoveredPeriod !== null ? schedule[hoveredPeriod] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <g key={pct}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID} />
            <text x={pad.l - 4} y={pad.t + plotH * (1 - pct) + 3} textAnchor="end" fill={TEXT_SEC} fontSize={8}>
              {fmtCurrency(maxBal * pct, true)}
            </text>
          </g>
        ))}

        {/* IO boundary line */}
        {ioPayments > 0 && ioPayments < schedule.length && (
          <>
            <line x1={toX(ioPayments)} y1={pad.t} x2={toX(ioPayments)} y2={pad.t + plotH} stroke={AMBER} strokeDasharray="4 3" strokeWidth={1} opacity={0.6} />
            <text x={toX(ioPayments)} y={pad.t - 4} textAnchor="middle" fill={AMBER} fontSize={7}>IO End</text>
          </>
        )}

        {/* Area fill */}
        <polygon points={areaPath} fill="rgba(76,111,255,0.12)" />

        {/* Balance line */}
        <polyline points={balanceLine} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" />

        {/* Interest bars (stacked on bottom) */}
        {schedule.map((r, i) => {
          const barW = Math.max(2, plotW / schedule.length - 1);
          const intH = (r.interest / maxBal) * plotH;
          const prinH = (r.principal / maxBal) * plotH;
          const x = toX(i) - barW / 2;
          return (
            <g key={i}
              onMouseEnter={() => setHoveredPeriod(i)}
              onMouseLeave={() => setHoveredPeriod(null)}
              className="cursor-pointer"
            >
              <rect x={x} y={pad.t + plotH - intH} width={barW} height={intH} fill={AMBER} opacity={0.5} rx={1} />
              <rect x={x} y={pad.t + plotH - intH - prinH} width={barW} height={prinH} fill={TEAL} opacity={0.5} rx={1} />
            </g>
          );
        })}

        {/* Period labels */}
        {schedule.filter((_, i) => i % Math.ceil(schedule.length / 8) === 0 || i === schedule.length - 1).map((r, _, arr) => (
          <text key={r.period} x={toX(r.period - 1)} y={h - 8} textAnchor="middle" fill={TEXT_SEC} fontSize={7}>
            {r.date.slice(0, 7)}
          </text>
        ))}

        {/* Hover indicator */}
        {hoveredPeriod !== null && (
          <circle cx={toX(hoveredPeriod)} cy={toY(schedule[hoveredPeriod].endingBalance)} r={4} fill={BLUE} stroke="white" strokeWidth={1.5} />
        )}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute top-2 right-2 bg-popover border border-border rounded-md p-2 text-[10px] font-mono shadow-lg z-10 space-y-0.5">
          <div className="text-foreground font-semibold">Period {hovered.period}</div>
          <div className="text-muted-foreground">{hovered.date}</div>
          <div>Balance: <span className="text-foreground">{fmtCurrency(hovered.endingBalance)}</span></div>
          <div>Interest: <span style={{ color: AMBER }}>{fmtCurrency(hovered.interest)}</span></div>
          <div>Principal: <span style={{ color: TEAL }}>{fmtCurrency(hovered.principal)}</span></div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 mt-1 justify-center">
        {[
          { color: BLUE, label: 'Balance' },
          { color: TEAL, label: 'Principal' },
          { color: AMBER, label: 'Interest' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
            <span className="text-[9px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cost of Capital Breakdown ────────────────────────────
function CostBreakdown({ results, config }: { results: LenderComputedResults; config: LenderConfig }) {
  const items = [
    { label: 'Total Interest', value: results.totalInterest, color: AMBER },
    { label: 'Commitment Fee', value: results.commitmentFee, color: BLUE },
    { label: 'End-of-Term Fee', value: results.endOfTermFee, color: TEAL },
  ].filter(i => i.value > 0);

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost Breakdown</h4>
      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex">
        {items.map(item => (
          <div key={item.label} className="h-full transition-all" style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color }} />
        ))}
      </div>
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{fmtCurrency(item.value)}</span>
            <span className="text-[10px] text-muted-foreground">({(item.value / total * 100).toFixed(0)}%)</span>
          </div>
        </div>
      ))}
      <div className="pt-1 border-t border-border/20 flex justify-between text-xs font-semibold">
        <span>Total Cost of Capital</span>
        <span className="font-mono">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── Funding Source Card ─────────────────────────────────────────
const LenderCard = memo(function LenderCard({ config, results, onChange, label }: {
  config: LenderConfig;
  results: LenderComputedResults;
  onChange: (config: LenderConfig) => void;
  label: string;
}) {
  const update = (field: keyof LenderConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <Card className="border-border/30">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{label}</h3>
          <Badge variant="outline" className="text-[10px] font-mono">
            {fmtPct(results.annualizedCoC)} ann. CoC
          </Badge>
        </div>

        <Tabs defaultValue="terms">
          <TabsList className="h-6 bg-muted/30 w-full">
            <TabsTrigger value="terms" className="text-[10px] h-5 flex-1">Terms</TabsTrigger>
            <TabsTrigger value="fees" className="text-[10px] h-5 flex-1">Fees</TabsTrigger>
            <TabsTrigger value="results" className="text-[10px] h-5 flex-1">Results</TabsTrigger>
            <TabsTrigger value="schedule" className="text-[10px] h-5 flex-1">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="terms" className="mt-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Commitment', field: 'commitment' as const },
                { label: 'Funded @ Close', field: 'fundedAtClose' as const },
                { label: 'Annual Rate %', field: 'annualRate' as const, step: '0.25' },
                { label: 'Term (Years)', field: 'termYears' as const },
                { label: 'IO Period (Years)', field: 'ioPeriodYears' as const, step: '0.5' },
              ].map(inp => (
                <div key={inp.field}>
                  <Label className="text-[10px] text-muted-foreground">{inp.label}</Label>
                  <Input type="number" className="h-7 text-xs font-mono" value={config[inp.field] || ''}
                    step={inp.step || '1'}
                    onChange={e => update(inp.field, parseFloat(e.target.value) || 0)} />
                </div>
              ))}
              <div>
                <Label className="text-[10px] text-muted-foreground">First Payment</Label>
                <Input type="date" className="h-7 text-xs" value={config.firstPaymentDate}
                  onChange={e => update('firstPaymentDate', e.target.value)} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                <Select value={config.paymentFrequency} onValueChange={v => update('paymentFrequency', v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="Annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Payment Type</Label>
                <Select value={config.paymentType} onValueChange={v => update('paymentType', v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="End">End</SelectItem>
                    <SelectItem value="Beginning">Beginning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fees" className="mt-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Commitment Fee %', field: 'commitmentFeePct' as const },
                { label: 'End of Term Fee %', field: 'endOfTermFeePct' as const },
                { label: 'Warrant', field: 'warrant' as const },
                { label: 'Early Payoff Yr 1 %', field: 'earlyPayoffYr1' as const },
                { label: 'Early Payoff Yr 2 %', field: 'earlyPayoffYr2' as const },
                { label: 'Early Payoff Yr 3 %', field: 'earlyPayoffYr3' as const },
              ].map(inp => (
                <div key={inp.field}>
                  <Label className="text-[10px] text-muted-foreground">{inp.label}</Label>
                  <Input type="number" className="h-7 text-xs font-mono" value={config[inp.field] || ''}
                    step="0.25"
                    onChange={e => update(inp.field, parseFloat(e.target.value) || 0)} />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="results" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Periodic Rate', value: fmtPct(results.periodicRate) },
                { label: 'IO Payment', value: fmtCurrency(results.ioPayment) },
                { label: 'Payment After IO', value: fmtCurrency(results.paymentAfterIO) },
                { label: 'Total Interest', value: fmtCurrency(results.totalInterest) },
                { label: 'Total Payments', value: fmtCurrency(results.totalPayments) },
              ].map(item => (
                <div key={item.label} className="flex justify-between py-1 border-b border-border/10">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-mono font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            <CostBreakdown results={results} config={config} />
          </TabsContent>

          <TabsContent value="schedule" className="mt-3">
            <AmortizationChart schedule={results.schedule} config={config} />
            {results.schedule.length > 0 && (
              <ScrollArea className="h-40 mt-2">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border/30">
                      <th className="text-center py-1 px-1">#</th>
                      <th className="text-left py-1 px-1">Date</th>
                      <th className="text-right py-1 px-1">Balance</th>
                      <th className="text-right py-1 px-1">Payment</th>
                      <th className="text-right py-1 px-1">Interest</th>
                      <th className="text-right py-1 px-1">Principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.schedule.map(row => (
                      <tr key={row.period} className="border-b border-border/5 hover:bg-muted/20">
                        <td className="text-center py-0.5 px-1">{row.period}</td>
                        <td className="py-0.5 px-1">{row.date}</td>
                        <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.startingBalance, true)}</td>
                        <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.payment, true)}</td>
                        <td className="text-right py-0.5 px-1 font-mono" style={{ color: AMBER }}>{fmtCurrency(row.interest, true)}</td>
                        <td className="text-right py-0.5 px-1 font-mono" style={{ color: TEAL }}>{fmtCurrency(row.principal, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
});

// ── Comparison Matrix ───────────────────────────────────
function ComparisonMatrix({ lenders, results }: { lenders: LenderConfig[]; results: LenderComputedResults[] }) {
  const metrics = [
    { label: 'Commitment', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtCurrency(c.commitment), raw: (c: LenderConfig) => c.commitment, better: 'higher' as const },
    { label: 'Funded at Close', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtCurrency(c.fundedAtClose), raw: (c: LenderConfig) => c.fundedAtClose, better: 'higher' as const },
    { label: 'Annual Rate', getValue: (c: LenderConfig, r: LenderComputedResults) => `${c.annualRate}%`, raw: (c: LenderConfig) => c.annualRate, better: 'lower' as const },
    { label: 'Term', getValue: (c: LenderConfig, r: LenderComputedResults) => `${c.termYears} yrs`, raw: (c: LenderConfig) => c.termYears, better: 'higher' as const },
    { label: 'IO Period', getValue: (c: LenderConfig, r: LenderComputedResults) => `${c.ioPeriodYears} yrs`, raw: (c: LenderConfig) => c.ioPeriodYears, better: 'higher' as const },
    { label: 'IO Payment', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtCurrency(r.ioPayment), raw: (_: LenderConfig, r?: LenderComputedResults) => r?.ioPayment || 0, better: 'lower' as const },
    { label: 'Total Interest', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtCurrency(r.totalInterest), raw: (_: LenderConfig, r?: LenderComputedResults) => r?.totalInterest || 0, better: 'lower' as const },
    { label: 'Cost of Capital', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtCurrency(r.costOfCapital), raw: (_: LenderConfig, r?: LenderComputedResults) => r?.costOfCapital || 0, better: 'lower' as const },
    { label: 'CoC %', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtPct(r.costOfCapitalPct), raw: (_: LenderConfig, r?: LenderComputedResults) => r?.costOfCapitalPct || 0, better: 'lower' as const },
    { label: 'Annualized CoC', getValue: (c: LenderConfig, r: LenderComputedResults) => fmtPct(r.annualizedCoC), raw: (_: LenderConfig, r?: LenderComputedResults) => r?.annualizedCoC || 0, better: 'lower' as const },
  ];

  return (
    <Card className="border-border/30">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">Lender Comparison Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Metric</th>
                {lenders.map((_, i) => (
                  <th key={i} className="text-right py-1.5 px-2 font-semibold">
                    Lender {String.fromCharCode(65 + i)}
                  </th>
                ))}
                <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Winner</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(metric => {
                const rawValues = lenders.map((c, i) => metric.raw(c, results[i]));
                const bestIdx = metric.better === 'lower'
                  ? rawValues.indexOf(Math.min(...rawValues))
                  : rawValues.indexOf(Math.max(...rawValues));
                const allSame = rawValues.every(v => v === rawValues[0]);

                return (
                  <tr key={metric.label} className="border-b border-border/5 hover:bg-muted/10">
                    <td className="py-1.5 px-2 text-muted-foreground">{metric.label}</td>
                    {lenders.map((c, i) => (
                      <td key={i} className={cn(
                        "text-right py-1.5 px-2 font-mono",
                        !allSame && i === bestIdx && "font-semibold text-emerald-400"
                      )}>
                        {metric.getValue(c, results[i])}
                      </td>
                    ))}
                    <td className="text-right py-1.5 px-2">
                      {allSame ? (
                        <span className="text-muted-foreground">Tie</span>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                          {String.fromCharCode(65 + bestIdx)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────
export function SaaSModelDebtServicing({ lenders, updateLender }: Props) {
  const results = useMemo(() =>
    lenders.map(l => calculateLenderResults(l)),
    [lenders]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Debt Servicing — Lender Comparison</h3>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {lenders.length} lender{lenders.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Comparison Matrix first */}
      <ComparisonMatrix lenders={lenders} results={results} />

      {/* Individual lender cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {lenders.map((config, i) => (
          <LenderCard
            key={i}
            config={config}
            results={results[i]}
            onChange={c => updateLender(i, c)}
            label={`Lender ${String.fromCharCode(65 + i)}`}
          />
        ))}
      </div>
    </div>
  );
}
