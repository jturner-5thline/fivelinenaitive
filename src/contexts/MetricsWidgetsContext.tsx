import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useMetricsEditPermission } from '@/hooks/useMetricsEditPermission';

export type MetricWidgetType = 'stat' | 'chart';
export type MetricChartType = 'bar' | 'line' | 'pie' | 'area' | 'composed' | 'waterfall' | 'gauge' | 'bullet' | 'treemap' | 'funnel' | 'radar' | 'heatmap' | 'forecast';
export type MetricWidgetSize = 'small' | 'medium' | 'large' | 'full';

export type ComparisonPeriod = 'none' | 'prev-month' | 'prev-quarter' | 'prev-year';
export type TimePeriod = 'all-time' | 'this-week' | 'this-month' | 'this-quarter' | 'ytd' | 'ttm' | 'last-30d' | 'last-90d' | 'last-12m' | 'custom';

export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'all-time', label: 'All Time' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'ttm', label: 'TTM (Trailing 12M)' },
  { value: 'last-30d', label: 'Last 30 Days' },
  { value: 'last-90d', label: 'Last 90 Days' },
  { value: 'last-12m', label: 'Last 12 Months' },
];

export interface MetricWidgetConfig {
  id: string;
  title: string;
  type: MetricWidgetType;
  chartType?: MetricChartType;
  dataSource: string;
  size: MetricWidgetSize;
  color: string;
  entityFilter?: string;
  comparisonPeriod?: ComparisonPeriod;
  timePeriod?: TimePeriod;
  datarailsConfig?: Record<string, any>;
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
  addWidget: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => string;
  updateWidget: (id: string, widget: Partial<Omit<MetricWidgetConfig, 'id' | 'createdAt'>>) => void;
  deleteWidget: (id: string) => void;
  reorderWidgets: (widgets: MetricWidgetConfig[]) => void;
  resetToDefaults: () => void;
  presets: MetricsLayoutPreset[];
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  canEditMetrics: boolean;
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
  { id: 'revenue-waterfall', label: 'Revenue Waterfall', type: 'chart' },
  { id: 'pipeline-gauge', label: 'Pipeline Health Gauge', type: 'chart' },
  { id: 'kpi-bullet', label: 'KPI Bullet Charts', type: 'chart' },
  { id: 'pipeline-treemap', label: 'Pipeline Treemap', type: 'chart' },
  { id: 'conversion-funnel', label: 'Conversion Funnel', type: 'chart' },
  { id: 'performance-radar', label: 'Performance Radar', type: 'chart' },
  { id: 'activity-heatmap', label: 'Activity Heatmap', type: 'chart' },
  { id: 'revenue-forecast', label: 'Revenue Forecast', type: 'chart' },
  { id: 'qb-total-revenue', label: 'QB: Total Revenue', type: 'stat' },
  { id: 'qb-accounts-receivable', label: 'QB: Accounts Receivable', type: 'stat' },
  { id: 'qb-total-payments', label: 'QB: Total Payments', type: 'stat' },
  { id: 'qb-active-customers', label: 'QB: Active Customers', type: 'stat' },
  { id: 'qb-collection-rate', label: 'QB: Collection Rate', type: 'stat' },
  { id: 'qb-overdue-amount', label: 'QB: Overdue Amount', type: 'stat' },
  { id: 'qb-total-expenses', label: 'QB: Total Expenses', type: 'stat' },
  { id: 'qb-total-ap', label: 'QB: Accounts Payable', type: 'stat' },
  { id: 'qb-net-income', label: 'QB: Net Income', type: 'stat' },
  { id: 'qb-active-vendors', label: 'QB: Active Vendors', type: 'stat' },
  { id: 'qb-total-estimates', label: 'QB: Total Estimates', type: 'stat' },
  { id: 'qb-total-credit-memos', label: 'QB: Credit Memos', type: 'stat' },
  { id: 'qb-revenue-trend', label: 'QB: Revenue Trend (12M)', type: 'chart' },
  { id: 'qb-ar-aging', label: 'QB: AR Aging', type: 'chart' },
  { id: 'qb-ap-aging', label: 'QB: AP Aging', type: 'chart' },
  { id: 'qb-top-customers', label: 'QB: Top Customers', type: 'chart' },
  { id: 'qb-top-vendors', label: 'QB: Top Vendors by Spend', type: 'chart' },
  { id: 'qb-expense-by-category', label: 'QB: Expenses by Category', type: 'chart' },
  { id: 'qb-invoice-status', label: 'QB: Invoice Status', type: 'chart' },
  { id: 'qb-payment-methods', label: 'QB: Payment Methods', type: 'chart' },
  { id: 'qb-revenue-vs-payments', label: 'QB: Revenue vs Payments', type: 'chart' },
  { id: 'qb-revenue-vs-expenses', label: 'QB: Revenue vs Expenses', type: 'chart' },
  { id: 'hs-total-deals', label: 'HS: Total Deals', type: 'stat' },
  { id: 'hs-total-deal-value', label: 'HS: Total Deal Value', type: 'stat' },
  { id: 'hs-deals-won', label: 'HS: Deals Won', type: 'stat' },
  { id: 'hs-deals-lost', label: 'HS: Deals Lost', type: 'stat' },
  { id: 'hs-win-rate', label: 'HS: Win Rate', type: 'stat' },
  { id: 'hs-avg-deal-size', label: 'HS: Avg Deal Size', type: 'stat' },
  { id: 'hs-total-contacts', label: 'HS: Total Contacts', type: 'stat' },
  { id: 'hs-total-companies', label: 'HS: Total Companies', type: 'stat' },
  { id: 'hs-pipeline-by-stage', label: 'HS: Pipeline by Stage', type: 'chart' },
  { id: 'hs-deals-by-owner', label: 'HS: Deals by Owner', type: 'chart' },
  { id: 'hs-deal-value-trend', label: 'HS: Deal Value Trend', type: 'chart' },
  { id: 'hs-contacts-by-source', label: 'HS: Contacts by Source', type: 'chart' },
  { id: 'xs-revenue-per-deal', label: 'Cross: Revenue per Deal Signed', type: 'stat' },
  { id: 'xs-ar-per-active-deal', label: 'Cross: AR per Active Deal', type: 'stat' },
  { id: 'xs-collection-rate-by-entity', label: 'Cross: Collection Rate', type: 'stat' },
] as const;

