import { Helmet } from "react-helmet-async";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { type QuarterOption } from "@/hooks/useQBQuarterlyRevenue";
import { format, subMonths, subDays, parseISO } from "date-fns";
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
  PieChart as PieChartIcon, AreaChart, Star, ChevronDown, ChevronRight, LayoutDashboard, Download,
  Folder, FolderPlus, MoreHorizontal, Trash2 as TrashIcon
} from "lucide-react";
import { Sparkles } from "lucide-react";
import { RepPerformanceModelGrid } from "@/components/metrics/rep-model/RepPerformanceModelGrid";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { DraggableGridLayout } from "@/components/metrics/DraggableGridLayout";
import { InsightsTimeframePicker } from "@/components/metrics/InsightsTimeframePicker";
import { InsightsTimeframeProvider, useInsightsTimeframe } from "@/contexts/InsightsTimeframeContext";
import { StickyDashboardHeader } from "@/components/layout/StickyDashboardHeader";
import { EditableDashboardWrapper } from "@/components/metrics/EditableDashboardWrapper";
import { QuarterlyRevenueGrowthCard } from "@/components/insights/QuarterlyRevenueGrowthCard";
import { IncomeYTDCard } from "@/components/insights/IncomeYTDCard";
import { ClientCountMoMCard } from "@/components/insights/ClientCountMoMCard";
import { FinServTopCustomersCard } from "@/components/insights/FinServTopCustomersCard";
import { IncomeYTDMoMVarianceCard } from "@/components/insights/IncomeYTDMoMVarianceCard";
import { IncomeMoMCard } from "@/components/insights/IncomeMoMCard";
import { IncomeTop5CustomersMoMCard } from "@/components/insights/IncomeTop5CustomersMoMCard";
import { TotalIncomeRolling12MoCard } from "@/components/insights/TotalIncomeRolling12MoCard";
import { IncomeYTDByEntityCard } from "@/components/insights/IncomeYTDByEntityCard";
import { YTDIncomeBreakdownByEntityCard } from "@/components/insights/YTDIncomeBreakdownByEntityCard";
import { IncomeYTDChangeByEntityCard } from "@/components/insights/IncomeYTDChangeByEntityCard";
import { FinServTTMTop5CustomersCard } from "@/components/insights/FinServTTMTop5CustomersCard";
import { IncomeVsCOGSRolling12MoCard } from "@/components/insights/IncomeVsCOGSRolling12MoCard";
import { RevenueQuarterlySection } from "@/components/metrics/dashboards";
import { RevenueCustomersDashboard } from "@/components/insights/revenue-customers/RevenueCustomersDashboard";
import { GridWidgetCard } from "@/components/metrics/GridWidgetCard";
import { useGridLayout, generateDefaultLayout } from "@/hooks/useGridLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { useMetricsWidgets, MetricWidgetConfig, MetricWidgetSize, MetricChartType } from "@/contexts/MetricsWidgetsContext";
import { SortableMetricWidget, StatWidgetContent, ChartWidgetContent } from "@/components/metrics/SortableMetricWidget";
import { DatarailsWidgetEditor } from "@/components/widget-editor/DatarailsWidgetEditor";
import { DEFAULT_WIDGET_CONFIG, WidgetConfig as DatarailsWidgetConfig } from "@/components/widget-editor/widgetTypes";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompanyDashboardConfig } from "@/hooks/useCompanyDashboardConfig";
import { useMetricsEditPermission } from "@/hooks/useMetricsEditPermission";
import { useDashboardFolders } from "@/contexts/DashboardFoldersContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  WaterfallChart,
  GaugeChart,
  BulletChart,
  TreemapChart,
  FunnelChart,
  RadarChart,
  HeatmapCalendar,
  ForecastTrendline,
  ThresholdAlertBadge,
  ChartExport,
} from "@/components/metrics/charts";
import {
  ManagementSnapshotDashboard,
  type EditableManagementSnapshotCardId,
  type ManagementSnapshotEditableConfig,
  SUB_WIDGET_LABELS,
  SalesBDROIDashboard,
  SalesTeamBoardDashboard,
  ConsolidatedDebtPipelineDashboard,
  ControllerDashboard,
  ExecutiveDashboard,
  FinServFinancialMetricsDashboard,
  QuickBooksFinancialDashboard,
  ManagementReviewCarousel,
} from "@/components/metrics/dashboards";
import { WeeklyRundownCarousel } from "@/components/metrics/dashboards/WeeklyRundownCarousel";
import { useQuickBooksMetrics } from "@/hooks/useQuickBooksMetrics";
import { useHubSpotMetrics } from "@/hooks/useHubSpotMetrics";
import { useCustomMetrics } from "@/hooks/useCustomMetrics";
import { evaluateFormula, FormulaContext } from "@/lib/customMetricEngine";
import { SyncStatusBar } from "@/components/metrics/SyncStatusBar";
import { getTimePeriodRange, getTimePeriodLabel, isInRange } from "@/lib/timePeriodUtils";
import { DatarailsLiveStat, DatarailsLiveChart } from "@/components/metrics/DatarailsLiveWidget";
import { InsightsLoadingSkeleton, InsightsErrorState } from "@/components/insights/InsightsStateViews";
import { InsightsAssistantSheet } from "@/components/insights/InsightsAssistantSheet";
import { ReportingPeriodPicker, ActivePeriodLabel } from "@/components/insights/ReportingPeriodPicker";
import { CoverPreviewDialog } from "@/components/insights/CoverPreviewDialog";
import { useInsightsComparison } from "@/hooks/useInsightsComparison";
import { exportInsightsCsv, exportInsightsPdf, type InsightsExportContext } from "@/utils/insightsExport";
import { FileSpreadsheet, FileText } from "lucide-react";
// Dashboard options
const DASHBOARD_OPTIONS = [
  { id: 'management-snapshot', name: 'Weekly Rundown', isFavorite: true, folder: 'management-insights' as const },
  { id: 'revenue-customers', name: 'Revenue & Customers', isFavorite: false, folder: 'financial' as const },
  { id: 'controller-dashboard', name: 'Controller Dashboard', isFavorite: false, folder: 'financial' as const },
  { id: 'sales-team-board', name: 'Sales Team Board', isFavorite: false, folder: 'sales-bd' as const },
  { id: 'finserv-financial-metrics', name: 'FinServ Financial Metrics', isFavorite: false, folder: null },
  { id: 'consolidated-debt-pipeline', name: 'Consolidated Debt Pipeline Board', isFavorite: false, folder: 'sales-bd' as const },
  { id: 'sales-bd-roi', name: 'Sales & BD ROI', isFavorite: false, folder: 'sales-bd' as const },
  { id: 'quickbooks-financial', name: 'QuickBooks Financial', isFavorite: false, folder: 'financial' as const },
  { id: 'management-review', name: 'Insights Dashboard', isFavorite: false, folder: 'management-insights' as const },
];

/**
 * Code-defined ("default") folder groups for the Insights dashboard selector.
 * Render order is fixed and dashboards inside each folder are rendered in the
 * order listed here. Membership matches the `folder` field on DASHBOARD_OPTIONS.
 * Per-folder expand/collapse state is persisted in localStorage (default: open).
 */
const DEFAULT_FOLDER_GROUPS: { id: string; name: string; dashboardIds: string[] }[] = [
  {
    id: 'management-insights',
    name: 'Management Insights',
    dashboardIds: ['management-snapshot', 'management-review'],
  },
  {
    id: 'financial',
    name: 'Financial',
    dashboardIds: ['revenue-customers', 'controller-dashboard', 'quickbooks-financial'],
  },
  {
    id: 'sales-bd',
    name: 'Sales & BD',
    dashboardIds: ['sales-team-board', 'sales-bd-roi', 'consolidated-debt-pipeline'],
  },
];

const DEFAULT_FOLDER_IDS = new Set(
  DEFAULT_FOLDER_GROUPS.flatMap(g => g.dashboardIds)
);

const DEFAULT_FOLDER_EXPANDED_STORAGE_KEY = 'insights-default-folder-expanded-v1';

type ManagementSnapshotCardState = Omit<MetricWidgetConfig, 'id' | 'createdAt'>;

const MANAGEMENT_SNAPSHOT_STORAGE_KEY = 'management-snapshot-editable-cards-v1';

