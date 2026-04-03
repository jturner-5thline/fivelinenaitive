import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type {
  DailyData, WeeklyData, SidebarData, RecurringTag,
  PlanSnapshot, UndoSnapshot, ActivityLogEntry, ExportArchiveEntry,
  ExportFlag, RoleMode, ActiveTab, ThemeMode,
} from './types';
import {
  SEED_DAILY_DATA, SEED_SIDEBAR_DATA, SEED_ROW_STRUCTURE,
} from './seedData';
import { aggregateDailyToWeekly } from './dailyToWeekly';
import { CashFlowHeader } from './CashFlowHeader';
import { DailySourceTab } from './DailySourceTab';
import { WeeklyReportTab } from './WeeklyReportTab';
import { ExportModal } from './ExportModal';
import { ActivityLogDialog } from './ActivityLogDialog';
import { AddCashInModal } from './AddCashInModal';
import { useCashFlowImport } from './useCashFlowImport';
import { useCashInItems } from './useCashInItems';
import { useCompany } from '@/hooks/useCompany';
import { Skeleton } from '@/components/ui/skeleton';
import './cashflow.css';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const QUARTER_RANGES: Record<string, [number, number]> = {
  Q1: [0, 2],
  Q2: [3, 5],
  Q3: [6, 8],
  Q4: [9, 11],
};

function getAvailableYears(dates: string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    const y = parseInt(d.slice(0, 4));
    if (y >= 2025) years.add(y);
  }
  return Array.from(years).sort();
}

function filterDailyByPeriod(data: DailyData, years: string[], quarters: string[]): DailyData {
  if (years.length === 0 && quarters.length === 0) return data;
  const yearNums = years.map(Number);
  const indices: number[] = [];

  for (let i = 0; i < data.dates.length; i++) {
    const d = data.dates[i];
    const y = parseInt(d.slice(0, 4));
    const m = parseInt(d.slice(5, 7)) - 1;

    const yearMatch = yearNums.length === 0 || yearNums.includes(y);
    if (!yearMatch) continue;

    if (quarters.length > 0) {
      const inQuarter = quarters.some(q => {
        const [qStart, qEnd] = QUARTER_RANGES[q];
        return m >= qStart && m <= qEnd;
      });
      if (!inQuarter) continue;
    }

    indices.push(i);
  }

  if (indices.length === data.dates.length) return data;

  const filteredDates = indices.map(i => data.dates[i]);
  const filteredRows: Record<string, { label: string; entity: string; values: number[] }> = {};
  for (const [key, row] of Object.entries(data.rows)) {
    filteredRows[key] = {
      label: row.label,
      entity: row.entity,
      values: indices.map(i => row.values[i] ?? 0),
    };
  }

  return { dates: filteredDates, rows: filteredRows };
}

function filterWeeklyByPeriod(data: WeeklyData, years: string[], quarters: string[]): WeeklyData {
  if (years.length === 0 && quarters.length === 0) return data;
  const yearNums = years.map(Number);
  const filtered: WeeklyData = {};

  for (const [key, entry] of Object.entries(data)) {
    const y = parseInt(key.slice(0, 4));
    const m = parseInt(key.slice(5, 7)) - 1;

    const yearMatch = yearNums.length === 0 || yearNums.includes(y);
    if (!yearMatch) continue;

    if (quarters.length > 0) {
      const inQuarter = quarters.some(q => {
        const [qStart, qEnd] = QUARTER_RANGES[q];
        return m >= qStart && m <= qEnd;
      });
      if (!inQuarter) continue;
    }

    filtered[key] = entry;
  }

  return filtered;
}