export type MetricDataSource = typeof METRIC_WIDGET_DATA_SOURCES[number]['id'];

const DEFAULT_WIDGETS: MetricWidgetConfig[] = [
  { id: 'stat-1', title: 'Active Pipeline', type: 'stat', dataSource: 'active-pipeline', size: 'small', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'stat-2', title: 'Closed Won (All Time)', type: 'stat', dataSource: 'closed-won', size: 'small', color: 'hsl(var(--success))', createdAt: new Date().toISOString() },
  { id: 'stat-3', title: 'Total Fees Earned', type: 'stat', dataSource: 'total-fees', size: 'small', color: 'hsl(var(--chart-2))', createdAt: new Date().toISOString() },
  { id: 'stat-4', title: 'Avg Deal Size', type: 'stat', dataSource: 'avg-deal-size', size: 'small', color: 'hsl(var(--chart-4))', createdAt: new Date().toISOString() },
  { id: 'chart-1', title: 'Pipeline by Stage', type: 'chart', chartType: 'bar', dataSource: 'pipeline-by-stage', size: 'medium', color: 'hsl(var(--primary))', createdAt: new Date().toISOString() },
  { id: 'chart-2', title: 'Deal Activity: Rolling 12 Months', type: 'chart', chartType: 'bar', dataSource: 'deal-activity-12m', size: 'medium', color: 'hsl(var(--chart-3))', createdAt: new Date().toISOString() },
];

const CONFIG_KEY = 'metrics_widgets';
const PRESETS_CONFIG_KEY = 'metrics_presets';

