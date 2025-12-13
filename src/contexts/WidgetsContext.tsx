import { createContext, useContext, useState, ReactNode } from 'react';

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

interface WidgetsContextType {
  widgets: Widget[];
  addWidget: (widget: Omit<Widget, 'id'>) => void;
  updateWidget: (id: string, widget: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: Widget[]) => void;
}

const WidgetsContext = createContext<WidgetsContextType | undefined>(undefined);

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);

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

  return (
    <WidgetsContext.Provider value={{ widgets, addWidget, updateWidget, deleteWidget, reorderWidgets }}>
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
