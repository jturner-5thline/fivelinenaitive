import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useBDRoiStore } from './useBDRoiStore';
import { QUARTERS_16, PARTNER_EXPENSE_LABELS } from './bdRoiData';
import { rollingSum, ytdSum, allTimeSum, safeDiv } from './bdRoiFormulas';
import { BDFinancialTable, type TableSection } from './BDFinancialTable';

function buildComputedRows(data: typeof import('./bdRoiData').INITIAL_PARTNER_DATA, Q: number) {
  const totalExpenses = Array.from({ length: Q }, (_, i) =>
    data.expenses.reduce((sum, exp) => sum + (exp[i] ?? 0), 0)
  );
  const profit = data.revenue.map((r, i) => r - totalExpenses[i]);
  const ytdProfit = profit.map((_, i) => ytdSum(profit, i));
  const ttmProfit = profit.map((_, i) => rollingSum(profit, i));
  const allTimeProfit = profit.map((_, i) => allTimeSum(profit, i));
  const profitPct = profit.map((p, i) => safeDiv(p, data.revenue[i]));

  const ytdRev = data.revenue.map((_, i) => ytdSum(data.revenue, i));
  const ttmRev = data.revenue.map((_, i) => rollingSum(data.revenue, i));
  const totalRev = data.revenue.map((_, i) => allTimeSum(data.revenue, i));

  const dobYtd = data.dob.map((_, i) => ytdSum(data.dob, i));
  const dobTtm = data.dob.map((_, i) => rollingSum(data.dob, i));
  const dobTotal = data.dob.map((_, i) => allTimeSum(data.dob, i));

  const signedYtd = data.signed.map((_, i) => ytdSum(data.signed, i));
  const signedTtm = data.signed.map((_, i) => rollingSum(data.signed, i));
  const signedTotal = data.signed.map((_, i) => allTimeSum(data.signed, i));

  const closedYtd = data.closed.map((_, i) => ytdSum(data.closed, i));
  const closedTtm = data.closed.map((_, i) => rollingSum(data.closed, i));
  const closedTotal = data.closed.map((_, i) => allTimeSum(data.closed, i));

  return { totalExpenses, profit, ytdProfit, ttmProfit, allTimeProfit, profitPct, ytdRev, ttmRev, totalRev, dobYtd, dobTtm, dobTotal, signedYtd, signedTtm, signedTotal, closedYtd, closedTtm, closedTotal };
}

function buildSections(
  data: typeof import('./bdRoiData').INITIAL_PARTNER_DATA,
  computed: ReturnType<typeof buildComputedRows>,
  editable: boolean,
  onEditField?: (key: string, idx: number, val: number) => void,
  onEditExpense?: (expIdx: number, qIdx: number, val: number) => void,
): TableSection[] {
  const editFn = (key: string) => editable && onEditField ? (idx: number, val: number) => onEditField(key, idx, val) : undefined;
  const Q = data.partners.length;

  const pipelineSection: TableSection = {
    key: 'pipeline', label: 'Pipeline',
    rows: [
      { key: 'partners', label: 'Partners', values: data.partners, format: 'number', editable, onEdit: editFn('partners') },
      { key: 'dob', label: 'Deals on Board', values: data.dob, format: 'number', editable, onEdit: editFn('dob') },
      { key: 'dobYtd', label: 'DOB (YTD)', values: computed.dobYtd, format: 'number' },
      { key: 'dobTtm', label: 'DOB (TTM)', values: computed.dobTtm, format: 'number' },
      { key: 'dobTotal', label: 'DOB (Total)', values: computed.dobTotal, format: 'number' },
      { key: 'signed', label: 'Signed Clients', values: data.signed, format: 'number', editable, onEdit: editFn('signed') },
      { key: 'signedYtd', label: 'Signed (YTD)', values: computed.signedYtd, format: 'number' },
      { key: 'signedTtm', label: 'Signed (TTM)', values: computed.signedTtm, format: 'number' },
      { key: 'signedTotal', label: 'Signed (Total)', values: computed.signedTotal, format: 'number' },
      { key: 'closed', label: 'Closed Deals', values: data.closed, format: 'number', editable, onEdit: editFn('closed') },
      { key: 'closedYtd', label: 'Closed (YTD)', values: computed.closedYtd, format: 'number' },
      { key: 'closedTtm', label: 'Closed (TTM)', values: computed.closedTtm, format: 'number' },
      { key: 'closedTotal', label: 'Closed (Total)', values: computed.closedTotal, format: 'number' },
    ],
  };

  const financialSection: TableSection = {
    key: 'financial', label: 'Financial',
    rows: [
      { key: 'revenue', label: 'Client Revenue', values: data.revenue, format: 'dollar', editable, onEdit: editFn('revenue') },
      { key: 'ytdRev', label: 'YTD Revenue', values: computed.ytdRev, format: 'dollar' },
      { key: 'ttmRev', label: 'TTM Revenue', values: computed.ttmRev, format: 'dollar' },
      { key: 'totalRev', label: 'Total Revenue', values: computed.totalRev, format: 'dollar' },
      ...PARTNER_EXPENSE_LABELS.map((label, expIdx) => ({
        key: `exp${expIdx}`,
        label,
        values: data.expenses[expIdx],
        format: 'dollar' as const,
        editable,
        onEdit: editable && onEditExpense ? (qIdx: number, val: number) => onEditExpense(expIdx, qIdx, val) : undefined,
      })),
      { key: 'totalExp', label: 'Total Expenses', values: computed.totalExpenses, format: 'dollar', isTotal: true },
      { key: 'profit', label: 'Profit', values: computed.profit, format: 'dollar', isTotal: true },
      { key: 'ytdProfit', label: 'YTD Profit', values: computed.ytdProfit, format: 'dollar' },
      { key: 'ttmProfit', label: 'TTM Profit', values: computed.ttmProfit, format: 'dollar' },
      { key: 'allTimeProfit', label: 'All-Time Profit', values: computed.allTimeProfit, format: 'dollar' },
      { key: 'profitPct', label: 'Profit %', values: computed.profitPct, format: 'percent' },
    ],
  };

  return [pipelineSection, financialSection];
}

