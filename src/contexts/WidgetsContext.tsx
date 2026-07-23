import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  | 'average-deal-size'
  | 'sales-pipeline-deals'
  | 'sales-pipeline-volume';

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
  { value: 'active-deals', label: 'Active Deals (Final Credit → Terms Issued)' },
  { value: 'active-deal-volume', label: 'Active Deal Volume (Final Credit → Terms Issued)' },
  { value: 'sales-pipeline-deals', label: 'Sales Pipeline (NDA/Needs List → Proposal Issued)' },
  { value: 'sales-pipeline-volume', label: 'Sales Pipeline Volume (NDA/Needs List → Proposal Issued)' },
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
  { id: 'w3', label: 'Deals in Diligence', metric: 'deals-in-diligence', color: 'success' },
  { id: 'w4', label: 'Dollars in Diligence', metric: 'dollars-in-diligence', color: 'warning' },
];

const DEFAULT_SPECIAL_WIDGETS: Record<SpecialWidget, boolean> = {
  'stale-deals': false,
};

interface WidgetsContextType {
  widgets: Widget[];
  isLoading: boolean;
  addWidget: (widget: Omit<Widget, 'id'>) => void;
  updateWidget: (id: string, widget: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: Widget[]) => void;
  specialWidgets: Record<SpecialWidget, boolean>;
  toggleSpecialWidget: (widget: SpecialWidget) => void;
}

const WidgetsContext = createContext<WidgetsContextType | undefined>(undefined);

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [specialWidgets, setSpecialWidgets] = useState<Record<SpecialWidget, boolean>>(DEFAULT_SPECIAL_WIDGETS);
  // Workspace-wide list of widget metrics that any teammate has removed.
  // Once hidden, the widget stays gone for every user in the company
  // across sessions, page refreshes, and views — the metric only comes
  // back if someone re-adds it (which clears it from this list) or an
  // admin edits `company_settings.deals_hidden_widget_metrics` directly.
  const [hiddenMetrics, setHiddenMetrics] = useState<WidgetMetric[]>([]);
  const hiddenLoaded = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const isLoaded = useRef(false);

  // Load from Supabase on mount / user change
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setWidgets(DEFAULT_WIDGETS);
      setSpecialWidgets(DEFAULT_SPECIAL_WIDGETS);
      setIsLoading(false);
      isLoaded.current = false;
      return;
    }

    setIsLoading(true);
    isLoaded.current = false;
    // Defensive timeout: if the preferences query hangs (network blip, RLS
    // misconfig, etc.) fall back to defaults so the dashboard skeleton
    // doesn't get stuck forever.
    const fallbackTimer = setTimeout(() => {
      if (cancelled) return;
      if (!isLoaded.current) {
        setWidgets(DEFAULT_WIDGETS);
        setSpecialWidgets(DEFAULT_SPECIAL_WIDGETS);
        setIsLoading(false);
      }
    }, 5000);
    (async () => {
      const { data, error } = await (supabase as any)
        .from('widget_preferences')
        .select('widgets, special_widgets')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) { clearTimeout(fallbackTimer); return; }
      clearTimeout(fallbackTimer);

      if (!error && data) {
        if (Array.isArray(data.widgets) && data.widgets.length > 0) {
          setWidgets(data.widgets as Widget[]);
        } else {
          setWidgets(DEFAULT_WIDGETS);
        }
        if (data.special_widgets && typeof data.special_widgets === 'object') {
          setSpecialWidgets({ ...DEFAULT_SPECIAL_WIDGETS, ...(data.special_widgets as Record<SpecialWidget, boolean>) });
        } else {
          setSpecialWidgets(DEFAULT_SPECIAL_WIDGETS);
        }
      } else {
        setWidgets(DEFAULT_WIDGETS);
        setSpecialWidgets(DEFAULT_SPECIAL_WIDGETS);
      }
      isLoaded.current = true;
      setIsLoading(false);
    })();

    return () => { cancelled = true; clearTimeout(fallbackTimer); };
  }, [user]);

  // Load company-wide hidden widget list. This is the source of truth for
  // "deleted" widgets across the whole workspace — the per-user
  // `widgets` array is then filtered against it at render time.
  useEffect(() => {
    let cancelled = false;
    hiddenLoaded.current = false;
    if (!companyId) {
      setHiddenMetrics([]);
      return;
    }
    (async () => {
      const { data, error } = await (supabase as any)
        .from('company_settings')
        .select('deals_hidden_widget_metrics')
        .eq('company_id', companyId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && Array.isArray(data?.deals_hidden_widget_metrics)) {
        setHiddenMetrics(
          (data.deals_hidden_widget_metrics as unknown[]).filter(
            (m): m is WidgetMetric => typeof m === 'string',
          ),
        );
      } else {
        setHiddenMetrics([]);
      }
      hiddenLoaded.current = true;
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Realtime: pick up hides/unhides made by other teammates so their
  // deletions propagate without a refresh.
  useEffect(() => {
    if (!companyId) return;
    const channel = (supabase as any)
      .channel(`company-hidden-widgets-${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'company_settings', filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          const next = payload?.new?.deals_hidden_widget_metrics;
          if (Array.isArray(next)) {
            setHiddenMetrics(next.filter((m: unknown): m is WidgetMetric => typeof m === 'string'));
          }
        },
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [companyId]);

  const persistHiddenMetrics = async (next: WidgetMetric[]) => {
    if (!companyId) return;
    const { error } = await (supabase as any)
      .from('company_settings')
      .upsert(
        {
          company_id: companyId,
          deals_hidden_widget_metrics: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      );
    if (error) console.error('Failed to persist hidden deal widgets:', error);
  };

  // Persist to Supabase whenever values change (after initial load)
  useEffect(() => {
    if (!user || !isLoaded.current) return;
    const handle = setTimeout(() => {
      (supabase as any)
        .from('widget_preferences')
        .upsert(
          {
            user_id: user.id,
            widgets,
            special_widgets: specialWidgets,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .then(({ error }: any) => {
          if (error) console.error('Failed to persist widget preferences:', error);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [widgets, specialWidgets, user]);

  const addWidget = (widget: Omit<Widget, 'id'>) => {
    setWidgets(prev => [...prev, { ...widget, id: `w${Date.now()}` }]);
    // Re-adding a metric un-hides it workspace-wide.
    if (hiddenMetrics.includes(widget.metric)) {
      const next = hiddenMetrics.filter(m => m !== widget.metric);
      setHiddenMetrics(next);
      void persistHiddenMetrics(next);
    }
  };

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWidget = (id: string) => {
    let removedMetric: WidgetMetric | null = null;
    setWidgets(prev => {
      const target = prev.find(w => w.id === id);
      if (target) removedMetric = target.metric;
      return prev.filter(w => w.id !== id);
    });
    if (removedMetric && !hiddenMetrics.includes(removedMetric)) {
      const next = [...hiddenMetrics, removedMetric];
      setHiddenMetrics(next);
      void persistHiddenMetrics(next);
    }
  };

  const reorderWidgets = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
  };

  const toggleSpecialWidget = (widget: SpecialWidget) => {
    setSpecialWidgets(prev => ({ ...prev, [widget]: !prev[widget] }));
  };

  return (
    <WidgetsContext.Provider value={{ 
      widgets: widgets.filter(w => !hiddenMetrics.includes(w.metric)), 
      isLoading,
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
