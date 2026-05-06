import { useState, useRef, useCallback, useMemo } from 'react';
import { AvgRevenuePerClientWidget } from '@/components/metrics/AvgRevenuePerClientWidget';
import { DebtRevenueWidget, FinServRevenueWidget } from './RevenueOverviewDashboard';
import { PipelineMetricWidget, CombinedPipelineMetricWidget, type PipelineMetricCardId, PIPELINE_METRIC_LABELS } from './PipelineMetricsSection';
import { DealsSignedWidget, FinServClientsSignedWidget, OutstandingARWidget } from './SignedDealsAndARSection';
import { DebtProfitWidget, FinServProfitWidget } from './ProfitByEntitySection';
import {
  ExecDealsByStatusWidget,
} from './ExecutiveDashboard';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Lock, Pencil, ChevronDown, Loader2, Trash2, TrendingUp, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, ReferenceLine, LabelList } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { Button } from '@/components/ui/button';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow, type KPIDetailCardConfig, type NegativeStylingConfig, DEFAULT_KPI_DETAIL_CARD_CONFIG } from '@/components/widget-editor/widgetTypes';
import { KPIDetailCard } from '@/components/metrics/KPIDetailCard';
import { DraggableGridLayout, type WidgetConstraint } from '@/components/metrics/DraggableGridLayout';
import { RevenueByMonthChart } from '@/components/metrics/RevenueByMonthChart';
import { InsightsDrilldownDrawer } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { type GridLayoutItem } from '@/hooks/useGridLayout';
import { GripVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function NoPermissionCard({ title }: { title: string }) {
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Lock className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm font-medium">No Permission</p>
        <p className="text-xs">You do not have permission to view the data</p>
        <Button variant="default" size="sm" className="mt-3">Request Permission</Button>
      </CardContent>
    </Card>
  );
}

export type EditableManagementSnapshotCardId =
  | 'debt-revenue'
  | 'finserv-revenue'
  | 'total-revenue'
  | 'total-revenue-detail'
  | 'revenue-by-month'
  | 'clients-signed-debt'
  | 'clients-signed-finserv'
  | 'outstanding-ar'
  | 'debt-profit'
  | 'finserv-profit'
  | 'avg-rev-per-client';

export type WidgetSizeVariant = 'chart' | 'metric';

export type KPITileLayoutVariant = 'standard' | 'compact';

export type ManagementSnapshotEditableConfig = Pick<
  MetricWidgetConfig,
  'title' | 'color' | 'entityFilter' | 'comparisonPeriod'
> & Partial<Pick<MetricWidgetConfig, 'type' | 'chartType' | 'datarailsConfig'>> & {
  timeWindow?: TimeWindow;
  sizeVariant?: WidgetSizeVariant;
  kpiDetailConfig?: KPIDetailCardConfig;
  kpiTileLayout?: KPITileLayoutVariant;
  footerLabel?: string;
};

const WINDOW_GROUPS: { label: string; options: { value: TimeWindow; label: string }[] }[] = [
  {
    label: 'Current Period',
    options: [
      { value: 'mtd', label: 'Month to Date' },
      { value: 'qtd', label: 'Quarter to Date' },
      { value: 'ytd', label: 'Year to Date' },
    ],
  },
  {
    label: 'Prior Period',
    options: [
      { value: 'lastMonth', label: 'Last Month' },
      { value: 'lastQuarter', label: 'Last Quarter' },
      { value: 'lastYear', label: 'Last Year' },
    ],
  },
  {
    label: 'Rolling',
    options: [
      { value: 'last3Months', label: 'Last 3 Months' },
      { value: 'last6Months', label: 'Last 6 Months' },
      { value: 'ttm', label: 'Trailing 12 Months (TTM)' },
      { value: 'last12Months', label: 'Last 12 Months' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'all', label: 'All Time' },
    ],
  },
];

const WINDOW_LABEL_MAP: Record<string, string> = {};
for (const g of WINDOW_GROUPS) for (const o of g.options) WINDOW_LABEL_MAP[o.value] = o.label;

