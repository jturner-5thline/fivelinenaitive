import { useState, useEffect, memo, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, X } from 'lucide-react';
import type { WeeklyData, SidebarData, PlanSnapshot, ThemeMode, WeeklyOverrides } from './types';
import { fmtAbbrev } from './formatters';
import { WeeklyCharts } from './WeeklyCharts';
import { CashInPanel, NotesPanel } from './WeeklySidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGridWheelPassthrough } from './useGridWheelPassthrough';
import { ACCOUNT_OPTIONS } from './scheduledCashFlows';
import { useCellComments, cellCommentKey } from './cellComments/useCellComments';
import { CellCommentMenu } from './cellComments/CellCommentMenu';
import { CellCommentPopover } from './cellComments/CellCommentPopover';
import type { CellComment } from './cellComments/types';
import { useAuth } from '@/contexts/AuthContext';
import { CashFlowDrilldownModal, type DrilldownContext } from './CashFlowDrilldownModal';
import type { ScheduledCashFlow } from './scheduledCashFlows';

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
  companyId?: string | null;
  planSnapshots: PlanSnapshot[];
  activePlanId: string | null;
  onActivePlanChange: (id: string | null) => void;
  onSavePlan: (name: string) => void;
  onExport: () => void;
  onConfigureScheduled?: () => void;
  scheduledItems?: ScheduledCashFlow[];
  onSidebarEditItem: (index: number, field: string, value: string | number) => void;
  onSidebarRemoveItem: (index: number) => void;
  onSidebarAddItem: () => void;
  onSidebarRemoveDbItem: (id: string) => void;
  onNoteEdit: (index: number, value: string) => void;
  onNoteRemove: (index: number) => void;
  onNoteAdd: () => void;
  notesDialogOpen?: boolean;
  onNotesDialogOpenChange?: (open: boolean) => void;
  cashInDialogOpen?: boolean;
  onCashInDialogOpenChange?: (open: boolean) => void;
  onCellCommentCountChange?: (count: number) => void;
  weeksFuture?: number;
  onWeeksFutureChange?: (n: number) => void;
}

const DEBT_ADV_PARENT_KEY = 'Debt Advisory Revenue';
const DEBT_ADV_SUBKEYS = ['Retainers', 'Milestones', 'Closing Fees', 'Referral Fees'] as const;
const INTERNAL_TRANSFERS_PARENT_KEY = 'Internal Transfers';
const TRANSFER_ACCOUNT_KEY_PREFIX = 'Transfer:';

type WeeklyRow = {
  key: string;
  section: string;
  isTotal?: boolean;
  isHeader?: boolean;
  label?: string;
  isParent?: boolean;
  parent?: string;
  isNetChange?: boolean;
  isSpacer?: boolean;
  isTransferAccount?: boolean;
  transferAccount?: string;
};

const WEEKLY_ROW_ORDER: Array<WeeklyRow> = [
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
  { key: 'NET CHANGE', section: 'summary', isTotal: true, isNetChange: true },
  { key: '__spacer_transfers', section: 'spacer', isSpacer: true },
  { key: INTERNAL_TRANSFERS_PARENT_KEY, section: 'transfers', isTotal: false, isParent: true },
  ...ACCOUNT_OPTIONS.map((acc) => ({
    key: `${TRANSFER_ACCOUNT_KEY_PREFIX}${acc}`,
    section: 'transfers',
    isTotal: false,
    parent: INTERNAL_TRANSFERS_PARENT_KEY,
    isTransferAccount: true,
    transferAccount: acc,
  })),
];

const DEBT_ADV_COLLAPSE_KEY = 'cf:debtAdvisoryCollapsed';
const TRANSFERS_COLLAPSE_KEY = 'cf:internalTransfersCollapsed';
const LINE_ITEM_COL_WIDTH = 240;
const WEEK_COL_MIN_WIDTH = 130;