export function BDPartnerTab() {
  const store = useBDRoiStore();
  const { partnerAssumptions, partnerProjections, partnerActuals } = store;

  const projComputed = useMemo(() => buildComputedRows(partnerProjections, 16), [partnerProjections]);
  const actComputed = useMemo(() => buildComputedRows(partnerActuals, 16), [partnerActuals]);

  const projSections = useMemo(() => buildSections(
    partnerProjections, projComputed, true,
    (key, idx, val) => store.updateNestedArray('partnerProjections', key, idx, val, QUARTERS_16[idx], 'Partner Proj'),
    (expIdx, qIdx, val) => store.updatePartnerExpense('partnerProjections', expIdx, qIdx, val, QUARTERS_16[qIdx]),
  ), [partnerProjections, projComputed]);

  const actSections = useMemo(() => buildSections(
    partnerActuals, actComputed, true,
    (key, idx, val) => store.updateNestedArray('partnerActuals', key, idx, val, QUARTERS_16[idx], 'Partner Act'),
    (expIdx, qIdx, val) => store.updatePartnerExpense('partnerActuals', expIdx, qIdx, val, QUARTERS_16[qIdx]),
  ), [partnerActuals, actComputed]);

  // Variance
  const varianceSections = useMemo((): TableSection[] => {
    const allProjRows = projSections.flatMap(s => s.rows);
    const allActRows = actSections.flatMap(s => s.rows);
    const rows = allProjRows.map((projRow, ri) => {
      const actRow = allActRows[ri];
      if (!actRow) return projRow;
      const values = projRow.values.map((pv, qi) => {
        const av = actRow.values[qi];
        if (pv === null || av === null) return null;
        return (av as number) - (pv as number);
      });
      return { ...projRow, key: `var_${projRow.key}`, values, editable: false, onEdit: undefined };
    });
    return [{ key: 'variance', label: 'Variance (Actuals − Projections)', rows }];
  }, [projSections, actSections]);

  const assumptions = partnerAssumptions;

  return (
    <div className="space-y-4">
      {/* Assumptions */}
      <div className="bg-white border border-[#CED4DA] rounded-lg p-4">
        <h3 className="text-[13px] font-semibold text-[#212529] mb-3">Partner Program Assumptions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'newPartnersQ', label: 'New Partners/Q' },
            { key: 'dobsQ', label: 'DOBs/Q' },
            { key: 'signedConv', label: 'Signed Client Conv %', pct: true },
            { key: 'closedConv', label: 'Deals Closed Conv %', pct: true },
            { key: 'signedLag', label: 'Signed Client Lag (Q)' },
            { key: 'closedLag', label: 'Deal Closed Lag (Q)' },
            { key: 'revPerSigned', label: 'Revenue/Signed ($)' },
            { key: 'revPerClosed', label: 'Revenue/Closed ($)' },
          ].map(({ key, label, pct }) => (
            <div key={key}>
              <label className="text-[10px] text-[#6C757D] block mb-1">{label}</label>
              <Input
                type="number"
                className="h-7 text-[11px]"
                value={pct ? (assumptions as any)[key] * 100 : (assumptions as any)[key]}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0;
                  store.updateAssumption('partnerAssumptions', key, pct ? v / 100 : v);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="projections">
        <TabsList>
          <TabsTrigger value="projections" className="text-xs">Projections</TabsTrigger>
          <TabsTrigger value="actuals" className="text-xs">Actuals</TabsTrigger>
          <TabsTrigger value="variance" className="text-xs">Variance</TabsTrigger>
        </TabsList>
        <TabsContent value="projections">
          <h3 className="text-[13px] font-semibold text-[#212529] mb-2">Projections — Partner Program</h3>
          <BDFinancialTable sections={projSections} quarters={QUARTERS_16} />
        </TabsContent>
        <TabsContent value="actuals">
          <h3 className="text-[13px] font-semibold text-[#212529] mb-2">Actuals — Partner Program</h3>
          <BDFinancialTable sections={actSections} quarters={QUARTERS_16} />
        </TabsContent>
        <TabsContent value="variance">
          <h3 className="text-[13px] font-semibold text-[#212529] mb-2">Variance — Partner Program</h3>
          <BDFinancialTable sections={varianceSections} quarters={QUARTERS_16} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