function CashFlowSkeleton() {
  return (
    <div className="cf-root" style={{ padding: 16 }}>
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}

export function CashFlowManager() {
  const { company } = useCompany();
  const { importedDailyData, importedRowStructure, isImported, isImportLoading, importFile } = useCashFlowImport(company?.id);
  const { items: cashInDbItems, fetchItems: refreshCashInItems, removeItem: removeCashInDbItem, toSidebarItems } = useCashInItems();
  const [addCashInOpen, setAddCashInOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sidebarDbItems = useMemo(() => toSidebarItems(), [toSidebarItems]);

  // Master data — weekly is always derived from daily
  const [dailyData, setDailyData] = useState<DailyData>(() => deepClone(SEED_DAILY_DATA));
  const [sidebarData, setSidebarData] = useState<SidebarData>(() => deepClone(SEED_SIDEBAR_DATA));

  // Inject cash-in DB items + manual sidebar items into dailyData's "Customer Payments" row
  const enhancedDailyData = useMemo(() => {
    const allCashInItems = [
      ...cashInDbItems.map(i => ({ date: i.target_date, amount: i.amount })),
      ...sidebarData.cash_in_next_8_weeks.map(i => ({ date: i.date, amount: i.amount })),
    ];
    if (allCashInItems.length === 0) return dailyData;

    // Find the Customer Payments row key
    const custPayKey = Object.entries(dailyData.rows).find(
      ([, row]) => /Customer\s*Payment/i.test(row.label)
    )?.[0];
    if (!custPayKey) return dailyData;

    // Build a date→amount map from cash-in items
    const dateAmountMap: Record<string, number> = {};
    for (const item of allCashInItems) {
      if (!item.date || !item.amount) continue;
      // Normalize to YYYY-MM-DD
      const dateKey = item.date.slice(0, 10);
      dateAmountMap[dateKey] = (dateAmountMap[dateKey] || 0) + item.amount;
    }

    // Build date→index lookup
    const dateIndexMap: Record<string, number> = {};
    for (let i = 0; i < dailyData.dates.length; i++) {
      dateIndexMap[dailyData.dates[i]] = i;
    }

    // Check if any cash-in dates match dailyData dates
    let hasMatch = false;
    for (const d of Object.keys(dateAmountMap)) {
      if (dateIndexMap[d] !== undefined) { hasMatch = true; break; }
    }
    if (!hasMatch) return dailyData;

    // Clone only the affected row's values
    const newValues = [...dailyData.rows[custPayKey].values];
    for (const [date, amount] of Object.entries(dateAmountMap)) {
      const idx = dateIndexMap[date];
      if (idx !== undefined) {
        newValues[idx] = (newValues[idx] || 0) + amount;
      }
    }

    return {
      ...dailyData,
      rows: {
        ...dailyData.rows,
        [custPayKey]: { ...dailyData.rows[custPayKey], values: newValues },
      },
    };
  }, [dailyData, cashInDbItems, sidebarData.cash_in_next_8_weeks]);

  // Weekly data derived from enhanced daily (includes cash-in items)
  const weeklyData = useMemo(() => aggregateDailyToWeekly(enhancedDailyData), [enhancedDailyData]);

  useEffect(() => {
    if (isImported && importedDailyData) {
      const data = deepClone(importedDailyData);
      const dateCount = data.dates.length;
      // Inject M&T Bank Balance rows if not present in imported data
      const hasMtBegin = Object.values(data.rows).some(r => /M&T\s*Bank\s*Balance/i.test(r.label) && Object.entries(data.rows).some(([k]) => {
        const struct = importedRowStructure?.rows.find(s => `row_${s.row_num}` === k);
        return struct?.section === 'balance_begin';
      }));
      if (!hasMtBegin) {
        data.rows['row_mt_begin'] = { label: 'M&T Bank Balance', entity: 'ALL', values: new Array(dateCount).fill(46000) };
      }
      const hasMtEnd = Object.values(data.rows).some(r => /M&T\s*Bank\s*Balance/i.test(r.label));
      if (!hasMtEnd || !hasMtBegin) {
        if (!data.rows['row_mt_end']) {
          data.rows['row_mt_end'] = { label: 'M&T Bank Balance', entity: 'ALL', values: new Array(dateCount).fill(46000) };
        }
      }
      setDailyData(data);
    }
  }, [isImported, importedDailyData]);

  // Sandbox data (viewer mode)
  const [sandboxDaily, setSandboxDaily] = useState<DailyData | null>(null);
  const [sandboxSidebar, setSandboxSidebar] = useState<SidebarData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('weekly');
  const [role, setRole] = useState<RoleMode>('admin');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [recurringTags, setRecurringTags] = useState<RecurringTag[]>([]);

  // Date filter with debounce
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterQuarters, setFilterQuarters] = useState<string[]>([]);
  const [debouncedYears, setDebouncedYears] = useState<string[]>([]);
  const [debouncedQuarters, setDebouncedQuarters] = useState<string[]>([]);

  // Debounce filters by 200ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedYears(filterYears);
      setDebouncedQuarters(filterQuarters);
    }, 200);
    return () => clearTimeout(t);
  }, [filterYears, filterQuarters]);

  // Undo
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  // Activity log
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);

  // Plans
  const [planSnapshots, setPlanSnapshots] = useState<PlanSnapshot[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  // Export
  const [exportOpen, setExportOpen] = useState(false);
  const [archiveEntries, setArchiveEntries] = useState<ExportArchiveEntry[]>([]);

  // Data accessors — stable references
  const rawDaily = useMemo(() => role === 'viewer' && sandboxDaily ? sandboxDaily : dailyData, [role, sandboxDaily, dailyData]);
  const rawWeekly = useMemo(() => aggregateDailyToWeekly(rawDaily), [rawDaily]);
  const rawSidebar = useMemo(() => role === 'viewer' && sandboxSidebar ? sandboxSidebar : sidebarData, [role, sandboxSidebar, sidebarData]);

  const availableYears = useMemo(() => getAvailableYears(rawDaily.dates), [rawDaily.dates]);

  // Filtered data using debounced values
  const filteredDaily = useMemo(() => filterDailyByPeriod(rawDaily, debouncedYears, debouncedQuarters), [rawDaily, debouncedYears, debouncedQuarters]);
  const filteredWeekly = useMemo(() => filterWeeklyByPeriod(rawWeekly, debouncedYears, debouncedQuarters), [rawWeekly, debouncedYears, debouncedQuarters]);

  const setActiveData = useCallback((setter: 'daily' | 'sidebar', updater: (prev: any) => any) => {
    if (role === 'viewer') {
      if (setter === 'daily') setSandboxDaily(prev => updater(prev || dailyData));
      if (setter === 'sidebar') setSandboxSidebar(prev => updater(prev || sidebarData));
    } else {
      if (setter === 'daily') setDailyData(updater);
      if (setter === 'sidebar') setSidebarData(updater);
    }
  }, [role, dailyData, sidebarData]);

  const logAction = useCallback((action: string) => {
    setActivityLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      user: role === 'admin' ? 'Admin' : 'Viewer (sandbox)',
      action,
    }]);
  }, [role]);

  const pushUndo = useCallback((description: string) => {
    setUndoStack(prev => [...prev.slice(-49), {
      description,
      dailyData: deepClone(dailyData),
      weeklyData: deepClone(weeklyData),
      sidebarData: deepClone(sidebarData),
      recurringTags: deepClone(recurringTags),
    }]);
  }, [dailyData, weeklyData, sidebarData, recurringTags]);

  const performUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setDailyData(snapshot.dailyData);
    setSidebarData(snapshot.sidebarData);
    setRecurringTags(snapshot.recurringTags);
    logAction(`Undo: ${snapshot.description}`);
  }, [undoStack, logAction]);

  const handleRoleChange = useCallback((newRole: RoleMode) => {
    if (newRole === 'viewer' && role === 'admin') {
      setSandboxDaily(deepClone(dailyData));
      setSandboxSidebar(deepClone(sidebarData));
    }
    setRole(newRole);
  }, [role, dailyData, sidebarData]);

  const resetSandbox = useCallback(() => {
    setSandboxDaily(deepClone(dailyData));
    setSandboxSidebar(deepClone(sidebarData));
  }, [dailyData, sidebarData]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // KPIs from visible weekly data
  const { cashIn, cashOut, netChange } = useMemo(() => {
    const weekEntries = Object.values(rawWeekly);
    const ci = weekEntries.reduce((s, e) => s + ((e["TOTAL RECEIPTS"] as number) || 0), 0);
    const co = weekEntries.reduce((s, e) => s + ((e["TOTAL DISBURSEMENTS"] as number) || 0), 0);
    return { cashIn: ci, cashOut: co, netChange: ci - co };
  }, [rawWeekly]);

  const handleCellEdit = useCallback((rowKey: string, colIdx: number, value: number) => {
    pushUndo(`Edit daily cell: ${rowKey}, col ${colIdx}`);
    setActiveData('daily', (prev: DailyData) => {
      const next = deepClone(prev);
      if (next.rows[rowKey]) {
        next.rows[rowKey].values[colIdx] = value;
      }
      return next;
    });
    logAction(`Edit daily cell: ${rowKey}, col ${colIdx} → $${value.toFixed(0)}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleRowRemove = useCallback((rowKey: string) => {
    pushUndo(`Remove row: ${rowKey}`);
    setActiveData('daily', (prev: DailyData) => {
      const next = deepClone(prev);
      delete next.rows[rowKey];
      return next;
    });
    logAction(`Remove row: ${rowKey}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleRowAdd = useCallback((section: string, label: string, entity: string) => {
    pushUndo(`Add row: ${label}`);
    const newKey = `row_${Date.now()}`;
    setActiveData('daily', (prev: DailyData) => {
      const next = deepClone(prev);
      next.rows[newKey] = {
        label,
        entity,
        values: new Array(next.dates.length).fill(0),
      };
      return next;
    });
    logAction(`Add row: ${label} to ${section}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleRowRename = useCallback((rowKey: string, newLabel: string) => {
    pushUndo(`Rename row: ${rowKey}`);
    setActiveData('daily', (prev: DailyData) => {
      const next = deepClone(prev);
      if (next.rows[rowKey]) next.rows[rowKey].label = newLabel;
      return next;
    });
    logAction(`Rename row ${rowKey} → ${newLabel}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleRecurringTag = useCallback((rowKey: string, frequency: string, date: string) => {
    setRecurringTags(prev => [...prev.filter(t => t.rowKey !== rowKey), { rowKey, frequency: frequency as any, date }]);
  }, []);

  const handleSidebarEditItem = useCallback((index: number, field: string, value: string | number) => {
    pushUndo(`Edit Cash-In item: ${field}`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      (next.cash_in_next_8_weeks[index] as any)[field] = value;
      return next;
    });
    logAction(`Edit Cash-In item ${index}: ${field}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleSidebarRemoveItem = useCallback((index: number) => {
    pushUndo(`Remove Cash-In item`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      next.cash_in_next_8_weeks.splice(index, 1);
      return next;
    });
    logAction(`Remove Cash-In item ${index}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleSidebarAddItem = useCallback(() => {
    setAddCashInOpen(true);
  }, []);

  const handleCashInItemsAdded = useCallback(() => {
    refreshCashInItems();
    logAction('Added cash-in items from deals');
  }, [refreshCashInItems, logAction]);

  const handleRemoveCashInDbItem = useCallback(async (id: string) => {
    await removeCashInDbItem(id);
    logAction('Removed cash-in deal item');
  }, [removeCashInDbItem, logAction]);

  const handleNoteEdit = useCallback((index: number, value: string) => {
    pushUndo(`Edit note ${index}`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      next.notes[index] = value;
      return next;
    });
    logAction(`Edit note ${index}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleNoteRemove = useCallback((index: number) => {
    pushUndo(`Remove note`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      next.notes.splice(index, 1);
      return next;
    });
    logAction(`Remove note ${index}`);
  }, [pushUndo, setActiveData, logAction]);

  const handleNoteAdd = useCallback(() => {
    pushUndo(`Add note`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      next.notes.push('New note');
      return next;
    });
    logAction(`Add note`);
  }, [pushUndo, setActiveData, logAction]);

  const handleSavePlan = useCallback((name: string) => {
    const snapshot: PlanSnapshot = {
      id: Date.now().toString(),
      name,
      timestamp: new Date().toISOString(),
      weeklyData: deepClone(rawWeekly),
    };
    setPlanSnapshots(prev => [...prev, snapshot]);
    logAction(`Save plan: ${name}`);
  }, [rawWeekly, logAction]);

  const handleArchive = useCallback((entry: { title: string; flags: ExportFlag[]; notes: string; weekCount: number; dateRange: string }) => {
    setArchiveEntries(prev => [...prev, {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry,
    }]);
  }, []);

  const handleImportExcel = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importFile(file);
      e.target.value = '';
    }
  }, [importFile]);

  const handleOpenExport = useCallback(() => setExportOpen(true), []);
  const handleCloseExport = useCallback(() => setExportOpen(false), []);
  const handleOpenActivityLog = useCallback(() => setActivityLogOpen(true), []);
  const handleCloseActivityLog = useCallback(() => setActivityLogOpen(false), []);

  // Keyboard: Escape closes dialogs, Ctrl+Z for undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportOpen(false);
        setActivityLogOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo]);

  const rowStructure = useMemo(() => {
    const base = isImported && importedRowStructure ? importedRowStructure : SEED_ROW_STRUCTURE;
    const hasMtInStruct = base.rows.some(r => /M&T\s*Bank\s*Balance/i.test(r.label));
    if (hasMtInStruct) return base;

    const rows = [...base.rows];
    const lastBeginIdx = rows.reduce((acc, r, i) => r.section === 'balance_begin' && !r.is_total ? i : acc, -1);
    if (lastBeginIdx >= 0) {
      rows.splice(lastBeginIdx + 1, 0, {
        row_num: 'mt_begin', label: 'M&T Bank Balance', entity: 'ALL',
        section: 'balance_begin', is_total: false, is_protected: false, indent: true,
      });
    }
    const lastEndIdx = rows.reduce((acc, r, i) => r.section === 'balance_end' && !r.is_total ? i : acc, -1);
    if (lastEndIdx >= 0) {
      rows.splice(lastEndIdx + 1, 0, {
        row_num: 'mt_end', label: 'M&T Bank Balance', entity: 'ALL',
        section: 'balance_end', is_total: false, is_protected: false, indent: true,
      });
    }
    return { rows };
  }, [isImported, importedRowStructure]);

  // Show skeleton while import data is loading
  if (isImportLoading && !isImported) {
    return <CashFlowSkeleton />;
  }

  return (
    <div className="cf-root" data-theme={theme}>
      <CashFlowHeader
        role={role}
        theme={theme}
        activeTab={activeTab}
        cashIn={cashIn}
        cashOut={cashOut}
        netChange={netChange}
        undoCount={undoStack.length}
        activityCount={activityLog.length}
        onRoleChange={handleRoleChange}
        onThemeToggle={toggleTheme}
        onTabChange={setActiveTab}
        onUndo={performUndo}
        onOpenActivityLog={handleOpenActivityLog}
      />

      {role === 'viewer' && (
        <div className="cf-viewer-banner">
          <span>My View Mode — changes are local to you and won't affect the team's model</span>
          <button onClick={resetSandbox}>Reset to Master</button>
        </div>
      )}

      {/* Date period filter */}
      <div className="cf-filter-bar">
        <div className="cf-filter-group">
          <label className="cf-filter-label">Year</label>
          <div className="cf-toggle-group">
            {availableYears.map(y => {
              const yStr = String(y);
              const active = filterYears.includes(yStr);
              return (
                <button
                  key={y}
                  className={`cf-toggle-btn ${active ? 'active' : ''}`}
                  onClick={() => setFilterYears(prev =>
                    active ? prev.filter(v => v !== yStr) : [...prev, yStr]
                  )}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
        <div className="cf-filter-group">
          <label className="cf-filter-label">Quarter</label>
          <div className="cf-toggle-group">
            {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => {
              const active = filterQuarters.includes(q);
              return (
                <button
                  key={q}
                  className={`cf-toggle-btn ${active ? 'active' : ''}`}
                  onClick={() => setFilterQuarters(prev =>
                    active ? prev.filter(v => v !== q) : [...prev, q]
                  )}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>
        {(filterYears.length > 0 || filterQuarters.length > 0) && (
          <button
            className="cf-btn cf-btn-ghost"
            style={{ fontSize: 11, marginLeft: 4 }}
            onClick={() => { setFilterYears([]); setFilterQuarters([]); }}
          >
            Clear
          </button>
        )}
        <span className="cf-filter-summary">
          {activeTab === 'daily'
            ? `${filteredDaily.dates.length} days`
            : `${Object.keys(filteredWeekly).length} weeks`}
        </span>
      </div>

      {/* Hidden file input for Excel import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Main content — only active tab renders */}
      {activeTab === 'daily' ? (
        <DailySourceTab
          data={filteredDaily}
          rowStructure={rowStructure}
          recurringTags={recurringTags}
          isAdmin={role === 'admin'}
          onCellEdit={handleCellEdit}
          onRowRemove={handleRowRemove}
          onRowAdd={handleRowAdd}
          onRowRename={handleRowRename}
          onRecurringTag={handleRecurringTag}
          onImportExcel={handleImportExcel}
          isImportLoading={isImportLoading}
        />
      ) : (
        <WeeklyReportTab
          weeklyData={filteredWeekly}
          sidebarData={rawSidebar}
          sidebarDbItems={sidebarDbItems}
          theme={theme}
          isAdmin={role === 'admin'}
          planSnapshots={planSnapshots}
          activePlanId={activePlanId}
          onActivePlanChange={setActivePlanId}
          onSavePlan={handleSavePlan}
          onExport={handleOpenExport}
          onSidebarEditItem={handleSidebarEditItem}
          onSidebarRemoveItem={handleSidebarRemoveItem}
          onSidebarAddItem={handleSidebarAddItem}
          onSidebarRemoveDbItem={handleRemoveCashInDbItem}
          onNoteEdit={handleNoteEdit}
          onNoteRemove={handleNoteRemove}
          onNoteAdd={handleNoteAdd}
        />
      )}

      {/* Footer */}
      <div className="cf-footer">
        <span>© 2026 5th Line Capital, LLC</span>
        <a href="#" onClick={e => e.preventDefault()}>Created with Perplexity Computer</a>
      </div>

      {/* Modals — only mounted when open */}
      {exportOpen && (
        <ExportModal
          open={exportOpen}
          weeklyData={rawWeekly}
          onClose={handleCloseExport}
          onArchive={handleArchive}
        />
      )}
      {activityLogOpen && (
        <ActivityLogDialog
          open={activityLogOpen}
          entries={activityLog}
          onClose={handleCloseActivityLog}
        />
      )}
      {addCashInOpen && (
        <AddCashInModal
          open={addCashInOpen}
          onClose={() => setAddCashInOpen(false)}
          onItemsAdded={handleCashInItemsAdded}
        />
      )}
    </div>
  );
}