export function MetricsWidgetsProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const { canEditMetrics } = useMetricsEditPermission();
  const [widgets, setWidgets] = useState<MetricWidgetConfig[]>([]);
  const [presets, setPresets] = useState<MetricsLayoutPreset[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const widgetsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presetsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from company_settings
  useEffect(() => {
    if (!company?.id) {
      // No company yet — show defaults locally but don't persist
      setWidgets(DEFAULT_WIDGETS);
      setIsLoaded(true);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('fpa_dashboard_config')
          .eq('company_id', company.id)
          .maybeSingle();

        const fpaConfig = (data?.fpa_dashboard_config as Record<string, any>) || {};
        if (fpaConfig[CONFIG_KEY] && Array.isArray(fpaConfig[CONFIG_KEY]) && fpaConfig[CONFIG_KEY].length > 0) {
          setWidgets(fpaConfig[CONFIG_KEY]);
        } else {
          setWidgets(DEFAULT_WIDGETS);
        }
        if (fpaConfig[PRESETS_CONFIG_KEY] && Array.isArray(fpaConfig[PRESETS_CONFIG_KEY])) {
          setPresets(fpaConfig[PRESETS_CONFIG_KEY]);
        }
      } catch (err) {
        console.error('Error loading metrics widgets config:', err);
        setWidgets(DEFAULT_WIDGETS);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [company?.id]);

  const persistWidgets = useCallback((newWidgets: MetricWidgetConfig[]) => {
    if (!isLoaded || !company?.id) {
      return;
    }
    if (widgetsSaveTimerRef.current) clearTimeout(widgetsSaveTimerRef.current);
    widgetsSaveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase.rpc('save_fpa_dashboard_config' as any, {
          _company_id: company.id,
          _config_key: CONFIG_KEY,
          _config_value: newWidgets,
        });
        if (error) {
          console.error('Error saving metrics widgets:', error);
        }
      } catch (err) {
        console.error('Error saving metrics widgets:', err);
      }
    }, 500);
  }, [isLoaded, company?.id]);

  const persistPresets = useCallback((newPresets: MetricsLayoutPreset[]) => {
    if (!company?.id) return;
    if (presetsSaveTimerRef.current) clearTimeout(presetsSaveTimerRef.current);
    presetsSaveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase.rpc('save_fpa_dashboard_config' as any, {
          _company_id: company.id,
          _config_key: PRESETS_CONFIG_KEY,
          _config_value: newPresets,
        });
        if (error) {
          console.error('Error saving metrics presets:', error);
        }
      } catch (err) {
        console.error('Error saving metrics presets:', err);
      }
    }, 500);
  }, [company?.id]);

  const addWidget = (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>): string => {
    const newWidget: MetricWidgetConfig = {
      ...widget,
      id: `widget-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...widgets, newWidget];
    setWidgets(updated);
    persistWidgets(updated);
    return newWidget.id;
  };

  const updateWidget = (id: string, updates: Partial<Omit<MetricWidgetConfig, 'id' | 'createdAt'>>) => {
    const updated = widgets.map(w => w.id === id ? { ...w, ...updates } : w);
    setWidgets(updated);
    persistWidgets(updated);
  };

  const deleteWidget = (id: string) => {
    const updated = widgets.filter(w => w.id !== id);
    setWidgets(updated);
    persistWidgets(updated);
  };

  const reorderWidgets = (newWidgets: MetricWidgetConfig[]) => {
    setWidgets(newWidgets);
    persistWidgets(newWidgets);
  };

  const resetToDefaults = () => {
    setWidgets(DEFAULT_WIDGETS);
    persistWidgets(DEFAULT_WIDGETS);
  };

  const savePreset = (name: string) => {
    const newPreset: MetricsLayoutPreset = {
      id: `preset-${Date.now()}`,
      name,
      widgets: [...widgets],
      createdAt: new Date().toISOString(),
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    persistPresets(updated);
  };

  const loadPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset) {
      setWidgets(preset.widgets);
      persistWidgets(preset.widgets);
    }
  };

  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    persistPresets(updated);
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
