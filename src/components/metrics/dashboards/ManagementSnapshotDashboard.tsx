import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Lock, Pencil, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, LineChart, Bar, XAxis, YAxis, Tooltip, Legend, Line, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow } from '@/components/widget-editor/widgetTypes';
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
    <Card>
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
  | 'clients-signed-debt'
  | 'clients-signed-finserv'
  | 'outstanding-ar'
  | 'debt-profit'
  | 'finserv-profit';

export type WidgetSizeVariant = 'chart' | 'metric';

export type ManagementSnapshotEditableConfig = Pick<
  MetricWidgetConfig,
  'title' | 'color' | 'entityFilter' | 'comparisonPeriod'
> & Partial<Pick<MetricWidgetConfig, 'type' | 'chartType' | 'datarailsConfig'>> & {
  timeWindow?: TimeWindow;
  sizeVariant?: WidgetSizeVariant;
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
  onEditCard,
  onDeleteCard,
  onTimeWindowChange,
  chartHeight = 200,
}: GenericDashboardCardProps) {
  const { chartData, total, seriesKeys, isLoading } = useDashboardCardData(
    datarailsConfig,
    timeWindow,
    entityFilter,
  );

  const renderEditActions = () => {
    if (!isEditMode) return null;
    return (
      <div className="flex items-center gap-1">
        {onEditCard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEditCard(cardId)}
            aria-label={`Edit ${title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDeleteCard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDeleteCard(cardId)}
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

  const renderKPI = () => (
    <div className={`h-[${chartHeight}px] flex flex-col items-center justify-center gap-2`} style={{ height: chartHeight }}>
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-4xl font-bold text-foreground">
            {formatCurrency(total)}
          </p>
          <p className="text-xs text-muted-foreground">{WINDOW_LABEL_MAP[timeWindow] || timeWindow}</p>
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

    if (visualization === 'line') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            {dataKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                name={key}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <XAxis dataKey="period" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Legend />
          {dataKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={visualization === 'stackedBar' ? `${cardId}-stack` : undefined}
              fill={i === 0 ? color : CHART_COLORS[i % CHART_COLORS.length]}
              name={key}
              radius={visualization !== 'stackedBar' ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const handleCardClick = () => {
    if (!isEditMode && onEditCard) {
      onEditCard(cardId);
    }
  };

  return (
    <Card
      className={cn(
        'h-full flex flex-col',
        !isEditMode && onEditCard && 'cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all',
      )}
      onClick={handleCardClick}
    >
      <CardHeader className={cn('pb-2', sizeVariant === 'metric' && 'pb-1 pt-3 px-3')}>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={cn('text-sm font-medium', sizeVariant === 'metric' && 'text-xs')}>{title}</CardTitle>
          {renderEditActions()}
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
interface ManagementSnapshotDashboardProps {
  isEditMode?: boolean;
  onEditCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onDeleteCard?: (cardId: EditableManagementSnapshotCardId) => void;
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
  cardConfigs?: Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>;
  hiddenCards?: EditableManagementSnapshotCardId[];
}

export function ManagementSnapshotDashboard({
  isEditMode = false,
  onEditCard,
  onDeleteCard,
  onTimeWindowChange,
  cardConfigs = {},
  hiddenCards = [],
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
      onEditCard,
      onDeleteCard,
      onTimeWindowChange,
      chartHeight: variant === 'metric' ? 100 : 200,
    };
  };

  const isHidden = (cardId: EditableManagementSnapshotCardId) => hiddenCards.includes(cardId);

  const CHART_H = 4;
  const METRIC_H = 2;

  type CardEntry = {
    cardId: EditableManagementSnapshotCardId;
    props: GenericDashboardCardProps;
  };

  const allCards: CardEntry[] = [
    { cardId: 'debt-revenue', props: getCardProps('debt-revenue', 'Debt Revenue', 'hsl(var(--primary))', 'ytd', 'chart') },
    { cardId: 'finserv-revenue', props: getCardProps('finserv-revenue', 'FinServ Revenue', 'hsl(var(--chart-4))', 'ytd', 'chart') },
    { cardId: 'total-revenue', props: getCardProps('total-revenue', 'Total Revenue', 'hsl(var(--chart-2))', 'ytd', 'chart') },
    { cardId: 'clients-signed-debt', props: getCardProps('clients-signed-debt', 'Clients Signed - Debt', 'hsl(var(--primary))', 'ytd', 'metric') },
    { cardId: 'clients-signed-finserv', props: getCardProps('clients-signed-finserv', 'Clients Signed - FinServ', 'hsl(var(--chart-4))', 'ytd', 'metric') },
    { cardId: 'outstanding-ar', props: getCardProps('outstanding-ar', 'Outstanding A/R', 'hsl(var(--primary))', 'ytd', 'metric') },
    { cardId: 'debt-profit', props: getCardProps('debt-profit', 'Debt Profit', 'hsl(var(--primary))', 'ytd', 'chart') },
    { cardId: 'finserv-profit', props: getCardProps('finserv-profit', 'FinServ Profit', 'hsl(var(--chart-4))', 'ytd', 'chart') },
  ];

  const visibleCards = allCards.filter(c => !isHidden(c.cardId));

  return (
    <div className="grid grid-cols-12 gap-4 auto-rows-[60px]">
      {visibleCards.map(({ props }) => {
        const variant = props.sizeVariant || 'chart';
        const rowSpan = variant === 'metric' ? METRIC_H : CHART_H;
        return (
          <div
            key={props.cardId}
            className={cn(
              variant === 'chart' ? 'col-span-12 md:col-span-6' : 'col-span-6 md:col-span-3',
            )}
            style={{ gridRow: `span ${rowSpan}` }}
          >
            <GenericDashboardCard {...props} />
          </div>
        );
      })}
    </div>
  );
}
