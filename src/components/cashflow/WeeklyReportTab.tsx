import { useState, useEffect, memo, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, X, Plus, Pencil } from 'lucide-react';
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
  /**
   * Add a one-time scheduled cash flow entry for a specific row + week.
   * Used by inline cell "+ Add" popover so users can quickly add ad-hoc
   * receipts/disbursements that flow into both the weekly grid and the
   * Configure modal as one-time entries.
   */
  onAddOneTimeEntry?: (args: {
    rowKey: string;
    rowLabel: string;
    weekKey: string;
    weekEnding: string | null;
    flowType: 'cash_in' | 'cash_out';
    amount: number;
    description: string;
  }) => Promise<boolean> | boolean;
  /** User-defined custom row labels appended to Cash Receipts. */
  customReceiptRows?: string[];
  /** User-defined custom row labels appended to Cash Disbursements. */
  customDisbursementRows?: string[];
  /** Persist a new custom row label. Return false to indicate rejection (e.g. duplicate). */
  onAddCustomRow?: (section: 'receipts' | 'disbursements', name: string) => boolean;
  /** Remove a previously added custom row. */
  onRemoveCustomRow?: (section: 'receipts' | 'disbursements', name: string) => void;
  /** Patch fields on an existing scheduled entry (used by drilldown row Edit). */
  onUpdateScheduledEntry?: (id: string, patch: Partial<ScheduledCashFlow>) => Promise<boolean> | boolean;
  /** Delete a scheduled entry by id (used by drilldown row Delete). */
  onDeleteScheduledEntry?: (id: string) => Promise<boolean> | boolean;
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
  isCustom?: boolean;
  isAddRowFooter?: boolean;
};