function PeriodBadge({
  cardId,
  currentWindow,
  onTimeWindowChange,
}: {
  cardId: EditableManagementSnapshotCardId;
  currentWindow: TimeWindow;
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
}) {
  const label = WINDOW_LABEL_MAP[currentWindow] || currentWindow;

  if (!onTimeWindowChange) {
    return <Badge variant="outline" className="w-fit text-xs">{label}</Badge>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs font-medium gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onClick={(e) => e.stopPropagation()}>
        {WINDOW_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.options.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="text-xs"
                onSelect={() => onTimeWindowChange(cardId, opt.value)}
              >
                {opt.label}
                {opt.value === currentWindow && (
                  <span className="ml-auto text-primary">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CardVisualization = 'kpi' | 'bar' | 'stackedBar' | 'line';

// ---------------------------------------------------------------------------
// Generic card renderer that uses useDashboardCardData
// ---------------------------------------------------------------------------
interface GenericDashboardCardProps {
  cardId: EditableManagementSnapshotCardId;
  title: string;
  color: string;
  visualization: CardVisualization;
  timeWindow: TimeWindow;
  customRange?: { start: string; end: string };
  entityName: string | null;
  datarailsConfig: Partial<WidgetConfig> | undefined | null;
  entityFilter?: string | null;
  isEditMode: boolean;
  sizeVariant?: WidgetSizeVariant;
  kpiTileLayout?: KPITileLayoutVariant;
  footerLabel?: string;
  onEditCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onDeleteCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
  chartHeight?: number;
}

function GenericDashboardCard({
  cardId,
  title,
  color,
  visualization,
  timeWindow,
  customRange,
  entityName,
  datarailsConfig,
  entityFilter,
  isEditMode,
  sizeVariant = 'chart',
  kpiTileLayout = 'standard',
  footerLabel,
  onEditCard,
  onDeleteCard,
  onTimeWindowChange,
  chartHeight = 200,
}: GenericDashboardCardProps) {
  const [showTrendLine, setShowTrendLine] = useState(false);
  const { chartData, total, seriesKeys, isLoading } = useDashboardCardData(
    datarailsConfig,
    timeWindow,
    entityFilter,
    customRange,
  );

  const renderEditActions = () => {
    return (
      <div className="flex items-center gap-1">
        {onEditCard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onEditCard(cardId); }}
            aria-label={`Edit ${title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {isEditMode && onDeleteCard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDeleteCard(cardId); }}
            aria-label={`Delete ${title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  const renderLoading = () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const isCompactTile = kpiTileLayout === 'compact';

  const renderKPI = () => (
    <div className="flex flex-col items-center justify-center gap-1 h-full" style={{ minHeight: chartHeight }}>
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className={cn('uppercase tracking-wide text-muted-foreground', isCompactTile ? 'text-[10px]' : 'text-xs')}>{title}</p>
          <p className={cn('font-bold text-foreground', isCompactTile ? 'text-2xl' : 'text-4xl')}>
            {formatCurrency(total)}
          </p>
          {!isCompactTile && (
            <p className="text-xs text-muted-foreground">{WINDOW_LABEL_MAP[timeWindow] || timeWindow}</p>
          )}
          {isCompactTile && footerLabel && (
            <p className="text-[9px] text-muted-foreground/60 text-center mt-0.5">{footerLabel}</p>
          )}
        </>
      )}
    </div>
  );

  const renderChart = () => {
    if (isLoading) return renderLoading();

    if (!chartData || chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1">
          <p className="text-sm font-medium">No data available</p>
          <p className="text-xs">Click to configure this widget</p>
        </div>
      );
    }

    const dataKeys = seriesKeys.length > 0 ? seriesKeys : ['Revenue'];
    const neg = (datarailsConfig as any)?.negativeStyling as NegativeStylingConfig | undefined;
    const negEnabled = neg?.enableNegativeStyling ?? false;
    const negThreshold = neg?.negativeThreshold ?? 0;
    const negColor = neg?.negativeColor ?? 'hsl(0, 72%, 51%)';

    if (visualization === 'line') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            {negEnabled && <ReferenceLine y={negThreshold} stroke={negColor} strokeDasharray="4 4" strokeWidth={0.5} />}
            {dataKeys.map((key, i) => {
              const lineColor = CHART_COLORS[i % CHART_COLORS.length];
              if (negEnabled) {
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={lineColor}
                    name={key}
                    strokeWidth={1}
                    dot={(dotProps: any) => {
                      const val = dotProps.payload?.[key];
                      const isBelowThreshold = typeof val === 'number' && val < negThreshold;
                      return (
                        <circle
                          key={`dot-${dotProps.index}`}
                          cx={dotProps.cx}
                          cy={dotProps.cy}
                          r={3}
                          fill={isBelowThreshold ? negColor : lineColor}
                          stroke={isBelowThreshold ? negColor : lineColor}
                        />
                      );
                    }}
                  />
                );
              }
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={lineColor}
                  name={key}
                  strokeWidth={1}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // Compute cumulative trend data
    const trendData = showTrendLine ? chartData.map((entry: any) => {
      const total = dataKeys.reduce((sum: number, key: string) => sum + (Number(entry[key]) || 0), 0);
      return { ...entry, __trendLine: total };
    }) : chartData;

    const trendLineColor = '#94A3B8';

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trendData}>
          <defs>
            {negEnabled && (
              <linearGradient id={`negGrad-${cardId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 72%, 60%)" />
                <stop offset="100%" stopColor={negColor} />
              </linearGradient>
            )}
          </defs>
          <XAxis dataKey="period" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
          {showTrendLine && <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />}
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Legend />
          {negEnabled && <ReferenceLine yAxisId="left" y={negThreshold} stroke={negColor} strokeDasharray="4 4" strokeWidth={0.5} />}
          {dataKeys.map((key, i) => (
            <Bar
              key={key}
              yAxisId="left"
              dataKey={key}
              stackId={visualization === 'stackedBar' ? `${cardId}-stack` : undefined}
              fill={i === 0 ? color : CHART_COLORS[i % CHART_COLORS.length]}
              name={key}
              shape={visualization === 'stackedBar'
                ? createGlassBarShape({ radius: 3, topSegmentKey: dataKeys[dataKeys.length - 1], dataKey: key })
                : createGlassBarShape({ radius: 3 })
              }
            >
              {negEnabled && trendData.map((entry: any, idx: number) => {
                const val = entry[key];
                const isBelowThreshold = typeof val === 'number' && val < negThreshold;
                return (
                  <Cell
                    key={`cell-${idx}`}
                    fill={isBelowThreshold ? `url(#negGrad-${cardId})` : (i === 0 ? color : CHART_COLORS[i % CHART_COLORS.length])}
                  />
                );
              })}
            </Bar>
          ))}
          {showTrendLine && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="__trendLine"
              stroke={trendLineColor}
              strokeWidth={1}
              dot={{ r: 4, fill: trendLineColor }}
              name="Trend"
            >
              <LabelList
                dataKey="__trendLine"
                position="top"
                formatter={(value: number) => formatCurrency(value)}
                style={{ fontSize: 9, fill: trendLineColor, fontWeight: 600 }}
              />
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card
      className="h-full flex flex-col overflow-hidden"
    >
      <CardHeader className={cn('pb-2 widget-drag-handle cursor-grab', sizeVariant === 'metric' && 'pb-1 pt-3 px-3')}>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={cn('text-sm font-medium', sizeVariant === 'metric' && 'text-xs')}>{title}</CardTitle>
          <div className="flex items-center gap-0.5">
            {visualization !== 'kpi' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', showTrendLine && 'text-primary')}
                onClick={(e) => { e.stopPropagation(); setShowTrendLine(v => !v); }}
                aria-label="Toggle trend line"
              >
                <TrendingUp className="h-3.5 w-3.5" />
              </Button>
            )}
            {renderEditActions()}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <PeriodBadge cardId={cardId} currentWindow={timeWindow} onTimeWindowChange={onTimeWindowChange} />
          {entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {entityName}</Badge>}
        </div>
      </CardHeader>
      <CardContent className={cn('flex-1 min-h-0', sizeVariant === 'metric' && 'px-3 pb-3')}>
        {visualization === 'kpi' ? renderKPI() : (
          <div className="h-full">
            {renderChart()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface CardSizeOverride {
  w: number;
  h: number;
}

export type ManagementSnapshotSectionId =
  | 'revenue-overview'
  | 'pipeline-metrics'
  | 'signed-deals-ar'
  | 'profit-by-entity'
  | 'executive-dashboard';

/** New per-widget IDs for sub-section charts/KPIs. Each one is an
 *  independently draggable, resizable tile in the unified grid. */
export type WeeklyRundownSubWidgetId =
  // Revenue Overview charts
  | 'rev-debt' | 'rev-finserv'
  // Pipeline Metrics KPIs (combined debt count+$ tiles, plus FinServ tiles)
  | 'pm-debt-on-board-combined' | 'pm-debt-signed-combined' | 'pm-debt-closed-combined'
  | 'pm-finserv-deals-on-board' | 'pm-finserv-clients-signed' | 'pm-finserv-active-clients'
  // Signed Deals & AR
  | 'sd-deals-signed' | 'sd-finserv-clients-signed' | 'sd-outstanding-ar'
  // Profit by Entity
  | 'pe-debt-profit' | 'pe-finserv-profit'
  // Executive Dashboard tiles
  | 'exec-week-selector' | 'exec-deals-by-status';

export const SUB_WIDGET_LABELS: Record<WeeklyRundownSubWidgetId, string> = {
  'rev-debt': 'Debt Revenue',
  'rev-finserv': 'FinServ Revenue',
  'pm-debt-on-board-combined': 'Deals on the Board',
  'pm-debt-signed-combined': 'Deals Signed',
  'pm-debt-closed-combined': 'Deals Closed',
  'pm-finserv-deals-on-board': 'FinServ: Deals on the Board',
  'pm-finserv-clients-signed': 'FinServ Clients Signed',
  'pm-finserv-active-clients': 'FinServ: Active Clients',
  'sd-deals-signed': 'Deals Signed',
  'sd-finserv-clients-signed': 'FinServ Clients Signed',
  'sd-outstanding-ar': 'Outstanding A/R',
  'pe-debt-profit': 'Debt Profit',
  'pe-finserv-profit': 'FinServ Profit',
  'exec-week-selector': 'Executive Week Selector',
  'exec-deals-by-status': 'Deals By Status',
};

export const ALL_SUB_WIDGET_IDS: WeeklyRundownSubWidgetId[] = Object.keys(SUB_WIDGET_LABELS) as WeeklyRundownSubWidgetId[];

interface ManagementSnapshotDashboardProps {
  isEditMode?: boolean;
  onEditCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onDeleteCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
  cardConfigs?: Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>;
  hiddenCards?: EditableManagementSnapshotCardId[];
  hiddenSections?: ManagementSnapshotSectionId[];
  onDeleteSection?: (sectionId: ManagementSnapshotSectionId) => void;
  hiddenSubWidgets?: WeeklyRundownSubWidgetId[];
  onDeleteSubWidget?: (id: WeeklyRundownSubWidgetId) => void;
  gridLayout: GridLayoutItem[];
  onGridLayoutChange: (layout: GridLayoutItem[], immediate?: boolean) => void;
  /** Global dashboard quarter selection */
  selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption;
  onQuarterChange: (value: string) => void;
  quarterOptions: import('@/hooks/useQBQuarterlyRevenue').QuarterOption[];
  /** Additional widget elements (custom widgets) to include in the same grid */
  children?: React.ReactNode;
  /** Slot for the Executive Dashboard, rendered as a draggable/resizable section. */
  executiveSlot?: React.ReactNode;
}

export function ManagementSnapshotDashboard({
  isEditMode = false,
  onEditCard,
  onDeleteCard,
  onTimeWindowChange,
  cardConfigs = {},
  hiddenCards = [],
  gridLayout,
  onGridLayoutChange,
  selectedQuarter,
  onQuarterChange,
  quarterOptions,
  children,
  executiveSlot,
  hiddenSections = [],
  onDeleteSection,
  hiddenSubWidgets = [],
  onDeleteSubWidget,
}: ManagementSnapshotDashboardProps) {
  const { data: qbStatus } = useQuickBooksStatus();
  // Global Weekly Rundown timeframe — overrides per-card window so all
  // widgets reflect the same date range (or live snapshot when 'all').
  const tf = useInsightsTimeframeOptional();
  const globalTimeWindow = (tf?.timeWindow ?? null) as TimeWindow | null;
  const globalCustomRange = tf?.customRange;
  const periodLabel = tf?.timeframe?.label ?? selectedQuarter?.label ?? '';

  // Shared drilldown for top-level KPI tiles that don't have their own modal
  const [kpiDrill, setKpiDrill] = useState<{ label: string } | null>(null);

  const resolveEntityName = (entityFilter?: string) => {
    if (!entityFilter || entityFilter === 'all') return null;
    const conn = qbStatus?.connections?.find(c => c.realmId === entityFilter);
    return conn?.companyName || entityFilter;
  };

  const normalizeVisualization = (value?: string): CardVisualization => {
    if (value === 'kpi') return 'kpi';
    if (value === 'line') return 'line';
    if (value === 'stackedBar') return 'stackedBar';
    return 'bar';
  };

  const resolveVisualization = (config?: ManagementSnapshotEditableConfig): CardVisualization => {
    const datarailsType = (config?.datarailsConfig as { type?: string } | undefined)?.type;
    if (datarailsType) return normalizeVisualization(datarailsType);
    if (config?.type === 'stat') return 'kpi';
    if (config?.chartType === 'line') return 'line';
    return 'bar';
  };

  const getCardProps = (
    cardId: EditableManagementSnapshotCardId,
    fallbackTitle: string,
    fallbackColor: string = 'hsl(var(--primary))',
    fallbackWindow: TimeWindow = 'ytd',
    fallbackSizeVariant: WidgetSizeVariant = 'chart',
  ): GenericDashboardCardProps => {
    const cfg = cardConfigs[cardId];
    const variant = cfg?.sizeVariant || fallbackSizeVariant;
    const effectiveWindow = (globalTimeWindow ?? cfg?.timeWindow ?? fallbackWindow) as TimeWindow;
    return {
      cardId,
      title: cfg?.title || fallbackTitle,
      color: cfg?.color || fallbackColor,
      entityName: resolveEntityName(cfg?.entityFilter),
      visualization: resolveVisualization(cfg),
      timeWindow: effectiveWindow,
      customRange: globalTimeWindow === 'custom' ? globalCustomRange : undefined,
      datarailsConfig: cfg?.datarailsConfig as Partial<WidgetConfig> | undefined,
      entityFilter: cfg?.entityFilter,
      isEditMode,
      sizeVariant: variant,
      kpiTileLayout: cfg?.kpiTileLayout || 'standard',
      footerLabel: cfg?.footerLabel,
      onEditCard,
      onDeleteCard,
      // Per-card window override is disabled while the global selector drives
      // the dashboard. Keep the prop available for non-Insights consumers.
      onTimeWindowChange: globalTimeWindow ? undefined : onTimeWindowChange,
      chartHeight: variant === 'metric' ? 100 : 200,
    };
  };

  const isHidden = (cardId: EditableManagementSnapshotCardId) => hiddenCards.includes(cardId);

  type CardEntry = {
    cardId: EditableManagementSnapshotCardId;
    props: GenericDashboardCardProps;
  };

  const TOTAL_REVENUE_DETAIL_KPI: KPIDetailCardConfig = {
    cardTitle: 'Total Revenue',
    mainValueField: 'f-total-revenue',
    comparisonMode: 'vs Previous Period',
    comparisonSourceField: null,
    breakdownColumns: 2,
    layoutVariant: 'full',
    left: { label: 'Debt Revenue', valueField: 'f-revenue', varianceField: null, entityId: '193514877331929' },
    right: { label: 'FinServ Revenue', valueField: 'f-revenue', varianceField: null, entityId: '9341451968897660' },
  };

  const allCards: CardEntry[] = [
    { cardId: 'total-revenue-detail', props: getCardProps('total-revenue-detail', 'Total Revenue Detail', 'hsl(var(--chart-2))', 'ytd', 'metric') },
    { cardId: 'revenue-by-month',     props: getCardProps('revenue-by-month',     'Revenue by Month',     'hsl(var(--chart-2))', 'ytd', 'chart') },
  ];

  const visibleCards = allCards.filter(c => !isHidden(c.cardId));

  // Per-widget resize/drag rules for the top KPI grid. Keys = card id.
  // Charts get larger minimums than stat tiles so axes/legends stay legible.
  const TOP_GRID_CONSTRAINTS: Record<string, WidgetConstraint> = {
    // KPI tiles: small/medium, draggable + resizable within sane bounds
    'total-revenue-detail':  { minW: 4, minH: 3, maxH: 8 },
    'debt-revenue':          { minW: 3, minH: 3, maxH: 8 },
    'finserv-revenue':       { minW: 3, minH: 3, maxH: 8 },
    'total-revenue':         { minW: 3, minH: 3, maxH: 8 },
    'clients-signed-debt':   { minW: 3, minH: 2, maxH: 6 },
    'clients-signed-finserv':{ minW: 3, minH: 2, maxH: 6 },
    'outstanding-ar':        { minW: 3, minH: 2, maxH: 6 },
    'debt-profit':           { minW: 3, minH: 3, maxH: 8 },
    'finserv-profit':        { minW: 3, minH: 3, maxH: 8 },
    'avg-rev-per-client':    { minW: 3, minH: 2, maxH: 5 },
    // Chart widget: needs more room
    'revenue-by-month':      { minW: 5, minH: 4, maxH: 10 },
  };

  // Per-sub-widget renderers — each becomes an independently
  // draggable/resizable tile in the unified Weekly Rundown grid.
  const subWidgetRenderers: Record<WeeklyRundownSubWidgetId, React.ReactNode> = {
    'rev-debt': <DebtRevenueWidget selectedQuarter={selectedQuarter} />,
    'rev-finserv': <FinServRevenueWidget selectedQuarter={selectedQuarter} />,
    'pm-debt-on-board-combined': <CombinedPipelineMetricWidget cardId="debt-on-board-combined" selectedQuarter={selectedQuarter} />,
    'pm-debt-signed-combined':   <CombinedPipelineMetricWidget cardId="debt-signed-combined"   selectedQuarter={selectedQuarter} />,
    'pm-debt-closed-combined':   <CombinedPipelineMetricWidget cardId="debt-closed-combined"   selectedQuarter={selectedQuarter} />,
    'pm-finserv-deals-on-board': <PipelineMetricWidget cardId="finserv-deals-on-board"  selectedQuarter={selectedQuarter} />,
    'pm-finserv-clients-signed': <PipelineMetricWidget cardId="finserv-clients-signed"  selectedQuarter={selectedQuarter} />,
    'pm-finserv-active-clients': <PipelineMetricWidget cardId="finserv-active-clients"  selectedQuarter={selectedQuarter} />,
    'sd-deals-signed': <DealsSignedWidget selectedQuarter={selectedQuarter} />,
    'sd-finserv-clients-signed': <FinServClientsSignedWidget selectedQuarter={selectedQuarter} />,
    'sd-outstanding-ar': <OutstandingARWidget />,
    'pe-debt-profit': <DebtProfitWidget selectedQuarter={selectedQuarter} />,
    'pe-finserv-profit': <FinServProfitWidget selectedQuarter={selectedQuarter} />,
    // The dedicated Mon→Sun week selector tile has been retired in favour of
    // the unified header timeframe picker. The id remains for backwards
    // compatibility with persisted layouts but renders nothing.
    'exec-week-selector': null,
    'exec-deals-by-status': <ExecDealsByStatusWidget />,
  };

  const SUB_WIDGET_CONSTRAINTS: Record<string, WidgetConstraint> = {
    'rev-debt':    { minW: 4, minH: 4, maxH: 12 },
    'rev-finserv': { minW: 4, minH: 4, maxH: 12 },
    'pm-debt-on-board-combined': { minW: 3, minH: 2, maxH: 5 },
    'pm-debt-signed-combined':   { minW: 3, minH: 2, maxH: 5 },
    'pm-debt-closed-combined':   { minW: 3, minH: 2, maxH: 5 },
    'pm-finserv-deals-on-board': { minW: 3, minH: 2, maxH: 5 },
    'pm-finserv-clients-signed': { minW: 3, minH: 2, maxH: 5 },
    'pm-finserv-active-clients': { minW: 3, minH: 2, maxH: 5 },
    'sd-deals-signed':           { minW: 3, minH: 3, maxH: 16 },
    'sd-finserv-clients-signed': { minW: 3, minH: 3, maxH: 16 },
    'sd-outstanding-ar':         { minW: 3, minH: 4, maxH: 12 },
    'pe-debt-profit':            { minW: 4, minH: 4, maxH: 12 },
    'pe-finserv-profit':         { minW: 4, minH: 4, maxH: 12 },
    'executive-dashboard':       { minW: 8, minH: 8, maxH: 20 },
    'exec-week-selector':           { minW: 3, minH: 2, maxH: 5 },
    'exec-deals-by-status':         { minW: 3, minH: 3, maxH: 16 },
  };

  // The legacy monolithic Executive Dashboard section is removed, as is
  // the Mon→Sun "Executive Week Selector" tile (replaced by the unified
  // header timeframe picker). The "Deals by Status" tile remains as an
  // independently draggable/resizable sub-widget.
  const visibleSubWidgets = ALL_SUB_WIDGET_IDS.filter(
    id => id !== 'exec-week-selector' && !hiddenSubWidgets.includes(id),
  );
  const includeExec = false;

  const UNIFIED_CONSTRAINTS: Record<string, WidgetConstraint> = {
    ...TOP_GRID_CONSTRAINTS,
    ...SUB_WIDGET_CONSTRAINTS,
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <DraggableGridLayout
            layout={gridLayout}
            onLayoutChange={onGridLayoutChange}
            isEditMode={isEditMode}
            rowHeight={60}
            constraints={UNIFIED_CONSTRAINTS}
            className={cn(isEditMode && 'p-2 rounded-xl border-2 border-dashed border-primary/20')}
          >
            {visibleCards.map(({ cardId, props }) => (
              <div key={cardId} className="relative group h-full overflow-hidden">
                {isEditMode && (
                  <div className="widget-drag-handle absolute top-1 left-1/2 -translate-x-1/2 z-20 cursor-grab active:cursor-grabbing flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/70 backdrop-blur border border-border/50 opacity-70 hover:opacity-100 transition-opacity">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Drag</span>
                  </div>
                )}
                {/* Edit & delete chrome */}
                {(onEditCard || (isEditMode && onDeleteCard)) && (
                  <div
                    className="absolute top-1.5 right-1.5 z-30 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    {onEditCard && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit widget"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); onEditCard(cardId); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isEditMode && onDeleteCard && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove widget"
                        className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteCard(cardId); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
                <div className={cn('h-full', isEditMode && 'pointer-events-none')}>
                  {cardId === 'total-revenue-detail' ? (
                    <KPIDetailCard
                      kpiConfig={cardConfigs[cardId]?.kpiDetailConfig ?? TOTAL_REVENUE_DETAIL_KPI}
                      datarailsConfig={props.datarailsConfig}
                      timeWindow={props.timeWindow}
                      entityFilter={props.entityFilter}
                      isEditMode={isEditMode}
                      selectedPeriod={selectedQuarter}
                      onClick={isEditMode ? undefined : () => setKpiDrill({ label: 'Total Revenue' })}
                    />
                  ) : cardId === 'avg-rev-per-client' ? (
                    <AvgRevenuePerClientWidget />
                  ) : cardId === 'revenue-by-month' ? (
                    <RevenueByMonthChart />
                  ) : (
                    <GenericDashboardCard {...props} />
                  )}
                </div>
              </div>
            ))}
            {visibleSubWidgets.map((id) => (
              <div key={id} className="relative group h-full overflow-hidden">
            {isEditMode && (
              <>
                <div className="widget-drag-handle absolute top-1 left-1/2 -translate-x-1/2 z-20 cursor-grab active:cursor-grabbing flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/70 backdrop-blur border border-border/50 opacity-70 hover:opacity-100 transition-opacity">
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Drag</span>
                </div>
                {onDeleteSubWidget && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${SUB_WIDGET_LABELS[id]}`}
                    className="absolute top-1 right-1 z-30 h-7 w-7 bg-background/70 backdrop-blur border border-border/50 hover:bg-destructive/10 hover:text-destructive opacity-80 hover:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onDeleteSubWidget(id); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
            <div className={cn('h-full', isEditMode && 'pointer-events-none')}>
              {subWidgetRenderers[id]}
            </div>
              </div>
            ))}
            {includeExec && (
              <div key="executive-dashboard" className="relative group h-full overflow-auto">
                {isEditMode && (
                  <>
                    <div className="widget-drag-handle absolute top-1 left-1/2 -translate-x-1/2 z-20 cursor-grab active:cursor-grabbing flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/70 backdrop-blur border border-border/50 opacity-70 hover:opacity-100 transition-opacity">
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Drag</span>
                    </div>
                    {onDeleteSection && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove Executive Dashboard"
                        className="absolute top-1 right-1 z-30 h-7 w-7 bg-background/70 backdrop-blur border border-border/50 hover:bg-destructive/10 hover:text-destructive opacity-80 hover:opacity-100"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onDeleteSection('executive-dashboard'); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
                <div className="space-y-4">
                  <div><h2 className="text-lg font-semibold text-foreground">Executive Dashboard</h2></div>
                  {executiveSlot}
                </div>
              </div>
            )}
            {children}
        </DraggableGridLayout>
      </div>
    </div>
  );
}
