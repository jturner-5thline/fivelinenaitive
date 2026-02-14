import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type DashboardLayoutMode = 'focus' | 'task-ops' | 'pipeline';

export interface DashboardLayoutToggles {
  showMyDealsFirst: boolean;
  collapseCalendarByDefault: boolean;
  hideEmailHints: boolean;
  onlyUrgentAlerts: boolean;
  showStatusNotes: boolean;
  showTaskCounts: boolean;
  compactMode: boolean;
}

const DEFAULT_TOGGLES: Record<DashboardLayoutMode, DashboardLayoutToggles> = {
  focus: {
    showMyDealsFirst: true,
    collapseCalendarByDefault: false,
    hideEmailHints: false,
    onlyUrgentAlerts: true,
    showStatusNotes: true,
    showTaskCounts: true,
    compactMode: false,
  },
  'task-ops': {
    showMyDealsFirst: false,
    collapseCalendarByDefault: true,
    hideEmailHints: false,
    onlyUrgentAlerts: false,
    showStatusNotes: true,
    showTaskCounts: true,
    compactMode: false,
  },
  pipeline: {
    showMyDealsFirst: true,
    collapseCalendarByDefault: true,
    hideEmailHints: true,
    onlyUrgentAlerts: false,
    showStatusNotes: true,
    showTaskCounts: false,
    compactMode: true,
  },
};

const LAYOUT_STORAGE_KEY = 'dashboard-layout-mode';
const TOGGLES_STORAGE_KEY = 'dashboard-layout-toggles';

interface DashboardLayoutContextType {
  layoutMode: DashboardLayoutMode;
  setLayoutMode: (mode: DashboardLayoutMode) => void;
  toggles: DashboardLayoutToggles;
  setToggle: (key: keyof DashboardLayoutToggles, value: boolean) => void;
  resetToggles: () => void;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextType | undefined>(undefined);

export function DashboardLayoutProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<DashboardLayoutMode>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved && ['focus', 'task-ops', 'pipeline'].includes(saved)) {
        return saved as DashboardLayoutMode;
      }
    } catch {}
    return 'focus';
  });

  const [toggles, setToggles] = useState<DashboardLayoutToggles>(() => {
    try {
      const saved = localStorage.getItem(TOGGLES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_TOGGLES['focus'];
  });

  const setLayoutMode = (mode: DashboardLayoutMode) => {
    setLayoutModeState(mode);
    setToggles(DEFAULT_TOGGLES[mode]);
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(DEFAULT_TOGGLES[mode]));
  };

  const setToggle = (key: keyof DashboardLayoutToggles, value: boolean) => {
    setToggles(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const resetToggles = () => {
    const defaults = DEFAULT_TOGGLES[layoutMode];
    setToggles(defaults);
    localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(defaults));
  };

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  return (
    <DashboardLayoutContext.Provider value={{ layoutMode, setLayoutMode, toggles, setToggle, resetToggles }}>
      {children}
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout() {
  const context = useContext(DashboardLayoutContext);
  if (!context) throw new Error('useDashboardLayout must be used within DashboardLayoutProvider');
  return context;
}