const WEEKLY_ROW_ORDER: Array<WeeklyRow> = [
  { key: 'BEGINNING CASH', section: 'position', isTotal: true },
  { key: 'ENDING CASH', section: 'position', isTotal: true },
  { key: 'NET CHANGE', section: 'position', isTotal: true, isNetChange: true },
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
  onAddOneTimeEntry,
  customReceiptRows,
  customDisbursementRows,
  onAddCustomRow,
  onRemoveCustomRow,
  onUpdateScheduledEntry,
  onDeleteScheduledEntry,
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

  // ===== Floating sticky horizontal scrollbar =====
  // Mirrors the grid's horizontal scroll. Pinned to the bottom of the viewport
  // while the table is in view AND its content is wider than the viewport, so
  // users can scroll left/right at any vertical position without reaching the
  // page footer.
  const stickyScrollRef = useRef<HTMLDivElement | null>(null);
  const [stickyScroll, setStickyScroll] = useState<{
    visible: boolean;
    contentWidth: number;
    viewportWidth: number;
    left: number;
  }>({ visible: false, contentWidth: 0, viewportWidth: 0, left: 0 });
  // Re-entrancy guard so the two scroll handlers don't ping-pong.
  const syncingRef = useRef<'grid' | 'sticky' | null>(null);

  useEffect(() => {
    const grid = gridWrapRef.current?.querySelector<HTMLDivElement>('.cf-grid-wrap');
    if (!grid) return;

    const measure = () => {
      const contentWidth = grid.scrollWidth;
      const viewportWidth = grid.clientWidth;
      const overflows = contentWidth > viewportWidth + 1;
      // Only show when the grid is at least partially in the viewport AND
      // its bottom edge is below the viewport bottom (otherwise the native
      // bar is already visible right at the table's edge).
      const rect = grid.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      const nativeBarBelowFold = rect.bottom > window.innerHeight;
      setStickyScroll((prev) => {
        const next = {
          visible: overflows && inViewport && nativeBarBelowFold,
          contentWidth,
          viewportWidth,
          left: Math.max(0, rect.left),
        };
        if (
          prev.visible === next.visible &&
          prev.contentWidth === next.contentWidth &&
          prev.viewportWidth === next.viewportWidth &&
          prev.left === next.left
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    const onGridScroll = () => {
      if (syncingRef.current === 'sticky') {
        syncingRef.current = null;
        return;
      }
      const sticky = stickyScrollRef.current;
      if (!sticky) return;
      if (sticky.scrollLeft !== grid.scrollLeft) {
        syncingRef.current = 'grid';
        sticky.scrollLeft = grid.scrollLeft;
      }
    };
    grid.addEventListener('scroll', onGridScroll, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      grid.removeEventListener('scroll', onGridScroll);
    };
  }, [gridWrapRef, tableMinWidth]);

  const handleStickyScroll = useCallback(() => {
    if (syncingRef.current === 'grid') {
      syncingRef.current = null;
      return;
    }
    const sticky = stickyScrollRef.current;
    const grid = gridWrapRef.current?.querySelector<HTMLDivElement>('.cf-grid-wrap');
    if (!sticky || !grid) return;
    if (grid.scrollLeft !== sticky.scrollLeft) {
      syncingRef.current = 'sticky';
      grid.scrollLeft = sticky.scrollLeft;
    }
  }, [gridWrapRef]);

  // Inline "+ Add" popover state for receipts/disbursements cells.
  const [addCellPopover, setAddCellPopover] = useState<null | {
    rowKey: string;
    rowLabel: string;
    section: 'receipts' | 'disbursements';
    weekKey: string;
    weekEnding: string | null;
  }>(null);
  const [addCellDraft, setAddCellDraft] = useState<{
    description: string;
    amount: string;
    flowType: 'cash_in' | 'cash_out';
  }>({ description: '', amount: '', flowType: 'cash_in' });
  const [addCellSaving, setAddCellSaving] = useState(false);

  // "+ Add Row" prompt state for custom Cash Receipts / Disbursements rows.
  const [addRowPrompt, setAddRowPrompt] = useState<null | { section: 'receipts' | 'disbursements' }>(null);
  const [addRowName, setAddRowName] = useState('');
  const closeAddRowPrompt = useCallback(() => {
    setAddRowPrompt(null);
    setAddRowName('');
  }, []);
  const submitAddRow = useCallback(() => {
    if (!addRowPrompt || !onAddCustomRow) return;
    const ok = onAddCustomRow(addRowPrompt.section, addRowName);
    if (ok) closeAddRowPrompt();
  }, [addRowPrompt, addRowName, onAddCustomRow, closeAddRowPrompt]);

  // Build the effective row order: inject custom rows + an "+ Add Row" footer
  // into the receipts / disbursements sections. Custom row keys double as the
  // category label for scheduled entries — `resolveCategoryToGridRow` falls
  // through unknown keys as-is so values flow into the matching row.
  const effectiveRowOrder = useMemo<WeeklyRow[]>(() => {
    const out: WeeklyRow[] = [];
    const extraReceipts = customReceiptRows ?? [];
    const extraDisb = customDisbursementRows ?? [];
    for (const row of WEEKLY_ROW_ORDER) {
      out.push(row);
      // Insert custom receipts + footer right after the last canonical receipts
      // line item ('Other Receipts').
      if (row.key === 'Other Receipts') {
        for (const name of extraReceipts) {
          out.push({ key: name, section: 'receipts', isCustom: true });
        }
        if (onAddCustomRow) {
          out.push({ key: '__add_row_receipts', section: 'receipts', isAddRowFooter: true });
        }
      }
      if (row.key === 'Other Disbursements') {
        for (const name of extraDisb) {
          out.push({ key: name, section: 'disbursements', isCustom: true });
        }
        if (onAddCustomRow) {
          out.push({ key: '__add_row_disbursements', section: 'disbursements', isAddRowFooter: true });
        }
      }
    }
    return out;
  }, [customReceiptRows, customDisbursementRows, onAddCustomRow]);
  const closeAddCellPopover = useCallback(() => {
    setAddCellPopover(null);
    setAddCellDraft({ description: '', amount: '', flowType: 'cash_in' });
    setAddCellSaving(false);
  }, []);
  const submitAddCell = useCallback(async () => {
    if (!addCellPopover || !onAddOneTimeEntry) return;
    const amt = Number(addCellDraft.amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setAddCellSaving(true);
    const ok = await onAddOneTimeEntry({
      rowKey: addCellPopover.rowKey,
      rowLabel: addCellPopover.rowLabel,
      weekKey: addCellPopover.weekKey,
      weekEnding: addCellPopover.weekEnding,
      flowType: addCellDraft.flowType,
      amount: amt,
      description: addCellDraft.description.trim(),
    });
    if (ok) closeAddCellPopover();
    else setAddCellSaving(false);
  }, [addCellPopover, addCellDraft, onAddOneTimeEntry, closeAddCellPopover]);

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
  }, [handleGridScroll, visibleWeeks.length]);

  // Bubble cell-comment count up so the inline Notes badge can reflect it
  const topLevelCellCommentCount = useMemo(
    () => cellComments.filter(c => !c.parent_comment_id).length,
    [cellComments],
  );
  useEffect(() => {
    onCellCommentCountChange?.(topLevelCellCommentCount);
  }, [topLevelCellCommentCount, onCellCommentCountChange]);

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
    <div className="cf-weekly-layout">
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
              {effectiveRowOrder.map((rowDef) => {
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

                // "+ Add Row" footer for Cash Receipts / Disbursements sections.
                // Honor the same section-collapsed rule as detail rows.
                if ((rowDef as WeeklyRow).isAddRowFooter) {
                  if (collapsedSections[rowDef.section]) return null;
                  const section = rowDef.section as 'receipts' | 'disbursements';
                  return (
                    <tr key={rowDef.key} className="cf-add-row-footer">
                      <td className="cf-label-col" style={{ paddingLeft: 16 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAddRowName('');
                            setAddRowPrompt({ section });
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                          title={`Add a custom ${section === 'receipts' ? 'Cash Receipts' : 'Cash Disbursements'} row`}
                        >
                          <Plus size={12} strokeWidth={2.5} />
                          Add Row
                        </button>
                      </td>
                      <td colSpan={visibleWeeks.length} />
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
                      // Beginning/Ending Cash cells are editable for any user — typing
                      // a value writes a per-week override that persists until cleared.
                      const editable = isCashRow && !!onCashOverride;

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
                      // Allow inline "+ Add" only on actual receipt/disbursement
                      // line rows — not parents, totals, transfers, or headers.
                      const isAddable =
                        !!onAddOneTimeEntry &&
                        (rowDef.section === 'receipts' || rowDef.section === 'disbursements') &&
                        !rowDef.isParent &&
                        !rowDef.isHeader &&
                        !rowDef.isTotal &&
                        !isTransferAccount;

                      return (
                        <td
                          key={weekKey}
                          ref={(el) => registerCellRef(ccKey, el)}
                          className={`group relative ${displayVal > 0 ? 'cf-val-pos' : displayVal < 0 ? 'cf-val-neg' : ''}${isOverridden ? ' cf-cell-override' : ''}${cellCommentsHere.length > 0 ? ' cf-cell-has-comment' : ''}`}
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
                          {isOverridden && (
                            <span
                              className="cf-override-badge"
                              aria-label="Manually overridden"
                              title="Manually overridden — double-click to clear"
                            >
                              <Pencil size={9} strokeWidth={2.5} />
                            </span>
                          )}
                          {cellCommentsHere.length > 0 && (
                            <span
                              className={`cf-cell-comment-indicator${cellCommentsHere.length > 1 ? ' has-multiple' : ''}`}
                              aria-hidden
                            />
                          )}
                          {planVal !== null && renderVariance(val, planVal)}
                          {isAddable && (
                            <button
                              type="button"
                              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-md bg-primary/10 hover:bg-primary/25 text-primary border border-primary/30 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
                              title="Add one-time entry for this week"
                              aria-label="Add one-time entry for this week"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddCellPopover({
                                  rowKey: rowDef.key,
                                  rowLabel: labelText,
                                  section: rowDef.section as 'receipts' | 'disbursements',
                                  weekKey,
                                  weekEnding: (entry?.week_ending as string) ?? null,
                                });
                                setAddCellDraft({
                                  description: '',
                                  amount: '',
                                  flowType: rowDef.section === 'receipts' ? 'cash_in' : 'cash_out',
                                });
                              }}
                            >
                              <Plus size={11} strokeWidth={2.5} />
                            </button>
                          )}
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

      {/* Cash-In: Next 8 Weeks dialog (triggered from filter bar) */}
      <Dialog open={!!cashInDialogOpen} onOpenChange={(o) => onCashInDialogOpenChange?.(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cash-In: Next 8 Weeks</DialogTitle>
          </DialogHeader>
          <CashInPanel
            data={safeSidebarData}
            dbItems={safeSidebarDbItems}
            isAdmin={isAdmin}
            onEditItem={onSidebarEditItem}
            onRemoveItem={onSidebarRemoveItem}
            onAddItem={onSidebarAddItem}
            onRemoveDbItem={onSidebarRemoveDbItem}
          />
        </DialogContent>
      </Dialog>

      {/* Notes & Cell Comments dialog (triggered from filter bar) */}
      <Dialog open={!!notesDialogOpen} onOpenChange={(o) => onNotesDialogOpenChange?.(o)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notes & Key Items</DialogTitle>
          </DialogHeader>
          <NotesPanel
            data={safeSidebarData}
            isAdmin={isAdmin}
            onNoteEdit={onNoteEdit}
            onNoteRemove={onNoteRemove}
            onNoteAdd={onNoteAdd}
            cellComments={cellComments}
            currentUserId={user?.id ?? null}
            onCellCommentClick={(c) => {
              onNotesDialogOpenChange?.(false);
              handleSidebarCommentClick(c);
            }}
            onCellCommentDelete={(c) => deleteCellComment(c.id)}
          />
        </DialogContent>
      </Dialog>

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

      {/* Inline Add One-Time Entry popover (cell click on receipts/disbursements) */}
      {addCellPopover && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={closeAddCellPopover}
        >
          <div
            className="w-[360px] rounded-xl border border-border bg-card shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Add Entry</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {addCellPopover.rowLabel} · Week of {addCellPopover.weekKey}
                </div>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={closeAddCellPopover}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. ACME retainer payment"
                  value={addCellDraft.description}
                  autoFocus
                  onChange={(e) =>
                    setAddCellDraft((d) => ({ ...d, description: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full h-9 rounded-md border border-border bg-background pl-6 pr-2 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="0.00"
                    value={addCellDraft.amount}
                    onChange={(e) =>
                      setAddCellDraft((d) => ({ ...d, amount: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitAddCell();
                      if (e.key === 'Escape') closeAddCellPopover();
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAddCellDraft((d) => ({ ...d, flowType: 'cash_in' }))
                    }
                    className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                      addCellDraft.flowType === 'cash_in'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
                    }`}
                  >
                    + Cash-In
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAddCellDraft((d) => ({ ...d, flowType: 'cash_out' }))
                    }
                    className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                      addCellDraft.flowType === 'cash_out'
                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
                    }`}
                  >
                    − Cash-Out
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:bg-muted/40"
                onClick={closeAddCellPopover}
                disabled={addCellSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={submitAddCell}
                disabled={
                  addCellSaving ||
                  !(Number(addCellDraft.amount) > 0)
                }
              >
                {addCellSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "+ Add Row" prompt for custom Cash Receipts / Disbursements rows */}
      {addRowPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={closeAddRowPrompt}
        >
          <div
            className="w-[360px] rounded-xl border border-border bg-card shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Add Custom Row</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {addRowPrompt.section === 'receipts' ? 'Cash Receipts' : 'Cash Disbursements'} · appears in Configure modal
                </div>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={closeAddRowPrompt}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                Row Name
              </label>
              <input
                type="text"
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g. Equipment Sales"
                value={addRowName}
                autoFocus
                onChange={(e) => setAddRowName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAddRow();
                  if (e.key === 'Escape') closeAddRowPrompt();
                }}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:bg-muted/40"
                onClick={closeAddRowPrompt}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={submitAddRow}
                disabled={!addRowName.trim()}
              >
                Add Row
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating sticky horizontal scrollbar — pinned to viewport bottom while
          the grid is in view and overflows horizontally. Mirrors grid scroll. */}
      {stickyScroll.visible && (
        <div
          ref={stickyScrollRef}
          onScroll={handleStickyScroll}
          className="fixed z-40 overflow-x-auto overflow-y-hidden bg-background/85 backdrop-blur border-t border-border"
          style={{
            bottom: 0,
            left: stickyScroll.left,
            width: stickyScroll.viewportWidth,
            height: 14,
          }}
          aria-hidden="true"
        >
          <div style={{ width: stickyScroll.contentWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
});
