import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ChartConfig } from './ChartsContext';
import { useAuth } from '@/contexts/AuthContext';

export type WidgetType = 'stat' | 'list';

export type WidgetDataSource = 
  | 'pre-signing-hours'
  | 'post-signing-hours'
  | 'total-hours'
  | 'total-fees'
  | 'revenue-per-hour'
  | 'avg-hours-per-deal'
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

export interface LayoutPreset {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  charts: ChartConfig[];
  layoutMode: 'compact' | 'expanded';
  createdAt: string;
}

interface AnalyticsWidgetsContextType {
  widgets: WidgetConfig[];
  addWidget: (widget: Omit<WidgetConfig, 'id' | 'createdAt'>) => void;
  updateWidget: (id: string, widget: Partial<Omit<WidgetConfig, 'id' | 'createdAt'>>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: WidgetConfig[]) => void;
  resetToDefaults: () => void;
  presets: LayoutPreset[];
  savePreset: (name: string, charts: ChartConfig[], layoutMode: 'compact' | 'expanded') => void;
  loadPreset: (id: string) => { charts: ChartConfig[]; layoutMode: 'compact' | 'expanded' } | null;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, newName: string) => void;
}

const AnalyticsWidgetsContext = createContext<AnalyticsWidgetsContextType | undefined>(undefined);

const getUserStorageKey = (baseKey: string, userId?: string) =>
  userId ? `${baseKey}:${userId}` : null;

const defaultWidgets: WidgetConfig[] = [
  {
    id: 'widget-1',
    title: 'Total Hours',
    type: 'stat',
    dataSource: 'total-hours',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-2',
    title: 'Total Fees',
    type: 'stat',
    dataSource: 'total-fees',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-3',
    title: 'Revenue per Hour',
    type: 'stat',
    dataSource: 'revenue-per-hour',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'widget-4',
    title: 'Avg Hours per Deal',
    type: 'stat',
    dataSource: 'avg-hours-per-deal',
    size: 'small',
    createdAt: new Date().toISOString(),
  },
];
export function AnalyticsWidgetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const widgetsStorageKey = getUserStorageKey('analytics-widgets', user?.id);
  const presetsStorageKey = getUserStorageKey('analytics-presets', user?.id);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(defaultWidgets);
  const [presets, setPresets] = useState<LayoutPreset[]>([]);

  useEffect(() => {
    if (!widgetsStorageKey || !presetsStorageKey) {
      setWidgets(defaultWidgets);
      setPresets([]);
      return;
    }

    try {
      const savedWidgets = localStorage.getItem(widgetsStorageKey);
      const savedPresets = localStorage.getItem(presetsStorageKey);

      setWidgets(savedWidgets ? JSON.parse(savedWidgets) : defaultWidgets);
      setPresets(savedPresets ? JSON.parse(savedPresets) : []);
    } catch (error) {
      console.error('Failed to load analytics widget preferences:', error);
      setWidgets(defaultWidgets);
      setPresets([]);
    }
  }, [widgetsStorageKey, presetsStorageKey]);

  useEffect(() => {
    if (!widgetsStorageKey) return;
    localStorage.setItem(widgetsStorageKey, JSON.stringify(widgets));
  }, [widgets, widgetsStorageKey]);

  useEffect(() => {
    if (!presetsStorageKey) return;
    localStorage.setItem(presetsStorageKey, JSON.stringify(presets));
  }, [presets, presetsStorageKey]);

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

  const savePreset = (name: string, charts: ChartConfig[], layoutMode: 'compact' | 'expanded') => {
    const newPreset: LayoutPreset = {
      id: `preset-${Date.now()}`,
      name,
      widgets: [...widgets],
      charts: [...charts],
      layoutMode,
      createdAt: new Date().toISOString(),
    };
    setPresets(prev => [...prev, newPreset]);
  };

  const loadPreset = (id: string): { charts: ChartConfig[]; layoutMode: 'compact' | 'expanded' } | null => {
    const preset = presets.find(p => p.id === id);
    if (preset) {
      setWidgets(preset.widgets);
      return { charts: preset.charts, layoutMode: preset.layoutMode };
    }
    return null;
  };

  const deletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  const renamePreset = (id: string, newName: string) => {
    setPresets(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  return (
    <AnalyticsWidgetsContext.Provider value={{ 
      widgets, 
      addWidget, 
      updateWidget, 
      deleteWidget, 
      reorderWidgets,
      resetToDefaults,
      presets,
      savePreset,
      loadPreset,
      deletePreset,
      renamePreset,
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
  { id: 'avg-hours-per-deal', label: 'Avg Hours per Deal', type: 'stat' },
  { id: 'total-retainer', label: 'Total Retainer', type: 'stat' },
  { id: 'total-milestone', label: 'Total Milestone', type: 'stat' },
  { id: 'avg-success-fee', label: 'Avg Success Fee', type: 'stat' },
  { id: 'hours-by-manager', label: 'Hours by Manager', type: 'list' },
  { id: 'hours-by-stage', label: 'Hours by Stage', type: 'list' },
];
