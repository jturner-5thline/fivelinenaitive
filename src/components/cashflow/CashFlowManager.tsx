import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  DailyData, WeeklyData, SidebarData, RecurringTag,
  PlanSnapshot, UndoSnapshot, ActivityLogEntry, ExportArchiveEntry,
  ExportFlag, RoleMode, ActiveTab, ThemeMode,
} from './types';
import {
  SEED_DAILY_DATA, SEED_WEEKLY_DATA, SEED_SIDEBAR_DATA, SEED_ROW_STRUCTURE,
} from './seedData';
import { CashFlowHeader } from './CashFlowHeader';
import { DailySourceTab } from './DailySourceTab';
import { WeeklyReportTab } from './WeeklyReportTab';
import { ExportModal } from './ExportModal';
import { ActivityLogDialog } from './ActivityLogDialog';
import { useCashFlowImport } from './useCashFlowImport';
import { useCompany } from '@/hooks/useCompany';
import './cashflow.css';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const QUARTER_RANGES: Record<string, [number, number]> = {
  Q1: [0, 2], // Jan-Mar
  Q2: [3, 5], // Apr-Jun
  Q3: [6, 8], // Jul-Sep
  Q4: [9, 11], // Oct-Dec
};

function getAvailableYears(dates: string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    years.add(parseInt(d.slice(0, 4)));
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

export function CashFlowManager() {
  const { company } = useCompany();
  const { importedDailyData, importedRowStructure, isImported, isImportLoading, importFile } = useCashFlowImport(company?.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Master data — use imported data if available, otherwise fall back to seed
  const [dailyData, setDailyData] = useState<DailyData>(() => deepClone(SEED_DAILY_DATA));
  const [weeklyData, setWeeklyData] = useState<WeeklyData>(() => deepClone(SEED_WEEKLY_DATA));
  const [sidebarData, setSidebarData] = useState<SidebarData>(() => deepClone(SEED_SIDEBAR_DATA));

  // When imported data loads, replace dailyData
  useEffect(() => {
    if (isImported && importedDailyData) {
      setDailyData(deepClone(importedDailyData));
    }
  }, [isImported, importedDailyData]);

  // Sandbox data (viewer mode)
  const [sandboxDaily, setSandboxDaily] = useState<DailyData | null>(null);
  const [sandboxWeekly, setSandboxWeekly] = useState<WeeklyData | null>(null);
  const [sandboxSidebar, setSandboxSidebar] = useState<SidebarData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('weekly');
  const [role, setRole] = useState<RoleMode>('admin');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [recurringTags, setRecurringTags] = useState<RecurringTag[]>([]);

  // Date filter state (multi-select: empty array = show all)
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterQuarters, setFilterQuarters] = useState<string[]>([]);

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

  // Data accessors
  const getDaily = useCallback(() => role === 'viewer' && sandboxDaily ? sandboxDaily : dailyData, [role, sandboxDaily, dailyData]);
  const getWeekly = useCallback(() => role === 'viewer' && sandboxWeekly ? sandboxWeekly : weeklyData, [role, sandboxWeekly, weeklyData]);
  const getSidebar = useCallback(() => role === 'viewer' && sandboxSidebar ? sandboxSidebar : sidebarData, [role, sandboxSidebar, sidebarData]);

  // Available years derived from daily data
  const rawDaily = role === 'viewer' && sandboxDaily ? sandboxDaily : dailyData;
  const availableYears = useMemo(() => getAvailableYears(rawDaily.dates), [rawDaily.dates]);

  // Filtered data
  const filteredDaily = useMemo(() => filterDailyByPeriod(getDaily(), filterYears, filterQuarters), [getDaily, filterYears, filterQuarters]);
  const filteredWeekly = useMemo(() => filterWeeklyByPeriod(getWeekly(), filterYears, filterQuarters), [getWeekly, filterYears, filterQuarters]);

  const setActiveData = useCallback((setter: 'daily' | 'weekly' | 'sidebar', updater: (prev: any) => any) => {
    if (role === 'viewer') {
      if (setter === 'daily') setSandboxDaily(prev => updater(prev || dailyData));
      if (setter === 'weekly') setSandboxWeekly(prev => updater(prev || weeklyData));
      if (setter === 'sidebar') setSandboxSidebar(prev => updater(prev || sidebarData));
    } else {
      if (setter === 'daily') setDailyData(updater);
      if (setter === 'weekly') setWeeklyData(updater);
      if (setter === 'sidebar') setSidebarData(updater);
    }
  }, [role, dailyData, weeklyData, sidebarData]);

  // Logging
  const logAction = useCallback((action: string) => {
    setActivityLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      user: role === 'admin' ? 'Admin' : 'Viewer (sandbox)',
      action,
    }]);
  }, [role]);

  // Undo
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
    setWeeklyData(snapshot.weeklyData);
    setSidebarData(snapshot.sidebarData);
    setRecurringTags(snapshot.recurringTags);
    logAction(`Undo: ${snapshot.description}`);
  }, [undoStack, logAction]);

  // Role change
  const handleRoleChange = useCallback((newRole: RoleMode) => {
    if (newRole === 'viewer' && role === 'admin') {
      setSandboxDaily(deepClone(dailyData));
      setSandboxWeekly(deepClone(weeklyData));
      setSandboxSidebar(deepClone(sidebarData));
    }
    setRole(newRole);
  }, [role, dailyData, weeklyData, sidebarData]);

  const resetSandbox = useCallback(() => {
    setSandboxDaily(deepClone(dailyData));
    setSandboxWeekly(deepClone(weeklyData));
    setSandboxSidebar(deepClone(sidebarData));
  }, [dailyData, weeklyData, sidebarData]);

  // Theme
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // KPIs from visible weekly data
  const activeWeekly = getWeekly();
  const weekEntries = Object.values(activeWeekly);
  const cashIn = weekEntries.reduce((s, e) => s + ((e["TOTAL RECEIPTS"] as number) || 0), 0);
  const cashOut = weekEntries.reduce((s, e) => s + ((e["TOTAL DISBURSEMENTS"] as number) || 0), 0);
  const netChange = cashIn - cashOut;

  // Cell edit handler
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

  // Row management
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

  // Sidebar handlers
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
    pushUndo(`Add Cash-In item`);
    setActiveData('sidebar', (prev: SidebarData) => {
      const next = deepClone(prev);
      next.cash_in_next_8_weeks.push({ name: 'New Item', amount: 0, date: new Date().toISOString().split('T')[0] });
      return next;
    });
    logAction(`Add Cash-In item`);
  }, [pushUndo, setActiveData, logAction]);

  // Notes handlers
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

  // Plan management
  const handleSavePlan = useCallback((name: string) => {
    const snapshot: PlanSnapshot = {
      id: Date.now().toString(),
      name,
      timestamp: new Date().toISOString(),
      weeklyData: deepClone(getWeekly()),
    };
    setPlanSnapshots(prev => [...prev, snapshot]);
    logAction(`Save plan: ${name}`);
  }, [getWeekly, logAction]);

  // Export archive
  const handleArchive = useCallback((entry: { title: string; flags: ExportFlag[]; notes: string; weekCount: number; dateRange: string }) => {
    setArchiveEntries(prev => [...prev, {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry,
    }]);
  }, []);

  // Keyboard: Escape closes dialogs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportOpen(false);
        setActivityLogOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
        onOpenActivityLog={() => setActivityLogOpen(true)}
      />

      {/* Viewer banner */}
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
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            importFile(file);
            e.target.value = '';
          }
        }}
      />

      {/* Main content */}
      {activeTab === 'daily' ? (
        <DailySourceTab
          data={filteredDaily}
          rowStructure={isImported && importedRowStructure ? importedRowStructure : SEED_ROW_STRUCTURE}
          recurringTags={recurringTags}
          isAdmin={role === 'admin'}
          onCellEdit={handleCellEdit}
          onRowRemove={handleRowRemove}
          onRowAdd={handleRowAdd}
          onRowRename={handleRowRename}
          onRecurringTag={handleRecurringTag}
          onImportExcel={() => fileInputRef.current?.click()}
          isImportLoading={isImportLoading}
        />
      ) : (
        <WeeklyReportTab
          weeklyData={filteredWeekly}
          sidebarData={getSidebar()}
          theme={theme}
          isAdmin={role === 'admin'}
          planSnapshots={planSnapshots}
          activePlanId={activePlanId}
          onActivePlanChange={setActivePlanId}
          onSavePlan={handleSavePlan}
          onExport={() => setExportOpen(true)}
          onSidebarEditItem={handleSidebarEditItem}
          onSidebarRemoveItem={handleSidebarRemoveItem}
          onSidebarAddItem={handleSidebarAddItem}
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

      {/* Modals */}
      <ExportModal
        open={exportOpen}
        weeklyData={getWeekly()}
        onClose={() => setExportOpen(false)}
        onArchive={handleArchive}
      />
      <ActivityLogDialog
        open={activityLogOpen}
        entries={activityLog}
        onClose={() => setActivityLogOpen(false)}
      />
    </div>
  );
}
