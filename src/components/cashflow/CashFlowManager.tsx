import { useState, useCallback, useEffect } from 'react';
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
import './cashflow.css';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function CashFlowManager() {
  // Master data
  const [dailyData, setDailyData] = useState<DailyData>(() => deepClone(SEED_DAILY_DATA));
  const [weeklyData, setWeeklyData] = useState<WeeklyData>(() => deepClone(SEED_WEEKLY_DATA));
  const [sidebarData, setSidebarData] = useState<SidebarData>(() => deepClone(SEED_SIDEBAR_DATA));

  // Sandbox data (viewer mode)
  const [sandboxDaily, setSandboxDaily] = useState<DailyData | null>(null);
  const [sandboxWeekly, setSandboxWeekly] = useState<WeeklyData | null>(null);
  const [sandboxSidebar, setSandboxSidebar] = useState<SidebarData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('weekly');
  const [role, setRole] = useState<RoleMode>('admin');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [recurringTags, setRecurringTags] = useState<RecurringTag[]>([]);

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

      {/* Main content */}
      {activeTab === 'daily' ? (
        <DailySourceTab
          data={getDaily()}
          rowStructure={SEED_ROW_STRUCTURE}
          recurringTags={recurringTags}
          isAdmin={role === 'admin'}
          onCellEdit={handleCellEdit}
          onRowRemove={handleRowRemove}
          onRowAdd={handleRowAdd}
          onRowRename={handleRowRename}
          onRecurringTag={handleRecurringTag}
        />
      ) : (
        <WeeklyReportTab
          weeklyData={getWeekly()}
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
