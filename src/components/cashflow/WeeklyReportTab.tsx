import { useState, memo, useCallback } from 'react';
import type { WeeklyData, SidebarData, PlanSnapshot, ThemeMode } from './types';
import { fmtAbbrev } from './formatters';
import { WeeklyCharts } from './WeeklyCharts';
import { WeeklySidebar } from './WeeklySidebar';

interface WeeklyReportTabProps {
  weeklyData: WeeklyData;
  sidebarData: SidebarData;
  theme: ThemeMode;
  isAdmin: boolean;
  planSnapshots: PlanSnapshot[];
  activePlanId: string | null;
  onActivePlanChange: (id: string | null) => void;
  onSavePlan: (name: string) => void;
  onExport: () => void;
  onSidebarEditItem: (index: number, field: string, value: string | number) => void;
  onSidebarRemoveItem: (index: number) => void;
  onSidebarAddItem: () => void;
  onNoteEdit: (index: number, value: string) => void;
  onNoteRemove: (index: number) => void;
  onNoteAdd: () => void;
}

const WEEKLY_ROW_ORDER = [
  { key: 'BEGINNING CASH', section: 'position', isTotal: true },
  { key: 'ENDING CASH', section: 'position', isTotal: true },
  { key: "Add'l Liquidity (Delayed Draw)", section: 'position', isTotal: false },
  { key: 'TOTAL CASH ON HAND', section: 'position', isTotal: true },
  { key: '__sep_receipts', section: 'receipts', label: '( + ) CASH RECEIPTS', isHeader: true },
  { key: 'Revenue Deposits', section: 'receipts', isTotal: false },
  { key: 'Customer Payments', section: 'receipts', isTotal: false },
  { key: 'Consulting Fees', section: 'receipts', isTotal: false },
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

export const WeeklyReportTab = memo(function WeeklyReportTab({
  weeklyData, sidebarData, theme, isAdmin,
  planSnapshots, activePlanId, onActivePlanChange, onSavePlan,
  onExport, onSidebarEditItem, onSidebarRemoveItem, onSidebarAddItem,
  onNoteEdit, onNoteRemove, onNoteAdd,
}: WeeklyReportTabProps) {
  const sortedWeeks = Object.entries(weeklyData).sort(([a], [b]) => a.localeCompare(b));
  const totalWeeks = sortedWeeks.length;

  // Find the index of the current week (closest week_ending >= today)
  const today = new Date().toISOString().split('T')[0];
  const currentWeekIndex = sortedWeeks.findIndex(([dateKey, entry]) => {
    const weekEnding = typeof entry.week_ending === 'string' ? entry.week_ending : dateKey;
    return weekEnding >= today;
  });
  const effectiveCurrentIndex = currentWeekIndex >= 0 ? currentWeekIndex : totalWeeks - 1;

  const [weeksPast, setWeeksPast] = useState(() => Math.min(effectiveCurrentIndex, 4));
  const [weeksFuture, setWeeksFuture] = useState(() => Math.min(totalWeeks - effectiveCurrentIndex, 12));

  const startIdx = Math.max(0, effectiveCurrentIndex - weeksPast);
  const endIdx = Math.min(totalWeeks, effectiveCurrentIndex + weeksFuture);
  const visibleWeeks = sortedWeeks.slice(startIdx, endIdx);

  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');

  const activePlan = activePlanId ? planSnapshots.find(p => p.id === activePlanId) : null;

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
        <WeeklyCharts weeklyData={weeklyData} theme={theme} />

        {/* Range bar */}
        <div className="cf-range-bar">
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
              {planSnapshots.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="cf-btn cf-btn-primary" onClick={onExport}>Export PDF</button>
          </div>
        </div>

        {/* Weekly grid */}
        <div className="cf-grid-wrap">
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
                  return (
                    <tr key={rowDef.key} className={`cf-section-header ${getSectionClass(rowDef.section)}`}>
                      <td className="cf-label-col" colSpan={visibleWeeks.length + 1}>
                        {rowDef.label}
                      </td>
                    </tr>
                  );
                }

                const isTotal = rowDef.isTotal;
                return (
                  <tr key={rowDef.key} className={isTotal ? 'cf-total-row' : 'cf-indent'}>
                    <td className="cf-label-col">{rowDef.key}</td>
                    {visibleWeeks.map(([weekKey, entry]) => {
                      const val = (entry[rowDef.key] as number) || 0;
                      const planEntry = activePlan?.weeklyData[weekKey];
                      const planVal = planEntry ? ((planEntry[rowDef.key] as number) || 0) : null;

                      return (
                        <td
                          key={weekKey}
                          className={val > 0 ? 'cf-val-pos' : val < 0 ? 'cf-val-neg' : ''}
                        >
                          <div>{fmtAbbrev(rowDef.section === 'disbursements' && !isTotal && val > 0 ? -val : val)}</div>
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

      <WeeklySidebar
        data={sidebarData}
        isAdmin={isAdmin}
        onEditItem={onSidebarEditItem}
        onRemoveItem={onSidebarRemoveItem}
        onAddItem={onSidebarAddItem}
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
