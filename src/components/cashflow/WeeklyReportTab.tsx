import { useState, useEffect, memo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WeeklyData, SidebarData, PlanSnapshot, ThemeMode, WeeklyOverrides } from './types';
import { fmtAbbrev } from './formatters';
import { WeeklyCharts } from './WeeklyCharts';
import { WeeklySidebar } from './WeeklySidebar';
import { useGridWheelPassthrough } from './useGridWheelPassthrough';

interface SidebarItem {
  id?: string;
  name: string;
  amount: number;
  date: string;
}

interface WeeklyReportTabProps {
  weeklyData: WeeklyData;
  weeklyOverrides?: WeeklyOverrides;
  onCashOverride?: (weekKey: string, field: 'beginningCash' | 'endingCash', value: number | null) => void;
  sidebarData: SidebarData;
  sidebarDbItems: SidebarItem[];
  theme: ThemeMode;
  isAdmin: boolean;
  planSnapshots: PlanSnapshot[];
  activePlanId: string | null;
  onActivePlanChange: (id: string | null) => void;
  onSavePlan: (name: string) => void;
  onExport: () => void;
  onConfigureScheduled?: () => void;
  onSidebarEditItem: (index: number, field: string, value: string | number) => void;
  onSidebarRemoveItem: (index: number) => void;
  onSidebarAddItem: () => void;
  onSidebarRemoveDbItem: (id: string) => void;
  onNoteEdit: (index: number, value: string) => void;
  onNoteRemove: (index: number) => void;
  onNoteAdd: () => void;
}

const DEBT_ADV_PARENT_KEY = 'Debt Advisory Revenue';
const DEBT_ADV_SUBKEYS = ['Retainers', 'Milestones', 'Closing Fees', 'Referral Fees'] as const;

const WEEKLY_ROW_ORDER: Array<{
  key: string;
  section: string;
  isTotal?: boolean;
  isHeader?: boolean;
  label?: string;
  isParent?: boolean;
  parent?: string;
}> = [
  { key: 'BEGINNING CASH', section: 'position', isTotal: true },
  { key: 'ENDING CASH', section: 'position', isTotal: true },
  { key: "Add'l Liquidity (Delayed Draw)", section: 'position', isTotal: false },
  { key: 'TOTAL CASH ON HAND', section: 'position', isTotal: true },
  { key: '__sep_receipts', section: 'receipts', label: '( + ) CASH RECEIPTS', isHeader: true },
  { key: DEBT_ADV_PARENT_KEY, section: 'receipts', isTotal: false, isParent: true },
  { key: 'Retainers', section: 'receipts', isTotal: false, parent: DEBT_ADV_PARENT_KEY },
  { key: 'Milestones', section: 'receipts', isTotal: false, parent: DEBT_ADV_PARENT_KEY },
  { key: 'Closing Fees', section: 'receipts', isTotal: false, parent: DEBT_ADV_PARENT_KEY },
  { key: 'Referral Fees', section: 'receipts', isTotal: false, parent: DEBT_ADV_PARENT_KEY },
  { key: 'FinServ Revenue', section: 'receipts', isTotal: false },
  { key: 'Technology Revenue', section: 'receipts', isTotal: false },
  { key: 'Loan Proceeds', section: 'receipts', isTotal: false },
  { key: 'Other Receipts', section: 'receipts', isTotal: false },
  { key: 'TOTAL RECEIPTS', section: 'receipts', isTotal: true },
  { key: '__sep_disb', section: 'disbursements', label: '( – ) CASH DISBURSEMENTS', isHeader: true },
  { key: 'Advertising & Marketing', section: 'disbursements', isTotal: false },
  { key: 'Insurance', section: 'disbursements', isTotal: false },
  { key: 'Payroll - Salaries', section: 'disbursements', isTotal: false },
  { key: 'Payroll - Taxes & Benefits', section: 'disbursements', isTotal: false },
  { key: 'Contractors & Consultants', section: 'disbursements', isTotal: false },
  { key: 'Rent & Occupancy', section: 'disbursements', isTotal: false },
  { key: 'Software & Technology', section: 'disbursements', isTotal: false },
  { key: 'Legal & Professional', section: 'disbursements', isTotal: false },
  { key: 'Travel & Entertainment', section: 'disbursements', isTotal: false },
  { key: 'Office & Admin', section: 'disbursements', isTotal: false },
  { key: 'Loan Payments', section: 'disbursements', isTotal: false },
  { key: 'Other Disbursements', section: 'disbursements', isTotal: false },
  { key: 'TOTAL DISBURSEMENTS', section: 'disbursements', isTotal: true },
  { key: '__sep_net', section: 'summary', label: 'NET CHANGE', isHeader: true },
  { key: 'Internal Transfers', section: 'summary', isTotal: false },
  { key: 'NET CHANGE', section: 'summary', isTotal: true },
];

const DEBT_ADV_COLLAPSE_KEY = 'cf:debtAdvisoryCollapsed';

