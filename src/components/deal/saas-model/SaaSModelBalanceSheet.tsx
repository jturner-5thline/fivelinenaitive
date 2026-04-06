import { useState, useMemo } from 'react';
import { SaaSModelData } from './types';
import { SpreadsheetTable, RowDef, ViewMode } from './SpreadsheetTable';
import { Scale, TrendingUp, TrendingDown, Landmark, ShieldCheck } from 'lucide-react';
import { fmtCurrency } from './formatters';
import { cn } from '@/lib/utils';
import { useFinancialComments } from '@/hooks/useFinancialComments';

interface Props {
  model: SaaSModelData;
  dealId?: string;
}

/* ── KPI Card — aligned with mapping-theme surface system ── */
function BsKpiCard({ label, value, prevValue, format, icon: Icon, warning }: {
  label: string;
  value: number;
  prevValue?: number;
  format: 'currency' | 'ratio';
  icon: React.ElementType;
  warning?: boolean;
}) {
  const formatted = format === 'currency' ? fmtCurrency(value) : value.toFixed(2) + 'x';
  const hasDelta = prevValue !== undefined && prevValue !== 0;
  const delta = hasDelta
    ? format === 'ratio' ? value - prevValue! : ((value - prevValue!) / Math.abs(prevValue!)) * 100
    : 0;
  const isPositive = delta > 0;

  return (
    <div className="rounded-lg border p-4"
      style={{
        background: 'var(--map-surface, hsl(var(--card)))',
        borderColor: warning
          ? 'hsl(var(--destructive) / 0.35)'
          : 'var(--map-border, hsl(var(--border) / 0.3))',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--map-text-muted, hsl(var(--muted-foreground)))' }}
        >{label}</span>
        <Icon className="h-3.5 w-3.5"
          style={{ color: warning ? 'hsl(var(--destructive) / 0.5)' : 'var(--map-text-faint, hsl(var(--muted-foreground) / 0.4))' }}
        />
      </div>
      <div className={cn(
        "text-lg font-bold tabular-nums tracking-[-0.01em]",
        warning && "text-destructive"
      )}
        style={!warning ? { color: 'var(--map-text, hsl(var(--foreground)))' } : undefined}
      >
        {formatted}
      </div>
      {hasDelta && Math.abs(delta) > 0.01 && (
        <div className={cn(
          "flex items-center gap-1 mt-1.5 text-[10px] font-medium",
          isPositive ? "text-emerald-400" : "text-destructive"
        )}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isPositive ? '+' : ''}{format === 'ratio' ? delta.toFixed(2) : delta.toFixed(1) + '%'} MoM
        </div>
      )}
    </div>
  );
}

