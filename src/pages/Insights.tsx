import { Helmet } from "react-helmet-async";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
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
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { DraggableGridLayout } from "@/components/metrics/DraggableGridLayout";
import { InsightsTimeframePicker } from "@/components/metrics/InsightsTimeframePicker";
import { DebtAdvisoryComparisonToggle } from "@/components/metrics/DebtAdvisoryComparisonToggle";
import { InsightsTimeframeProvider, useInsightsTimeframe } from "@/contexts/InsightsTimeframeContext";
import { StickyDashboardHeader } from "@/components/layout/StickyDashboardHeader";
import { EditableDashboardWrapper } from "@/components/metrics/EditableDashboardWrapper";
import { IncomeYTDCard } from "@/components/insights/IncomeYTDCard";
import { ClientCountMoMCard } from "@/components/insights/ClientCountMoMCard";
import { FinServTopCustomersCard } from "@/components/insights/FinServTopCustomersCard";
import { IncomeYTDMoMVarianceCard } from "@/components/insights/IncomeYTDMoMVarianceCard";
import { IncomeMoMCard } from "@/components/insights/IncomeMoMCard";
import { IncomeYTDByEntityCard } from "@/components/insights/IncomeYTDByEntityCard";
import { YTDIncomeBreakdownByEntityCard } from "@/components/insights/YTDIncomeBreakdownByEntityCard";
import { RevenueQuarterlySection } from "@/components/metrics/dashboards";
import { RevenueCustomersDashboard } from "@/components/insights/revenue-customers/RevenueCustomersDashboard";
import { MasterPlanButton } from "@/components/metrics/dashboards/plans/MasterPlanButton";
import { GridWidgetCard } from "@/components/metrics/GridWidgetCard";
import { useGridLayout, generateDefaultLayout } from "@/hooks/useGridLayout";
import { useUserGridLayout } from "@/hooks/useUserGridLayout";
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
import { FinServPerHourStat } from "@/components/insights/FinServPerHourStat";
import {
  FinServActiveClientCountStat,
  FinServTotalMrrStat,
} from "@/components/insights/FinServPipelineSnapshotStat";
import { DatarailsWidgetEditor } from "@/components/widget-editor/DatarailsWidgetEditor";
import { DEFAULT_WIDGET_CONFIG, WidgetConfig as DatarailsWidgetConfig } from "@/components/widget-editor/widgetTypes";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompanyDashboardConfig } from "@/hooks/useCompanyDashboardConfig";
import { useMetricsEditPermission } from "@/hooks/useMetricsEditPermission";
import { useAuth } from "@/contexts/AuthContext";
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
  ConsolidatedDebtPipelineDashboard,
  LenderIntelligenceDashboard,
  ControllerDashboard,
  ExecutiveDashboard,
  FinServFinancialMetricsDashboard,
  ManagementReviewCarousel,
} from "@/components/metrics/dashboards";
import { SalesDashboardV2 } from "@/components/metrics/dashboards/SalesDashboardV2";
import { SalesBdDashboard } from "@/components/metrics/dashboards/SalesBdDashboard";
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
import { ExportAllPagesDialog } from "@/components/insights/ExportAllPagesDialog";
import { useInsightsComparison } from "@/hooks/useInsightsComparison";
import { exportInsightsCsv, exportInsightsPdf, type InsightsExportContext } from "@/utils/insightsExport";
import { FileSpreadsheet, FileText } from "lucide-react";
// Dashboard options — single source of truth shared with the Master Plan
// tab strip. See `src/config/insightsDashboards.ts`.
import { DASHBOARD_OPTIONS } from "@/config/insightsDashboards";

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
    dashboardIds: ['revenue-customers', 'controller-dashboard'],
  },
  {
    id: 'sales-bd',
    name: 'Sales & BD',
    dashboardIds: ['sales-bd-page', 'sales-dashboard-v2', 'sales-bd-roi', 'consolidated-debt-pipeline', 'lender-intelligence'],
  },
];

const DEFAULT_FOLDER_IDS = new Set(
  DEFAULT_FOLDER_GROUPS.flatMap(g => g.dashboardIds)
);

const DEFAULT_FOLDER_EXPANDED_STORAGE_KEY = 'insights-default-folder-expanded-v1';
const SELECTED_DASHBOARD_SESSION_KEY = 'insights-selected-dashboard-v1';

