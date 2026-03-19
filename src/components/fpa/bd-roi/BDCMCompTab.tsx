import { COVER_META, QUARTERS_12 } from './bdRoiData';
import { useBDRoiStore } from './useBDRoiStore';
import { formatBDCurrency } from './bdRoiFormatters';
import { DollarSign, Calendar, Award } from 'lucide-react';

export function BDCMCompTab({ visibleQuarters }: { visibleQuarters: Set<string> }) {
  const { cmBonus } = useBDRoiStore();

  const totalPaid = cmBonus.reduce((a, b) => a + b, 0);
  const quarterlyPaid = cmBonus.filter((_, i) => i % 4 !== 3).reduce((a, b) => a + b, 0);
  const annualPaid = cmBonus.filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-bold text-foreground">CM Compensation Model</h2>

      {/* Main Card */}
      <div className="bg-card border border-border/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">CM Bonus Comp</h3>
            <p className="text-2xl font-bold text-primary">{formatBDCurrency(COVER_META.cmBonusComp)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">Quarterly Eligibility</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatBDCurrency(COVER_META.quarterlyEligibility)}</p>
          </div>
          <div className="border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-medium">Annual Eligibility</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatBDCurrency(COVER_META.annualEligibility)}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="border-t border-border/50 pt-4">
          <h4 className="text-[12px] font-semibold text-foreground mb-2">Bonus Distribution</h4>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Total Paid</p>
              <p className="text-sm font-bold text-foreground">{formatBDCurrency(totalPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Quarterly Paid</p>
              <p className="text-sm font-bold text-emerald-400">{formatBDCurrency(quarterlyPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Annual Paid</p>
              <p className="text-sm font-bold text-primary">{formatBDCurrency(annualPaid)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quarterly Breakdown */}
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h4 className="text-[12px] font-semibold text-foreground mb-2">Quarterly Breakdown</h4>
        <div className="overflow-auto">
          <table className="w-full text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-2 py-1.5 font-semibold text-foreground">Quarter</th>
                <th className="text-right px-2 py-1.5 font-semibold text-foreground">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {QUARTERS_12.map((q, i) => {
                if (!visibleQuarters.has(q)) return null;
                return (
                  <tr key={q} className="border-b border-border/30">
                    <td className="px-2 py-1.5 text-foreground">{q}</td>
                    <td className="text-right px-2 py-1.5 text-primary font-medium">{formatBDCurrency(cmBonus[i])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
