import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Pencil, ChevronDown, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, LineChart, Bar, XAxis, YAxis, Tooltip, Legend, ComposedChart, Line, CartesianGrid } from 'recharts';
import { parse, endOfMonth, endOfQuarter, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters } from 'date-fns';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQBRevenueByWindow } from '@/hooks/useQBWindowData';
import { Button } from '@/components/ui/button';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type TimeWindow } from '@/components/widget-editor/widgetTypes';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

const getWindowRange = (window: TimeWindow): { start: Date; end: Date } | null => {
  const now = new Date();

  switch (window) {
    case 'mtd':
      return { start: startOfMonth(now), end: now };
    case 'lastMonth': {
      const target = subMonths(now, 1);
      return { start: startOfMonth(target), end: endOfMonth(target) };
    }
    case 'qtd':
      return { start: startOfQuarter(now), end: now };
    case 'lastQuarter': {
      const target = subQuarters(now, 1);
      return { start: startOfQuarter(target), end: endOfQuarter(target) };
    }
    case 'ytd':
      return { start: startOfYear(now), end: now };
    case 'lastYear': {
      const year = now.getFullYear() - 1;
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
    }
    case 'ttm':
    case 'last12Months':
      return { start: subMonths(now, 12), end: now };
    case 'last6Months':
      return { start: subMonths(now, 6), end: now };
    case 'last3Months':
      return { start: subMonths(now, 3), end: now };
    case 'all':
    case 'custom':
    default:
      return null;
  }
};

function filterMonthlyRowsByWindow<T extends { month: string }>(rows: T[], window: TimeWindow): T[] {
  const range = getWindowRange(window);
  if (!range) return rows;

  return rows.filter((row) => {
    const monthDate = parse(row.month, 'MMM-yy', new Date());
    if (Number.isNaN(monthDate.getTime())) return false;

    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    return monthEnd >= range.start && monthStart <= range.end;
  });
}

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  planPercent?: string;
  subtitle?: string;
}