export const WeeklyReportTab = memo(function WeeklyReportTab({
  weeklyData, weeklyOverrides, onCashOverride,
  sidebarData, sidebarDbItems, theme, isAdmin, companyId,
  planSnapshots, activePlanId, onActivePlanChange, onSavePlan,
  onExport, onConfigureScheduled, scheduledItems, onSidebarEditItem, onSidebarRemoveItem, onSidebarAddItem, onSidebarRemoveDbItem,
  onNoteEdit, onNoteRemove, onNoteAdd,
  notesDialogOpen, onNotesDialogOpenChange,
  cashInDialogOpen, onCashInDialogOpenChange,
  onCellCommentCountChange,
  weeksFuture: weeksFutureProp,
  onWeeksFutureChange,
}: WeeklyReportTabProps) {
  const { user } = useAuth();
  const { comments: cellComments, byCell: cellCommentsByCell, addComment: addCellComment, deleteComment: deleteCellComment } =
    useCellComments({ companyId, planId: activePlanId });
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

  // Clamp to >=0 so that edge cases (empty initial weeklyData, current week at edge)
  // never produce negative state that silently collapses the visible window.
  const [weeksPast, setWeeksPast] = useState(() => Math.max(0, Math.min(Math.max(0, effectiveCurrentIndex), 4)));
  const [weeksFutureLocal, setWeeksFutureLocal] = useState(() =>
    Math.max(0, Math.min(Math.max(0, totalWeeks - effectiveCurrentIndex - 1), 12)),
  );
  const weeksFuture = weeksFutureProp ?? weeksFutureLocal;
  const setWeeksFuture = useCallback((n: number) => {
    const clamped = Math.max(0, n);
    if (onWeeksFutureChange) onWeeksFutureChange(clamped);
    if (weeksFutureProp === undefined) setWeeksFutureLocal(clamped);
  }, [onWeeksFutureChange, weeksFutureProp]);

  const startIdx = Math.max(0, effectiveCurrentIndex - weeksPast);
  const endIdx = Math.min(totalWeeks, effectiveCurrentIndex + 1 + weeksFuture);
  const cols = useMemo(() => sortedWeeks.slice(startIdx, endIdx), [sortedWeeks, startIdx, endIdx]);
  const visibleWeeks = cols;
  const visibleWeekKeys = useMemo(() => cols.map(([key]) => key), [cols]);
  const tableMinWidth = useMemo(
    () => `calc(${LINE_ITEM_COL_WIDTH}px + ${cols.length} * ${WEEK_COL_MIN_WIDTH}px)`,
    [cols.length],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[WeeklyReportTab] visible week columns', {
      weeksPast,
      weeksFuture,
      startIdx,
      endIdx,
      totalWeeks,
      expectedColumnCount: Math.max(0, endIdx - startIdx),
      renderedColumnCount: cols.length,
      weekKeys: visibleWeekKeys,
    });
  }, [weeksPast, weeksFuture, startIdx, endIdx, totalWeeks, cols.length, visibleWeekKeys]);

  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [debtAdvCollapsed, setDebtAdvCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(DEBT_ADV_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [transfersCollapsed, setTransfersCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(TRANSFERS_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const gridWrapRef = useGridWheelPassthrough<HTMLDivElement>();

  // Sidebar drawer (off-canvas) state — keeps Weekly Report full-width
  const SIDEBAR_OPEN_KEY = 'cf:sidebarDrawerOpen';
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(SIDEBAR_OPEN_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [sidebarOpen]);

  // Horizontal scroll edge-fade indicators
  const [edgeState, setEdgeState] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const handleGridScroll = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdgeState((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => {
    const el = gridWrapRef.current?.querySelector<HTMLDivElement>('.cf-grid-wrap');
    if (!el) return;
    handleGridScroll(el);
    const onScroll = () => handleGridScroll(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => handleGridScroll(el));
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [handleGridScroll, visibleWeeks.length, sidebarOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEBT_ADV_COLLAPSE_KEY, debtAdvCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [debtAdvCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRANSFERS_COLLAPSE_KEY, transfersCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [transfersCollapsed]);

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const toggleDebtAdv = useCallback(() => setDebtAdvCollapsed(p => !p), []);
  const toggleTransfers = useCallback(() => setTransfersCollapsed(p => !p), []);

  const parentSumForWeek = useCallback((entry: any): number => {
    let s = 0;
    for (const k of DEBT_ADV_SUBKEYS) s += Number(entry?.[k]) || 0;
    return s;
  }, []);

  const transferAccountValue = useCallback((entry: any, account: string): number => {
    return Number(entry?.[`${TRANSFER_ACCOUNT_KEY_PREFIX}${account}`]) || 0;
  }, []);

  // ===== Cell-comment menu / popover state =====
  type CellCtx = {
    line_item_key: string;
    line_item_label: string;
    week_key: string;
    week_num: number | null;
    week_ending: string | null;
    cell_value_snapshot: number | null;
  };
  const [menuState, setMenuState] = useState<{ x: number; y: number; ctx: CellCtx } | null>(null);
  const [popoverState, setPopoverState] = useState<{ x: number; y: number; ctx: CellCtx; mode: 'compose' | 'view' } | null>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const registerCellRef = useCallback((key: string, el: HTMLTableCellElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  // ===== Drilldown state =====
  const [drilldown, setDrilldown] = useState<DrilldownContext | null>(null);
  const openDrilldown = useCallback(
    (rowKey: string, rowLabel: string, weekKey: string, weekEnding: string | null, cellValue: number) => {
      setDrilldown({
        rowKey,
        rowLabel,
        weekKey,
        weekEnding: weekEnding || weekKey,
        cellValue,
      });
    },
    [],
  );

  const handleCellContextMenu = useCallback((e: React.MouseEvent<HTMLTableCellElement>, ctx: CellCtx) => {
    e.preventDefault();
    setPopoverState(null);
    setMenuState({ x: e.clientX, y: e.clientY, ctx });
  }, []);

  const handleMenuAdd = useCallback(() => {
    if (!menuState) return;
    setPopoverState({ x: menuState.x, y: menuState.y, ctx: menuState.ctx, mode: 'compose' });
    setMenuState(null);
  }, [menuState]);

  const handleMenuView = useCallback(() => {
    if (!menuState) return;
    setPopoverState({ x: menuState.x, y: menuState.y, ctx: menuState.ctx, mode: 'view' });
    setMenuState(null);
  }, [menuState]);

  const handleSubmitComment = useCallback(async (html: string) => {
    if (!popoverState) return;
    const c = popoverState.ctx;
    await addCellComment({
      line_item_key: c.line_item_key,
      line_item_label: c.line_item_label,
      week_key: c.week_key,
      week_num: c.week_num,
      week_ending: c.week_ending,
      cell_value_snapshot: c.cell_value_snapshot,
      content_html: html,
      content_text: '',
    });
  }, [popoverState, addCellComment]);

  const scrollToCell = useCallback((line_item_key: string, week_key: string) => {
    const el = cellRefs.current.get(cellCommentKey(line_item_key, week_key));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    el.classList.remove('cf-cell-highlight');
    void el.offsetWidth;
    el.classList.add('cf-cell-highlight');
    setTimeout(() => el.classList.remove('cf-cell-highlight'), 2000);
  }, []);

  const handleSidebarCommentClick = useCallback((c: CellComment) => {
    scrollToCell(c.line_item_key, c.week_key);
    const el = cellRefs.current.get(cellCommentKey(c.line_item_key, c.week_key));
    if (el) {
      const rect = el.getBoundingClientRect();
      setPopoverState({
        x: rect.left,
        y: rect.bottom + 4,
        ctx: {
          line_item_key: c.line_item_key,
          line_item_label: c.line_item_label,
          week_key: c.week_key,
          week_num: c.week_num,
          week_ending: c.week_ending,
          cell_value_snapshot: c.cell_value_snapshot,
        },
        mode: 'view',
      });
    }
  }, [scrollToCell]);

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
    <div className={`cf-weekly-layout cf-has-drawer${sidebarOpen ? ' cf-drawer-open' : ''}`}>
      <div className="cf-weekly-main">
        <WeeklyCharts
          weeklyData={safeWeeklyData}
          theme={theme}
          visibleWeekKeys={visibleWeekKeys}
        />

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
            {(edgeState.left || edgeState.right) && (
              <span className="cf-overflow-hint" aria-live="polite">
                {edgeState.left && edgeState.right
                  ? '← → Scroll to see more weeks'
                  : edgeState.right
                    ? '→ Scroll to see more weeks'
                    : '← More weeks to the left'}
              </span>
            )}
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
            <button
              className="cf-btn cf-btn-ghost"
              onClick={() => setSidebarOpen(o => !o)}
              title={sidebarOpen ? 'Hide notes & cash-in panel' : 'Show notes & cash-in panel'}
              aria-label={sidebarOpen ? 'Hide notes panel' : 'Show notes panel'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {sidebarOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <span>{sidebarOpen ? 'Hide Notes' : 'Notes'}</span>
            </button>
          </div>
        </div>

        {/* Weekly grid */}
        <div
          className={`cf-grid-wrap${edgeState.left ? ' cf-edge-left' : ''}${edgeState.right ? ' cf-edge-right' : ''}`}
          style={{ borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}
        >
          <div className="cf-grid-inner" style={{ minWidth: tableMinWidth, width: tableMinWidth }}>
            <table
              className="cf-grid"
              key={`weeks-${cols.length}-${visibleWeekKeys[0] ?? 'none'}-${visibleWeekKeys[visibleWeekKeys.length - 1] ?? 'none'}`}
            >
              <colgroup>
                <col style={{ width: LINE_ITEM_COL_WIDTH, minWidth: LINE_ITEM_COL_WIDTH }} />
                {visibleWeekKeys.map((weekKey) => (
                  <col key={weekKey} style={{ width: WEEK_COL_MIN_WIDTH, minWidth: WEEK_COL_MIN_WIDTH }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="cf-label-col">Line Item</th>
                  {cols.map(([key, entry]) => (
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
                  const showTotals = rowDef.section === 'receipts' || rowDef.section === 'disbursements';
                  const totalKey = rowDef.section === 'receipts' ? 'TOTAL RECEIPTS' : 'TOTAL DISBURSEMENTS';
                  return (
                    <tr
                      key={rowDef.key}
                      className={`cf-section-header ${getSectionClass(rowDef.section)}`}
                      style={isCollapsible ? { cursor: 'pointer' } : undefined}
                      onClick={isCollapsible ? () => toggleSection(rowDef.section) : undefined}
                    >
                      {showTotals ? (
                        <>
                          <td className="cf-label-col" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {isCollapsible && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
                            {rowDef.label}
                          </td>
                          {visibleWeeks.map(([weekKey, entry]) => {
                            const raw = Number(entry?.[totalKey]) || 0;
                            const display = rowDef.section === 'disbursements' && raw > 0 ? -raw : raw;
                            const lineItemKey = totalKey; // 'TOTAL RECEIPTS' | 'TOTAL DISBURSEMENTS'
                            const ccKey = cellCommentKey(lineItemKey, weekKey);
                            const cellCommentsHere = cellCommentsByCell[ccKey] || [];
                            const cellCtx: CellCtx = {
                              line_item_key: lineItemKey,
                              line_item_label: rowDef.label || lineItemKey,
                              week_key: weekKey,
                              week_num: (entry?.week_num as number) ?? null,
                              week_ending: (entry?.week_ending as string) ?? null,
                              cell_value_snapshot: display,
                            };
                            return (
                              <td
                                key={weekKey}
                                ref={(el) => registerCellRef(ccKey, el)}
                                style={{ fontWeight: 700 }}
                                onContextMenu={(e) => {
                                  e.stopPropagation();
                                  handleCellContextMenu(e, cellCtx);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title={cellCommentsHere.length > 0 ? `${cellCommentsHere.length} comment${cellCommentsHere.length > 1 ? 's' : ''}` : undefined}
                                className={cellCommentsHere.length > 0 ? 'cf-cell-has-comment' : undefined}
                              >
                                {fmtAbbrev(display)}
                                {cellCommentsHere.length > 0 && (
                                  <span className={`cf-cell-comment-indicator${cellCommentsHere.length > 1 ? ' has-multiple' : ''}`} aria-hidden />
                                )}
                              </td>
                            );
                          })}
                        </>
                      ) : (
                        <td className="cf-label-col" colSpan={visibleWeeks.length + 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isCollapsible && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
                          {rowDef.label}
                        </td>
                      )}
                    </tr>
                  );
                }

                // Spacer row (truly empty, normal row height, no borders implying data)
                if ((rowDef as WeeklyRow).isSpacer) {
                  return (
                    <tr key={rowDef.key} aria-hidden="true">
                      <td
                        colSpan={visibleWeeks.length + 1}
                        style={{
                          height: '1.75rem',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                        }}
                      />
                    </tr>
                  );
                }

                // NET CHANGE row — computed per week as TOTAL RECEIPTS - TOTAL DISBURSEMENTS
                if ((rowDef as WeeklyRow).isNetChange) {
                  return (
                    <tr key={rowDef.key} className="cf-total-row">
                      <td className="cf-label-col">{rowDef.key}</td>
                      {visibleWeeks.map(([weekKey, entry]) => {
                        const receipts = Number(entry?.['TOTAL RECEIPTS']) || 0;
                        const disb = Number(entry?.['TOTAL DISBURSEMENTS']) || 0;
                        const net = receipts - disb;
                        const planEntry = activePlan?.weeklyData?.[weekKey];
                        const planVal = planEntry
                          ? (Number(planEntry?.['TOTAL RECEIPTS']) || 0) - (Number(planEntry?.['TOTAL DISBURSEMENTS']) || 0)
                          : null;
                        const ccKey = cellCommentKey('NET CHANGE', weekKey);
                        const cellCommentsHere = cellCommentsByCell[ccKey] || [];
                        const cellCtx: CellCtx = {
                          line_item_key: 'NET CHANGE',
                          line_item_label: 'NET CHANGE',
                          week_key: weekKey,
                          week_num: (entry?.week_num as number) ?? null,
                          week_ending: (entry?.week_ending as string) ?? null,
                          cell_value_snapshot: net,
                        };
                        return (
                          <td
                            key={weekKey}
                            ref={(el) => registerCellRef(ccKey, el)}
                            className={`${net > 0 ? 'cf-val-pos' : net < 0 ? 'cf-val-neg' : ''}${cellCommentsHere.length > 0 ? ' cf-cell-has-comment' : ''}`}
                            style={{ fontWeight: 700, cursor: 'pointer' }}
                            onContextMenu={(e) => handleCellContextMenu(e, cellCtx)}
                            onClick={() => openDrilldown('NET CHANGE', 'Net Change', weekKey, (entry?.week_ending as string) ?? null, net)}
                            title={cellCommentsHere.length > 0 ? `${cellCommentsHere.length} comment${cellCommentsHere.length > 1 ? 's' : ''} • Click to view source entries` : 'Click to view source entries'}
                          >
                            <div>{fmtAbbrev(net)}</div>
                            {cellCommentsHere.length > 0 && (
                              <span className={`cf-cell-comment-indicator${cellCommentsHere.length > 1 ? ' has-multiple' : ''}`} aria-hidden />
                            )}
                            {planVal !== null && renderVariance(net, planVal)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                const isTotal = rowDef.isTotal;
                const isParent = rowDef.isParent === true;
                const isChild = !!rowDef.parent;
                const isTransferAccount = (rowDef as WeeklyRow).isTransferAccount === true;
                const isTransfersParent = isParent && rowDef.key === INTERNAL_TRANSFERS_PARENT_KEY;
                const isDebtAdvParent = isParent && rowDef.key === DEBT_ADV_PARENT_KEY;
                // Hide detail rows when section is collapsed (but keep totals visible).
                // Skip this hide-rule for transfer rows — the transfers section uses its own
                // parent-level collapse (transfersCollapsed) rather than the section header.
                if (!isTotal && !isParent && !isTransferAccount && collapsedSections[rowDef.section]) {
                  return null;
                }
                // Hide Debt Advisory sub-rows when its parent is collapsed
                if (isChild && rowDef.parent === DEBT_ADV_PARENT_KEY && debtAdvCollapsed) {
                  return null;
                }
                // Hide Internal Transfers account sub-rows when its parent is collapsed
                if (isTransferAccount && transfersCollapsed) {
                  return null;
                }
                const parentCollapsed = isDebtAdvParent ? debtAdvCollapsed : isTransfersParent ? transfersCollapsed : false;
                const parentToggle = isDebtAdvParent ? toggleDebtAdv : isTransfersParent ? toggleTransfers : undefined;
                const isCashRow = rowDef.key === 'BEGINNING CASH' || rowDef.key === 'ENDING CASH';
                const overrideField: 'beginningCash' | 'endingCash' | null = isCashRow
                  ? (rowDef.key === 'BEGINNING CASH' ? 'beginningCash' : 'endingCash')
                  : null;
                const labelText = isTransferAccount
                  ? (rowDef as WeeklyRow).transferAccount || rowDef.key
                  : rowDef.key;
                return (
                  <tr
                    key={rowDef.key}
                    className={`${isTotal ? 'cf-total-row' : 'cf-indent'}${(isChild || isTransferAccount) ? ' cf-subcategory-row' : ''}${isParent ? ' cf-parent-row' : ''}`}
                    style={isParent ? { cursor: 'pointer' } : undefined}
                    onClick={isParent ? parentToggle : undefined}
                  >
                    <td
                      className="cf-label-col"
                      style={
                        (isChild || isTransferAccount)
                          ? { paddingLeft: 32, color: 'hsl(var(--muted-foreground))', fontSize: '0.8125rem' }
                          : isParent
                            ? { display: 'flex', alignItems: 'center', gap: 4 }
                            : undefined
                      }
                    >
                      {isParent && (parentCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
                      {labelText}
                    </td>
                    {visibleWeeks.map(([weekKey, entry]) => {
                      const transferAcc = (rowDef as WeeklyRow).transferAccount;
                      const rawVal = isTransferAccount && transferAcc
                        ? transferAccountValue(entry, transferAcc)
                        : isTransfersParent
                          ? (Number((entry as any)?.['Internal Transfers']) || 0)
                          : isDebtAdvParent
                            ? parentSumForWeek(entry)
                            : ((entry[rowDef.key] as number) || 0);
                      const val = rawVal;
                      const displayVal = rowDef.section === 'disbursements' && !isTotal && val > 0 ? -val : val;
                      const planEntry = activePlan?.weeklyData?.[weekKey];
                      const planVal = planEntry
                        ? (isTransferAccount && transferAcc
                            ? transferAccountValue(planEntry, transferAcc)
                            : isTransfersParent
                              ? (Number((planEntry as any)?.['Internal Transfers']) || 0)
                              : isDebtAdvParent
                                ? parentSumForWeek(planEntry)
                                : ((planEntry[rowDef.key] as number) || 0))
                        : null;
                      const isOverridden = !!(isCashRow && overrideField && safeOverrides[weekKey]?.[overrideField] !== undefined);
                      const editable = isAdmin && isCashRow && !!onCashOverride;

                      // Cell comment plumbing
                      const lineItemKey = isTransferAccount && transferAcc
                        ? `transfer:${transferAcc}`
                        : rowDef.key;
                      const ccKey = cellCommentKey(lineItemKey, weekKey);
                      const cellCommentsHere = cellCommentsByCell[ccKey] || [];
                      const cellCtx: CellCtx = {
                        line_item_key: lineItemKey,
                        line_item_label: labelText,
                        week_key: weekKey,
                        week_num: (entry?.week_num as number) ?? null,
                        week_ending: (entry?.week_ending as string) ?? null,
                        cell_value_snapshot: displayVal,
                      };

                      return (
                        <td
                          key={weekKey}
                          ref={(el) => registerCellRef(ccKey, el)}
                          className={`${displayVal > 0 ? 'cf-val-pos' : displayVal < 0 ? 'cf-val-neg' : ''}${isOverridden ? ' cf-cell-override' : ''}${cellCommentsHere.length > 0 ? ' cf-cell-has-comment' : ''}`}
                          title={isOverridden ? 'Manually overridden — double-click to clear' : (editable ? 'Click to edit' : 'Click to view source entries')}
                          style={!editable ? { cursor: 'pointer' } : undefined}
                          onContextMenu={(e) => handleCellContextMenu(e, cellCtx)}
                          onClick={!editable ? () => openDrilldown(rowDef.key, labelText, weekKey, (entry?.week_ending as string) ?? null, displayVal) : undefined}
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
                          {cellCommentsHere.length > 0 && (
                            <span
                              className={`cf-cell-comment-indicator${cellCommentsHere.length > 1 ? ' has-multiple' : ''}`}
                              aria-hidden
                            />
                          )}
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
        cellComments={cellComments}
        currentUserId={user?.id ?? null}
        onCellCommentClick={handleSidebarCommentClick}
        onCellCommentDelete={(c) => deleteCellComment(c.id)}
      />

      {menuState && (
        <CellCommentMenu
          x={menuState.x}
          y={menuState.y}
          hasComments={(cellCommentsByCell[cellCommentKey(menuState.ctx.line_item_key, menuState.ctx.week_key)] || []).length > 0}
          onAdd={handleMenuAdd}
          onView={handleMenuView}
          onClose={() => setMenuState(null)}
        />
      )}

      {popoverState && (
        <CellCommentPopover
          anchor={{ x: popoverState.x, y: popoverState.y }}
          mode={popoverState.mode}
          comments={cellCommentsByCell[cellCommentKey(popoverState.ctx.line_item_key, popoverState.ctx.week_key)] || []}
          onSubmit={handleSubmitComment}
          onDelete={async (id) => { await deleteCellComment(id); }}
          onClose={() => setPopoverState(null)}
        />
      )}

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

      <CashFlowDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        context={drilldown}
        items={scheduledItems || []}
      />
    </div>
  );
});
