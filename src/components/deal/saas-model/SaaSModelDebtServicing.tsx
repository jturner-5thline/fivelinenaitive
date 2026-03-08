import { useState, useMemo } from 'react';
import { LenderConfig, LenderComputedResults } from './types';
import { calculateLenderResults, createDefaultLenderConfig } from './calculations';
import { fmtCurrency, fmtPct, fmtNum } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  lenders: LenderConfig[];
  updateLender: (index: number, config: LenderConfig) => void;
}

function LenderCard({ config, results, onChange, label }: {
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
        <h3 className="text-sm font-semibold">{label}</h3>

        {/* Terms */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Terms</h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Commitment', field: 'commitment' as const, type: 'number' },
              { label: 'Funded @ Close', field: 'fundedAtClose' as const, type: 'number' },
              { label: 'Annual Rate %', field: 'annualRate' as const, type: 'number', step: '0.25' },
              { label: 'Term (Years)', field: 'termYears' as const, type: 'number' },
              { label: 'IO Period (Years)', field: 'ioPeriodYears' as const, type: 'number', step: '0.5' },
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
        </div>

        {/* Fees */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Fees</h4>
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
        </div>

        {/* Computed Results */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Computed Results</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Periodic Rate', value: fmtPct(results.periodicRate) },
              { label: 'IO Payment', value: fmtCurrency(results.ioPayment) },
              { label: 'Payment After IO', value: fmtCurrency(results.paymentAfterIO) },
              { label: 'Total Interest', value: fmtCurrency(results.totalInterest) },
              { label: 'End of Term Fee', value: fmtCurrency(results.endOfTermFee) },
              { label: 'Commitment Fee', value: fmtCurrency(results.commitmentFee) },
              { label: 'Total Payments', value: fmtCurrency(results.totalPayments) },
            ].map(item => (
              <div key={item.label} className="flex justify-between py-1 border-b border-border/10">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-xs font-mono font-medium">{item.value}</span>
              </div>
            ))}
            <div className="col-span-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 flex justify-between">
              <div>
                <div className="text-[10px] text-amber-500 font-medium">Cost of Capital</div>
                <div className="text-sm font-bold font-mono text-amber-500">{fmtCurrency(results.costOfCapital)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">{fmtPct(results.costOfCapitalPct)}</div>
                <div className="text-[10px] text-muted-foreground">{fmtPct(results.annualizedCoC)} ann.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Amortization Schedule */}
        {results.schedule.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Amortization Schedule</h4>
            <ScrollArea className="h-48">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/30">
                    <th className="text-center py-1 px-1">#</th>
                    <th className="text-left py-1 px-1">Date</th>
                    <th className="text-right py-1 px-1">Starting</th>
                    <th className="text-right py-1 px-1">Payment</th>
                    <th className="text-right py-1 px-1">Interest</th>
                    <th className="text-right py-1 px-1">Principal</th>
                    <th className="text-right py-1 px-1">Ending</th>
                  </tr>
                </thead>
                <tbody>
                  {results.schedule.map(row => (
                    <tr key={row.period} className="border-b border-border/5">
                      <td className="text-center py-0.5 px-1">{row.period}</td>
                      <td className="py-0.5 px-1">{row.date}</td>
                      <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.startingBalance, true)}</td>
                      <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.payment, true)}</td>
                      <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.interest, true)}</td>
                      <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.principal, true)}</td>
                      <td className="text-right py-0.5 px-1 font-mono">{fmtCurrency(row.endingBalance, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SaaSModelDebtServicing({ lenders, updateLender }: Props) {
  const results = useMemo(() =>
    lenders.map(l => calculateLenderResults(l)),
    [lenders]
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Debt Servicing — Lender Comparison</h3>
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