function readPersistedInsightsDashboard() {
  try {
    return globalThis.sessionStorage?.getItem(SELECTED_DASHBOARD_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

function persistInsightsDashboard(id: string) {
  try {
    globalThis.sessionStorage?.setItem(SELECTED_DASHBOARD_SESSION_KEY, id);
  } catch {
    // ignore storage failures
  }
}

function getInitialInsightsDashboard(search: string) {
  const params = new URLSearchParams(search);
  const dashParam = params.get('dashboard');
  if (dashParam) return dashParam;
  const view = params.get('view');
  if (view === 'weekly-rundown') return 'management-snapshot';
  if (params.get('tab')) return 'management-review';

  // If the page remounts because a timeframe picker wrote URL params, keep the
  // user's current dashboard instead of falling back to Weekly Rundown.
  const hasTimeframeParams = params.has('tf') || params.has('tfStart') || params.has('tfEnd') || params.has('view') || params.has('period');
  if (hasTimeframeParams) return readPersistedInsightsDashboard() || 'management-snapshot';

  return 'management-snapshot';
}

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
        <ChartWidgetContent title={widget.title} description="QuickBooks revenue">
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
        <ChartWidgetContent title={widget.title} description="Deal creation trend">
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
    case 'finserv-revenue-per-hour':
      return <FinServPerHourStat title={widget.title} color={widget.color} mode="revenue" timePeriod={widget.timePeriod} />;
    case 'finserv-profit-per-hour':
      return <FinServPerHourStat title={widget.title} color={widget.color} mode="profit" timePeriod={widget.timePeriod} />;
    case 'finserv-active-client-count':
      return <FinServActiveClientCountStat title={widget.title} color={widget.color} timePeriod={widget.timePeriod} />;
    case 'finserv-total-mrr':
      return <FinServTotalMrrStat title={widget.title} color={widget.color} timePeriod={widget.timePeriod} />;
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

  const location = useLocation();
  const initialDashboardRef = useRef<string | null>(null);
  if (initialDashboardRef.current === null) {
    initialDashboardRef.current = getInitialInsightsDashboard(location.search);
  }
  const [selectedDashboard, setSelectedDashboard] = useState(initialDashboardRef.current);
  // Ref updated below once allowedDashboardIds is computed, so selectDashboard
  // (declared before the memo for hook-ordering reasons) can enforce the
  // per-user allowlist without depending on it directly.
  const allowedDashboardIdsRef = useRef<Set<string> | null>(null);
  const selectDashboard = useCallback((id: string) => {
    const allowed = allowedDashboardIdsRef.current;
    const nextId = allowed && !allowed.has(id) ? (Array.from(allowed)[0] ?? id) : id;
    persistInsightsDashboard(nextId);
    setSelectedDashboard(nextId);
    // Reflect the current dashboard in the URL so /insights?dashboard=<id>
    // is a shareable deep link. Preserve other query params (timeframe,
    // reporting period, etc.) and replace history to keep the back stack clean.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('dashboard') !== nextId) {
        url.searchParams.set('dashboard', nextId);
        window.history.replaceState(window.history.state, '', url.toString());
      }
    } catch {
      /* no-op */
    }
  }, []);
  const [isEditMode, setIsEditMode] = useState(false);

  // Per-user Insights dashboard restrictions. Users listed here only see the
  // dashboards in their allowlist; the dropdown, folders and custom dashboards
  // are all filtered accordingly and the initial/active selection is forced
  // into the allowlist.
  const { user: authUser } = useAuth();
  const RESTRICTED_DASHBOARDS: Record<string, readonly string[]> = {
    'ppina@5thline.co': ['sales-dashboard-v2', 'consolidated-debt-pipeline'],
    'nheikali@5thline.co': ['sales-dashboard-v2', 'consolidated-debt-pipeline'],
    'ffustinoni@5thline.co': ['sales-dashboard-v2', 'sales-bd-roi', 'consolidated-debt-pipeline'],
  };
  const allowedDashboardIds = useMemo(() => {
    const email = authUser?.email?.toLowerCase();
    const list = email ? RESTRICTED_DASHBOARDS[email] : undefined;
    return list ? new Set(list) : null;
  }, [authUser?.email]);
  // Keep the ref in sync so selectDashboard can enforce restrictions
  // for deep-link driven calls that happen outside the dropdown.
  allowedDashboardIdsRef.current = allowedDashboardIds;
  const isInsightsLayoutEditor = authUser?.email?.toLowerCase() === 'jturner@5thline.co';
  const visibleDashboardOptions = useMemo(
    () => allowedDashboardIds
      ? DASHBOARD_OPTIONS.filter(d => allowedDashboardIds.has(d.id))
      : DASHBOARD_OPTIONS,
    [allowedDashboardIds]
  );
  // Hard block: if the persisted / deep-link / default selection isn't in the
  // user's allowlist, treat it as the first allowed dashboard immediately —
  // don't wait for the correcting useEffect below, otherwise the restricted
  // dashboard renders for a frame and the user can see (and interact with) it.
  const effectiveSelectedDashboard = useMemo(() => {
    if (!allowedDashboardIds) return selectedDashboard;
    if (allowedDashboardIds.has(selectedDashboard)) return selectedDashboard;
    return visibleDashboardOptions[0]?.id ?? selectedDashboard;
  }, [allowedDashboardIds, selectedDashboard, visibleDashboardOptions]);
  useEffect(() => {
    if (allowedDashboardIds && !allowedDashboardIds.has(selectedDashboard)) {
      const first = visibleDashboardOptions[0]?.id;
      if (first) selectDashboard(first);
    }
  }, [allowedDashboardIds, selectedDashboard, selectDashboard, visibleDashboardOptions]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const undoStackRef = useRef<Array<{ type: 'card' | 'section'; id: string; label: string; undo: () => void }>>([]);

  // Deep-link support for the Weekly Rundown email CTA.
  // /insights?view=weekly-rundown opens the Weekly Rundown
  // (management-snapshot) dashboard automatically.
  const [searchParams] = useSearchParams();
  // Track the deep-link params we've already honored so subsequent
  // searchParam changes (e.g. the global Reporting Period picker writing
  // `view=month|quarter` + `period=…` to the URL) don't yank the user
  // back to the Weekly Rundown while they're viewing another dashboard.
  const lastHandledDeepLinkRef = useRef<{ view: string | null; tab: string | null } | null>(null);
  useEffect(() => {
    const view = searchParams.get('view');
    const tab = searchParams.get('tab');
    const dashboard = searchParams.get('dashboard');
    const last = lastHandledDeepLinkRef.current;
    const isFirstRun = last === null;
    const viewChanged = !isFirstRun && last!.view !== view;
    const tabChanged = !isFirstRun && last!.tab !== tab;
    const dashboardChanged = !isFirstRun && (last as any).dashboard !== dashboard;
    lastHandledDeepLinkRef.current = { view, tab, dashboard } as any;

    // Explicit ?dashboard=<id> deep link (initial load, back/forward,
    // pasted URL) wins over the legacy view/tab heuristics below.
    if (dashboard && (isFirstRun || dashboardChanged)) {
      selectDashboard(dashboard);
      return;
    }

    // Only the Weekly Rundown deep link uses `view`. Other `view` values
    // (e.g. the ReportingPeriodPicker's `month` / `quarter`) must be
    // ignored so switching the timeframe doesn't reset the dashboard.
    if (view === 'weekly-rundown' && (isFirstRun || viewChanged)) {
      selectDashboard('management-snapshot');
      return;
    }
    // Deep-link from Submit-for-review email: ?tab=jt|jm|sw opens the
    // Management Review carousel; the carousel picks the inner tab.
    if (tab && (isFirstRun || tabChanged)) {
      selectDashboard('management-review');
      return;
    }
    // Plain navigation to /insights (no deep-link params) lands on the
    // Weekly Rundown — but only on the initial mount, never as a reaction
    // to unrelated searchParam updates.
    if (isFirstRun && !view && !tab) {
      selectDashboard('management-snapshot');
    }
  }, [searchParams, selectDashboard]);

  // Legacy redirect: QuickBooks Financial dashboard was merged into the
  // Controller Dashboard. Any deep links or persisted selections pointing
  // at the old id are transparently routed to its replacement.
  useEffect(() => {
    if (selectedDashboard === 'quickbooks-financial') {
      selectDashboard('controller-dashboard');
    }
  }, [selectedDashboard, selectDashboard]);

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
    selectDashboard(newDashboard.id);
    setCreateDashboardOpen(false);
    setNewDashboardName('');
    setIsEditMode(true);
    toast({ title: 'Dashboard created', description: `"${newDashboard.name}" is ready. Add widgets to get started.` });
  };

  const handleDeleteCustomDashboard = (dashId: string) => {
    saveCustomDashboards({ dashboards: customDashboards.filter(d => d.id !== dashId) });
    if (selectedDashboard === dashId) selectDashboard('management-review');
    toast({ title: 'Dashboard deleted' });
  };

  const handleRenameCustomDashboard = (dashId: string, newName: string) => {
    saveCustomDashboards({
      dashboards: customDashboards.map(d => d.id === dashId ? { ...d, name: newName } : d),
    });
  };

  // For restricted users, custom dashboards are never accessible — the
  // effective selection is forced back into the allowlist above, so we key
  // custom-dashboard detection off the guarded value too.
  const isCustomDashboard = !allowedDashboardIds && selectedDashboard.startsWith('custom-');
  const activeCustomDashboard = allowedDashboardIds
    ? undefined
    : customDashboards.find(d => d.id === selectedDashboard);

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
    ...visibleDashboardOptions,
    ...(allowedDashboardIds ? [] : customDashboards).map(d => ({ id: d.id, name: d.name, isFavorite: false })),
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

  // Locked Weekly Rundown widget set — matches the canonical layout below.
  // Small header revenue cards and the revenue-by-month tile were removed
  // from the layout at the user's request; the 2-column arrangement in
  // `unifiedLayoutDefaults` is the only source of truth for placement.
  const SNAPSHOT_CARD_IDS: EditableManagementSnapshotCardId[] = [
    'total-revenue-detail',
  ];

  // Unified layout IDs: snapshot cards + section blocks + custom widgets in ONE grid.
  // Section blocks are full-width tiles in the same grid so users can drag any
  // widget across, above, below, or between sections in edit mode.
  const SNAPSHOT_SUB_WIDGET_IDS: import('@/components/metrics/dashboards/ManagementSnapshotDashboard').WeeklyRundownSubWidgetId[] = [
    'rev-debt','rev-finserv',
    'last-week-summary',
    'sd-deals-signed','sd-finserv-clients-signed','sd-outstanding-ar',
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
  // LOCKED Weekly Rundown layout — two equal columns, four rows.
  // Do not modify without an explicit user request. The layout key below is
  // bumped whenever this arrangement changes so every user re-hydrates the
  // canonical version on next load.
  const unifiedLayoutDefaults = useMemo(() => {
    const defaults: import('@/hooks/useGridLayout').GridLayoutItem[] = [
      // LOCKED Weekly Rundown layout — do NOT modify without an explicit user
      // request. Every widget locks w/h with matching min/max so react-grid-
      // layout cannot auto-resize on refresh, data change, or per user.
      // ROW 1 (y:0..9) — three columns:
      //   LEFT  : LAST WEEK (tall, spans full row height)
      //   MID   : TOTAL REVENUE
      //   RIGHT : DEALS BY STATUS stacked over OUTSTANDING A/R
      { i: 'last-week-summary',    x: 0, y: 0, w: 6, h: 9, minW: 6, maxW: 6, minH: 9, maxH: 9 },
      { i: 'total-revenue-detail', x: 6, y: 0, w: 3, h: 4, minW: 3, maxW: 3, minH: 4, maxH: 4 },
      { i: 'exec-deals-by-status', x: 9, y: 0, w: 3, h: 4, minW: 3, maxW: 3, minH: 4, maxH: 4 },
      { i: 'sd-outstanding-ar',    x: 6, y: 4, w: 6, h: 5, minW: 6, maxW: 6, minH: 5, maxH: 5 },
      // ROW 2 (y:9..15) — Debt / FinServ revenue charts
      { i: 'rev-debt',             x: 0, y: 9,  w: 6, h: 6, minW: 6, maxW: 6, minH: 6, maxH: 6 },
      { i: 'rev-finserv',          x: 6, y: 9,  w: 6, h: 6, minW: 6, maxW: 6, minH: 6, maxH: 6 },
      // ROW 3 (y:15..21) — Deals Signed / FinServ Clients Signed
      { i: 'sd-deals-signed',           x: 0, y: 15, w: 6, h: 6, minW: 6, maxW: 6, minH: 6, maxH: 6 },
      { i: 'sd-finserv-clients-signed', x: 6, y: 15, w: 6, h: 6, minW: 6, maxW: 6, minH: 6, maxH: 6 },
    ];
    return defaults;
  }, []);

  const {
    layout: snapshotGridLayout,
    saveLayout: saveSnapshotGridLayout,
    resetLayout: resetSnapshotGridLayout,
  } = useUserGridLayout('management-snapshot-unified-v28', unifiedLayoutIds, {
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
      const candidateIds = visibleDashboardOptions
        .filter(d => !DEFAULT_FOLDER_IDS.has(d.id))
        .map(d => d.id);
      return getUnfolderedDashboardIds(candidateIds);
    },
    [folders, getUnfolderedDashboardIds, visibleDashboardOptions]
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
          <StickyDashboardHeader
            surface="module"
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-3">
                {/* Dashboard Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-auto p-0 bg-transparent hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent data-[state=open]:bg-transparent"
                    >
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-6 w-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight bg-transparent text-foreground">
                          {allDashboardOptions.find(d => d.id === selectedDashboard)?.name || 'Dashboard'}
                        </h1>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  {/* Master Plan editor: monthly plan/target values for every widget across every dashboard. */}
                  {/* Rendered as a sibling so it stays inside the header row next to the dashboard title. */}
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="w-[22rem] max-h-[72vh] overflow-y-auto p-2 rounded-xl border border-white/[0.06] bg-[rgba(14,18,28,0.92)] backdrop-blur-xl shadow-[0_24px_48px_-24px_rgba(0,0,0,0.7)] z-50"
                  >
                    {/* Default code-defined folders (Management Insights, Financial, Sales & BD) */}
                    {DEFAULT_FOLDER_GROUPS.map((group, groupIdx) => {
                      const isExpanded = defaultFolderExpanded[group.id] ?? true;
                      const groupDashboards = group.dashboardIds
                        .map(id => visibleDashboardOptions.find(d => d.id === id))
                        .filter(Boolean) as typeof DASHBOARD_OPTIONS;
                      if (groupDashboards.length === 0) return null;

                      return (
                        <div key={group.id} className={cn(groupIdx > 0 && "mt-1")}>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-white/[0.04]"
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
                                <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground/70" />
                              )}
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">{group.name}</span>
                              <span className="text-[10px] font-medium text-muted-foreground/50 tabular-nums">{groupDashboards.length}</span>
                            </div>
                          </div>
                          {isExpanded && <div className="mt-0.5 space-y-0.5">{groupDashboards.map((dashboard) => (
                            <DropdownMenuItem
                              key={dashboard.id}
                              className={cn(
                                "group/item flex items-center justify-between py-1.5 pl-7 pr-2 rounded-md transition-colors focus:bg-white/[0.05] hover:bg-white/[0.04]",
                                selectedDashboard === dashboard.id && "bg-primary/10 text-foreground"
                              )}
                              onClick={() => selectDashboard(dashboard.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                                  selectedDashboard === dashboard.id ? "bg-primary" : "bg-muted-foreground/30"
                                )} />
                                <span className="text-sm truncate">{dashboard.name}</span>
                              </div>
                              {dashboard.isFavorite && (
                                <Star className="h-3 w-3 text-primary fill-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          ))}</div>}
                        </div>
                      );
                    })}

                    {/* User-created folders (DB-backed) */}
                    {folders.map((folder) => {
                      const folderDashboards = folder.dashboardIds
                        .map(id => visibleDashboardOptions.find(d => d.id === id))
                        .filter(Boolean);
                      
                      return (
                        <div key={folder.id} className="mt-1">
                          <div
                            className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group transition-colors hover:bg-white/[0.04]"
                            onClick={() => toggleFolder(folder.id)}
                          >
                            <div className="flex items-center gap-2">
                              {folder.isExpanded ? (
                                <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground/70" />
                              )}
                              <Folder className="h-3.5 w-3.5 text-muted-foreground/70" />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">{folder.name}</span>
                              <span className="text-[10px] font-medium text-muted-foreground/50 tabular-nums">{folderDashboards.length}</span>
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
                          {folder.isExpanded && <div className="mt-0.5 space-y-0.5">{folderDashboards.map((dashboard) => dashboard && (
                            <DropdownMenuSub key={dashboard.id}>
                              <div className="flex items-center gap-0.5">
                                <DropdownMenuItem
                                  className={cn(
                                    "flex-1 flex items-center justify-between py-1.5 pl-7 pr-2 rounded-md transition-colors focus:bg-white/[0.05] hover:bg-white/[0.04]",
                                    selectedDashboard === dashboard.id && "bg-primary/10 text-foreground"
                                  )}
                                  onClick={() => selectDashboard(dashboard.id)}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn(
                                      "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                                      selectedDashboard === dashboard.id ? "bg-primary" : "bg-muted-foreground/30"
                                    )} />
                                    <span className="text-sm truncate">{dashboard.name}</span>
                                  </div>
                                </DropdownMenuItem>
                                <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05]">
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
                          ))}</div>}
                        </div>
                      );
                    })}

                    {folders.length > 0 && unfolderedIds.length > 0 && (
                      <DropdownMenuSeparator className="my-1.5 bg-white/[0.05]" />
                    )}

                    {/* Unfoldered dashboards */}
                    {unfolderedIds.map((id) => {
                      const dashboard = visibleDashboardOptions.find(d => d.id === id);
                      if (!dashboard) return null;
                      return (
                        <DropdownMenuSub key={dashboard.id}>
                          <div className="flex items-center gap-0.5">
                            <DropdownMenuItem
                              className={cn(
                                "flex-1 flex items-center justify-between py-1.5 px-2 rounded-md transition-colors focus:bg-white/[0.05] hover:bg-white/[0.04]",
                                selectedDashboard === dashboard.id && "bg-primary/10 text-foreground"
                              )}
                              onClick={() => selectDashboard(dashboard.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                                  selectedDashboard === dashboard.id ? "bg-primary" : "bg-muted-foreground/30"
                                )} />
                                <span className="text-sm truncate">{dashboard.name}</span>
                              </div>
                              <Star
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  dashboard.isFavorite
                                    ? "text-primary fill-primary"
                                    : "text-muted-foreground/30"
                                )}
                              />
                            </DropdownMenuItem>
                            {folders.length > 0 && (
                              <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05]">
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
                    {!allowedDashboardIds && customDashboards.length > 0 && (
                      <DropdownMenuSeparator className="my-1.5 bg-white/[0.05]" />
                    )}
                    {(allowedDashboardIds ? [] : customDashboards).map((dash) => (
                      <DropdownMenuSub key={dash.id}>
                        <div className="flex items-center gap-0.5">
                          <DropdownMenuItem
                            className={cn(
                              "flex-1 flex items-center justify-between py-1.5 px-2 rounded-md transition-colors focus:bg-white/[0.05] hover:bg-white/[0.04]",
                              selectedDashboard === dash.id && "bg-primary/10 text-foreground"
                            )}
                            onClick={() => selectDashboard(dash.id)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <LayoutDashboard className="h-3.5 w-3.5 text-chart-4 shrink-0" />
                              <span className="text-sm truncate">{dash.name}</span>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSubTrigger className="h-7 w-7 p-0 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05]">
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
                        <DropdownMenuSeparator className="my-1.5 bg-white/[0.05]" />
                        <DropdownMenuItem
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-primary/90 hover:text-primary focus:bg-primary/10 hover:bg-primary/[0.08] transition-colors"
                          onClick={() => setNewFolderOpen(true)}
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                          <span className="text-sm font-medium">New Folder</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-primary/90 hover:text-primary focus:bg-primary/10 hover:bg-primary/[0.08] transition-colors"
                          onClick={() => setCreateDashboardOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span className="text-sm font-medium">Create New Dashboard</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedDashboard !== 'management-review' && <MasterPlanButton />}
                <SyncStatusBar />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {effectiveSelectedDashboard === 'consolidated-debt-pipeline' && (
                <DebtAdvisoryComparisonToggle />
              )}
              {selectedDashboard !== 'management-review' && (
                <InsightsTimeframePicker />
              )}

              {effectiveSelectedDashboard === 'management-review' && (
                <ReportingPeriodPicker />
              )}

              {effectiveSelectedDashboard === 'management-review' && (
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

              {effectiveSelectedDashboard === 'management-review' && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={assistantTriggerRef}
                      variant="outline"
                      size="sm"
                      aria-label="Open Insights Assistant"
                      aria-haspopup="dialog"
                      aria-expanded={assistantOpen}
                      className="h-9 w-9 p-0 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 text-primary hover:from-primary/15 hover:to-primary/10 hidden"
                      onClick={() => setAssistantOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI Summary, Q&amp;A, Drivers, Forecast, Anomalies</TooltipContent>
                </UITooltip>
              )}

              {effectiveSelectedDashboard === 'management-review' && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Export report for ${insightsExportContext.periodLabel}`}
                      className="h-9 w-9 p-0"
                      onClick={() => setExportAllOpen(true)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export report — {insightsExportContext.periodLabel}</TooltipContent>
                </UITooltip>
              )}

              <DropdownMenu>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Presets"
                        className="h-9 w-9 p-0 hidden"
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

              {canEditMetrics && (selectedDashboard !== 'management-review' || isInsightsLayoutEditor) && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isEditMode ? "default" : "outline"}
                      size="sm"
                      aria-label={isEditMode ? "Done Editing" : "Edit Layout"}
                      aria-pressed={isEditMode}
                      className="h-9 w-9 p-0 hidden"
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

              {isEditMode && canEditMetrics && effectiveSelectedDashboard === 'management-snapshot' && (
                <>
                  <Button size="sm" onClick={handleAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Widget
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      saveSnapshotGridLayout(snapshotGridLayout, true);
                      toast({ title: 'Saved as default layout', description: 'This arrangement is now the default for everyone in your workspace.' });
                    }}
                    title="Persist the current arrangement as the default layout for all members"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save as Default
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
          {effectiveSelectedDashboard === 'management-review' && (
            <InsightsAssistantSheet
              open={assistantOpen}
              onOpenChange={setAssistantOpen}
              returnFocusRef={assistantTriggerRef}
            />
          )}

          {/* On-demand Cover preview (Insights Dashboard only) */}
          {effectiveSelectedDashboard === 'management-review' && (
            <CoverPreviewDialog
              open={coverPreviewOpen}
              onOpenChange={setCoverPreviewOpen}
            />
          )}

          {effectiveSelectedDashboard === 'management-review' && (
            <ExportAllPagesDialog
              open={exportAllOpen}
              onOpenChange={setExportAllOpen}
            />
          )}

          {/* Dashboard Content - always show pre-built dashboards */}
          <EditableDashboardWrapper isEditMode={isEditMode} onCardEdit={() => { /* edit only via explicit pencil button */ }}>
            {effectiveSelectedDashboard === 'management-snapshot' && (
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
            {effectiveSelectedDashboard === 'sales-bd-roi' && <SalesBDROIDashboard />}
            {effectiveSelectedDashboard === 'revenue-customers' && (
              <div>
                <RevenueCustomersDashboard />
                <div className="mt-4">
                  <RevenueQuarterlySection selectedQuarter={dashboardSelectedQuarter} />
                </div>
              </div>
            )}
            {effectiveSelectedDashboard === 'sales-bd-page' && <SalesBdDashboard />}
            {effectiveSelectedDashboard === 'sales-dashboard-v2' && <SalesDashboardV2 />}
            {effectiveSelectedDashboard === 'consolidated-debt-pipeline' && (
              <ConsolidatedDebtPipelineDashboard selectedQuarter={dashboardSelectedQuarter} />
            )}
            {effectiveSelectedDashboard === 'lender-intelligence' && <LenderIntelligenceDashboard />}
            {effectiveSelectedDashboard === 'controller-dashboard' && <ControllerDashboard />}
            {effectiveSelectedDashboard === 'finserv-financial-metrics' && <FinServFinancialMetricsDashboard />}
            {effectiveSelectedDashboard === 'management-review' && (
              <ManagementReviewCarousel
                isEditMode={isEditMode}
                onExitEditMode={() => setIsEditMode(false)}
              />
            )}

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