export const WeeklyReportTab = memo(function WeeklyReportTab({
  weeklyData, weeklyOverrides, onCashOverride,
  sidebarData, sidebarDbItems, theme, isAdmin,
  planSnapshots, activePlanId, onActivePlanChange, onSavePlan,
  onExport, onConfigureScheduled, onSidebarEditItem, onSidebarRemoveItem, onSidebarAddItem, onSidebarRemoveDbItem,
  onNoteEdit, onNoteRemove, onNoteAdd,
}: WeeklyReportTabProps) {
  const safeWeeklyData = weeklyData || {};
  const safeOverrides = weeklyOverrides || {};
  const safeSidebarData: SidebarData = {
    cash_in_next_8_weeks: Array.isArray(sidebarData?.cash_in_next_8_weeks) ? sidebarData.cash_in_next_8_weeks : [],
    notes: Array.isArray(sidebarData?.notes) ? sidebarData.notes : [],
  };
  const safeSidebarDbItems = sidebarDbItems || [];
  const safePlanSnapshots = planSnapshots || [];
  const sortedWeeks = Object.entries(safeWeeklyData).sort(([a], [b]) => a.localeCompare(b));
  const totalWeeks = sortedWeeks.length;

  // Find the index of the current week (closest week_ending >= today)
  const today = new Date().toISOString().split('T')[0];
  const currentWeekIndex = sortedWeeks.findIndex(([dateKey, entry]) => {
    const weekEnding = typeof entry.week_ending === 'string' ? entry.week_ending : dateKey;
    return weekEnding >= today;
  });
  const effectiveCurrentIndex = currentWeekIndex >= 0 ? currentWeekIndex : totalWeeks - 1;

  const [weeksPast, setWeeksPast] = useState(() => Math.min(effectiveCurrentIndex, 4));
  const [weeksFuture, setWeeksFuture] = useState(() => Math.min(totalWeeks - effectiveCurrentIndex - 1, 12));

  const startIdx = Math.max(0, effectiveCurrentIndex - weeksPast);
  const endIdx = Math.min(totalWeeks, effectiveCurrentIndex + 1 + weeksFuture);
  const visibleWeeks = sortedWeeks.slice(startIdx, endIdx);

  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const gridWrapRef = useGridWheelPassthrough<HTMLDivElement>();

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const activePlan = activePlanId ? safePlanSnapshots.find(p => p.id === activePlanId) : null;

  const renderVariance = (actual: number, plan: number) => {
    const diff = actual - plan;
    if (Math.abs(diff) < 500) return <div className="cf-variance">—</div>;
    const label = diff > 0 ? `+${fmtAbbrev(diff)}` : fmtAbbrev(diff);
    return <div className={`cf-variance ${diff > 0 ? 'pos' : 'neg'}`}>{label}</div>;
  };

  const handleSavePlan = useCallback(() => {
    onSavePlan(planName || `Plan — ${new Date().toLocaleDateString()}`);
    setSavePlanOpen(false);
    setPlanName('');
  }, [planName, onSavePlan]);

  const getSectionClass = (section: string) => {
    switch (section) {
      case 'receipts': return 'receipts';
      case 'disbursements': return 'disbursements';
      case 'summary': return 'summary';
      case 'position': return 'balance';
      default: return '';
    }
  };

  return (
    <div className="cf-weekly-layout">
      <div className="cf-weekly-main">
        <WeeklyCharts weeklyData={safeWeeklyData} theme={theme} />

        {/* Table card */}
        <div ref={gridWrapRef} className="cf-table-card">
        <div className="cf-range-bar" style={{ borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <div className="cf-range-controls">
            <span className="cf-range-label">Weeks Past</span>
            <input
              type="number"
              className="cf-range-input"
              value={weeksPast}
              onChange={e => setWeeksPast(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
            <span className="cf-range-label">Weeks Future</span>
            <input
              type="number"
              className="cf-range-input"
              value={weeksFuture}
              onChange={e => setWeeksFuture(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
            <span className="cf-range-label">
              Showing {visibleWeeks.length} of {totalWeeks} weeks
            </span>
          </div>
          <div className="cf-range-controls">
            <button className="cf-btn cf-btn-secondary" onClick={() => setSavePlanOpen(true)}>Save Plan</button>
            <select
              className="cf-select"
              value={activePlanId || ''}
              onChange={e => onActivePlanChange(e.target.value || null)}
            >
              <option value="">No Comparison</option>
              {safePlanSnapshots.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="cf-btn cf-btn-primary" onClick={onExport}>Export PDF</button>
          </div>
        </div>

        {/* Weekly grid */}
        <div className="cf-grid-wrap" style={{ borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
          <table className="cf-grid">
            <thead>
              <tr>
                <th className="cf-label-col">Line Item</th>
                {visibleWeeks.map(([key, entry]) => (
                  <th key={key}>
                    <div>Wk {entry.week_num}</div>
                    <div style={{ fontSize: '9px' }}>
                      {new Date(entry.week_ending).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKLY_ROW_ORDER.map((rowDef) => {
                if ('isHeader' in rowDef && rowDef.isHeader) {
                  const isCollapsible = rowDef.section === 'receipts' || rowDef.section === 'disbursements';
                  const isCollapsed = collapsedSections[rowDef.section];
                  return (
                    <tr
                      key={rowDef.key}
                      className={`cf-section-header ${getSectionClass(rowDef.section)}`}
                      style={isCollapsible ? { cursor: 'pointer' } : undefined}
                      onClick={isCollapsible ? () => toggleSection(rowDef.section) : undefined}
                    >
                      <td className="cf-label-col" colSpan={visibleWeeks.length + 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isCollapsible && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
                        {rowDef.label}
                      </td>
                    </tr>
                  );
                }

                const isTotal = rowDef.isTotal;
                // Hide detail rows when section is collapsed (but keep totals visible)
                if (!isTotal && collapsedSections[rowDef.section]) {
                  return null;
                }
                const isCashRow = rowDef.key === 'BEGINNING CASH' || rowDef.key === 'ENDING CASH';
                const overrideField: 'beginningCash' | 'endingCash' | null = isCashRow
                  ? (rowDef.key === 'BEGINNING CASH' ? 'beginningCash' : 'endingCash')
                  : null;
                return (
                  <tr key={rowDef.key} className={isTotal ? 'cf-total-row' : 'cf-indent'}>
                    <td className="cf-label-col">{rowDef.key}</td>
                    {visibleWeeks.map(([weekKey, entry]) => {
                      const val = (entry[rowDef.key] as number) || 0;
                      const displayVal = rowDef.section === 'disbursements' && !isTotal && val > 0 ? -val : val;
                      const planEntry = activePlan?.weeklyData?.[weekKey];
                      const planVal = planEntry ? ((planEntry[rowDef.key] as number) || 0) : null;
                      const isOverridden = !!(isCashRow && overrideField && safeOverrides[weekKey]?.[overrideField] !== undefined);
                      const editable = isAdmin && isCashRow && !!onCashOverride;

                      return (
                        <td
                          key={weekKey}
                          className={`${displayVal > 0 ? 'cf-val-pos' : displayVal < 0 ? 'cf-val-neg' : ''}${isOverridden ? ' cf-cell-override' : ''}`}
                          title={isOverridden ? 'Manually overridden — double-click to clear' : (editable ? 'Click to edit' : undefined)}
                          onDoubleClick={isOverridden && editable && overrideField
                            ? () => onCashOverride!(weekKey, overrideField, null)
                            : undefined}
                        >
                          {editable && overrideField ? (
                            <input
                              className={`cf-cell-input ${displayVal > 0 ? 'cf-val-pos' : displayVal < 0 ? 'cf-val-neg' : ''}`}
                              defaultValue={fmtAbbrev(displayVal)}
                              type="text"
                              inputMode="decimal"
                              onFocus={(e) => {
                                e.currentTarget.value = val === 0 ? '' : String(val);
                                e.currentTarget.select();
                              }}
                              onBlur={(e) => {
                                const raw = e.currentTarget.value.trim();
                                if (raw === '') {
                                  onCashOverride!(weekKey, overrideField, null);
                                  return;
                                }
                                const parsed = Number(raw);
                                if (!Number.isFinite(parsed)) {
                                  e.currentTarget.value = fmtAbbrev(displayVal);
                                  return;
                                }
                                if (parsed === val && !isOverridden) {
                                  e.currentTarget.value = fmtAbbrev(displayVal);
                                  return;
                                }
                                onCashOverride!(weekKey, overrideField, parsed);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                if (e.key === 'Escape') {
                                  (e.currentTarget as HTMLInputElement).value = fmtAbbrev(displayVal);
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              key={`${weekKey}-${val}-${isOverridden ? 'o' : 'c'}`}
                            />
                          ) : (
                            <div>{fmtAbbrev(displayVal)}</div>
                          )}
                          {isOverridden && <span className="cf-override-dot" aria-hidden />}
                          {planVal !== null && renderVariance(val, planVal)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      <WeeklySidebar
        data={safeSidebarData}
        dbItems={safeSidebarDbItems}
        isAdmin={isAdmin}
        onEditItem={onSidebarEditItem}
        onRemoveItem={onSidebarRemoveItem}
        onAddItem={onSidebarAddItem}
        onRemoveDbItem={onSidebarRemoveDbItem}
        onNoteEdit={onNoteEdit}
        onNoteRemove={onNoteRemove}
        onNoteAdd={onNoteAdd}
      />

      {/* Save Plan dialog */}
      {savePlanOpen && (
        <div className="cf-overlay" onClick={() => setSavePlanOpen(false)}>
          <div className="cf-dialog" onClick={e => e.stopPropagation()}>
            <div className="cf-dialog-title">Save Plan Snapshot</div>
            <input
              className="cf-input"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder={`Plan — ${new Date().toLocaleDateString()}`}
              autoFocus
            />
            <div className="cf-dialog-actions">
              <button className="cf-btn cf-btn-ghost" onClick={() => setSavePlanOpen(false)}>Cancel</button>
              <button className="cf-btn cf-btn-primary" onClick={handleSavePlan}>Save Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
