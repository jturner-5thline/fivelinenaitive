import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

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

export type SpecialWidget = 'stale-deals';

export const SPECIAL_WIDGET_OPTIONS: { value: SpecialWidget; label: string; description: string }[] = [
  { value: 'stale-deals', label: 'Alerts', description: 'Stale deals and lenders needing updates' },
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
};

interface WidgetsContextType {
  widgets: Widget[];
  addWidget: (widget: Omit<Widget, 'id'>) => void;
  updateWidget: (id: string, widget: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: Widget[]) => void;
  specialWidgets: Record<SpecialWidget, boolean>;
  toggleSpecialWidget: (widget: SpecialWidget) => void;
  isAdminUser: boolean;
}

const WidgetsContext = createContext<WidgetsContextType | undefined>(undefined);

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const { company, isAdmin } = useCompany();
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [specialWidgets, setSpecialWidgets] = useState<Record<SpecialWidget, boolean>>(DEFAULT_SPECIAL_WIDGETS);
  const [loaded, setLoaded] = useState(false);

  // Load widgets from company_settings
  useEffect(() => {
    if (!company?.id) return;

    const loadFromCompany = async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('deals_widgets_config, deals_special_widgets')
        .eq('company_id', company.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load company widgets:', error);
        // Fall back to localStorage for migration
        fallbackToLocalStorage();
        setLoaded(true);
        return;
      }

      if (data?.deals_widgets_config) {
        setWidgets(data.deals_widgets_config as unknown as Widget[]);
      } else {
        // Migrate from localStorage if available
        fallbackToLocalStorage();
      }

      if (data?.deals_special_widgets) {
        setSpecialWidgets({ ...DEFAULT_SPECIAL_WIDGETS, ...(data.deals_special_widgets as unknown as Record<SpecialWidget, boolean>) });
      } else {
        const stored = localStorage.getItem('dashboard-special-widgets');
        if (stored) {
          try {
            setSpecialWidgets({ ...DEFAULT_SPECIAL_WIDGETS, ...JSON.parse(stored) });
          } catch {}
        }
      }

      setLoaded(true);
    };

    loadFromCompany();
  }, [company?.id]);

  const fallbackToLocalStorage = () => {
    try {
      const stored = localStorage.getItem('dashboard-widgets');
      if (stored) {
        setWidgets(JSON.parse(stored));
      }
    } catch {}
  };

  // Save to company_settings (debounced via effect)
  const saveToCompany = useCallback(async (newWidgets: Widget[], newSpecialWidgets: Record<SpecialWidget, boolean>) => {
    if (!company?.id || !loaded) return;

    const { error } = await supabase
      .from('company_settings')
      .upsert({
        company_id: company.id,
        deals_widgets_config: newWidgets as any,
        deals_special_widgets: newSpecialWidgets as any,
      }, { onConflict: 'company_id' });

    if (error) {
      console.error('Failed to save company widgets:', error);
    }
  }, [company?.id, loaded]);

  const addWidget = (widget: Omit<Widget, 'id'>) => {
    if (!isAdmin) return;
    const newWidget: Widget = {
      ...widget,
      id: `w${Date.now()}`,
    };
    setWidgets(prev => {
      const updated = [...prev, newWidget];
      saveToCompany(updated, specialWidgets);
      return updated;
    });
  };

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    if (!isAdmin) return;
    setWidgets(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, ...updates } : w);
      saveToCompany(updated, specialWidgets);
      return updated;
    });
  };

  const deleteWidget = (id: string) => {
    if (!isAdmin) return;
    setWidgets(prev => {
      const updated = prev.filter(w => w.id !== id);
      saveToCompany(updated, specialWidgets);
      return updated;
    });
  };

  const reorderWidgets = (newWidgets: Widget[]) => {
    if (!isAdmin) return;
    setWidgets(newWidgets);
    saveToCompany(newWidgets, specialWidgets);
  };

  const toggleSpecialWidget = (widget: SpecialWidget) => {
    if (!isAdmin) return;
    setSpecialWidgets(prev => {
      const updated = { ...prev, [widget]: !prev[widget] };
      saveToCompany(widgets, updated);
      return updated;
    });
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
      isAdminUser: isAdmin,
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
