import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type WidgetType = 'stat' | 'list';

export type WidgetDataSource = 
  | 'pre-signing-hours'
  | 'post-signing-hours'
  | 'total-hours'
  | 'total-fees'
  | 'revenue-per-hour'
  | 'total-retainer'
  | 'total-milestone'
  | 'avg-success-fee'
  | 'hours-by-manager'
  | 'hours-by-stage';

export interface WidgetConfig {
  id: string;
  title: string;
  type: WidgetType;
  dataSource: WidgetDataSource;
  size: 'small' | 'medium' | 'large';
  createdAt: string;
}

interface AnalyticsWidgetsContextType {
  widgets: WidgetConfig[];
  addWidget: (widget: Omit<WidgetConfig, 'id' | 'createdAt'>) => void;
  updateWidget: (id: string, widget: Partial<Omit<WidgetConfig, 'id' | 'createdAt'>>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: WidgetConfig[]) => void;
  resetToDefaults: () => void;
}

const AnalyticsWidgetsContext = createContext<AnalyticsWidgetsContextType | undefined>(undefined);

const defaultWidgets: WidgetConfig[] = [
  {
    id: 'widget-1',
    title: 'Pre-Signing Hours',
    type: 'stat',
    dataSource: 'pre-signing-hours',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-2',
    title: 'Post-Signing Hours',
    type: 'stat',
    dataSource: 'post-signing-hours',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-3',
    title: 'Total Hours',
    type: 'stat',
    dataSource: 'total-hours',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-4',
    title: 'Total Fees',
    type: 'stat',
    dataSource: 'total-fees',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-5',
    title: 'Revenue per Hour',
    type: 'stat',
    dataSource: 'revenue-per-hour',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-6',
    title: 'Total Retainer',
    type: 'stat',
    dataSource: 'total-retainer',
    size: 'medium',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-7',
    title: 'Total Milestone',
    type: 'stat',
    dataSource: 'total-milestone',
    size: 'medium',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-8',
    title: 'Avg Success Fee',
    type: 'stat',
    dataSource: 'avg-success-fee',
    size: 'medium',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-9',
    title: 'Hours by Manager',
    type: 'list',
    dataSource: 'hours-by-manager',
    size: 'large',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-10',
    title: 'Hours by Stage',
    type: 'list',
    dataSource: 'hours-by-stage',
    size: 'large',
    createdAt: new Date().toISOString(),
  },
];

export function AnalyticsWidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    const saved = localStorage.getItem('analytics-widgets');
    return saved ? JSON.parse(saved) : defaultWidgets;
  });

  useEffect(() => {
    localStorage.setItem('analytics-widgets', JSON.stringify(widgets));
  }, [widgets]);

  const addWidget = (widget: Omit<WidgetConfig, 'id' | 'createdAt'>) => {
    const newWidget: WidgetConfig = {
      ...widget,
      id: `widget-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setWidgets(prev => [...prev, newWidget]);
  };

  const updateWidget = (id: string, updates: Partial<Omit<WidgetConfig, 'id' | 'createdAt'>>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const reorderWidgets = (newWidgets: WidgetConfig[]) => {
    setWidgets(newWidgets);
  };

  const resetToDefaults = () => {
    setWidgets(defaultWidgets);
  };

  return (
    <AnalyticsWidgetsContext.Provider value={{ 
      widgets, 
      addWidget, 
      updateWidget, 
      deleteWidget, 
      reorderWidgets,
      resetToDefaults 
    }}>
      {children}
    </AnalyticsWidgetsContext.Provider>
  );
}

export function useAnalyticsWidgets() {
  const context = useContext(AnalyticsWidgetsContext);
  if (!context) {
    throw new Error('useAnalyticsWidgets must be used within an AnalyticsWidgetsProvider');
  }
  return context;
}

export const WIDGET_DATA_SOURCES: { id: WidgetDataSource; label: string; type: WidgetType }[] = [
  { id: 'pre-signing-hours', label: 'Pre-Signing Hours', type: 'stat' },
  { id: 'post-signing-hours', label: 'Post-Signing Hours', type: 'stat' },
  { id: 'total-hours', label: 'Total Hours', type: 'stat' },
  { id: 'total-fees', label: 'Total Fees', type: 'stat' },
  { id: 'revenue-per-hour', label: 'Revenue per Hour', type: 'stat' },
  { id: 'total-retainer', label: 'Total Retainer', type: 'stat' },
  { id: 'total-milestone', label: 'Total Milestone', type: 'stat' },
  { id: 'avg-success-fee', label: 'Avg Success Fee', type: 'stat' },
  { id: 'hours-by-manager', label: 'Hours by Manager', type: 'list' },
  { id: 'hours-by-stage', label: 'Hours by Stage', type: 'list' },
];