const MANAGEMENT_SNAPSHOT_CARD_DEFAULTS: Record<EditableManagementSnapshotCardId, ManagementSnapshotCardState> = {
  'debt-revenue': {
    title: 'Debt Revenue',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'closed-value-12m',
    size: 'medium',
    color: 'hsl(var(--primary))',
  },
  'finserv-revenue': {
    title: 'FinServ Revenue',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'fees-pop',
    size: 'medium',
    color: 'hsl(var(--chart-4))',
  },
  'total-revenue': {
    title: 'Total Revenue',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'closed-value-12m',
    size: 'medium',
    color: 'hsl(var(--chart-2))',
  },
  'total-revenue-detail': {
    title: 'Total Revenue Detail',
    type: 'stat',
    dataSource: 'qb-total-revenue',
    size: 'small',
    color: 'hsl(var(--chart-2))',
  },
  'clients-signed-debt': {
    title: 'Clients Signed - Debt',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'deal-activity-12m',
    size: 'medium',
    color: 'hsl(var(--primary))',
  },
  'clients-signed-finserv': {
    title: 'Clients Signed - FinServ',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'qtd-value',
    size: 'medium',
    color: 'hsl(var(--chart-4))',
  },
  'outstanding-ar': {
    title: 'Outstanding A/R',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'pipeline-by-stage',
    size: 'medium',
    color: 'hsl(var(--primary))',
  },
  'debt-profit': {
    title: 'Debt Profit',
    type: 'chart',
    chartType: 'composed',
    dataSource: 'manager-performance',
    size: 'medium',
    color: 'hsl(var(--primary))',
  },
  'finserv-profit': {
    title: 'FinServ Revenue',
    type: 'chart',
    chartType: 'composed',
    dataSource: 'ytd-cumulative',
    size: 'medium',
    color: 'hsl(var(--chart-4))',
  },
  'avg-rev-per-client': {
    title: 'Avg Revenue per New Client Signed',
    type: 'stat',
    dataSource: 'computed-kpi',
    size: 'small',
    color: 'hsl(var(--chart-3))',
  },
  'revenue-by-month': {
    title: 'Revenue by Month',
    type: 'chart',
    chartType: 'bar',
    dataSource: 'computed-kpi',
    size: 'medium',
    color: 'hsl(var(--chart-2))',
  },
};

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
  metrics: ReturnType<typeof useMetricsData>['data'],
  qbMetrics?: ReturnType<typeof useQuickBooksMetrics>['data'],
  hsMetrics?: ReturnType<typeof useHubSpotMetrics>['data'],
) {
  if (!metrics && !widget.dataSource.startsWith('qb-') && !widget.dataSource.startsWith('hs-') && !widget.dataSource.startsWith('datarails-')) return null;
  if (widget.dataSource.startsWith('qb-') && !qbMetrics) {
    return (
      <ChartWidgetContent title={widget.title}>
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Connect QuickBooks to see this data
        </div>
      </ChartWidgetContent>
    );
  }
  if (widget.dataSource.startsWith('hs-') && !hsMetrics) {
    return (
      <ChartWidgetContent title={widget.title}>
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Connect HubSpot to see this data
        </div>
      </ChartWidgetContent>
    );
  }

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
                <Line yAxisId="right" type="monotone" dataKey="fees" stroke="hsl(var(--chart-2))" name="Fees Earned" strokeWidth={1} dot={{ r: 3 }} />
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
                <Line type="monotone" dataKey="closedWonValue" stroke={widget.color} strokeWidth={1} dot={{ r: 4 }} />
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
                <Line yAxisId="right" type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" name="Deal Count" strokeWidth={1} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'revenue-waterfall': {
      const revenue = metrics.totalClosedWonValue || 500000;
      const fees = metrics.totalFees || 50000;
      const waterfallData = [
        { name: 'Revenue', value: revenue },
        { name: 'Fees', value: fees },
        { name: 'Pipeline', value: metrics.totalPipelineValue || 200000 },
        { name: 'Lost', value: -(metrics.monthlyData.reduce((s, d) => s + d.closedLostValue, 0) || 100000) },
        { name: 'Net', value: revenue + fees + (metrics.totalPipelineValue || 200000) - (metrics.monthlyData.reduce((s, d) => s + d.closedLostValue, 0) || 100000) },
      ];
      return (
        <ChartWidgetContent title={widget.title} description="Revenue breakdown waterfall">
          <WaterfallChart data={waterfallData} height={chartHeight} color={widget.color} />
        </ChartWidgetContent>
      );
    }

    case 'pipeline-gauge': {
      const target = metrics.totalClosedWonValue > 0 ? metrics.totalClosedWonValue * 1.2 : 1000000;
      return (
        <ChartWidgetContent title={widget.title} description="Pipeline health vs target">
          <div className="flex items-center gap-2 mb-2 justify-end">
            <ThresholdAlertBadge
              value={(metrics.totalPipelineValue / target) * 100}
              thresholds={{ warn: 50, critical: 80, direction: 'above' }}
            />
          </div>
          <GaugeChart
            value={metrics.totalPipelineValue}
            max={target}
            target={target}
            label="Pipeline Value"
            height={chartHeight}
          />
        </ChartWidgetContent>
      );
    }

    case 'kpi-bullet': {
      const closedTarget = metrics.totalClosedWonValue > 0 ? metrics.totalClosedWonValue * 1.1 : 500000;
      const feeTarget = metrics.totalFees > 0 ? metrics.totalFees * 1.1 : 50000;
      return (
        <ChartWidgetContent title={widget.title} description="KPIs vs targets">
          <div className="space-y-6 py-2">
            <BulletChart
              actual={metrics.totalClosedWonValue}
              target={closedTarget}
              ranges={[closedTarget * 0.5, closedTarget * 0.8, closedTarget * 1.2]}
              label="Closed Won Value"
              formatValue={(v) => `$${(v / 1000000).toFixed(1)}M`}
            />
            <BulletChart
              actual={metrics.totalFees}
              target={feeTarget}
              ranges={[feeTarget * 0.5, feeTarget * 0.8, feeTarget * 1.2]}
              label="Total Fees"
              formatValue={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <BulletChart
              actual={metrics.activeDealsCount}
              target={Math.max(metrics.activeDealsCount * 1.2, 20)}
              ranges={[5, 15, Math.max(metrics.activeDealsCount * 1.5, 30)]}
              label="Active Deals"
              formatValue={(v) => `${v}`}
            />
          </div>
        </ChartWidgetContent>
      );
    }

    case 'pipeline-treemap': {
      const treemapData = metrics.stageBreakdown.map(s => ({
        name: s.stage,
        size: s.value,
      }));
      return (
        <ChartWidgetContent title={widget.title} description="Pipeline value by stage (proportional)">
          <TreemapChart data={treemapData} height={chartHeight} />
        </ChartWidgetContent>
      );
    }

    case 'conversion-funnel': {
      const stages = metrics.stageBreakdown.sort((a, b) => b.value - a.value);
      const funnelData = stages.slice(0, 6).map(s => ({
        name: s.stage,
        value: s.value,
        count: s.count,
      }));
      return (
        <ChartWidgetContent title={widget.title} description="Pipeline conversion funnel">
          <FunnelChart data={funnelData} height={chartHeight} />
        </ChartWidgetContent>
      );
    }

    case 'performance-radar': {
      const maxPipeline = Math.max(metrics.totalPipelineValue, 1);
      const maxClosed = Math.max(metrics.totalClosedWonValue, 1);
      const radarData = [
        { subject: 'Pipeline', current: (metrics.totalPipelineValue / maxPipeline) * 100, benchmark: 70 },
        { subject: 'Win Rate', current: metrics.closedWonCount > 0 ? Math.min((metrics.closedWonCount / Math.max(metrics.activeDealsCount + metrics.closedWonCount, 1)) * 100, 100) : 30, benchmark: 50 },
        { subject: 'Avg Size', current: Math.min((metrics.avgDealSize / (maxClosed / Math.max(metrics.closedWonCount, 1))) * 50, 100), benchmark: 60 },
        { subject: 'Velocity', current: Math.min(metrics.monthlyData.filter(m => m.dealCount > 0).length / 12 * 100, 100), benchmark: 65 },
        { subject: 'Fees', current: metrics.totalFees > 0 ? Math.min((metrics.totalFees / maxClosed) * 200, 100) : 20, benchmark: 40 },
        { subject: 'Activity', current: Math.min(metrics.monthlyData.reduce((s, d) => s + d.dealCount, 0) / 12 * 10, 100), benchmark: 55 },
      ];
      return (
        <ChartWidgetContent title={widget.title} description="Multi-dimensional performance">
          <RadarChart
            data={radarData}
            dataKeys={[
              { key: 'current', color: 'hsl(var(--primary))', name: 'Current' },
              { key: 'benchmark', color: 'hsl(var(--muted-foreground))', name: 'Benchmark' },
            ]}
            height={chartHeight}
          />
        </ChartWidgetContent>
      );
    }

    case 'activity-heatmap': {
      // Generate heatmap from monthly data approximation
      const heatmapData: Record<string, number> = {};
      const now = new Date();
      metrics.monthlyData.forEach((m) => {
        const avgPerDay = m.dealCount / 30;
        for (let d = 0; d < 30; d++) {
          const date = format(subDays(now, Math.floor(Math.random() * 365)), 'yyyy-MM-dd');
          heatmapData[date] = (heatmapData[date] || 0) + Math.round(avgPerDay + Math.random() * 2);
        }
      });
      return (
        <ChartWidgetContent title={widget.title} description="Deal activity over the past year">
          <HeatmapCalendar data={heatmapData} height={chartHeight} />
        </ChartWidgetContent>
      );
    }

    case 'revenue-forecast': {
      const forecastData = metrics.monthlyData.map((m, i) => ({
        month: m.month,
        actual: m.closedWonValue,
        forecast: undefined as number | undefined,
        upper: undefined as number | undefined,
        lower: undefined as number | undefined,
      }));
      // Add 3 months of forecast
      const avgMonthly = metrics.monthlyData.reduce((s, d) => s + d.closedWonValue, 0) / 12;
      const trend = metrics.monthlyData.length >= 2
        ? (metrics.monthlyData[11].closedWonValue - metrics.monthlyData[0].closedWonValue) / 11
        : 0;
      for (let i = 1; i <= 3; i++) {
        const projected = avgMonthly + trend * i;
        forecastData.push({
          month: format(subMonths(new Date(), -i), 'MMM-yy'),
          actual: undefined as any,
          forecast: Math.max(projected, 0),
          upper: Math.max(projected * 1.3, 0),
          lower: Math.max(projected * 0.7, 0),
        });
      }
      // Fill forecast start point
      if (forecastData.length > 12) {
        forecastData[11].forecast = forecastData[11].actual;
      }
      return (
        <ChartWidgetContent title={widget.title} description="Revenue forecast with confidence band">
          <ForecastTrendline data={forecastData} height={chartHeight} color={widget.color} />
        </ChartWidgetContent>
      );
    }

    // QuickBooks chart widgets
    case 'qb-revenue-trend': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Rolling 12 months from QuickBooks">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={qbMetrics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="payments" stroke="hsl(var(--chart-2))" name="Payments" strokeWidth={1} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-ar-aging': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Outstanding balances by aging bucket">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qbMetrics.arAgingData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Outstanding"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="value" fill={widget.color} radius={[4, 4, 0, 0]}>
                  {qbMetrics.arAgingData.map((_, index) => (
                    <Cell key={index} fill={index <= 1 ? "hsl(var(--primary))" : index <= 2 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-top-customers': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Based on invoice totals">
          <div style={{ height: chartHeight }}>
            {qbMetrics.topCustomers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qbMetrics.topCustomers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="revenue" fill={widget.color} radius={[0, 4, 4, 0]}>
                    {qbMetrics.topCustomers.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No customer data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-invoice-status': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Distribution by status">
          <div style={{ height: chartHeight }}>
            {qbMetrics.invoiceStatusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={qbMetrics.invoiceStatusBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="status" label={({ status, count }) => `${status} (${count})`} labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}>
                    {qbMetrics.invoiceStatusBreakdown.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No invoice data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-payment-methods': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Payments by method">
          <div style={{ height: chartHeight }}>
            {qbMetrics.paymentMethodsBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={qbMetrics.paymentMethodsBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="method" label={({ method, count }) => `${method} (${count})`} labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}>
                    {qbMetrics.paymentMethodsBreakdown.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No payment data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-revenue-vs-payments': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Monthly revenue vs payments collected">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qbMetrics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Invoiced" radius={[4, 4, 0, 0]} />
                <Bar dataKey="payments" fill="hsl(var(--chart-2))" name="Collected" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    // New QB charts
    case 'qb-ap-aging': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Outstanding payables by aging bucket">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qbMetrics.apAgingData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Outstanding"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="value" fill={widget.color} radius={[4, 4, 0, 0]}>
                  {qbMetrics.apAgingData.map((_, index) => (
                    <Cell key={index} fill={index <= 1 ? "hsl(var(--primary))" : index <= 2 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-top-vendors': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="By total spend (expenses + bills)">
          <div style={{ height: chartHeight }}>
            {qbMetrics.topVendors.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qbMetrics.topVendors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Spend"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="spend" fill={widget.color} radius={[0, 4, 4, 0]}>
                    {qbMetrics.topVendors.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No vendor data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-expense-by-category': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Top expense categories">
          <div style={{ height: chartHeight }}>
            {qbMetrics.expenseByCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qbMetrics.expenseByCategoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="category" type="category" width={120} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="amount" fill={widget.color} radius={[0, 4, 4, 0]}>
                    {qbMetrics.expenseByCategoryData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No expense data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'qb-revenue-vs-expenses': {
      if (!qbMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Monthly revenue vs expenses">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={qbMetrics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Expenses" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="payments" stroke="hsl(var(--chart-2))" name="Payments" strokeWidth={1} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    // HubSpot chart widgets
    case 'hs-pipeline-by-stage': {
      if (!hsMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="HubSpot deals by stage">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hsMetrics.pipelineByStage.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <YAxis dataKey="stage" type="category" width={100} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="value" fill={widget.color} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'hs-deals-by-owner': {
      if (!hsMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Deal value by owner/manager">
          <div style={{ height: chartHeight }}>
            {hsMetrics.dealsByOwner.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hsMetrics.dealsByOwner} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="owner" type="category" width={100} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number, _: string, props: any) => [`${formatCurrency(v)} (${props.payload.count} deals)`, "Value"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="value" fill={widget.color} radius={[0, 4, 4, 0]}>
                    {hsMetrics.dealsByOwner.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No owner data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    case 'hs-deal-value-trend': {
      if (!hsMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Rolling 12 months deal creation">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hsMetrics.dealValueTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [name === 'value' ? formatCurrency(v) : v, name === 'value' ? 'Deal Value' : 'Deal Count']} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar yAxisId="left" dataKey="value" fill={widget.color} name="Deal Value" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" name="Deal Count" strokeWidth={1} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWidgetContent>
      );
    }

    case 'hs-contacts-by-source': {
      if (!hsMetrics) return null;
      return (
        <ChartWidgetContent title={widget.title} description="Deal distribution by type">
          <div style={{ height: chartHeight }}>
            {hsMetrics.contactsBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={hsMetrics.contactsBySource} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="count" nameKey="source" label={({ source, count }) => `${source} (${count})`} labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}>
                    {hsMetrics.contactsBySource.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No source data</div>
            )}
          </div>
        </ChartWidgetContent>
      );
    }

    default: {
      // Datarails custom widgets - use live data
      if (widget.dataSource.startsWith('datarails-') && widget.datarailsConfig) {
        return <DatarailsLiveChart widget={widget} />;
      }

      return (
        <ChartWidgetContent title={widget.title}>
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Unknown data source: {widget.dataSource}
          </div>
        </ChartWidgetContent>
      );
    }
  }
}

// Helper: compute deal metrics filtered by time period
function computeFilteredDealMetrics(range: { start: Date; end: Date } | null, rawDeals?: any[]) {
  if (!range || !rawDeals?.length) return null;
  const filtered = rawDeals.filter(d => isInRange(d.updated_at, range));
  const active = filtered.filter(d => d.status !== 'archived');
  const closedWon = filtered.filter(d => d.status === 'archived' && d.stage === 'closed-won');
  const totalPipelineValue = active.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
  const totalClosedWonValue = closedWon.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
  const totalFees = closedWon.reduce((s: number, d: any) => s + Number(d.total_fee || 0), 0);
  const avgDealSize = closedWon.length > 0 ? totalClosedWonValue / closedWon.length : 0;
  return { totalPipelineValue, totalClosedWonValue, totalFees, avgDealSize, activeDealsCount: active.length, closedWonCount: closedWon.length };
}

// Helper: compute QB metrics filtered by time period
function computeFilteredQbMetrics(range: { start: Date; end: Date } | null, rawInvoices?: any[], rawPayments?: any[], rawExpenses?: any[]) {
  if (!range) return null;
  const invoices = (rawInvoices || []).filter((inv: any) => isInRange(inv.txn_date, range));
  const payments = (rawPayments || []).filter((p: any) => isInRange(p.txn_date, range));
  const expenses = (rawExpenses || []).filter((e: any) => isInRange(e.txn_date, range));
  const totalRevenue = invoices.reduce((s: number, inv: any) => s + (inv.total_amt || 0), 0);
  const totalAR = invoices.reduce((s: number, inv: any) => s + (inv.balance || 0), 0);
  const totalPayments = payments.reduce((s: number, p: any) => s + (p.total_amt || 0), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.total_amt || 0), 0);
  const now = new Date();
  const overdueInvoices = invoices.filter((inv: any) => inv.due_date && inv.balance > 0 && new Date(inv.due_date) < now);
  const overdueAmount = overdueInvoices.reduce((s: number, inv: any) => s + (inv.balance || 0), 0);
  const collectionRate = totalRevenue > 0 ? ((totalRevenue - totalAR) / totalRevenue) * 100 : 0;
  const netIncome = totalRevenue - totalExpenses;
  return { totalRevenue, totalAR, totalPayments, totalExpenses, overdueAmount, overdueCount: overdueInvoices.length, collectionRate, netIncome, totalInvoices: invoices.length };
}


interface RawDataForTimePeriod {
  rawDeals?: any[];
  rawInvoices?: any[];
  rawPayments?: any[];
  rawExpenses?: any[];
}

function renderStatContent(
  widget: MetricWidgetConfig,
  metrics: ReturnType<typeof useMetricsData>['data'],
  qbMetrics?: ReturnType<typeof useQuickBooksMetrics>['data'],
  hsMetrics?: ReturnType<typeof useHubSpotMetrics>['data'],
  customMetricDefs?: ReturnType<typeof useCustomMetrics>['metrics'],
  allWidgets?: MetricWidgetConfig[],
  rawData?: RawDataForTimePeriod,
) {
  if (!metrics && !widget.dataSource.startsWith('qb-') && !widget.dataSource.startsWith('hs-') && !widget.dataSource.startsWith('custom-') && !widget.dataSource.startsWith('xs-') && !widget.dataSource.startsWith('datarails-')) return null;

  // Time period filtering
  const range = getTimePeriodRange(widget.timePeriod);
  const periodLabel = getTimePeriodLabel(widget.timePeriod);

  // Compute time-period-filtered values
  const fd = computeFilteredDealMetrics(range, rawData?.rawDeals);
  const fq = computeFilteredQbMetrics(range, rawData?.rawInvoices, rawData?.rawPayments, rawData?.rawExpenses);

  // Handle custom calculated metrics
  if (widget.dataSource.startsWith('custom-')) {
    const metricId = widget.dataSource.replace('custom-', '');
    const metricDef = customMetricDefs?.find(m => m.id === metricId);
    if (!metricDef) {
      return (
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Custom metric not found</p>
        </CardContent>
      );
    }

    // Build evaluation context from live data
    const sourceValues: Record<string, number> = {};
    if (metrics) {
      sourceValues['active-pipeline'] = metrics.totalPipelineValue;
      sourceValues['closed-won'] = metrics.totalClosedWonValue;
      sourceValues['total-fees'] = metrics.totalFees;
      sourceValues['avg-deal-size'] = metrics.avgDealSize;
    }
    if (qbMetrics) {
      sourceValues['qb-total-revenue'] = qbMetrics.totalRevenue;
      sourceValues['qb-accounts-receivable'] = qbMetrics.totalAR;
      sourceValues['qb-total-payments'] = qbMetrics.totalPayments;
      sourceValues['qb-active-customers'] = qbMetrics.activeCustomers;
      sourceValues['qb-collection-rate'] = qbMetrics.collectionRate;
      sourceValues['qb-overdue-amount'] = qbMetrics.overdueAmount;
    }

    // Resolve widget references
    const widgetValues: Record<string, number> = {};
    allWidgets?.forEach(w => {
      if (w.type === 'stat' && !w.dataSource.startsWith('custom-')) {
        const val = sourceValues[w.dataSource];
        if (val !== undefined) widgetValues[w.id] = val;
      }
    });

    const ctx: FormulaContext = { sources: sourceValues, widgets: widgetValues };
    let result = 0;
    try {
      result = evaluateFormula(metricDef.formula, ctx);
    } catch {
      result = 0;
    }

    let formattedValue: string;
    switch (metricDef.result_type) {
      case 'currency':
        formattedValue = formatCurrency(result);
        break;
      case 'percentage':
        formattedValue = `${result.toFixed(1)}%`;
        break;
      default:
        formattedValue = result >= 1000 ? `${(result / 1000).toFixed(1)}k` : result.toFixed(1);
    }

    return (
      <StatWidgetContent
        title={widget.title}
        value={formattedValue}
        subtitle={metricDef.description || 'Custom calculated metric'}
        icon="percent"
        color={widget.color}
      />
    );
  }

  // Use filtered data if time period is set, otherwise use pre-aggregated
  const dealData = fd || (metrics ? { totalPipelineValue: metrics.totalPipelineValue, totalClosedWonValue: metrics.totalClosedWonValue, totalFees: metrics.totalFees, avgDealSize: metrics.avgDealSize, activeDealsCount: metrics.activeDealsCount, closedWonCount: metrics.closedWonCount } : null);
  const qbData = fq || (qbMetrics ? { totalRevenue: qbMetrics.totalRevenue, totalAR: qbMetrics.totalAR, totalPayments: qbMetrics.totalPayments, totalExpenses: qbMetrics.totalExpenses, overdueAmount: qbMetrics.overdueAmount, overdueCount: qbMetrics.overdueCount, collectionRate: qbMetrics.collectionRate, netIncome: qbMetrics.netIncome, totalInvoices: qbMetrics.totalInvoices } : null);
  const periodSuffix = periodLabel ? ` (${periodLabel})` : '';

  switch (widget.dataSource) {
    case 'active-pipeline':
      return dealData ? (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(dealData.totalPipelineValue)}
          subtitle={`${dealData.activeDealsCount} active deals${periodSuffix}`}
          icon="pipeline"
          color={widget.color}
        />
      ) : null;
    case 'closed-won':
      return dealData ? (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(dealData.totalClosedWonValue)}
          subtitle={`${dealData.closedWonCount} deals closed${periodSuffix}`}
          icon="trending-up"
          color={widget.color}
        />
      ) : null;
    case 'total-fees':
      return dealData ? (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(dealData.totalFees)}
          subtitle={`From closed deals${periodSuffix}`}
          icon="dollar"
          color={widget.color}
        />
      ) : null;
    case 'avg-deal-size':
      return dealData ? (
        <StatWidgetContent
          title={widget.title}
          value={formatCurrency(dealData.avgDealSize)}
          subtitle={`Based on closed deals${periodSuffix}`}
          icon="percent"
          color={widget.color}
        />
      ) : null;
    // QuickBooks stat widgets
    case 'qb-total-revenue':
      return qbData ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbData.totalRevenue)} subtitle={`${qbData.totalInvoices} invoices${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    case 'qb-accounts-receivable':
      return qbData ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbData.totalAR)} subtitle={`${qbData.overdueCount} overdue${periodSuffix}`} icon="trending-up" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    case 'qb-total-payments':
      return qbData ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbData.totalPayments)} subtitle={`Payments received${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    case 'qb-active-customers':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={`${qbMetrics.activeCustomers}`} subtitle={`of ${qbMetrics.totalCustomers} total`} icon="pipeline" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    case 'qb-collection-rate':
      return qbData ? (
        <StatWidgetContent title={widget.title} value={`${qbData.collectionRate.toFixed(1)}%`} subtitle={`Of invoiced amount${periodSuffix}`} icon="percent" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    case 'qb-overdue-amount':
      return qbData ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbData.overdueAmount)} subtitle={`${qbData.overdueCount} invoices overdue${periodSuffix}`} icon="trending-up" color={widget.color} />
      ) : (
        <CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>
      );
    // New QB stats
    case 'qb-total-expenses':
      return (fq || qbMetrics) ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(fq ? fq.totalExpenses : qbMetrics!.totalExpenses)} subtitle={`From expenses & purchases${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);
    case 'qb-total-ap':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbMetrics.totalAP)} subtitle={`Outstanding bills${periodSuffix}`} icon="trending-up" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);
    case 'qb-net-income':
      return (fq || qbMetrics) ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(fq ? fq.netIncome : qbMetrics!.netIncome)} subtitle={`Revenue minus expenses${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);
    case 'qb-active-vendors':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={`${qbMetrics.activeVendors}`} subtitle={`of ${qbMetrics.totalVendors} total`} icon="pipeline" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);
    case 'qb-total-estimates':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbMetrics.totalEstimates)} subtitle={`Pending estimates${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);
    case 'qb-total-credit-memos':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbMetrics.totalCreditMemos)} subtitle={`Credit memos issued${periodSuffix}`} icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect QuickBooks</p></CardContent>);

    // HubSpot stats
    case 'hs-total-deals':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.totalDeals}`} subtitle="From HubSpot" icon="pipeline" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-total-deal-value':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(hsMetrics.totalDealValue)} subtitle={`${hsMetrics.totalDeals} deals`} icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-deals-won':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.dealsWon}`} subtitle={formatCurrency(hsMetrics.dealsWonValue)} icon="trending-up" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-deals-lost':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.dealsLost}`} subtitle={formatCurrency(hsMetrics.dealsLostValue)} icon="trending-up" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-win-rate':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.winRate.toFixed(1)}%`} subtitle="Won / (Won + Lost)" icon="percent" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-avg-deal-size':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(hsMetrics.avgDealSize)} subtitle="Average across all deals" icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-total-contacts':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.totalContacts}`} subtitle="From HubSpot" icon="pipeline" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);
    case 'hs-total-companies':
      return hsMetrics ? (
        <StatWidgetContent title={widget.title} value={`${hsMetrics.totalCompanies}`} subtitle="From HubSpot" icon="pipeline" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connect HubSpot</p></CardContent>);

    // Cross-source stats
    case 'xs-revenue-per-deal':
      return (qbMetrics && hsMetrics && hsMetrics.dealsWon > 0) ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbMetrics.totalRevenue / hsMetrics.dealsWon)} subtitle="QB Revenue ÷ HS Deals Won" icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Requires QB + HS</p></CardContent>);
    case 'xs-ar-per-active-deal':
      return (qbMetrics && metrics && metrics.activeDealsCount > 0) ? (
        <StatWidgetContent title={widget.title} value={formatCurrency(qbMetrics.totalAR / metrics.activeDealsCount)} subtitle="QB AR ÷ Active Deals" icon="dollar" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Requires QB + Deals</p></CardContent>);
    case 'xs-collection-rate-by-entity':
      return qbMetrics ? (
        <StatWidgetContent title={widget.title} value={`${qbMetrics.collectionRate.toFixed(1)}%`} subtitle="Collected vs invoiced" icon="percent" color={widget.color} />
      ) : (<CardContent className="pt-6"><p className="text-xs text-muted-foreground">Requires QuickBooks</p></CardContent>);

    default: {
      // Datarails custom KPI widgets - use live data
      if (widget.dataSource.startsWith('datarails-') && widget.datarailsConfig) {
        return <DatarailsLiveStat widget={widget} />;
      }
      return (
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Unknown stat: {widget.dataSource}</p>
        </CardContent>
      );
    }
  }
}

function MetricsInner() {
  const { data: metrics, rawDeals, isLoading, isFetching, error, refetch } = useMetricsData();
  const { data: qbMetrics, rawInvoices, rawPayments, rawExpenses } = useQuickBooksMetrics();
  const { data: hsMetrics } = useHubSpotMetrics();
  const { metrics: customMetricDefs } = useCustomMetrics();
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
    deletePreset,
    canEditMetrics,
  } = useMetricsWidgets();

  const [selectedDashboard, setSelectedDashboard] = useState('management-snapshot');
  const [isEditMode, setIsEditMode] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const undoStackRef = useRef<Array<{ type: 'card' | 'section'; id: string; label: string; undo: () => void }>>([]);

  // Ctrl/Cmd+Z while in Edit Layout mode undoes most recent widget/section deletion
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z');
      if (!isUndo) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const last = undoStackRef.current.pop();
      if (!last) return;
      e.preventDefault();
      last.undo();
      sonnerToast(`Restored ${last.label}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditMode]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  // Custom user-created dashboards (company-level)
  interface CustomDashboard {
    id: string;
    name: string;
    widgetIds: string[];
    createdAt: string;
  }
  const {
    config: customDashboardsConfig,
    saveConfig: saveCustomDashboards,
    canEdit: canEditDashboards,
  } = useCompanyDashboardConfig<{ dashboards: CustomDashboard[] }>(
    'custom_dashboards',
    { dashboards: [] },
    { allowAllMembers: true },
  );
  const customDashboards = customDashboardsConfig.dashboards || [];

  const handleCreateDashboard = () => {
    if (!newDashboardName.trim()) return;
    const newDashboard: CustomDashboard = {
      id: `custom-${Date.now()}`,
      name: newDashboardName.trim(),
      widgetIds: [],
      createdAt: new Date().toISOString(),
    };
    saveCustomDashboards({ dashboards: [...customDashboards, newDashboard] });
    setSelectedDashboard(newDashboard.id);
    setCreateDashboardOpen(false);
    setNewDashboardName('');
    setIsEditMode(true);
    toast({ title: 'Dashboard created', description: `"${newDashboard.name}" is ready. Add widgets to get started.` });
  };

  const handleDeleteCustomDashboard = (dashId: string) => {
    saveCustomDashboards({ dashboards: customDashboards.filter(d => d.id !== dashId) });
    if (selectedDashboard === dashId) setSelectedDashboard('management-snapshot');
    toast({ title: 'Dashboard deleted' });
  };

  const handleRenameCustomDashboard = (dashId: string, newName: string) => {
    saveCustomDashboards({
      dashboards: customDashboards.map(d => d.id === dashId ? { ...d, name: newName } : d),
    });
  };

  const isCustomDashboard = selectedDashboard.startsWith('custom-');
  const activeCustomDashboard = customDashboards.find(d => d.id === selectedDashboard);

  // ── Global dashboard timeframe (drives every widget on Weekly Rundown) ──
  const { selectedQuarter: dashboardSelectedQuarter, timeframe: insightsTimeframe, reportingPeriod } = useInsightsTimeframe();
  // Source the metric deltas already used by the dashboard so exports reflect
  // the exact same data boundaries the user is seeing on screen.
  const { deltas: insightsDeltas } = useInsightsComparison();

  /** Build a filename/title/data-boundary context from the active Reporting period. */
  const insightsExportContext = useMemo<InsightsExportContext>(() => {
    if (reportingPeriod) {
      return {
        periodToken: reportingPeriod.period,
        periodLabel: reportingPeriod.label,
        start: reportingPeriod.start,
        end: reportingPeriod.end,
        granularity: reportingPeriod.view,
      };
    }
    return {
      periodToken: `${insightsTimeframe.start}_${insightsTimeframe.end}`,
      periodLabel: insightsTimeframe.label,
      start: insightsTimeframe.start,
      end: insightsTimeframe.end,
      granularity: 'range',
    };
  }, [reportingPeriod, insightsTimeframe]);

  const handleExportInsightsCsv = useCallback(() => {
    const inRange = insightsDeltas; // deltas are already scoped to the active timeframe
    exportInsightsCsv(insightsExportContext, inRange);
    sonnerToast.success(`Exported CSV for ${insightsExportContext.periodLabel}`);
  }, [insightsDeltas, insightsExportContext]);

  const handleExportInsightsPdf = useCallback(() => {
    exportInsightsPdf(insightsExportContext, insightsDeltas);
    sonnerToast.success(`Exported PDF for ${insightsExportContext.periodLabel}`);
  }, [insightsDeltas, insightsExportContext]);
  // Legacy compat: a few places still expect a `quarterOptions` array. Build a
  // single-element list containing the current selection so they keep working.
  const dashboardQuarterOptions = useMemo<QuarterOption[]>(
    () => [dashboardSelectedQuarter],
    [dashboardSelectedQuarter],
  );
  const allDashboardOptions = [
    ...DASHBOARD_OPTIONS,
    ...customDashboards.map(d => ({ id: d.id, name: d.name, isFavorite: false })),
  ];
  const [editingWidget, setEditingWidget] = useState<MetricWidgetConfig | undefined>();
  const [editingManagementSnapshotCardId, setEditingManagementSnapshotCardId] = useState<EditableManagementSnapshotCardId | null>(null);
  const {
    config: managementSnapshotCards,
    saveConfig: saveManagementSnapshotCards,
    canEdit: canEditSnapshotCards,
  } = useCompanyDashboardConfig<Record<EditableManagementSnapshotCardId, ManagementSnapshotCardState>>(
    'snapshot_card_configs',
    MANAGEMENT_SNAPSHOT_CARD_DEFAULTS,
    { allowAllMembers: true },
  );
  const setManagementSnapshotCards = (updater: React.SetStateAction<Record<EditableManagementSnapshotCardId, ManagementSnapshotCardState>>) => {
    const newVal = typeof updater === 'function' ? updater(managementSnapshotCards) : updater;
    saveManagementSnapshotCards(newVal);
  };

  const {
    config: hiddenSnapshotCardsConfig,
    saveConfig: saveHiddenSnapshotCards,
  } = useCompanyDashboardConfig<{ items: EditableManagementSnapshotCardId[] }>(
    'hidden_snapshot_cards',
    { items: [] },
    { allowAllMembers: true },
  );
  const hiddenSnapshotCards = hiddenSnapshotCardsConfig.items;
  const setHiddenSnapshotCards = (updater: React.SetStateAction<EditableManagementSnapshotCardId[]>) => {
    const newVal = typeof updater === 'function' ? updater(hiddenSnapshotCards) : updater;
    saveHiddenSnapshotCards({ items: newVal });
  };

  // Persisted hidden Weekly Rundown sections (Revenue Overview, Pipeline
  // Metrics, etc.). Soft-delete via this list — never destroys the section
  // implementations themselves.
  const {
    config: hiddenSnapshotSectionsConfig,
    saveConfig: saveHiddenSnapshotSections,
  } = useCompanyDashboardConfig<{ items: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').ManagementSnapshotSectionId[] }>(
    'hidden_snapshot_sections',
    { items: [] },
    { allowAllMembers: true },
  );
  const hiddenSnapshotSections = hiddenSnapshotSectionsConfig.items;

  // Persisted hidden sub-widgets (individual charts/KPIs extracted from sections)
  const {
    config: hiddenSubWidgetsConfig,
    saveConfig: saveHiddenSubWidgets,
  } = useCompanyDashboardConfig<{ items: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').WeeklyRundownSubWidgetId[] }>(
    'hidden_snapshot_sub_widgets',
    { items: [] },
    { allowAllMembers: true },
  );
  const hiddenSubWidgets = hiddenSubWidgetsConfig.items;
  const handleDeleteSubWidget = (id: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').WeeklyRundownSubWidgetId) => {
    if (hiddenSubWidgets.includes(id)) return;
    const next = [...hiddenSubWidgets, id];
    saveHiddenSubWidgets({ items: next });
    const label = SUB_WIDGET_LABELS[id] ?? 'Widget';
    undoStackRef.current.push({
      type: 'card', id, label,
      undo: () => saveHiddenSubWidgets({ items: next.filter(x => x !== id) }),
    });
    sonnerToast(`${label} removed`, {
      action: { label: 'Undo', onClick: () => saveHiddenSubWidgets({ items: next.filter(x => x !== id) }) },
    });
  };
  const SNAPSHOT_SECTION_LABELS: Record<string, string> = {
    'revenue-overview': 'Revenue Overview',
    'pipeline-metrics': 'Pipeline Metrics',
    'signed-deals-ar': 'Signed Deals & AR',
    'profit-by-entity': 'Profit by Entity',
    'executive-dashboard': 'Executive Dashboard',
  };
  const handleDeleteSnapshotSection = (sectionId: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').ManagementSnapshotSectionId) => {
    if (hiddenSnapshotSections.includes(sectionId)) return;
    const next = [...hiddenSnapshotSections, sectionId];
    saveHiddenSnapshotSections({ items: next });
    const label = SNAPSHOT_SECTION_LABELS[sectionId] ?? 'Section';
    undoStackRef.current.push({
      type: 'section',
      id: sectionId,
      label,
      undo: () => saveHiddenSnapshotSections({ items: next.filter(s => s !== sectionId) }),
    });
    sonnerToast(`${label} removed`, {
      action: {
        label: 'Undo',
        onClick: () => {
          saveHiddenSnapshotSections({ items: next.filter(s => s !== sectionId) });
          undoStackRef.current = undoStackRef.current.filter(e => !(e.type === 'section' && e.id === sectionId));
        },
      },
    });
  };
  const restoreAllSnapshotHidden = () => {
    saveHiddenSnapshotCards({ items: [] });
    saveHiddenSnapshotSections({ items: [] });
  };

  const SNAPSHOT_CARD_IDS: EditableManagementSnapshotCardId[] = [
    'debt-revenue', 'finserv-revenue', 'total-revenue', 'total-revenue-detail',
    'revenue-by-month',
    'clients-signed-debt', 'clients-signed-finserv', 'outstanding-ar',
    'debt-profit', 'finserv-profit',
  ];

  // Unified layout IDs: snapshot cards + section blocks + custom widgets in ONE grid.
  // Section blocks are full-width tiles in the same grid so users can drag any
  // widget across, above, below, or between sections in edit mode.
  const SNAPSHOT_SUB_WIDGET_IDS: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').WeeklyRundownSubWidgetId[] = [
    'rev-debt','rev-finserv',
    'pm-debt-on-board-combined','pm-debt-signed-combined','pm-debt-closed-combined','pm-finserv-deals-on-board','pm-finserv-clients-signed','pm-finserv-active-clients',
    'sd-deals-signed','sd-finserv-clients-signed','sd-outstanding-ar',
    'pe-debt-profit','pe-finserv-profit',
    'exec-deals-by-status',
  ];
  // Executive Dashboard is now broken into individual sub-widgets above; the
  // legacy monolithic block is no longer rendered in the grid.
  const includeExec = false;
  const unifiedLayoutIds = useMemo(() => {
    const widgetIds = widgets.map(w => w.id);
    const subIds = SNAPSHOT_SUB_WIDGET_IDS.filter(id => !(hiddenSnapshotCards as any).includes(id));
    return [...SNAPSHOT_CARD_IDS, ...subIds, ...(includeExec ? ['executive-dashboard'] : []), ...widgetIds];
  }, [widgets, hiddenSnapshotCards, includeExec]);

  // Default placement — mirrors the reference layout image:
  //   • Top-left large 2×2 Key Stats summary block
  //   • Top-right two small chart cards side-by-side
  //   • Mid-right wide chart spanning the right section
  //   • Bottom-left smaller table/list + medium chart adjacent
  //   • Bottom-right wide chart spanning the right section
  // Additional existing widgets are preserved below the primary band.
  const unifiedLayoutDefaults = useMemo(() => {
    const defaults: import('@/hooks/useGridLayout').GridLayoutItem[] = [
      // === PRIMARY REFERENCE BAND ===
      // Top-left: large Key Stats summary block (≈ 2 cols × 2 rows)
      { i: 'total-revenue-detail', x: 0, y: 0, w: 6, h: 6, minW: 4, minH: 4 },

      // Top-right: two small chart cards side-by-side
      { i: 'debt-revenue',    x: 6, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
      { i: 'finserv-revenue', x: 9, y: 0, w: 3, h: 3, minW: 3, minH: 3 },

      // Mid-right: wide chart spanning the full right section width
      { i: 'revenue-by-month', x: 6, y: 3, w: 6, h: 3, minW: 5, minH: 3 },

      // Bottom-left: smaller table/list area + medium chart adjacent
      { i: 'outstanding-ar',         x: 0, y: 6, w: 3, h: 3, minW: 3, minH: 2 },
      { i: 'total-revenue',          x: 3, y: 6, w: 3, h: 3, minW: 3, minH: 3 },
      { i: 'clients-signed-debt',    x: 0, y: 9, w: 3, h: 3, minW: 3, minH: 2 },
      { i: 'clients-signed-finserv', x: 3, y: 9, w: 3, h: 3, minW: 3, minH: 2 },

      // Bottom-right: wide chart spanning the right section
      { i: 'sd-outstanding-ar', x: 6, y: 6, w: 6, h: 6, minW: 3, minH: 3 },

      // === PRESERVED SUPPLEMENTARY WIDGETS (kept below primary band) ===
      { i: 'debt-profit',    x: 0, y: 12, w: 6, h: 3, minW: 3, minH: 3 },
      { i: 'finserv-profit', x: 6, y: 12, w: 6, h: 3, minW: 3, minH: 3 },

      { i: 'rev-debt',    x: 0, y: 15, w: 6, h: 6, minW: 3, minH: 4 },
      { i: 'rev-finserv', x: 6, y: 15, w: 6, h: 6, minW: 3, minH: 4 },

      { i: 'pm-debt-on-board-combined', x: 0, y: 21, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'pm-debt-signed-combined',   x: 4, y: 21, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'pm-debt-closed-combined',   x: 8, y: 21, w: 4, h: 2, minW: 3, minH: 2 },

      { i: 'pm-finserv-deals-on-board', x: 0, y: 23, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'pm-finserv-clients-signed', x: 4, y: 23, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'pm-finserv-active-clients', x: 8, y: 23, w: 4, h: 2, minW: 3, minH: 2 },

      { i: 'sd-deals-signed',           x: 0, y: 25, w: 4, h: 6, minW: 3, minH: 3 },
      { i: 'sd-finserv-clients-signed', x: 4, y: 25, w: 4, h: 6, minW: 3, minH: 3 },
      { i: 'exec-deals-by-status',      x: 8, y: 25, w: 4, h: 6, minW: 3, minH: 3 },

      { i: 'pe-debt-profit',    x: 0, y: 31, w: 6, h: 6, minW: 4, minH: 4 },
      { i: 'pe-finserv-profit', x: 6, y: 31, w: 6, h: 6, minW: 4, minH: 4 },
    ];
    return defaults;
  }, []);

  const {
    layout: snapshotGridLayout,
    saveLayout: saveSnapshotGridLayout,
    resetLayout: resetSnapshotGridLayout,
  } = useGridLayout('management-snapshot-unified-v9', unifiedLayoutIds, {
    allowAllMembers: true,
    layoutDefaults: unifiedLayoutDefaults,
  });

  const [snapshotCardToDelete, setSnapshotCardToDelete] = useState<EditableManagementSnapshotCardId | null>(null);
  const [snapshotDeleteConfirmOpen, setSnapshotDeleteConfirmOpen] = useState(false);

  const handleDeleteManagementSnapshotCard = (cardId: EditableManagementSnapshotCardId) => {
    setSnapshotCardToDelete(cardId);
    setSnapshotDeleteConfirmOpen(true);
  };

  const confirmDeleteSnapshotCard = () => {
    if (snapshotCardToDelete) {
      const cardId = snapshotCardToDelete;
      const next = [...hiddenSnapshotCards, cardId];
      saveHiddenSnapshotCards({ items: next });
      const label = managementSnapshotCards?.[cardId]?.title ?? 'Widget';
      undoStackRef.current.push({
        type: 'card',
        id: cardId,
        label,
        undo: () => saveHiddenSnapshotCards({ items: next.filter(c => c !== cardId) }),
      });
      sonnerToast(`${label} removed`, {
        action: {
          label: 'Undo',
          onClick: () => {
            saveHiddenSnapshotCards({ items: next.filter(c => c !== cardId) });
            undoStackRef.current = undoStackRef.current.filter(e => !(e.type === 'card' && e.id === cardId));
          },
        },
      });
    }
    setSnapshotDeleteConfirmOpen(false);
    setSnapshotCardToDelete(null);
  };
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');




  const managementSnapshotCardConfigs = useMemo<Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>>(() => {
    return (Object.keys(managementSnapshotCards) as EditableManagementSnapshotCardId[]).reduce((acc, key) => {
      const card = managementSnapshotCards[key];
      acc[key] = {
        title: card.title,
        color: card.color,
        entityFilter: card.entityFilter,
        comparisonPeriod: card.comparisonPeriod,
        type: card.type,
        chartType: card.chartType,
        datarailsConfig: card.datarailsConfig,
        timeWindow: (card.datarailsConfig as any)?.xAxis?.window || undefined,
        kpiDetailConfig: (card as any).kpiDetailConfig || undefined,
        kpiTileLayout: (card as any).kpiTileLayout || undefined,
        footerLabel: (card as any).footerLabel || undefined,
      };
      return acc;
    }, {} as Partial<Record<EditableManagementSnapshotCardId, ManagementSnapshotEditableConfig>>);
  }, [managementSnapshotCards]);

  const {
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolder,
    moveDashboardToFolder,
    getUnfolderedDashboardIds,
  } = useDashboardFolders();

  const unfolderedIds = useMemo(
    () => {
      // Exclude any dashboards that belong to a code-defined default folder so
      // they don't render twice (once inside the default folder, once at the root).
      const candidateIds = DASHBOARD_OPTIONS
        .filter(d => !DEFAULT_FOLDER_IDS.has(d.id))
        .map(d => d.id);
      return getUnfolderedDashboardIds(candidateIds);
    },
    [folders, getUnfolderedDashboardIds]
  );

  // Per-folder expand/collapse state for the 3 code-defined default folders,
  // persisted in localStorage. Defaults all folders to expanded on first load.
  const [defaultFolderExpanded, setDefaultFolderExpanded] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') {
      return Object.fromEntries(DEFAULT_FOLDER_GROUPS.map(g => [g.id, true]));
    }
    try {
      const raw = window.localStorage.getItem(DEFAULT_FOLDER_EXPANDED_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      return Object.fromEntries(
        DEFAULT_FOLDER_GROUPS.map(g => [g.id, stored[g.id] ?? true])
      );
    } catch {
      return Object.fromEntries(DEFAULT_FOLDER_GROUPS.map(g => [g.id, true]));
    }
  });

  const toggleDefaultFolder = useCallback((folderId: string) => {
    setDefaultFolderExpanded(prev => {
      const next = { ...prev, [folderId]: !(prev[folderId] ?? true) };
      try {
        window.localStorage.setItem(
          DEFAULT_FOLDER_EXPANDED_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        /* ignore quota / privacy mode errors */
      }
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
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

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingWidget(undefined);
    setEditingManagementSnapshotCardId(null);
  };

  const handleEdit = (widget: MetricWidgetConfig) => {
    setEditingManagementSnapshotCardId(null);
    setEditingWidget(widget);
    setEditorOpen(true);
  };

  const handleEditManagementSnapshotCard = (cardId: EditableManagementSnapshotCardId) => {
    setEditingManagementSnapshotCardId(cardId);
    setEditingWidget({
      id: `management-snapshot-${cardId}`,
      createdAt: new Date().toISOString(),
      ...managementSnapshotCards[cardId],
    });
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditingManagementSnapshotCardId(null);
    setEditingWidget(undefined);
    setEditorOpen(true);
  };

  /** Generic handler for clicking any card in a pre-built dashboard */
  const handlePrebuiltCardEdit = (cardTitle: string) => {
    setEditingManagementSnapshotCardId(null);
    setEditingWidget({
      id: `prebuilt-${selectedDashboard}-${cardTitle.replace(/\s+/g, '-').toLowerCase()}`,
      createdAt: new Date().toISOString(),
      title: cardTitle,
      type: 'chart',
      chartType: 'bar',
      dataSource: `datarails-prebuilt-${Date.now()}`,
      size: 'medium',
      color: 'hsl(var(--primary))',
    });
    setEditorOpen(true);
  };

  // Map management snapshot card IDs to sensible default editor configs
  const SNAPSHOT_CARD_SEED_CONFIGS: Record<string, Partial<DatarailsWidgetConfig>> = {
    'total-revenue': {
      type: 'bar',
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
      values: [
        { fieldId: 'f-total-revenue', label: 'Total Revenue', agg: 'sum', format: 'currency' },
        { fieldId: 'f-revenue', label: 'Debt Revenue', agg: 'sum', format: 'currency' },
        { fieldId: 'f-revenue', label: 'FinServ Revenue', agg: 'sum', format: 'currency' },
      ],
    },
    'debt-revenue': {
      type: 'bar',
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
      series: { fieldId: null, mode: 'single' },
      values: [{ fieldId: 'f-revenue', label: 'Debt Revenue', agg: 'sum', format: 'currency' }],
    },
    'finserv-revenue': {
      type: 'bar',
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
      values: [{ fieldId: 'f-revenue', label: 'FinServ Revenue', agg: 'sum', format: 'currency' }],
    },
    'total-revenue-detail': {
      type: 'kpi',
      values: [{ fieldId: 'f-total-revenue', label: 'Total Revenue', agg: 'sum', format: 'currency' }],
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
    },
    'clients-signed-debt': {
      type: 'kpi',
      values: [{ fieldId: 'n-closed-won-count', label: 'Clients Signed - Debt', agg: 'sum', format: 'number' }],
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
    },
    'clients-signed-finserv': {
      type: 'kpi',
      values: [{ fieldId: 'n-closed-won-count', label: 'Clients Signed - FinServ', agg: 'sum', format: 'number' }],
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
    },
    'outstanding-ar': {
      type: 'kpi',
      values: [{ fieldId: 'f-amount', label: 'Outstanding A/R', agg: 'sum', format: 'currency' }],
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
    },
    'debt-profit': {
      type: 'bar',
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
      values: [{ fieldId: 'f-net-income', label: 'Debt Profit', agg: 'sum', format: 'currency' }],
    },
    'finserv-profit': {
      type: 'bar',
      xAxis: { fieldId: 'd-report', grain: 'month', window: 'ytd', label: 'Reporting Month' },
      values: [{ fieldId: 'f-net-income', label: 'FinServ Profit', agg: 'sum', format: 'currency' }],
    },
  };

  const editorInitialConfig = useMemo<DatarailsWidgetConfig>(() => {
    if (!editingWidget) return DEFAULT_WIDGET_CONFIG;

    const persisted = editingWidget.datarailsConfig as Partial<DatarailsWidgetConfig> | undefined;
    if (persisted && Object.keys(persisted).length > 0) {
      return {
        ...DEFAULT_WIDGET_CONFIG,
        ...persisted,
        id: persisted.id ?? editingWidget.id,
        name: persisted.name ?? editingWidget.title,
      };
    }

    // For management snapshot cards, seed with meaningful defaults
    if (editingManagementSnapshotCardId) {
      const seed = SNAPSHOT_CARD_SEED_CONFIGS[editingManagementSnapshotCardId];
      if (seed) {
        return {
          ...DEFAULT_WIDGET_CONFIG,
          ...seed,
          id: editingWidget.id,
          name: editingWidget.title || DEFAULT_WIDGET_CONFIG.name,
        };
      }
    }

    return {
      ...DEFAULT_WIDGET_CONFIG,
      id: editingWidget.id,
      name: editingWidget.title || DEFAULT_WIDGET_CONFIG.name,
      type: editingWidget.type === 'stat'
        ? 'kpi'
        : editingWidget.chartType === 'line'
          ? 'line'
          : editingWidget.chartType === 'bar'
            ? 'bar'
            : 'columnChart',
    };
  }, [editingWidget, editingManagementSnapshotCardId]);

  const handleSave = (widgetData: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => {
    if (editingManagementSnapshotCardId) {
      setManagementSnapshotCards(prev => ({
        ...prev,
        [editingManagementSnapshotCardId]: {
          ...prev[editingManagementSnapshotCardId],
          ...widgetData,
        },
      }));
      toast({ title: "Widget updated" });
      setEditingManagementSnapshotCardId(null);
      return;
    }

    if (editingWidget) {
      updateWidget(editingWidget.id, widgetData);
      toast({ title: "Widget updated" });
    } else {
      const newId = addWidget(widgetData);
      // When adding a new widget on a custom dashboard, track it
      if (isCustomDashboard && activeCustomDashboard) {
        saveCustomDashboards({
          dashboards: customDashboards.map(d =>
            d.id === activeCustomDashboard.id
              ? { ...d, widgetIds: [...d.widgetIds, newId] }
              : d
          ),
        });
      }
      toast({ title: "Widget added successfully", description: widgetData.title });
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

  const getWidgetDisplayType = (widget: MetricWidgetConfig): 'stat' | 'chart' => {
    if (widget.dataSource.startsWith('datarails-')) {
      const selectedType = (widget.datarailsConfig as { type?: string } | undefined)?.type;
      if (selectedType === 'kpi') return 'stat';
      if (selectedType) return 'chart';
    }
    return widget.type;
  };

  const statWidgets = widgets.filter((w) => getWidgetDisplayType(w) === 'stat');
  const chartWidgets = widgets.filter((w) => getWidgetDisplayType(w) === 'chart');
  const allWidgetIds = useMemo(() => widgets.map(w => w.id), [widgets]);
  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Insights | 5thLine</title>
        </Helmet>
        <InsightsLoadingSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Helmet>
          <title>Insights | 5thLine</title>
        </Helmet>
        <InsightsErrorState
          error={error as Error}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </>
    );
  }




  return (
    <>
      <Helmet>
        <title>Insights | 5thLine</title>
      </Helmet>
      <div className="bg-transparent">
        <div className="insights-glass-skin container mx-auto py-6 px-4 space-y-6">
          {/* Header (sticky to top of scrollable <main>) */}
          <StickyDashboardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                {/* Dashboard Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-6 w-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">
                          {allDashboardOptions.find(d => d.id === selectedDashboard)?.name || 'Dashboard'}
                        </h1>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80 max-h-[70vh] overflow-y-auto bg-popover border border-border shadow-lg z-50">
                    {/* Default code-defined folders (Management Insights, Financial, Sales & BD) */}
                    {DEFAULT_FOLDER_GROUPS.map((group) => {
                      const isExpanded = defaultFolderExpanded[group.id] ?? true;
                      const groupDashboards = group.dashboardIds
                        .map(id => DASHBOARD_OPTIONS.find(d => d.id === id))
                        .filter(Boolean) as typeof DASHBOARD_OPTIONS;

                      return (
                        <div key={group.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
                            onClick={() => toggleDefaultFolder(group.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleDefaultFolder(group.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <Folder className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{group.name}</span>
                              <span className="text-xs text-muted-foreground">({groupDashboards.length})</span>
                            </div>
                          </div>
                          {isExpanded && groupDashboards.map((dashboard) => (
                            <DropdownMenuItem
                              key={dashboard.id}
                              className={cn(
                                "flex items-center justify-between py-1.5 pl-10",
                                selectedDashboard === dashboard.id && "bg-accent"
                              )}
                              onClick={() => setSelectedDashboard(dashboard.id)}
                            >
                              <div className="flex items-center gap-2">
                                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{dashboard.name}</span>
                              </div>
                              {dashboard.isFavorite && (
                                <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      );
                    })}

                    {/* User-created folders (DB-backed) */}
                    {folders.map((folder) => {
                      const folderDashboards = folder.dashboardIds
                        .map(id => DASHBOARD_OPTIONS.find(d => d.id === id))
                        .filter(Boolean);
                      
                      return (
                        <div key={folder.id}>
                          <div
                            className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer group"
                            onClick={() => toggleFolder(folder.id)}
                          >
                            <div className="flex items-center gap-2">
                              {folder.isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <Folder className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{folder.name}</span>
                              <span className="text-xs text-muted-foreground">({folderDashboards.length})</span>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingFolderId(folder.id);
                                  setRenameFolderName(folder.name);
                                }}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteFolder(folder.id);
                                  }}
                                >
                                  <TrashIcon className="h-3.5 w-3.5 mr-2" />
                                  Delete Folder
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {folder.isExpanded && folderDashboards.map((dashboard) => dashboard && (
                            <DropdownMenuSub key={dashboard.id}>
                              <div className="flex items-center">
                                <DropdownMenuItem
                                  className={cn(
                                    "flex-1 flex items-center justify-between py-1.5 pl-10",
                                    selectedDashboard === dashboard.id && "bg-accent"
                                  )}
                                  onClick={() => setSelectedDashboard(dashboard.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm">{dashboard.name}</span>
                                  </div>
                                </DropdownMenuItem>
                                <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </DropdownMenuSubTrigger>
                              </div>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => moveDashboardToFolder(dashboard.id, null)}>
                                  Remove from folder
                                </DropdownMenuItem>
                                {folders.filter(f => f.id !== folder.id).map(f => (
                                  <DropdownMenuItem key={f.id} onClick={() => moveDashboardToFolder(dashboard.id, f.id)}>
                                    <Folder className="h-3.5 w-3.5 mr-2" />
                                    Move to {f.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                        </div>
                      );
                    })}

                    {folders.length > 0 && unfolderedIds.length > 0 && <DropdownMenuSeparator />}

                    {/* Unfoldered dashboards */}
                    {unfolderedIds.map((id) => {
                      const dashboard = DASHBOARD_OPTIONS.find(d => d.id === id);
                      if (!dashboard) return null;
                      return (
                        <DropdownMenuSub key={dashboard.id}>
                          <div className="flex items-center">
                            <DropdownMenuItem
                              className={cn(
                                "flex-1 flex items-center justify-between py-2",
                                selectedDashboard === dashboard.id && "bg-accent"
                              )}
                              onClick={() => setSelectedDashboard(dashboard.id)}
                            >
                              <div className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                <span>{dashboard.name}</span>
                              </div>
                              <Star
                                className={cn(
                                  "h-4 w-4",
                                  dashboard.isFavorite
                                    ? "text-primary fill-primary"
                                    : "text-muted-foreground/40"
                                )}
                              />
                            </DropdownMenuItem>
                            {folders.length > 0 && (
                              <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center">
                                <Folder className="h-3.5 w-3.5" />
                              </DropdownMenuSubTrigger>
                            )}
                          </div>
                          {folders.length > 0 && (
                            <DropdownMenuSubContent>
                              {folders.map(f => (
                                <DropdownMenuItem key={f.id} onClick={() => moveDashboardToFolder(dashboard.id, f.id)}>
                                  <Folder className="h-3.5 w-3.5 mr-2" />
                                  Move to {f.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          )}
                        </DropdownMenuSub>
                      );
                    })}

                    {/* Custom dashboards */}
                    {customDashboards.length > 0 && <DropdownMenuSeparator />}
                    {customDashboards.map((dash) => (
                      <DropdownMenuSub key={dash.id}>
                        <div className="flex items-center">
                          <DropdownMenuItem
                            className={cn(
                              "flex-1 flex items-center justify-between py-2",
                              selectedDashboard === dash.id && "bg-accent"
                            )}
                            onClick={() => setSelectedDashboard(dash.id)}
                          >
                            <div className="flex items-center gap-2">
                              <LayoutDashboard className="h-4 w-4 text-chart-4" />
                              <span>{dash.name}</span>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </DropdownMenuSubTrigger>
                        </div>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteCustomDashboard(dash.id)}
                          >
                            <TrashIcon className="h-3.5 w-3.5 mr-2" />
                            Delete Dashboard
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}

                    {canEditMetrics && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="flex items-center gap-2 text-primary"
                          onClick={() => setNewFolderOpen(true)}
                        >
                          <FolderPlus className="h-4 w-4" />
                          <span>New Folder</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center gap-2 text-primary"
                          onClick={() => setCreateDashboardOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          <span>Create New Dashboard</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-muted-foreground">
                  Pipeline performance analytics powered by real deal data
                </p>
                <SyncStatusBar />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedDashboard === 'management-snapshot' && (
                <InsightsTimeframePicker />
              )}

              {selectedDashboard === 'management-review' && (
                <ReportingPeriodPicker />
              )}

              {selectedDashboard === 'management-review' && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Preview report Cover"
                      aria-haspopup="dialog"
                      aria-expanded={coverPreviewOpen}
                      className="h-9 w-9 p-0"
                      onClick={() => setCoverPreviewOpen(true)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview report front matter (Cover)</TooltipContent>
                </UITooltip>
              )}

              {selectedDashboard === 'management-review' && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={assistantTriggerRef}
                      variant="outline"
                      size="sm"
                      aria-label="Open Insights Assistant"
                      aria-haspopup="dialog"
                      aria-expanded={assistantOpen}
                      className="h-9 w-9 p-0 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 text-primary hover:from-primary/15 hover:to-primary/10"
                      onClick={() => setAssistantOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI Summary, Q&amp;A, Drivers, Forecast, Anomalies</TooltipContent>
                </UITooltip>
              )}

              {selectedDashboard === 'management-review' && (
                <DropdownMenu>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Export Insights for ${insightsExportContext.periodLabel}`}
                          className="h-9 w-9 p-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Export {insightsExportContext.periodLabel}</TooltipContent>
                  </UITooltip>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {insightsExportContext.periodLabel}
                      <div className="text-[10px] normal-case tracking-normal text-muted-foreground/70">
                        {insightsExportContext.start} → {insightsExportContext.end}
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportInsightsCsv}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportInsightsPdf}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Presets"
                        className="h-9 w-9 p-0"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Presets</TooltipContent>
                </UITooltip>
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

              {canEditMetrics && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isEditMode ? "default" : "outline"}
                      size="sm"
                      aria-label={isEditMode ? "Done Editing" : "Edit Layout"}
                      aria-pressed={isEditMode}
                      className="h-9 w-9 p-0"
                      onClick={() => setIsEditMode(!isEditMode)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isEditMode ? "Done Editing" : "Edit Layout"}
                  </TooltipContent>
                </UITooltip>
              )}

              {/* Slot for dashboard-specific header actions (e.g. QIR Comments notepad). */}
              <div id="qir-header-actions-slot" className="flex items-center gap-2" />

              {isEditMode && canEditMetrics && (
                <>
                  <Button size="sm" onClick={handleAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Widget
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm('Reset this dashboard to the default layout? Your current arrangement will be replaced.')) {
                        resetSnapshotGridLayout();
                        toast({ title: 'Layout reset to default' });
                      }
                    }}
                    title="Revert this dashboard to the default layout"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default Layout
                  </Button>
                  {(hiddenSnapshotCards.length + hiddenSnapshotSections.length) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={restoreAllSnapshotHidden}
                      title="Bring back all widgets and sections you removed"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restore Hidden ({hiddenSnapshotCards.length + hiddenSnapshotSections.length})
                    </Button>
                  )}
                </>
              )}
            </div>
          </StickyDashboardHeader>

          {/* Insights Assistant slide-over (Insights Dashboard only) */}
          {selectedDashboard === 'management-review' && (
            <InsightsAssistantSheet
              open={assistantOpen}
              onOpenChange={setAssistantOpen}
              returnFocusRef={assistantTriggerRef}
            />
          )}

          {/* On-demand Cover preview (Insights Dashboard only) */}
          {selectedDashboard === 'management-review' && (
            <CoverPreviewDialog
              open={coverPreviewOpen}
              onOpenChange={setCoverPreviewOpen}
            />
          )}

          {/* Dashboard Content - always show pre-built dashboards */}
          <QuarterlyRevenueGrowthCard />
          <EditableDashboardWrapper isEditMode={isEditMode} onCardEdit={() => { /* edit only via explicit pencil button */ }}>
            {selectedDashboard === 'management-snapshot' && (
              <WeeklyRundownCarousel
                page1={
                  <div className="space-y-8">
                    <ManagementSnapshotDashboard
                      isEditMode={isEditMode}
                      onEditCard={handleEditManagementSnapshotCard}
                      onDeleteCard={handleDeleteManagementSnapshotCard}
                      hiddenCards={hiddenSnapshotCards}
                      hiddenSections={hiddenSnapshotSections}
                      onDeleteSection={handleDeleteSnapshotSection}
                      hiddenSubWidgets={hiddenSubWidgets}
                      onDeleteSubWidget={handleDeleteSubWidget}
                      onTimeWindowChange={(cardId, window) => {
                        setManagementSnapshotCards(prev => {
                          const card = prev[cardId];
                          const existingDR = (card.datarailsConfig || {}) as Record<string, any>;
                          return {
                            ...prev,
                            [cardId]: {
                              ...card,
                              datarailsConfig: {
                                ...existingDR,
                                xAxis: { ...(existingDR.xAxis || {}), window },
                              },
                            },
                          };
                        });
                      }}
                      cardConfigs={managementSnapshotCardConfigs}
                      gridLayout={snapshotGridLayout.map(item => (
                        // Strip any legacy oversized minW/minH so widgets that
                        // used to be locked (e.g. Outstanding A/R) inherit the
                        // same flexible resize range as other Weekly Rundown
                        // cards. New min sizes come from the layout defaults
                        // (small) and constraints map (empty).
                        item.i === 'sd-outstanding-ar' || item.i === 'outstanding-ar'
                          ? { ...item, minW: 2, minH: 2 }
                          : item
                      ))}
                      onGridLayoutChange={saveSnapshotGridLayout}
                      selectedQuarter={dashboardSelectedQuarter}
                      onQuarterChange={() => { /* selector lives in page header */ }}
                      quarterOptions={dashboardQuarterOptions}
                      executiveSlot={<ExecutiveDashboard />}
                    >
                      {widgets.map((widget) => {
                        const HIDDEN_WEEKLY_RUNDOWN_SOURCES = new Set([
                          'closed-won',
                          'pipeline-by-stage',
                          'active-pipeline',
                          'total-fees',
                          'avg-deal-size',
                          'deal-activity-12m',
                        ]);
                        if (HIDDEN_WEEKLY_RUNDOWN_SOURCES.has(widget.dataSource as string)) {
                          return null;
                        }
                        const isStat = getWidgetDisplayType(widget) === 'stat';
                        return (
                          <div key={widget.id}>
                            <GridWidgetCard
                              isEditMode={isEditMode}
                              onEdit={() => handleEdit(widget)}
                              onDelete={() => {
                                setWidgetToDelete(widget.id);
                                setDeleteConfirmOpen(true);
                              }}
                            >
                              {isStat
                                ? renderStatContent(widget, metrics, qbMetrics, hsMetrics, customMetricDefs, widgets, { rawDeals, rawInvoices, rawPayments, rawExpenses })
                                : renderChartContent(widget, metrics, qbMetrics, hsMetrics)
                              }
                            </GridWidgetCard>
                          </div>
                        );
                      })}
                    </ManagementSnapshotDashboard>
                  </div>
                }
              />
            )}
            {selectedDashboard === 'sales-bd-roi' && <SalesBDROIDashboard />}
            {selectedDashboard === 'revenue-customers' && (
              <div className="space-y-5">
                <IncomeYTDCard />
                <IncomeYTDMoMVarianceCard />
                <IncomeYTDByEntityCard />
                <YTDIncomeBreakdownByEntityCard />
                <IncomeYTDChangeByEntityCard />
                <FinServTTMTop5CustomersCard />
                <TotalIncomeRolling12MoCard />
                <IncomeVsCOGSRolling12MoCard />
                <IncomeMoMCard />
                <ClientCountMoMCard />
                <IncomeTop5CustomersMoMCard />
                <FinServTopCustomersCard />
                <RevenueQuarterlySection selectedQuarter={dashboardSelectedQuarter} />
              </div>
            )}
            {selectedDashboard === 'sales-team-board' && <SalesTeamBoardDashboard />}
            {selectedDashboard === 'consolidated-debt-pipeline' && (
              <ConsolidatedDebtPipelineDashboard selectedQuarter={dashboardSelectedQuarter} />
            )}
            {selectedDashboard === 'controller-dashboard' && <ControllerDashboard />}
            {selectedDashboard === 'finserv-financial-metrics' && <FinServFinancialMetricsDashboard />}
            {selectedDashboard === 'quickbooks-financial' && <QuickBooksFinancialDashboard />}
            {selectedDashboard === 'management-review' && <ManagementReviewCarousel />}

            {/* Custom user-created dashboards */}
            {isCustomDashboard && activeCustomDashboard && (
              <div className="space-y-6">
                {widgets.filter(w => {
                  // Show widgets that belong to this custom dashboard
                  return activeCustomDashboard.widgetIds.includes(w.id);
                }).length === 0 ? (
                  // Empty state
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-20">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <LayoutDashboard className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">
                        {activeCustomDashboard.name}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-6 text-center max-w-md">
                        This dashboard is empty. Add widgets to start building your custom view.
                      </p>
                      <div className="flex gap-3">
                        <Button onClick={() => { setIsEditMode(true); handleAdd(); }}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Your First Widget
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  // Render widgets that belong to this dashboard
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {widgets
                      .filter(w => activeCustomDashboard.widgetIds.includes(w.id))
                      .map((widget) => {
                        const isStat = getWidgetDisplayType(widget) === 'stat';
                        return (
                          <GridWidgetCard
                            key={widget.id}
                            isEditMode={isEditMode}
                            onEdit={() => handleEdit(widget)}
                            onDelete={() => {
                              setWidgetToDelete(widget.id);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            {isStat
                              ? renderStatContent(widget, metrics, qbMetrics, hsMetrics, customMetricDefs, widgets, { rawDeals, rawInvoices, rawPayments, rawExpenses })
                              : renderChartContent(widget, metrics, qbMetrics, hsMetrics)
                            }
                          </GridWidgetCard>
                        );
                      })}
                    {isEditMode && (
                      <Card
                        className="border-dashed border-2 border-muted-foreground/25 hover:border-primary/50 cursor-pointer transition-colors flex items-center justify-center min-h-[200px]"
                        onClick={handleAdd}
                      >
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm font-medium text-muted-foreground">Add Widget</span>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </EditableDashboardWrapper>

        </div>
      </div>

      {/* Widget Editor - Full Screen Overlay */}
      <Dialog open={editorOpen} onOpenChange={(o) => { if (!o) handleCloseEditor(); }}>
        <DialogContent
          className="max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 sm:rounded-none translate-x-0 translate-y-0 left-0 top-0 bg-background overflow-hidden flex flex-col"
        >
          <div className="flex-1 min-h-0 overflow-auto">
            <DatarailsWidgetEditor
            initialWidgetConfig={editorInitialConfig}
            onSave={(datarailsConfig) => {
              const chartTypeMap: Record<string, MetricChartType> = {
                columnChart: 'bar',
                bar: 'bar',
                stackedBar: 'bar',
                line: 'line',
                kpi: 'bar',
                table: 'bar',
                column: 'bar',
              };

              const dataSource =
                editingWidget?.dataSource?.startsWith('datarails-')
                  ? editingWidget.dataSource
                  : `datarails-${Date.now()}`;

              const widgetData: Omit<MetricWidgetConfig, 'id' | 'createdAt'> = {
                title: datarailsConfig.name,
                type: datarailsConfig.type === 'kpi' ? 'stat' : 'chart',
                chartType: chartTypeMap[datarailsConfig.type] || 'bar',
                dataSource,
                size: 'medium' as MetricWidgetSize,
                color: 'hsl(var(--primary))',
                timePeriod:
                  datarailsConfig.xAxis.window === 'last3Months'
                    ? 'last-90d'
                    : datarailsConfig.xAxis.window === 'ytd'
                      ? 'ytd'
                      : 'all-time',
                datarailsConfig: datarailsConfig as unknown as Record<string, any>,
              };
              handleSave(widgetData);
              handleCloseEditor();
            }}
            onCancel={() => handleCloseEditor()}
            />
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Snapshot Card Delete Confirmation */}
      <AlertDialog open={snapshotDeleteConfirmOpen} onOpenChange={setSnapshotDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Widget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this widget? You can restore it later from the layout settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSnapshotCard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
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

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Organize your dashboards into folders for easy access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  createFolder(newFolderName.trim());
                  setNewFolderName('');
                  setNewFolderOpen(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newFolderName.trim()) {
                  createFolder(newFolderName.trim());
                  setNewFolderName('');
                  setNewFolderOpen(false);
                }
              }}
              disabled={!newFolderName.trim()}
            >
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renamingFolderId} onOpenChange={(open) => !open && setRenamingFolderId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Folder name"
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameFolderName.trim() && renamingFolderId) {
                  renameFolder(renamingFolderId, renameFolderName.trim());
                  setRenamingFolderId(null);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolderId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameFolderName.trim() && renamingFolderId) {
                  renameFolder(renamingFolderId, renameFolderName.trim());
                  setRenamingFolderId(null);
                }
              }}
              disabled={!renameFolderName.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Dashboard Dialog */}
      <Dialog open={createDashboardOpen} onOpenChange={setCreateDashboardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Dashboard</DialogTitle>
            <DialogDescription>
              Create a blank dashboard where you can add custom widgets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Dashboard name"
              value={newDashboardName}
              onChange={(e) => setNewDashboardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDashboardName.trim()) {
                  handleCreateDashboard();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDashboardOpen(false); setNewDashboardName(''); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateDashboard} disabled={!newDashboardName.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Metrics() {
  return (
    <InsightsTimeframeProvider>
      <MetricsInner />
    </InsightsTimeframeProvider>
  );
}
