import { useState, useRef, useCallback, useMemo } from 'react';
import { AvgRevenuePerClientWidget } from '@/components/metrics/AvgRevenuePerClientWidget';
import { RevenueQuarterlySection } from './RevenueOverviewDashboard';
import { PipelineMetricsSection } from './PipelineMetricsSection';
import { SignedDealsAndARSection } from './SignedDealsAndARSection';
import { ProfitByEntitySection } from './ProfitByEntitySection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Lock, Pencil, ChevronDown, Loader2, Trash2, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, ReferenceLine, LabelList } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { Button } from '@/components/ui/button';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow, type KPIDetailCardConfig, type NegativeStylingConfig, DEFAULT_KPI_DETAIL_CARD_CONFIG } from '@/components/widget-editor/widgetTypes';
import { KPIDetailCard } from '@/components/metrics/KPIDetailCard';
import { DraggableGridLayout } from '@/components/metrics/DraggableGridLayout';
import { type GridLayoutItem } from '@/hooks/useGridLayout';
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

interface ManagementSnapshotDashboardProps {
  isEditMode?: boolean;
  onEditCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onDeleteCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
  cardConfigs?: Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>;
  hiddenCards?: EditableManagementSnapshotCardId[];
  gridLayout: GridLayoutItem[];
  onGridLayoutChange: (layout: GridLayoutItem[], immediate?: boolean) => void;
  /** Global dashboard quarter selection */
  selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption;
  onQuarterChange: (value: string) => void;
  quarterOptions: import('@/hooks/useQBQuarterlyRevenue').QuarterOption[];
  /** Additional widget elements (custom widgets) to include in the same grid */
  children?: React.ReactNode;
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
}: ManagementSnapshotDashboardProps) {
  const { data: qbStatus } = useQuickBooksStatus();

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
    return {
      cardId,
      title: cfg?.title || fallbackTitle,
      color: cfg?.color || fallbackColor,
      entityName: resolveEntityName(cfg?.entityFilter),
      visualization: resolveVisualization(cfg),
      timeWindow: (cfg?.timeWindow || fallbackWindow) as TimeWindow,
      datarailsConfig: cfg?.datarailsConfig as Partial<WidgetConfig> | undefined,
      entityFilter: cfg?.entityFilter,
      isEditMode,
      sizeVariant: variant,
      kpiTileLayout: cfg?.kpiTileLayout || 'standard',
      footerLabel: cfg?.footerLabel,
      onEditCard,
      onDeleteCard,
      onTimeWindowChange,
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
  ];

  const visibleCards = allCards.filter(c => !isHidden(c.cardId));

  return (
    <div className="space-y-6">
      <DraggableGridLayout
        layout={gridLayout}
        onLayoutChange={onGridLayoutChange}
        isEditMode={isEditMode}
        rowHeight={60}
        // Edit-mode frame: keep the dashed outline so the editable region is
        // clearly delimited, but drop the tinted fill so the section reads as
        // an open transparent area rather than a boxed-in surface.
        className={cn(isEditMode && 'p-2 rounded-xl border-2 border-dashed border-primary/20')}
      >
        {visibleCards.map(({ cardId, props }) => (
          <div key={cardId} className="relative group">
            {/* Pencil edit button for all cards */}
            {onEditCard && (
              <div className="absolute top-1.5 right-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); onEditCard(cardId); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {cardId === 'total-revenue-detail' ? (
              <KPIDetailCard
                kpiConfig={cardConfigs[cardId]?.kpiDetailConfig ?? TOTAL_REVENUE_DETAIL_KPI}
                datarailsConfig={props.datarailsConfig}
                timeWindow={props.timeWindow}
                entityFilter={props.entityFilter}
                isEditMode={isEditMode}
                selectedPeriod={selectedQuarter}
              />
            ) : cardId === 'avg-rev-per-client' ? (
              <AvgRevenuePerClientWidget />
            ) : (
              <GenericDashboardCard {...props} />
            )}
          </div>
        ))}
        {children}
      </DraggableGridLayout>

      {/* Revenue Quarterly Section */}
      <RevenueQuarterlySection selectedQuarter={selectedQuarter} />

      {/* Pipeline Metrics Section */}
      <PipelineMetricsSection selectedQuarter={selectedQuarter} />

      {/* Signed Deals & AR Section */}
      <SignedDealsAndARSection selectedQuarter={selectedQuarter} />

      {/* Profit by Entity Section */}
      <ProfitByEntitySection selectedQuarter={selectedQuarter} />
    </div>
  );
}
