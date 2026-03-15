import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  | 'clients-signed-debt'
  | 'clients-signed-finserv'
  | 'outstanding-ar'
  | 'debt-profit'
  | 'finserv-profit';

export type ManagementSnapshotEditableConfig = Pick<
  MetricWidgetConfig,
  'title' | 'color' | 'entityFilter' | 'comparisonPeriod'
> & Partial<Pick<MetricWidgetConfig, 'type' | 'chartType' | 'datarailsConfig'>> & {
  timeWindow?: TimeWindow;
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
        >
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
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
  onEditCard?: (cardId: EditableManagementSnapshotCardId) => void;
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
  onEditCard,
  onTimeWindowChange,
  chartHeight = 200,
}: GenericDashboardCardProps) {
  const { chartData, total, seriesKeys, isLoading } = useDashboardCardData(
    datarailsConfig,
    timeWindow,
    entityFilter,
  );

  const renderEditAction = () => {
    if (!isEditMode || !onEditCard) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onEditCard(cardId)}
        aria-label={`Edit ${title}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {renderEditAction()}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <PeriodBadge cardId={cardId} currentWindow={timeWindow} onTimeWindowChange={onTimeWindowChange} />
          {entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {entityName}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {visualization === 'kpi' ? renderKPI() : (
          <div style={{ height: chartHeight }}>
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
  onTimeWindowChange?: (cardId: EditableManagementSnapshotCardId, window: TimeWindow) => void;
  cardConfigs?: Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>;
}

export function ManagementSnapshotDashboard({
  isEditMode = false,
  onEditCard,
  onTimeWindowChange,
  cardConfigs = {},
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
  ): GenericDashboardCardProps => {
    const cfg = cardConfigs[cardId];
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
      onEditCard,
      onTimeWindowChange,
    };
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GenericDashboardCard
          {...getCardProps('debt-revenue', 'Debt Revenue', 'hsl(var(--primary))', 'ytd')}
        />
        <GenericDashboardCard
          {...getCardProps('finserv-revenue', 'FinServ Revenue', 'hsl(var(--chart-4))', 'ytd')}
        />

        {/* Total Revenue Summary — static for now */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold">—</p>
              <p className="text-muted-foreground text-sm">Configure individual cards via widget editor</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Clients Signed & A/R */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GenericDashboardCard
          {...getCardProps('clients-signed-debt', 'Clients Signed - Debt')}
          chartHeight={180}
        />
        <GenericDashboardCard
          {...getCardProps('clients-signed-finserv', 'Clients Signed - FinServ')}
          chartHeight={180}
        />
        <GenericDashboardCard
          {...getCardProps('outstanding-ar', 'Outstanding A/R')}
          chartHeight={180}
        />
      </div>

      {/* Row 3: Profit & Active Deals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GenericDashboardCard
          {...getCardProps('debt-profit', 'Debt Profit')}
          chartHeight={180}
        />
        <GenericDashboardCard
          {...getCardProps('finserv-profit', 'FinServ Profit', 'hsl(var(--chart-4))')}
          chartHeight={180}
        />
        <NoPermissionCard title="Active Deals" />
      </div>
    </div>
  );
}
