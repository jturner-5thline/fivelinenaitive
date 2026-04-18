import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type {
  DailyData, WeeklyData, SidebarData, RecurringTag,
  PlanSnapshot, UndoSnapshot, ActivityLogEntry, ExportArchiveEntry,
  ExportFlag, RoleMode, ActiveTab, ThemeMode, WeeklyOverrides,
} from './types';
import {
  SEED_SIDEBAR_DATA,
} from './seedData';
import { IMPORTED_DAILY_DATA, IMPORTED_ROW_STRUCTURE } from './importedCashFlowData';
import { aggregateDailyToWeekly } from './dailyToWeekly';
import { CashFlowHeader } from './CashFlowHeader';
import { DailySourceTab } from './DailySourceTab';
import { WeeklyReportTab } from './WeeklyReportTab';
import { ExportModal } from './ExportModal';
import { ActivityLogDialog } from './ActivityLogDialog';
import { AddCashInModal } from './AddCashInModal';
import { ScheduledCashFlowsModal } from './ScheduledCashFlowsModal';
import { useCashFlowImport } from './useCashFlowImport';
import { useCashInItems } from './useCashInItems';
import { useScheduledCashFlows } from './useScheduledCashFlows';
import { mergeScheduledIntoWeekly } from './scheduledCashFlows';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
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

const EMPTY_DAILY_DATA: DailyData = { dates: [], rows: {} };
const EMPTY_SIDEBAR_DATA: SidebarData = { cash_in_next_8_weeks: [], notes: [] };

function normalizeDailyData(data: DailyData | null | undefined): DailyData {
  return {
    dates: Array.isArray(data?.dates) ? data.dates : [],
    rows: data?.rows && typeof data.rows === 'object' ? data.rows : {},
  };
}

function normalizeWeeklyData(data: WeeklyData | null | undefined): WeeklyData {
  return data && typeof data === 'object' ? data : {};
}

