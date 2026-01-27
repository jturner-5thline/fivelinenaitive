import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type WidgetMetric = 
  | 'active-deals'
  | 'active-deal-volume'
  | 'deals-in-diligence'
  | 'dollars-in-diligence'
  | 'total-deals'
  | 'archived-deals'
  | 'on-track-deals'
  | 'at-risk-deals'
  | 'total-pipeline-value'
  | 'average-deal-size';

export interface Widget {
  id: string;
  label: string;
  metric: WidgetMetric;
  color: 'primary' | 'accent' | 'success' | 'warning' | 'destructive';
}

export type SpecialWidget = 'stale-deals' | 'milestones' | 'smart-suggestions';

export const SPECIAL_WIDGET_OPTIONS: { value: SpecialWidget; label: string; description: string }[] = [
  { value: 'stale-deals', label: 'Alerts', description: 'Stale deals and lenders needing updates' },
  { value: 'milestones', label: 'Milestones', description: 'View upcoming and overdue milestones' },
  { value: 'smart-suggestions', label: 'Smart Suggestions', description: 'AI-powered deal insights and recommendations' },
];

export const METRIC_OPTIONS: { value: WidgetMetric; label: string }[] = [
  { value: 'active-deals', label: 'Active Deals' },
  { value: 'active-deal-volume', label: 'Active Deal Volume' },
  { value: 'deals-in-diligence', label: 'Deals in Diligence' },
  { value: 'dollars-in-diligence', label: 'Dollars in Diligence' },
  { value: 'total-deals', label: 'Total Deals' },
  { value: 'archived-deals', label: 'Archived Deals' },
  { value: 'on-track-deals', label: 'On Track Deals' },
  { value: 'at-risk-deals', label: 'At Risk Deals' },
  { value: 'total-pipeline-value', label: 'Total Pipeline Value' },
  { value: 'average-deal-size', label: 'Average Deal Size' },
];

export const COLOR_OPTIONS: { value: Widget['color']; label: string; className: string }[] = [
  { value: 'primary', label: 'Purple', className: 'bg-primary' },
  { value: 'accent', label: 'Blue', className: 'bg-accent' },
  { value: 'success', label: 'Green', className: 'bg-success' },
  { value: 'warning', label: 'Orange', className: 'bg-warning' },
  { value: 'destructive', label: 'Red', className: 'bg-destructive' },
];

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'w1', label: 'Active Deals', metric: 'active-deals', color: 'primary' },
  { id: 'w2', label: 'Active Deal Volume', metric: 'active-deal-volume', color: 'accent' },
  { id: 'w3', label: 'Deals in Diligence', metric: 'deals-in-diligence', color: 'success' },
  { id: 'w4', label: 'Dollars in Diligence', metric: 'dollars-in-diligence', color: 'warning' },
];

const DEFAULT_SPECIAL_WIDGETS: Record<SpecialWidget, boolean> = {
  'stale-deals': false,
  'milestones': true,
  'smart-suggestions': true,
};

const STORAGE_KEY = 'dashboard-widgets';
const SPECIAL_WIDGETS_STORAGE_KEY = 'dashboard-special-widgets';

const loadWidgets = (): Widget[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load widgets from localStorage:', error);
  }
  return DEFAULT_WIDGETS;
};

const saveWidgets = (widgets: Widget[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch (error) {
    console.error('Failed to save widgets to localStorage:', error);
  }
};

const loadSpecialWidgets = (): Record<SpecialWidget, boolean> => {
  try {
    const stored = localStorage.getItem(SPECIAL_WIDGETS_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SPECIAL_WIDGETS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load special widgets from localStorage:', error);
  }
  return DEFAULT_SPECIAL_WIDGETS;
};

const saveSpecialWidgets = (specialWidgets: Record<SpecialWidget, boolean>) => {
  try {
    localStorage.setItem(SPECIAL_WIDGETS_STORAGE_KEY, JSON.stringify(specialWidgets));
  } catch (error) {
    console.error('Failed to save special widgets to localStorage:', error);
  }
};

interface WidgetsContextType {
  widgets: Widget[];
  addWidget: (widget: Omit<Widget, 'id'>) => void;
  updateWidget: (id: string, widget: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: Widget[]) => void;
  specialWidgets: Record<SpecialWidget, boolean>;
  toggleSpecialWidget: (widget: SpecialWidget) => void;
}

const WidgetsContext = createContext<WidgetsContextType | undefined>(undefined);

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<Widget[]>(loadWidgets);
  const [specialWidgets, setSpecialWidgets] = useState<Record<SpecialWidget, boolean>>(loadSpecialWidgets);

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  useEffect(() => {
    saveSpecialWidgets(specialWidgets);
  }, [specialWidgets]);

  const addWidget = (widget: Omit<Widget, 'id'>) => {
    const newWidget: Widget = {
      ...widget,
      id: `w${Date.now()}`,
    };
    setWidgets(prev => [...prev, newWidget]);
  };

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const reorderWidgets = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
  };

  const toggleSpecialWidget = (widget: SpecialWidget) => {
    setSpecialWidgets(prev => ({
      ...prev,
      [widget]: !prev[widget],
    }));
  };

  return (
    <WidgetsContext.Provider value={{ 
      widgets, 
      addWidget, 
      updateWidget, 
      deleteWidget, 
      reorderWidgets,
      specialWidgets,
      toggleSpecialWidget,
    }}>
      {children}
    </WidgetsContext.Provider>
  );
}

export function useWidgets() {
  const context = useContext(WidgetsContext);
  if (!context) {
    throw new Error('useWidgets must be used within a WidgetsProvider');
  }
  return context;
}
