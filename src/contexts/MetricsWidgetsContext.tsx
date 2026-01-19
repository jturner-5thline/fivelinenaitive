import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type MetricWidgetType = 'stat' | 'chart';
export type MetricChartType = 'bar' | 'line' | 'pie' | 'area' | 'composed';
export type MetricWidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface MetricWidgetConfig {
  id: string;
  title: string;
  type: MetricWidgetType;
  chartType?: MetricChartType;
  dataSource: string;
  size: MetricWidgetSize;
  color: string;
  createdAt: string;
}

export interface MetricsLayoutPreset {
  id: string;
  name: string;
  widgets: MetricWidgetConfig[];
  createdAt: string;
}

interface MetricsWidgetsContextType {
  widgets: MetricWidgetConfig[];
  addWidget: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => void;
  updateWidget: (id: string, widget: Partial<Omit<MetricWidgetConfig, 'id' | 'createdAt'>>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: MetricWidgetConfig[]) => void;
  resetToDefaults: () => void;
  presets: MetricsLayoutPreset[];
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
}

const MetricsWidgetsContext = createContext<MetricsWidgetsContextType | undefined>(undefined);

export const METRIC_WIDGET_DATA_SOURCES = [
  { id: 'active-pipeline', label: 'Active Pipeline', type: 'stat' },
  { id: 'closed-won', label: 'Closed Won (All Time)', type: 'stat' },
  { id: 'total-fees', label: 'Total Fees Earned', type: 'stat' },
  { id: 'avg-deal-size', label: 'Average Deal Size', type: 'stat' },
  { id: 'closed-value-12m', label: 'Closed Value: Rolling 12 Months', type: 'chart' },
  { id: 'pipeline-by-stage', label: 'Pipeline by Stage', type: 'chart' },
  { id: 'deal-activity-12m', label: 'Deal Activity: Rolling 12 Months', type: 'chart' },
  { id: 'closed-value-pop', label: 'Closed Value: Period over Period', type: 'chart' },
  { id: 'fees-pop', label: 'Fees: Period over Period', type: 'chart' },
  { id: 'ytd-cumulative', label: 'YTD Cumulative Value', type: 'chart' },
  { id: 'qtd-value', label: 'QTD Value', type: 'chart' },
  { id: 'pipeline-by-type', label: 'Pipeline by Deal Type', type: 'chart' },
  { id: 'manager-performance', label: 'Manager Performance', type: 'chart' },
  { id: 'stage-breakdown', label: 'Pipeline Stage Breakdown', type: 'chart' },
] as const;

export type MetricDataSource = typeof METRIC_WIDGET_DATA_SOURCES[number]['id'];

const DEFAULT_WIDGETS: MetricWidgetConfig[] = [
  { id: 'stat-1', title: 'Active Pipeline', type: 'stat', dataSource: 'active-pipeline', size: 'small', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'stat-2', title: 'Closed Won (All Time)', type: 'stat', dataSource: 'closed-won', size: 'small', color: 'hsl(var(--success))', createdAt: new Date().toISOString() },
  { id: 'stat-3', title: 'Total Fees Earned', type: 'stat', dataSource: 'total-fees', size: 'small', color: 'hsl(var(--chart-2))', createdAt: new Date().toISOString() },
  { id: 'stat-4', title: 'Avg Deal Size', type: 'stat', dataSource: 'avg-deal-size', size: 'small', color: 'hsl(var(--chart-4))', createdAt: new Date().toISOString() },
  { id: 'chart-1', title: 'Closed Value: Rolling 12 Months', type: 'chart', chartType: 'composed', dataSource: 'closed-value-12m', size: 'large', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-2', title: 'Pipeline by Stage', type: 'chart', chartType: 'bar', dataSource: 'pipeline-by-stage', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-3', title: 'Deal Activity: Rolling 12 Months', type: 'chart', chartType: 'bar', dataSource: 'deal-activity-12m', size: 'full', color: 'hsl(var(--chart-3))', createdAt: new Date().toISOString() },
  { id: 'chart-4', title: 'Closed Value: Period over Period', type: 'chart', chartType: 'bar', dataSource: 'closed-value-pop', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-5', title: 'Fees: Period over Period', type: 'chart', chartType: 'bar', dataSource: 'fees-pop', size: 'medium', color: 'hsl(var(--chart-2))', createdAt: new Date().toISOString() },
  { id: 'chart-6', title: 'YTD Cumulative Value', type: 'chart', chartType: 'area', dataSource: 'ytd-cumulative', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-7', title: 'QTD Value', type: 'chart', chartType: 'bar', dataSource: 'qtd-value', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-8', title: 'Pipeline by Deal Type', type: 'chart', chartType: 'pie', dataSource: 'pipeline-by-type', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-9', title: 'Manager Performance', type: 'chart', chartType: 'bar', dataSource: 'manager-performance', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-10', title: 'Pipeline Stage Breakdown', type: 'chart', chartType: 'composed', dataSource: 'stage-breakdown', size: 'full', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
];

const STORAGE_KEY = 'metrics-widgets';
const PRESETS_STORAGE_KEY = 'metrics-presets';

export function MetricsWidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<MetricWidgetConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
  });

  const [presets, setPresets] = useState<MetricsLayoutPreset[]>(() => {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  useEffect(() => {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const addWidget = (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => {
    const newWidget: MetricWidgetConfig = {
      ...widget,
      id: `widget-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setWidgets(prev => [...prev, newWidget]);
  };

  const updateWidget = (id: string, updates: Partial<Omit<MetricWidgetConfig, 'id' | 'createdAt'>>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const reorderWidgets = (newWidgets: MetricWidgetConfig[]) => {
    setWidgets(newWidgets);
  };

  const resetToDefaults = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  const savePreset = (name: string) => {
    const newPreset: MetricsLayoutPreset = {
      id: `preset-${Date.now()}`,
      name,
      widgets: [...widgets],
      createdAt: new Date().toISOString(),
    };
    setPresets(prev => [...prev, newPreset]);
  };

  const loadPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset) {
      setWidgets(preset.widgets);
    }
  };

  const deletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  return (
    <MetricsWidgetsContext.Provider value={{
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
    }}>
      {children}
    </MetricsWidgetsContext.Provider>
  );
}

export function useMetricsWidgets() {
  const context = useContext(MetricsWidgetsContext);
  if (!context) {
    throw new Error('useMetricsWidgets must be used within a MetricsWidgetsProvider');
  }
  return context;
}
