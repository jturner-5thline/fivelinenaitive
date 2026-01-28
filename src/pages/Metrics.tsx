import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format, subMonths } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, Percent, Building2, Calendar, Loader2, 
  Plus, Pencil, RotateCcw, Save, FolderOpen, BarChart3, LineChart as LineChartIcon, 
  PieChart as PieChartIcon, AreaChart, Star, ChevronDown, LayoutDashboard
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMetricsData } from "@/hooks/useMetricsData";
import { useMetricsWidgets, MetricWidgetConfig, MetricWidgetSize } from "@/contexts/MetricsWidgetsContext";
import { SortableMetricWidget, StatWidgetContent, ChartWidgetContent } from "@/components/metrics/SortableMetricWidget";
import { MetricWidgetEditor } from "@/components/metrics/MetricWidgetEditor";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ManagementSnapshotDashboard,
  IncomeBoardDashboard,
  SalesBDROIDashboard,
  SalesTeamBoardDashboard,
  WeeklyCashflowDashboard,
  HarvestMonthlyTrackingDashboard,
  SalesCommissionBoardDashboard,
} from "@/components/metrics/dashboards";

// Dashboard options
const DASHBOARD_OPTIONS = [
  { id: 'management-snapshot', name: 'Management Snapshot', isFavorite: true },
  { id: 'pnl', name: 'P&L', isFavorite: false },
  { id: 'cash-flow', name: 'Cash Flow', isFavorite: false },
  { id: 'revenue-customers', name: 'Revenue & Customers', isFavorite: false },
  { id: 'income-board', name: 'Income Board', isFavorite: false },
  { id: 'finserv-pipeline-metrics', name: 'Finserv Pipeline Metrics', isFavorite: false },
  { id: 'controller-dashboard', name: 'Controller Dashboard', isFavorite: false },
  { id: 'sales-team-board', name: 'Sales Team Board', isFavorite: false },
  { id: 'finserv-financial-metrics', name: 'FinServ Financial Metrics', isFavorite: false },
  { id: 'consolidated-debt-pipeline', name: 'Consolidated Debt Pipeline Board', isFavorite: false },
  { id: 'executive-dashboard', name: 'Executive Dashboard', isFavorite: false },
  { id: 'sales-bd-roi', name: 'Sales & BD ROI', isFavorite: false },
  { id: 'weekly-cashflow', name: 'Weekly Cashflow', isFavorite: false },
  { id: 'harvest-monthly-tracking', name: 'Harvest Monthly Tracking', isFavorite: false },
  { id: 'flor-sales-commission', name: 'Flor Sales Commission Board', isFavorite: false },
  { id: 'james-sales-commission', name: 'James Sales Commission Board', isFavorite: false },
  { id: 'niki-sales-commission', name: 'Niki Sales Commission Board', isFavorite: false },
  { id: 'paz-sales-commission', name: 'Paz Sales Commission Board', isFavorite: false },
];

// Generate rolling 12 months labels
const generateMonthLabels = () => {
  const labels = [];
  for (let i = 11; i >= 0; i--) {
    labels.push(format(subMonths(new Date(), i), "MMM-yy"));
  }
  return labels;
};

const monthLabels = generateMonthLabels();

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210, 70%, 50%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 60%, 50%)",
  "hsl(45, 70%, 50%)",
  "hsl(120, 50%, 40%)",
];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value: number) => `${value}%`;