function MetricCard({ title, value, change, changeLabel = 'vs Previous Period', planPercent }: MetricCardProps) {
  const isPositive = change && change >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <div className="flex items-center gap-2 mt-1 text-xs">
          {change !== undefined && (
            <span className={isPositive ? 'text-success' : 'text-destructive'}>
              {isPositive ? '+' : ''}{change}% {changeLabel}
            </span>
          )}
          {planPercent && <span className="text-muted-foreground">{planPercent} of Plan</span>}
        </div>
      </CardContent>
    </Card>
  );
}

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
  const { data: metrics, isLoading } = useMetricsData();
  const { data: qbStatus } = useQuickBooksStatus();

  if (isLoading || !metrics) {
    return <div className="animate-pulse space-y-4">Loading...</div>;
  }

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

  const getCardConfig = (
    cardId: EditableManagementSnapshotCardId,
    fallbackTitle: string,
    fallbackColor: string = 'hsl(var(--primary))',
    fallbackWindow: TimeWindow = 'ytd',
  ) => ({
    title: cardConfigs[cardId]?.title || fallbackTitle,
    color: cardConfigs[cardId]?.color || fallbackColor,
    entityName: resolveEntityName(cardConfigs[cardId]?.entityFilter),
    visualization: resolveVisualization(cardConfigs[cardId]),
    timeWindow: (cardConfigs[cardId]?.timeWindow || fallbackWindow) as TimeWindow,
    cardId,
  });

  const renderEditAction = (cardId: EditableManagementSnapshotCardId) => {
    if (!isEditMode || !onEditCard) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onEditCard(cardId)}
        aria-label={`Edit ${cardConfigs[cardId]?.title || cardId}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    );
  };

  const debtRevenueConfig = getCardConfig('debt-revenue', 'Debt Revenue', 'hsl(var(--primary))', 'lastQuarter');
  const finServRevenueConfig = getCardConfig('finserv-revenue', 'FinServ Revenue');
  const clientsSignedDebtConfig = getCardConfig('clients-signed-debt', 'Clients Signed - Debt');
  const clientsSignedFinServConfig = getCardConfig('clients-signed-finserv', 'Clients Signed - FinServ');
  const outstandingARConfig = getCardConfig('outstanding-ar', 'Outstanding A/R');
  const debtProfitConfig = getCardConfig('debt-profit', 'Debt Profit');
  const finServProfitConfig = getCardConfig('finserv-profit', 'FinServ Revenue');

  // Use QB invoices for debt revenue (same source as widget editor)
  const debtRevenueEntityFilter = cardConfigs['debt-revenue']?.entityFilter;
  const { data: qbDebtRevenue, isLoading: qbDebtRevenueLoading } = useQBRevenueByWindow(
    debtRevenueConfig.timeWindow,
    debtRevenueEntityFilter && debtRevenueEntityFilter !== 'all' ? debtRevenueEntityFilter : null,
  );
  const debtRevenueData = (qbDebtRevenue?.periods ?? []).map((row) => ({
    period: row.period,
    closing: row.amount,
    retainer: 0,
    milestone: 0,
  }));
  const debtRevenueTotal = qbDebtRevenue?.total ?? 0;

  const clientsSignedDebtRows = filterMonthlyRowsByWindow(metrics.monthlyData, clientsSignedDebtConfig.timeWindow);
  const clientsSignedDebt = (clientsSignedDebtRows.length > 0 ? clientsSignedDebtRows : metrics.monthlyData.slice(-1)).map((row) => ({
    month: row.month,
    count: row.dealCount,
  }));

  const clientsSignedFinServRows = filterMonthlyRowsByWindow(metrics.monthlyData, clientsSignedFinServConfig.timeWindow);
  const clientsSignedFinServ = (clientsSignedFinServRows.length > 0 ? clientsSignedFinServRows : metrics.monthlyData.slice(-1)).map((row) => ({
    month: row.month,
    count: row.dealCount,
  }));

  const debtProfitRows = filterMonthlyRowsByWindow(metrics.monthlyData, debtProfitConfig.timeWindow);
  const debtProfitData = (debtProfitRows.length > 0 ? debtProfitRows : metrics.monthlyData.slice(-1)).map((row) => {
    const netIncome = row.closedWonValue - row.totalFees;
    const netIncomePercent = row.closedWonValue > 0 ? (netIncome / row.closedWonValue) * 100 : 0;
    return {
      period: row.month,
      netIncome,
      netIncomePercent: Math.round(netIncomePercent * 10) / 10,
    };
  });

  const finServProfitRows = filterMonthlyRowsByWindow(metrics.monthlyData, finServProfitConfig.timeWindow);
  const finservProfitData = (finServProfitRows.length > 0 ? finServProfitRows : metrics.monthlyData.slice(-1)).map((row) => {
    const netIncome = row.closedWonValue - row.totalFees;
    const netIncomePercent = row.closedWonValue > 0 ? (netIncome / row.closedWonValue) * 100 : 0;
    return {
      period: row.month,
      netIncome,
      netIncomePercent: Math.round(netIncomePercent * 10) / 10,
    };
  });

  // Keep static placeholders for cards not yet wired to dynamic sources
  const finservRevenueData = [
    { month: 'Nov-25', revenue: 27000, recurring: 9000 },
    { month: 'Dec-25', revenue: 25000, recurring: 9000 },
    { month: 'Jan-26', revenue: 23000, recurring: 9000 },
  ];

  const arData = [
    { entity: '5th Line Capital Advisors LLC', amount: 80500 },
    { entity: '5th Line Financial Services, LLC', amount: 51680 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Debt Revenue Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{debtRevenueConfig.title}</CardTitle>
              {renderEditAction('debt-revenue')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <PeriodBadge cardId="debt-revenue" currentWindow={debtRevenueConfig.timeWindow} onTimeWindowChange={onTimeWindowChange} />
              {debtRevenueConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {debtRevenueConfig.entityName}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {debtRevenueConfig.visualization === 'kpi' ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</p>
                <p className="text-4xl font-bold text-foreground">
                  {formatCurrency(
                    debtRevenueData.reduce((sum, row) => sum + row.closing + row.milestone + row.retainer, 0)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{WINDOW_LABEL_MAP[debtRevenueConfig.timeWindow] || debtRevenueConfig.timeWindow}</p>
              </div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  {debtRevenueConfig.visualization === 'line' ? (
                    <LineChart data={debtRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="closing" stroke={debtRevenueConfig.color} name="Closing Fees" strokeWidth={2} />
                      <Line type="monotone" dataKey="milestone" stroke="hsl(var(--chart-2))" name="Milestone" strokeWidth={2} />
                      <Line type="monotone" dataKey="retainer" stroke="hsl(var(--chart-3))" name="Retainer" strokeWidth={2} />
                    </LineChart>
                  ) : (
                    <BarChart data={debtRevenueData}>
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar
                        dataKey="closing"
                        stackId={debtRevenueConfig.visualization === 'stackedBar' ? 'debt-revenue-stack' : undefined}
                        fill={debtRevenueConfig.color}
                        name="Closing Fees"
                      />
                      <Bar
                        dataKey="milestone"
                        stackId={debtRevenueConfig.visualization === 'stackedBar' ? 'debt-revenue-stack' : undefined}
                        fill="hsl(var(--chart-2))"
                        name="Milestone"
                      />
                      <Bar
                        dataKey="retainer"
                        stackId={debtRevenueConfig.visualization === 'stackedBar' ? 'debt-revenue-stack' : undefined}
                        fill="hsl(var(--chart-3))"
                        name="Retainer"
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* FinServ Revenue Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{finServRevenueConfig.title}</CardTitle>
              {renderEditAction('finserv-revenue')}
            </div>
            {finServRevenueConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {finServRevenueConfig.entityName}</Badge>}
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finservRevenueData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="revenue" fill={finServRevenueConfig.color} name="Revenue" />
                  <Bar dataKey="recurring" fill="hsl(var(--chart-2))" name="Recurring" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Total Revenue Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold">{formatCurrency(metrics.totalFees || 87500)}</p>
              <p className="text-destructive text-sm">-43% vs Previous Period</p>
              <p className="text-muted-foreground text-sm">of Plan</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Debt Revenue</p>
                <p className="font-semibold">{formatCurrency(53100)}</p>
                <p className="text-destructive text-xs">-55%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">FinServ Revenue</p>
                <p className="font-semibold">{formatCurrency(33400)}</p>
                <p className="text-success text-xs">+52%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Sales Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <MetricCard title="Debt: Deals on Board" value="6" change={-57} planPercent="67%" />
            <MetricCard title="Debt: $ on Board" value="$0" change={-100} planPercent="#DIV/0!" />
            <MetricCard title="Debt: Deals Signed" value="5" change={67} planPercent="72%" />
            <MetricCard title="Debt: $ Signed" value="$0" change={undefined} planPercent="72%" />
            <MetricCard title="FinServ: Deals on Board" value="2" change={100} planPercent="72%" />
            <MetricCard title="FinServ: Clients Signed" value="1" change={-50} planPercent="72%" />
          </div>
        </CardContent>
      </Card>

      {/* Row 3: Clients Signed Charts & A/R */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{clientsSignedDebtConfig.title}</CardTitle>
              {renderEditAction('clients-signed-debt')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <PeriodBadge cardId="clients-signed-debt" currentWindow={clientsSignedDebtConfig.timeWindow} onTimeWindowChange={onTimeWindowChange} />
              {clientsSignedDebtConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {clientsSignedDebtConfig.entityName}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientsSignedDebt}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={clientsSignedDebtConfig.color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{clientsSignedFinServConfig.title}</CardTitle>
              {renderEditAction('clients-signed-finserv')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <PeriodBadge cardId="clients-signed-finserv" currentWindow={clientsSignedFinServConfig.timeWindow} onTimeWindowChange={onTimeWindowChange} />
              {clientsSignedFinServConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {clientsSignedFinServConfig.entityName}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientsSignedFinServ}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={clientsSignedFinServConfig.color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{outstandingARConfig.title}</CardTitle>
              {renderEditAction('outstanding-ar')}
            </div>
            {outstandingARConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {outstandingARConfig.entityName}</Badge>}
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={arData} layout="vertical">
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="entity" type="category" width={150} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill={outstandingARConfig.color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Financial & Active Deals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{debtProfitConfig.title}</CardTitle>
              {renderEditAction('debt-profit')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs">Entity: {debtProfitConfig.entityName || 'All'}</Badge>
              <PeriodBadge cardId="debt-profit" currentWindow={debtProfitConfig.timeWindow} onTimeWindowChange={onTimeWindowChange} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={debtProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="netIncome" fill={debtProfitConfig.color} name="Net Income" />
                  <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium">{finServProfitConfig.title}</CardTitle>
              {renderEditAction('finserv-profit')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <PeriodBadge cardId="finserv-profit" currentWindow={finServProfitConfig.timeWindow} onTimeWindowChange={onTimeWindowChange} />
              {finServProfitConfig.entityName && <Badge variant="secondary" className="w-fit text-xs">Entity: {finServProfitConfig.entityName}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finservProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="netIncome" fill={finServProfitConfig.color} name="Net Income" />
                  <Line yAxisId="right" type="monotone" dataKey="netIncomePercent" stroke="hsl(var(--chart-2))" name="Net Income %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <NoPermissionCard title="Active Deals" />
      </div>
    </div>
  );
}