export function SaaSModelBalanceSheet({ model, dealId }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [showVariance, setShowVariance] = useState(false);
  const bs = model.balanceSheet;
  const {
    comments: financialComments,
    addComment,
    deleteComment,
    getCommentsForAnchor,
    getCommentCountForRow,
  } = useFinancialComments(dealId || '');
  const bs = model.balanceSheet;

  // Compute KPIs from latest period
  const kpis = useMemo(() => {
    const len = bs.totalAssets.length;
    if (len === 0) return null;
    const i = len - 1;
    const p = i - 1;

    const totalCA = bs.totalCurrentAssets[i] ?? 0;
    const totalCL = bs.totalCurrentLiabilities[i] ?? 0;
    const prevCA = p >= 0 ? (bs.totalCurrentAssets[p] ?? 0) : 0;
    const prevCL = p >= 0 ? (bs.totalCurrentLiabilities[p] ?? 0) : 0;

    const workingCapital = totalCA - totalCL;
    const prevWorkingCapital = p >= 0 ? prevCA - prevCL : 0;

    const currentRatio = totalCL !== 0 ? totalCA / totalCL : 0;
    const prevCurrentRatio = prevCL !== 0 ? prevCA / prevCL : 0;

    const quickAssets = (bs.cash[i] ?? 0) + (bs.marketableSecurities[i] ?? 0) + (bs.ar[i] ?? 0);
    const prevQuickAssets = p >= 0 ? (bs.cash[p] ?? 0) + (bs.marketableSecurities[p] ?? 0) + (bs.ar[p] ?? 0) : 0;
    const quickRatio = totalCL !== 0 ? quickAssets / totalCL : 0;
    const prevQuickRatio = prevCL !== 0 ? prevQuickAssets / prevCL : 0;

    const totalAssets = bs.totalAssets[i] ?? 0;
    const prevTotalAssets = p >= 0 ? (bs.totalAssets[p] ?? 0) : 0;

    const bsCheck = bs.bsCheck[i] ?? 0;

    return {
      workingCapital, prevWorkingCapital,
      currentRatio, prevCurrentRatio,
      quickRatio, prevQuickRatio,
      totalAssets, prevTotalAssets,
      bsBalanced: Math.abs(bsCheck) < 0.01,
    };
  }, [bs]);

  const rows: RowDef[] = [
    { key: 'sec-assets', label: 'ASSETS', values: [], isSection: true },
    { key: 'cash', label: 'Cash & Cash Equivalents', values: bs.cash },
    { key: 'mkt-sec', label: 'Marketable Securities', values: bs.marketableSecurities },
    { key: 'ar', label: 'Accounts Receivable', values: bs.ar },
    { key: 'prepaid', label: 'Prepaid Expenses', values: bs.prepaid },
    { key: 'inventory', label: 'Inventory', values: bs.inventory },
    { key: 'other-ca', label: 'Other Current Assets', values: bs.otherCurrentAssets },
    { key: 'total-ca', label: 'Total Current Assets', values: bs.totalCurrentAssets, isSubtotal: true, formula: 'SUM(Current Asset items)' },
    { key: 'ppe', label: 'PP&E', values: bs.ppe },
    { key: 'fixed-assets', label: 'Fixed Assets', values: bs.fixedAssets },
    { key: 'cap-software', label: 'Capitalized Software', values: bs.capSoftware },
    { key: 'intangibles', label: 'Intangible Assets', values: bs.intangibles },
    { key: 'other-lt-assets', label: 'Other LT Assets', values: bs.otherLTAssets },
    { key: 'total-lt-assets', label: 'Total LT Assets', values: bs.totalLTAssets, isSubtotal: true, formula: 'SUM(LT Asset items)' },
    { key: 'total-assets', label: 'Total Assets', values: bs.totalAssets, isTotal: true, formula: 'Total Current + Total LT Assets' },
    { key: 'sec-liabilities', label: 'LIABILITIES', values: [], isSection: true },
    { key: 'ap', label: 'Accounts Payable', values: bs.ap },
    { key: 'credit-cards', label: 'Credit Cards', values: bs.creditCards },
    { key: 'emp-accruals', label: 'Employee Accruals', values: bs.employeeAccruals },
    { key: 'other-accrued', label: 'Other Accrued Liabilities', values: bs.otherAccrued },
    { key: 'st-debt', label: 'Short-Term Debt', values: bs.stDebt },
    { key: 'deferred-rev', label: 'Deferred Revenue', values: bs.deferredRevenue },
    { key: 'other-st-liab', label: 'Other ST Liabilities', values: bs.otherSTLiabilities },
    { key: 'total-cl', label: 'Total Current Liabilities', values: bs.totalCurrentLiabilities, isSubtotal: true, formula: 'SUM(Current Liability items)' },
    { key: 'lt-debt', label: 'Long-Term Debt', values: bs.ltDebt },
    { key: 'gov-loan', label: 'Government Loan', values: bs.govLoan },
    { key: 'shareholder-loan', label: 'Shareholder Loan', values: bs.shareholderLoan },
    { key: 'conv-notes', label: 'Convertible Notes', values: bs.convertibleNotes },
    { key: 'total-lt-liab', label: 'Total LT Liabilities', values: bs.totalLTLiabilities, isSubtotal: true, formula: 'SUM(LT Liability items)' },
    { key: 'total-liab', label: 'Total Liabilities', values: bs.totalLiabilities, isTotal: true, formula: 'Total Current + Total LT Liabilities' },
    { key: 'sec-equity', label: 'EQUITY', values: [], isSection: true },
    { key: 'paid-in-cap', label: 'Paid in Capital', values: bs.paidInCapital },
    { key: 'retained-earnings', label: 'Retained Earnings', values: bs.retainedEarnings },
    { key: 'net-income-bs', label: 'Net Income', values: bs.netIncomeBs },
    { key: 'total-equity', label: 'Total Equity', values: bs.totalEquity, isTotal: true, formula: 'SUM(Equity items)' },
    { key: 'total-l-e', label: 'Total Liabilities & Equity', values: bs.totalLiabilitiesEquity, isTotal: true, formula: 'Total Liabilities + Total Equity' },
    { key: 'bs-check', label: 'BS Check (should be 0)', values: bs.bsCheck, isCheck: true, formula: 'Total Assets - Total L&E' },
  ];

  return (
    <div className="mapping-workbench space-y-3">
      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-5 gap-3">
          <BsKpiCard label="Total Assets" value={kpis.totalAssets} prevValue={kpis.prevTotalAssets} format="currency" icon={Landmark} />
          <BsKpiCard label="Working Capital" value={kpis.workingCapital} prevValue={kpis.prevWorkingCapital} format="currency" icon={Scale} warning={kpis.workingCapital < 0} />
          <BsKpiCard label="Current Ratio" value={kpis.currentRatio} prevValue={kpis.prevCurrentRatio} format="ratio" icon={Scale} warning={kpis.currentRatio < 1} />
          <BsKpiCard label="Quick Ratio" value={kpis.quickRatio} prevValue={kpis.prevQuickRatio} format="ratio" icon={TrendingUp} warning={kpis.quickRatio < 1} />
          <div className="rounded-lg border p-4"
            style={{
              background: 'var(--map-surface, hsl(var(--card)))',
              borderColor: !kpis.bsBalanced
                ? 'hsl(var(--destructive) / 0.35)'
                : 'var(--map-border, hsl(var(--border) / 0.3))',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: 'var(--map-text-muted, hsl(var(--muted-foreground)))' }}
              >BS Check</span>
              <ShieldCheck className="h-3.5 w-3.5"
                style={{ color: kpis.bsBalanced ? 'rgb(52 211 153 / 0.6)' : 'hsl(var(--destructive) / 0.5)' }}
              />
            </div>
            <div className={cn(
              "text-lg font-bold tabular-nums",
              kpis.bsBalanced ? "text-emerald-400" : "text-destructive"
            )}>
              {kpis.bsBalanced ? '✓ Balanced' : '✗ Imbalanced'}
            </div>
            <div className="text-[10px] mt-1"
              style={{ color: 'var(--map-text-faint, hsl(var(--muted-foreground) / 0.4))' }}
            >
              Assets = L + E
            </div>
          </div>
        </div>
      )}

      <SpreadsheetTable
        title="Balance Sheet"
        rows={rows}
        months={model.months}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        annualAggregation="last"
        actualThruDate={model.settings.actualThruDate}
        showVariance={showVariance}
        onToggleVariance={() => setShowVariance(v => !v)}
        conditionalFormatting
        statementType="balance_sheet"
        comments={financialComments}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        getCommentsForAnchor={getCommentsForAnchor}
        getCommentCountForRow={getCommentCountForRow}
      />
    </div>
  );
}
