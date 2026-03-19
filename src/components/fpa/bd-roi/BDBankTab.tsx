import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useBDRoiStore } from './useBDRoiStore';
import { QUARTERS_12 } from './bdRoiData';
import { rollingSum, ytdSum, allTimeSum, safeDiv } from './bdRoiFormulas';
import { BDFinancialTable, type TableSection } from './BDFinancialTable';
import { getVisibleIndices } from './QuarterFilter';

function buildBankComputed(data: typeof import('./bdRoiData').INITIAL_BANK_DATA) {
  const Q = 12;
  const totalExpenses = Array.from({ length: Q }, (_, i) =>
    data.expenses.travel[i] + data.expenses.events[i] + data.expenses.meals[i]
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

function buildBankSections(
  data: typeof import('./bdRoiData').INITIAL_BANK_DATA,
  computed: ReturnType<typeof buildBankComputed>,
  editable: boolean,
  onEditField?: (key: string, idx: number, val: number) => void,
  onEditExpense?: (key: string, qIdx: number, val: number) => void,
): TableSection[] {
  const editFn = (key: string) => editable && onEditField ? (idx: number, val: number) => onEditField(key, idx, val) : undefined;

  return [
    {
      key: 'pipeline', label: 'Pipeline',
      rows: [
        { key: 'contacts', label: 'Bank Contacts', values: data.contacts, format: 'number', editable, onEdit: editFn('contacts') },
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
    },
    {
      key: 'financial', label: 'Financial',
      rows: [
        { key: 'revenue', label: 'Revenue', values: data.revenue, format: 'dollar', editable, onEdit: editFn('revenue') },
        { key: 'ytdRev', label: 'YTD Revenue', values: computed.ytdRev, format: 'dollar' },
        { key: 'ttmRev', label: 'TTM Revenue', values: computed.ttmRev, format: 'dollar' },
        { key: 'totalRev', label: 'Total Revenue', values: computed.totalRev, format: 'dollar' },
        { key: 'expTravel', label: 'Travel & Lodging', values: data.expenses.travel, format: 'dollar', editable, onEdit: editable && onEditExpense ? (qi: number, v: number) => onEditExpense('travel', qi, v) : undefined },
        { key: 'expEvents', label: 'Events & Sponsorships', values: data.expenses.events, format: 'dollar', editable, onEdit: editable && onEditExpense ? (qi: number, v: number) => onEditExpense('events', qi, v) : undefined },
        { key: 'expMeals', label: 'Meals & Entertainment', values: data.expenses.meals, format: 'dollar', editable, onEdit: editable && onEditExpense ? (qi: number, v: number) => onEditExpense('meals', qi, v) : undefined },
        { key: 'totalExp', label: 'Total Expenses', values: computed.totalExpenses, format: 'dollar', isTotal: true },
        { key: 'profit', label: 'Profit', values: computed.profit, format: 'dollar', isTotal: true },
        { key: 'ytdProfit', label: 'YTD Profit', values: computed.ytdProfit, format: 'dollar' },
        { key: 'ttmProfit', label: 'TTM Profit', values: computed.ttmProfit, format: 'dollar' },
        { key: 'allTimeProfit', label: 'All-Time Profit', values: computed.allTimeProfit, format: 'dollar' },
        { key: 'profitPct', label: 'Profit %', values: computed.profitPct, format: 'percent' },
      ],
    },
  ];
}

export function BDBankTab() {
  const store = useBDRoiStore();
  const { bankAssumptions, bankProjections, bankActuals } = store;

  const projComputed = useMemo(() => buildBankComputed(bankProjections), [bankProjections]);
  const actComputed = useMemo(() => buildBankComputed(bankActuals), [bankActuals]);

  const projSections = useMemo(() => buildBankSections(
    bankProjections, projComputed, true,
    (key, idx, val) => store.updateNestedArray('bankProjections', key, idx, val, QUARTERS_12[idx], 'Bank Proj'),
    (key, qIdx, val) => store.updateBankExpense('bankProjections', key, qIdx, val, QUARTERS_12[qIdx]),
  ), [bankProjections, projComputed]);

  const actSections = useMemo(() => buildBankSections(
    bankActuals, actComputed, true,
    (key, idx, val) => store.updateNestedArray('bankActuals', key, idx, val, QUARTERS_12[idx], 'Bank Act'),
    (key, qIdx, val) => store.updateBankExpense('bankActuals', key, qIdx, val, QUARTERS_12[qIdx]),
  ), [bankActuals, actComputed]);

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

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h3 className="text-[13px] font-semibold text-foreground mb-3">Bank Channel Assumptions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'newContactsQ', label: 'New Contacts/Q' },
            { key: 'dobsQ', label: 'DOBs/Q' },
            { key: 'signedConv', label: 'Signed Conv %', pct: true },
            { key: 'closedConv', label: 'Closed Conv %', pct: true },
            { key: 'signedLag', label: 'Signed Lag (Q)' },
            { key: 'closedLag', label: 'Closed Lag (Q)' },
            { key: 'revPerSigned', label: 'Revenue/Signed ($)' },
            { key: 'revPerClosed', label: 'Revenue/Closed ($)' },
          ].map(({ key, label, pct }) => (
            <div key={key}>
              <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
              <Input
                type="number"
                className="h-7 text-[11px]"
                value={pct ? (bankAssumptions as any)[key] * 100 : (bankAssumptions as any)[key]}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0;
                  store.updateAssumption('bankAssumptions', key, pct ? v / 100 : v);
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
          <h3 className="text-[13px] font-semibold text-foreground mb-2">Projections — Bank Channel</h3>
          <BDFinancialTable sections={projSections} quarters={QUARTERS_12} />
        </TabsContent>
        <TabsContent value="actuals">
          <h3 className="text-[13px] font-semibold text-foreground mb-2">Actuals — Bank Channel</h3>
          <BDFinancialTable sections={actSections} quarters={QUARTERS_12} />
        </TabsContent>
        <TabsContent value="variance">
          <h3 className="text-[13px] font-semibold text-foreground mb-2">Variance — Bank Channel</h3>
          <BDFinancialTable sections={varianceSections} quarters={QUARTERS_12} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