// Chart rendering based on data source
function renderChartContent(
  widget: MetricWidgetConfig,
  metrics: ReturnType<typeof useMetricsData>['data']
) {
  if (!metrics) return null;

  const chartHeight = widget.size === 'small' ? 180 : widget.size === 'medium' ? 240 : 280;

  switch (widget.dataSource) {
    case 'closed-value-12m': {
      const data = metrics.monthlyData.map(d => ({
        month: d.month,
        closedWon: d.closedWonValue,
        fees: d.totalFees,
      }));
      return (
        <ChartWidgetContent title={widget.title} description="Monthly closed-won value and fees earned">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "closedWon" ? "Closed Value" : "Fees"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar yAxisId="left" dataKey="closedWon" fill="hsl(var(--primary))" name="Closed Value" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="fees" stroke="hsl(var(--chart-2))" name="Fees Earned" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'pipeline-by-stage': {
      return (
        <ChartWidgetContent title={widget.title} description="Current deal distribution">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.stageBreakdown.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <YAxis dataKey="stage" type="category" width={100} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="value" fill={widget.color} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'deal-activity-12m': {
      const data = metrics.monthlyData.map(d => ({
        month: d.month,
        dealCount: d.dealCount,
      }));
      return (
        <ChartWidgetContent title={widget.title} description="Number of deals updated per month">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [value, "Deals"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="dealCount" fill={widget.color} name="Deal Activity" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'closed-value-pop': {
      const valueVariance = metrics.currentMonthValue - metrics.previousMonthValue;
      const data = [{ category: "Closed Value", previous: metrics.previousMonthValue, current: metrics.currentMonthValue, variance: valueVariance }];
      const changePercent = metrics.previousMonthValue > 0 ? ((valueVariance / metrics.previousMonthValue) * 100).toFixed(1) : '0';
      return (
        <ChartWidgetContent title={widget.title} description="Current month vs previous month">
          <div style={{ height: chartHeight - 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value)]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name={format(subMonths(new Date(), 1), "MMM-yy")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="current" fill={widget.color} name={format(new Date(), "MMM-yy")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="variance" fill={valueVariance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} name="Variance" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={`text-sm mt-2 ${Number(changePercent) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {Number(changePercent) >= 0 ? '+' : ''}{changePercent}% vs prior month
          </p>
        </ChartWidgetContent>
      );
    }

    case 'fees-pop': {
      const feesVariance = metrics.currentMonthFees - metrics.previousMonthFees;
      const data = [{ category: "Fees Earned", previous: metrics.previousMonthFees, current: metrics.currentMonthFees, variance: feesVariance }];
      const changePercent = metrics.previousMonthFees > 0 ? ((feesVariance / metrics.previousMonthFees) * 100).toFixed(1) : '0';
      return (
        <ChartWidgetContent title={widget.title} description="Current month vs previous month">
          <div style={{ height: chartHeight - 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value)]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name={format(subMonths(new Date(), 1), "MMM-yy")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="current" fill={widget.color} name={format(new Date(), "MMM-yy")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="variance" fill={feesVariance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} name="Variance" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={`text-sm mt-2 ${Number(changePercent) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {Number(changePercent) >= 0 ? '+' : ''}{changePercent}% vs prior month
          </p>
        </ChartWidgetContent>
      );
    }

    case 'ytd-cumulative': {
      return (
        <ChartWidgetContent title={widget.title} description="Year-to-date closed deal value (cumulative)">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics.ytdData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Cumulative Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Area type="monotone" dataKey="closedWonValue" fill={`${widget.color}33`} stroke={widget.color} name="YTD Value" />
                <Line type="monotone" dataKey="closedWonValue" stroke={widget.color} strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qtd-value': {
      return (
        <ChartWidgetContent title={widget.title} description="Quarter-to-date performance">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.quarterlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Closed Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="closedWonValue" fill={widget.color} name="Monthly Closed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'pipeline-by-type': {
      return (
        <ChartWidgetContent title={widget.title} description="Value distribution by deal type">
          <div style={{ height: chartHeight }}>
            {metrics.dealTypeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.dealTypeBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="type"
                    label={({ type, percent }) => `${type} (${percent}%)`}
                    labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  >
                    {metrics.dealTypeBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No deal type data available
              </div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'manager-performance': {
      return (
        <ChartWidgetContent title={widget.title} description="Closed-won value by manager">
          <div style={{ height: chartHeight }}>
            {metrics.managerPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.managerPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="manager" type="category" width={100} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(value: number, name: string, props: any) => [`${formatCurrency(value)} (${props.payload.dealCount} deals)`, "Closed Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="closedWonValue" radius={[0, 4, 4, 0]}>
                    {metrics.managerPerformance.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No manager data available
              </div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'stage-breakdown': {
      return (
        <ChartWidgetContent title={widget.title} description="Deal count and value by current stage">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics.stageBreakdown}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="stage" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number, name: string) => [name === "value" ? formatCurrency(value) : value, name === "value" ? "Pipeline Value" : "Deal Count"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar yAxisId="left" dataKey="value" fill={widget.color} name="Pipeline Value" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" name="Deal Count" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    default:
      return (
        <ChartWidgetContent title={widget.title}>
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Unknown data source: {widget.dataSource}
          </div>
        </ChartWidgetContent>
      );
  }
}

// Stat widget rendering
function renderStatContent(
  widget: MetricWidgetConfig,
  metrics: ReturnType<typeof useMetricsData>['data']
) {
  if (!metrics) return null;

  switch (widget.dataSource) {
    case 'active-pipeline':
      return (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(metrics.totalPipelineValue)}
          subtitle={`${metrics.activeDealsCount} active deals`}
          icon="pipeline"
          color={widget.color}
        />
      );
    case 'closed-won':
      return (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(metrics.totalClosedWonValue)}
          subtitle={`${metrics.closedWonCount} deals closed`}
          icon="trending-up"
          color={widget.color}
        />
      );
    case 'total-fees':
      return (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(metrics.totalFees)}
          subtitle="From closed deals"
          icon="dollar"
          color={widget.color}
        />
      );
    case 'avg-deal-size':
      return (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(metrics.avgDealSize)}
          subtitle="Based on closed deals"
          icon="percent"
          color={widget.color}
        />
      );
    default:
      return (
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Unknown stat: {widget.dataSource}</p>
        </CardContent>
      );
  }
}

export default function Metrics() {
  const [reportingMonth, setReportingMonth] = useState(format(new Date(), "MMM-yy"));
  const { data: metrics, isLoading, error } = useMetricsData();
  const { 
    widgets, 
    addWidget, 
    updateWidget, 
    deleteWidget, 
    reorderWidgets, 
    resetToDefaults,
    presets,
    savePreset,
    loadPreset,
    deletePreset 
  } = useMetricsWidgets();

  const [selectedDashboard, setSelectedDashboard] = useState('management-snapshot');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<MetricWidgetConfig | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  const handleEdit = (widget: MetricWidgetConfig) => {
    setEditingWidget(widget);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditingWidget(undefined);
    setEditorOpen(true);
  };

  const handleSave = (widgetData: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => {
    if (editingWidget) {
      updateWidget(editingWidget.id, widgetData);
      toast({ title: "Widget updated" });
    } else {
      addWidget(widgetData);
      toast({ title: "Widget added" });
    }
  };

  const handleDeleteConfirm = () => {
    if (widgetToDelete) {
      deleteWidget(widgetToDelete);
      toast({ title: "Widget deleted" });
    }
    setDeleteConfirmOpen(false);
    setWidgetToDelete(null);
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      savePreset(presetName.trim());
      toast({ title: "Layout preset saved" });
      setPresetName('');
      setSavePresetOpen(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Deal Metrics | 5thLine</title>
        </Helmet>
        <div className="bg-background">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading metrics...</span>
          </div>
          <div className="grid lg:grid-cols-4 gap-4 mt-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-[200px]" />
            ))}
          </div>
        </div>
      </>
    );
  }

  const statWidgets = widgets.filter(w => w.type === 'stat');
  const chartWidgets = widgets.filter(w => w.type === 'chart');

  return (
    <>
      <Helmet>
        <title>Deal Metrics | 5thLine</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-6 px-4 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                {/* Dashboard Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-6 w-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">
                          {DASHBOARD_OPTIONS.find(d => d.id === selectedDashboard)?.name || 'Dashboard'}
                        </h1>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 bg-popover border border-border shadow-lg z-50">
                    {DASHBOARD_OPTIONS.map((dashboard) => (
                      <DropdownMenuItem
                        key={dashboard.id}
                        onClick={() => setSelectedDashboard(dashboard.id)}
                        className={cn(
                          "flex items-center justify-between py-2",
                          selectedDashboard === dashboard.id && "bg-accent"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          <span>{dashboard.name}</span>
                        </div>
                        <Star 
                          className={cn(
                            "h-4 w-4",
                            dashboard.isFavorite 
                              ? "text-yellow-500 fill-yellow-500" 
                              : "text-muted-foreground/40"
                          )} 
                        />
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="flex items-center gap-2 text-primary">
                      <Plus className="h-4 w-4" />
                      <span>Create New Dashboard</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Badge variant="outline" className="text-sm">
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(new Date(), "MMM, yyyy")}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                Pipeline performance analytics powered by real deal data
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={reportingMonth} onValueChange={setReportingMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthLabels.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Presets
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSavePresetOpen(true)}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Current Layout
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={resetToDefaults}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default
                  </DropdownMenuItem>
                  {presets.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {presets.map((preset) => (
                        <DropdownMenuItem key={preset.id} onClick={() => loadPreset(preset.id)}>
                          {preset.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant={isEditMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {isEditMode ? "Done Editing" : "Edit Layout"}
              </Button>

              {isEditMode && (
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Widget
                </Button>
              )}
            </div>
          </div>

          {/* Dashboard Content */}
          {selectedDashboard === 'management-snapshot' && <ManagementSnapshotDashboard />}
          {selectedDashboard === 'income-board' && <IncomeBoardDashboard />}
          {selectedDashboard === 'sales-bd-roi' && <SalesBDROIDashboard />}
          {selectedDashboard === 'sales-team-board' && <SalesTeamBoardDashboard />}
          {selectedDashboard === 'weekly-cashflow' && <WeeklyCashflowDashboard />}
          {selectedDashboard === 'harvest-monthly-tracking' && <HarvestMonthlyTrackingDashboard />}
          {selectedDashboard === 'flor-sales-commission' && <SalesCommissionBoardDashboard ownerName="Flor" />}
          {selectedDashboard === 'james-sales-commission' && <SalesCommissionBoardDashboard ownerName="James Turner" />}
          {selectedDashboard === 'niki-sales-commission' && <SalesCommissionBoardDashboard ownerName="Niki Heikali" />}
          {selectedDashboard === 'paz-sales-commission' && <SalesCommissionBoardDashboard ownerName="Paz" />}

          {/* Default Widgets Grid for other dashboards */}
          {!['management-snapshot', 'income-board', 'sales-bd-roi', 'sales-team-board', 'weekly-cashflow', 'harvest-monthly-tracking', 'flor-sales-commission', 'james-sales-commission', 'niki-sales-commission', 'paz-sales-commission'].includes(selectedDashboard) && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                {/* Stat Widgets Row */}
                {statWidgets.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {statWidgets.map((widget) => (
                      <SortableMetricWidget
                        key={widget.id}
                        widget={widget}
                        isEditMode={isEditMode}
                        onEdit={() => handleEdit(widget)}
                        onDelete={() => {
                          setWidgetToDelete(widget.id);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        {renderStatContent(widget, metrics)}
                      </SortableMetricWidget>
                    ))}
                  </div>
                )}

                {/* Chart Widgets Grid */}
                {chartWidgets.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
                    {chartWidgets.map((widget) => (
                      <SortableMetricWidget
                        key={widget.id}
                        widget={widget}
                        isEditMode={isEditMode}
                        onEdit={() => handleEdit(widget)}
                        onDelete={() => {
                          setWidgetToDelete(widget.id);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        {renderChartContent(widget, metrics)}
                      </SortableMetricWidget>
                    ))}
                  </div>
                )}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Widget Editor Dialog */}
      <MetricWidgetEditor
        widget={editingWidget}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Widget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this widget? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Preset Dialog */}
      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Layout Preset</DialogTitle>
            <DialogDescription>
              Save your current widget configuration as a reusable preset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavePresetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
