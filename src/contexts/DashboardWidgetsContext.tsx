import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type DashboardWidgetId = 
  | 'calendar'
  | 'email'
  | 'quick-prompts'
  | 'create-deal'
  | 'notifications'
  | 'deals-calendar'
  | 'news-feed'
  | 'recent-activity';

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: 'calendar', label: 'Calendar', description: 'Quick access to your calendar', icon: 'Calendar', enabled: true, order: 0 },
  { id: 'email', label: 'Email', description: 'Quick access to emails', icon: 'Mail', enabled: true, order: 1 },
  { id: 'quick-prompts', label: 'Quick Prompts', description: 'AI-powered quick actions', icon: 'Zap', enabled: true, order: 2 },
  { id: 'create-deal', label: 'Create New Deal', description: 'Quickly create a new deal', icon: 'Briefcase', enabled: true, order: 3 },
  { id: 'notifications', label: 'Notifications', description: 'Recent notifications carousel', icon: 'Bell', enabled: true, order: 4 },
  { id: 'deals-calendar', label: 'Deals Calendar', description: 'Calendar view of your deals', icon: 'CalendarDays', enabled: true, order: 5 },
  { id: 'news-feed', label: 'News Feed', description: 'Latest industry news', icon: 'Newspaper', enabled: true, order: 6 },
  { id: 'recent-activity', label: 'Recent Activity', description: 'Your recent deal activity', icon: 'Activity', enabled: true, order: 7 },
];

const STORAGE_KEY = 'dashboard-widgets-config';

interface DashboardWidgetsContextType {
  widgets: DashboardWidgetConfig[];
  isWidgetEnabled: (id: DashboardWidgetId) => boolean;
  toggleWidget: (id: DashboardWidgetId) => void;
  reorderWidgets: (widgets: DashboardWidgetConfig[]) => void;
  resetToDefaults: () => void;
  getQuickActionWidgets: () => DashboardWidgetConfig[];
  getMainWidgets: () => DashboardWidgetConfig[];
}

const DashboardWidgetsContext = createContext<DashboardWidgetsContextType | undefined>(undefined);

function loadWidgets(): DashboardWidgetConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardWidgetConfig[];
      // Merge with defaults to handle new widgets added later
      const mergedWidgets = DEFAULT_WIDGETS.map(defaultWidget => {
        const savedWidget = parsed.find(w => w.id === defaultWidget.id);
        return savedWidget ? { ...defaultWidget, enabled: savedWidget.enabled, order: savedWidget.order } : defaultWidget;
      });
      return mergedWidgets.sort((a, b) => a.order - b.order);
    }
  } catch (e) {
    console.error('Error loading dashboard widgets:', e);
  }
  return DEFAULT_WIDGETS;
}

function saveWidgets(widgets: DashboardWidgetConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch (e) {
    console.error('Error saving dashboard widgets:', e);
  }
}

export function DashboardWidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(() => loadWidgets());

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  const isWidgetEnabled = (id: DashboardWidgetId): boolean => {
    return widgets.find(w => w.id === id)?.enabled ?? true;
  };

  const toggleWidget = (id: DashboardWidgetId) => {
    setWidgets(prev => 
      prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w)
    );
  };

  const reorderWidgets = (newWidgets: DashboardWidgetConfig[]) => {
    setWidgets(newWidgets.map((w, i) => ({ ...w, order: i })));
  };

  const resetToDefaults = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  const getQuickActionWidgets = (): DashboardWidgetConfig[] => {
    const quickActionIds: DashboardWidgetId[] = ['calendar', 'email', 'quick-prompts', 'create-deal'];
    return widgets
      .filter(w => quickActionIds.includes(w.id) && w.enabled)
      .sort((a, b) => a.order - b.order);
  };

  const getMainWidgets = (): DashboardWidgetConfig[] => {
    const mainWidgetIds: DashboardWidgetId[] = ['notifications', 'deals-calendar', 'news-feed', 'recent-activity'];
    return widgets
      .filter(w => mainWidgetIds.includes(w.id) && w.enabled)
      .sort((a, b) => a.order - b.order);
  };

  return (
    <DashboardWidgetsContext.Provider value={{
      widgets,
      isWidgetEnabled,
      toggleWidget,
      reorderWidgets,
      resetToDefaults,
      getQuickActionWidgets,
      getMainWidgets,
    }}>
      {children}
    </DashboardWidgetsContext.Provider>
  );
}

export function useDashboardWidgets() {
  const context = useContext(DashboardWidgetsContext);
  if (!context) {
    throw new Error('useDashboardWidgets must be used within DashboardWidgetsProvider');
  }
  return context;
}