function normalizeSidebarData(data: SidebarData | null | undefined): SidebarData {
  return {
    cash_in_next_8_weeks: Array.isArray(data?.cash_in_next_8_weeks) ? data.cash_in_next_8_weeks : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

function getAvailableYears(dates: string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    const y = parseInt(d.slice(0, 4));
    if (y >= 2025) years.add(y);
  }
  return Array.from(years).sort();
}

function filterDailyByPeriod(data: DailyData, years: string[], quarters: string[]): DailyData {
  const safeData = normalizeDailyData(data);
  if (years.length === 0 && quarters.length === 0) return safeData;
  const yearNums = (years || []).map(Number);
  const indices: number[] = [];

  for (let i = 0; i < safeData.dates.length; i++) {
    const d = safeData.dates[i] || '';
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

  if (indices.length === safeData.dates.length) return safeData;

  const filteredDates = indices.map(i => safeData.dates[i]).filter((date): date is string => Boolean(date));
  const filteredRows: Record<string, { label: string; entity: string; values: number[] }> = {};
  for (const [key, row] of Object.entries(safeData.rows || {})) {
    filteredRows[key] = {
      label: row.label,
      entity: row.entity,
      values: indices.map(i => row.values?.[i] ?? 0),
    };
  }

  return { dates: filteredDates, rows: filteredRows };
}

function filterWeeklyByPeriod(data: WeeklyData, years: string[], quarters: string[]): WeeklyData {
  const safeData = normalizeWeeklyData(data);
  if (years.length === 0 && quarters.length === 0) return safeData;
  const yearNums = (years || []).map(Number);
  const filtered: WeeklyData = {};

  for (const [key, entry] of Object.entries(safeData || {})) {
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
  const { items: scheduledItems, saveAll: saveScheduledItems } = useScheduledCashFlows(company?.id);
  const [addCashInOpen, setAddCashInOpen] = useState(false);
  const [scheduledModalOpen, setScheduledModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sidebarDbItems = useMemo(() => toSidebarItems(), [toSidebarItems]);

  // Master data — weekly is always derived from daily
  const [dailyData, setDailyData] = useState<DailyData>(() => {
    try { return normalizeDailyData(deepClone(IMPORTED_DAILY_DATA)); } catch { return EMPTY_DAILY_DATA; }
  });
  const [sidebarData, setSidebarData] = useState<SidebarData>(() => normalizeSidebarData(deepClone(SEED_SIDEBAR_DATA)));
  const sidebarLoadedRef = useRef(false);
  const sidebarSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load persisted sidebar data from DB
  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cashflow_sidebar_data' as any)
          .select('cash_in_items, notes')
          .eq('company_id', company.id)
          .maybeSingle();

        if (error) { console.error('Error loading sidebar data:', error); }
        
        if (data) {
          const cashInItems = (data as any).cash_in_items;
          const notes = (data as any).notes;
          if (Array.isArray(cashInItems) || Array.isArray(notes)) {
            setSidebarData({
              cash_in_next_8_weeks: Array.isArray(cashInItems) ? cashInItems : [],
              notes: Array.isArray(notes) ? notes : [],
            });
          }
        }
        // If no data found, keep SEED_SIDEBAR_DATA as fallback
      } catch (err) {
        console.error('Error loading sidebar data:', err);
      } finally {
        sidebarLoadedRef.current = true;
      }
    })();
  }, [company?.id]);

  // Auto-save sidebar data to DB when it changes (debounced)
  useEffect(() => {
    if (!company?.id || !sidebarLoadedRef.current) return;
    
    if (sidebarSaveTimerRef.current) clearTimeout(sidebarSaveTimerRef.current);
    sidebarSaveTimerRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('cashflow_sidebar_data' as any)
          .upsert({
            company_id: company.id,
            cash_in_items: sidebarData.cash_in_next_8_weeks,
            notes: sidebarData.notes,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'company_id' });
      } catch (err) {
        console.error('Error saving sidebar data:', err);
      }
    }, 800);

    return () => {
      if (sidebarSaveTimerRef.current) clearTimeout(sidebarSaveTimerRef.current);
    };
  }, [company?.id, sidebarData]);

  // --- Daily data + recurring tags persistence ---
  const dailySaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const dailyLoadedRef = useRef(false);

  // Load persisted daily data + recurring tags from DB
  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cash_flow_imports' as any)
          .select('daily_data, recurring_tags, weekly_overrides')
          .eq('company_id', company.id)
          .maybeSingle();

        if (error) { console.error('Error loading daily data:', error); }

        if (data) {
          const dd = (data as any).daily_data;
          if (dd && typeof dd === 'object' && Array.isArray(dd.dates)) {
            setDailyData(normalizeDailyData(dd));
          }
          const rt = (data as any).recurring_tags;
          if (Array.isArray(rt)) {
            setRecurringTags(rt);
          }
          const wo = (data as any).weekly_overrides;
          if (wo && typeof wo === 'object' && !Array.isArray(wo)) {
            setWeeklyOverrides(wo as WeeklyOverrides);
          }
        }
      } catch (err) {
        console.error('Error loading daily data:', err);
      } finally {
        dailyLoadedRef.current = true;
      }
    })();
  }, [company?.id]);




  // Inject cash-in DB items + manual sidebar items into dailyData and roll them through dependent cash rows
  const enhancedDailyData = useMemo(() => {
    const safeDailyData = normalizeDailyData(dailyData);
    const safeSidebarData = normalizeSidebarData(sidebarData);
    const allCashInItems = [
      ...(cashInDbItems || []).map(i => ({ date: i.target_date, amount: i.amount })),
      ...safeSidebarData.cash_in_next_8_weeks.map(i => ({ date: i.date, amount: i.amount })),
    ];
    if (allCashInItems.length === 0 || !safeDailyData.rows) return safeDailyData;

    const findRowKey = (pattern: RegExp) => Object.entries(safeDailyData.rows || {}).find(
      ([, row]) => pattern.test(row.label)
    )?.[0];

    const custPayKey = findRowKey(/Customer\s*Payment/i);
    const totalReceiptsKey = findRowKey(/TOTAL.*CASH.*RECEIPTS|TOTAL.*RECEIPTS/i);
    const netCashChangeKey = findRowKey(/NET.*CASH.*CHANGE/i);
    const endingCashKey = findRowKey(/ENDING.*(CASH|BANK|BALANCE)/i);
    const beginningCashKey = findRowKey(/BEGINNING.*(CASH|BANK|BALANCE)/i);
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
    for (let i = 0; i < safeDailyData.dates.length; i++) {
      dateIndexMap[safeDailyData.dates[i]] = i;
    }

    // Check if any cash-in dates match dailyData dates
    let hasMatch = false;
    for (const d of Object.keys(dateAmountMap)) {
      if (dateIndexMap[d] !== undefined) { hasMatch = true; break; }
    }
    if (!hasMatch) return dailyData;

    const customerPaymentValues = [...(safeDailyData.rows[custPayKey]?.values || [])];
    const totalReceiptsValues = totalReceiptsKey ? [...(safeDailyData.rows[totalReceiptsKey]?.values || [])] : null;
    const netCashChangeValues = netCashChangeKey ? [...(safeDailyData.rows[netCashChangeKey]?.values || [])] : null;
    const endingCashValues = endingCashKey ? [...(safeDailyData.rows[endingCashKey]?.values || [])] : null;
    const beginningCashValues = beginningCashKey ? [...(safeDailyData.rows[beginningCashKey]?.values || [])] : null;
    const dailyDeltas = new Array(safeDailyData.dates.length).fill(0);

    for (const [date, amount] of Object.entries(dateAmountMap)) {
      const idx = dateIndexMap[date];
      if (idx !== undefined) {
        customerPaymentValues[idx] = (customerPaymentValues[idx] || 0) + amount;
        if (totalReceiptsValues) totalReceiptsValues[idx] = (totalReceiptsValues[idx] || 0) + amount;
        if (netCashChangeValues) netCashChangeValues[idx] = (netCashChangeValues[idx] || 0) + amount;
        dailyDeltas[idx] += amount;
      }
    }

    let runningDelta = 0;
    const cumulativeDelta = dailyDeltas.map((delta) => {
      runningDelta += delta;
      return runningDelta;
    });

    if (endingCashValues) {
      for (let i = 0; i < endingCashValues.length; i++) {
        endingCashValues[i] = (endingCashValues[i] || 0) + cumulativeDelta[i];
      }
    }

    if (beginningCashValues) {
      for (let i = 1; i < beginningCashValues.length; i++) {
        beginningCashValues[i] = (beginningCashValues[i] || 0) + cumulativeDelta[i - 1];
      }
    }

    const updatedRows = {
      ...(safeDailyData.rows || {}),
      [custPayKey]: { ...safeDailyData.rows[custPayKey], values: customerPaymentValues },
    };

    if (totalReceiptsKey && totalReceiptsValues) {
      updatedRows[totalReceiptsKey] = { ...safeDailyData.rows[totalReceiptsKey], values: totalReceiptsValues };
    }

    if (netCashChangeKey && netCashChangeValues) {
      updatedRows[netCashChangeKey] = { ...safeDailyData.rows[netCashChangeKey], values: netCashChangeValues };
    }

    if (endingCashKey && endingCashValues) {
      updatedRows[endingCashKey] = { ...safeDailyData.rows[endingCashKey], values: endingCashValues };
    }

    if (beginningCashKey && beginningCashValues) {
      updatedRows[beginningCashKey] = { ...safeDailyData.rows[beginningCashKey], values: beginningCashValues };
    }

    return {
      ...safeDailyData,
      rows: updatedRows,
    };
  }, [dailyData, cashInDbItems, sidebarData.cash_in_next_8_weeks]);

  // Weekly data derived from enhanced daily (includes cash-in items)
  const weeklyData = useMemo(() => aggregateDailyToWeekly(normalizeDailyData(enhancedDailyData)), [enhancedDailyData]);

  useEffect(() => {
    if (isImported && importedDailyData) {
      const data = normalizeDailyData(deepClone(importedDailyData));
      const importedStructureRows = importedRowStructure?.rows ?? [];
      const dateCount = data.dates.length;
      // Inject M&T Bank Balance rows if not present in imported data
      const hasMtBegin = Object.entries(data.rows || {}).some(([k, r]) => {
        const struct = importedStructureRows.find(s => `row_${s.row_num}` === k);
        return /M&T\s*Bank\s*Balance/i.test(r.label) && struct?.section === 'balance_begin';
      });
      if (!hasMtBegin) {
        data.rows['row_mt_begin'] = { label: 'M&T Bank Balance', entity: 'ALL', values: new Array(dateCount).fill(46000) };
      }
      const hasMtEnd = Object.values(data.rows || {}).some(r => /M&T\s*Bank\s*Balance/i.test(r.label));
      if (!hasMtEnd || !hasMtBegin) {
        if (!data.rows['row_mt_end']) {
          data.rows['row_mt_end'] = { label: 'M&T Bank Balance', entity: 'ALL', values: new Array(dateCount).fill(46000) };
        }
      }
      setDailyData(data);
    }
  }, [isImported, importedDailyData, importedRowStructure]);

  // Sandbox data (viewer mode)
  const [sandboxDaily, setSandboxDaily] = useState<DailyData | null>(null);
  const [sandboxSidebar, setSandboxSidebar] = useState<SidebarData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('weekly');
  const [role, setRole] = useState<RoleMode>('admin');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [recurringTags, setRecurringTags] = useState<RecurringTag[]>([]);
  const [weeklyOverrides, setWeeklyOverrides] = useState<WeeklyOverrides>({});

  // Auto-save daily data + recurring tags to DB when they change (debounced)
  useEffect(() => {
    if (!company?.id || !dailyLoadedRef.current || role !== 'admin') return;

    if (dailySaveTimerRef.current) clearTimeout(dailySaveTimerRef.current);
    dailySaveTimerRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('cash_flow_imports' as any)
          .upsert({
            company_id: company.id,
            daily_data: dailyData,
            recurring_tags: recurringTags,
            weekly_overrides: weeklyOverrides,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'company_id' });
      } catch (err) {
        console.error('Error saving daily data:', err);
      }
    }, 800);

    return () => {
      if (dailySaveTimerRef.current) clearTimeout(dailySaveTimerRef.current);
    };
  }, [company?.id, dailyData, recurringTags, weeklyOverrides, role]);

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

  // Data accessors — stable references (use enhancedDailyData so cash-in items flow through)
  const rawDaily = useMemo(() => normalizeDailyData(role === 'viewer' && sandboxDaily ? sandboxDaily : enhancedDailyData), [role, sandboxDaily, enhancedDailyData]);
  const computedWeekly = useMemo(() => normalizeWeeklyData(aggregateDailyToWeekly(rawDaily)), [rawDaily]);

  // Sequential weekly resolver with roll-forward chain.
  // Precedence per week:
  //   Beginning Cash = explicit beginningCash override
  //                  | else prior week's resolved Ending Cash (if any prior week exists)
  //                  | else computed base Beginning Cash
  //   Ending Cash    = explicit endingCash override
  //                  | else resolved Beginning Cash + Net Change
  // The resolved Ending Cash carries into the next week's Beginning Cash unless
  // that next week has its own explicit override (which starts a new chain).
  const rawWeekly = useMemo<WeeklyData>(() => {
    const sortedKeys = Object.keys(computedWeekly).sort();
    if (sortedKeys.length === 0) return computedWeekly;
    const hasOverrides = weeklyOverrides && Object.keys(weeklyOverrides).length > 0;
    if (!hasOverrides) return computedWeekly;

    const out: WeeklyData = {};
    let prevResolvedEnd: number | null = null;

    for (const key of sortedKeys) {
      const entry = computedWeekly[key];
      const ov = weeklyOverrides?.[key];
      const baseBegin = (entry['BEGINNING CASH'] as number) || 0;
      const baseEnd = (entry['ENDING CASH'] as number) || 0;
      const netChange = (entry['NET CHANGE'] as number) || 0;
      const addl = (entry["Add'l Liquidity (Delayed Draw)"] as number) || 0;

      // Resolve Beginning Cash
      let resolvedBegin: number;
      if (ov?.beginningCash !== undefined) {
        resolvedBegin = ov.beginningCash;
      } else if (prevResolvedEnd !== null) {
        // Chain from prior week's resolved ending cash
        resolvedBegin = prevResolvedEnd;
      } else {
        resolvedBegin = baseBegin;
      }

      // Resolve Ending Cash
      let resolvedEnd: number;
      if (ov?.endingCash !== undefined) {
        resolvedEnd = ov.endingCash;
      } else {
        resolvedEnd = Math.round(resolvedBegin + netChange);
      }

      // Only emit a modified entry when values diverge from the base
      const beginChanged = resolvedBegin !== baseBegin;
      const endChanged = resolvedEnd !== baseEnd;

      if (beginChanged || endChanged) {
        out[key] = {
          ...entry,
          'BEGINNING CASH': resolvedBegin,
          'ENDING CASH': resolvedEnd,
          'TOTAL CASH ON HAND': resolvedEnd + addl,
        };
      } else {
        out[key] = entry;
      }

      prevResolvedEnd = resolvedEnd;
    }
    return out;
  }, [computedWeekly, weeklyOverrides]);

  // Merge scheduled cash flow entries into the weekly grid
  const weeklyWithScheduled = useMemo<WeeklyData>(
    () => mergeScheduledIntoWeekly(rawWeekly, scheduledItems),
    [rawWeekly, scheduledItems],
  );

  const rawSidebar = useMemo(() => normalizeSidebarData(role === 'viewer' && sandboxSidebar ? sandboxSidebar : sidebarData), [role, sandboxSidebar, sidebarData]);

  const availableYears = useMemo(() => getAvailableYears(rawDaily.dates), [rawDaily.dates]);

  // Filtered data using debounced values
  const filteredDaily = useMemo(() => filterDailyByPeriod(rawDaily, debouncedYears, debouncedQuarters), [rawDaily, debouncedYears, debouncedQuarters]);
  const filteredWeekly = useMemo(() => filterWeeklyByPeriod(weeklyWithScheduled, debouncedYears, debouncedQuarters), [weeklyWithScheduled, debouncedYears, debouncedQuarters]);

  const setActiveData = useCallback((setter: 'daily' | 'sidebar', updater: (prev: any) => any) => {
    if (role === 'viewer') {
      if (setter === 'daily') setSandboxDaily(prev => normalizeDailyData(updater(normalizeDailyData(prev || dailyData))));
      if (setter === 'sidebar') setSandboxSidebar(prev => normalizeSidebarData(updater(normalizeSidebarData(prev || sidebarData))));
    } else {
      if (setter === 'daily') setDailyData(prev => normalizeDailyData(updater(normalizeDailyData(prev))));
      if (setter === 'sidebar') setSidebarData(prev => normalizeSidebarData(updater(normalizeSidebarData(prev))));
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
    const weekEntries = Object.values(rawWeekly || {});
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

  // Set or clear a Beginning/Ending Cash override for a specific week.
  // Pass `value === null` to clear the override and revert to computed value.
  const handleWeeklyCashOverride = useCallback(
    (weekKey: string, field: 'beginningCash' | 'endingCash', value: number | null) => {
      if (role !== 'admin') return;
      setWeeklyOverrides(prev => {
        const next = { ...prev };
        const current = { ...(next[weekKey] || {}) };
        if (value === null || Number.isNaN(value)) {
          delete current[field];
        } else {
          current[field] = Math.round(value);
        }
        if (current.beginningCash === undefined && current.endingCash === undefined) {
          delete next[weekKey];
        } else {
          next[weekKey] = current;
        }
        return next;
      });
      logAction(
        value === null
          ? `Clear ${field === 'beginningCash' ? 'Beginning' : 'Ending'} Cash override (${weekKey})`
          : `Override ${field === 'beginningCash' ? 'Beginning' : 'Ending'} Cash → ${value} (${weekKey})`
      );
    },
    [role, logAction]
  );

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
    const base = isImported && importedRowStructure ? importedRowStructure : IMPORTED_ROW_STRUCTURE;
    const baseRows = base?.rows ?? [];
    const hasMtInStruct = baseRows.some(r => /M&T\s*Bank\s*Balance/i.test(r.label));
    if (hasMtInStruct) return { rows: baseRows };

    const rows = [...baseRows];
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
        onConfigureScheduled={() => setScheduledModalOpen(true)}
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
          weeklyOverrides={weeklyOverrides}
          onCashOverride={handleWeeklyCashOverride}
          sidebarData={rawSidebar}
          sidebarDbItems={sidebarDbItems}
          theme={theme}
          isAdmin={role === 'admin'}
          planSnapshots={planSnapshots}
          activePlanId={activePlanId}
          onActivePlanChange={setActivePlanId}
          onSavePlan={handleSavePlan}
          onExport={handleOpenExport}
          onConfigureScheduled={() => setScheduledModalOpen(true)}
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
      {scheduledModalOpen && (
        <ScheduledCashFlowsModal
          open={scheduledModalOpen}
          initialEntries={scheduledItems}
          onClose={() => setScheduledModalOpen(false)}
          onSave={async (entries) => {
            const ok = await saveScheduledItems(entries);
            if (ok) logAction(`Updated scheduled cash flows (${entries.length} entries)`);
            return ok;
          }}
        />
      )}
    </div>
  );
}
