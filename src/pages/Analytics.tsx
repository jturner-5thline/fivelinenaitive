import { useState, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, AreaChart, GripVertical, CalendarIcon, RotateCcw, LayoutGrid, Grid2X2, Grid3X3, Save, FolderOpen } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCharts, ChartType, ChartConfig } from '@/contexts/ChartsContext';
import { useAnalyticsWidgets, WidgetConfig, WidgetDataSource, WIDGET_DATA_SOURCES, LayoutPreset } from '@/contexts/AnalyticsWidgetsContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDealsContext } from '@/contexts/DealsContext';
import { Deal } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
import { SortableStatWidget } from '@/components/analytics/SortableStatWidget';
import { SortableListWidget } from '@/components/analytics/SortableListWidget';
import { 
  BarChart, 
  Bar, 
  LineChart as RechartsLineChart, 
  Line, 
  PieChart as RechartsPieChart, 
  Pie, 
  AreaChart as RechartsAreaChart, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

// Calculate hours data from deals
const getHoursData = (deals: Deal[]) => {
  const totalPreSigning = deals.reduce((sum, deal) => sum + (deal.preSigningHours ?? 0), 0);
  const totalPostSigning = deals.reduce((sum, deal) => sum + (deal.postSigningHours ?? 0), 0);
  const totalHours = totalPreSigning + totalPostSigning;
  const totalFees = deals.reduce((sum, deal) => sum + (deal.totalFee || 0), 0);
  const totalRetainer = deals.reduce((sum, deal) => sum + (deal.retainerFee ?? 0), 0);
  const totalMilestone = deals.reduce((sum, deal) => sum + (deal.milestoneFee ?? 0), 0);
  const avgSuccessFee = deals.filter(d => d.successFeePercent != null).length > 0
    ? deals.reduce((sum, deal) => sum + (deal.successFeePercent ?? 0), 0) / deals.filter(d => d.successFeePercent != null).length
    : 0;
  const revenuePerHour = totalHours > 0 ? totalFees / totalHours : 0;
  
  // Calculate average hours per deal
  const dealsWithHours = deals.filter(d => (d.preSigningHours ?? 0) + (d.postSigningHours ?? 0) > 0);
  const dealsWithHoursCount = dealsWithHours.length;
  const avgHoursPerDeal = dealsWithHoursCount > 0 ? totalHours / dealsWithHoursCount : 0;
  
  const hoursByManager: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  deals.forEach(deal => {
    if (!hoursByManager[deal.manager]) {
      hoursByManager[deal.manager] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByManager[deal.manager].preSigning += deal.preSigningHours ?? 0;
    hoursByManager[deal.manager].postSigning += deal.postSigningHours ?? 0;
    hoursByManager[deal.manager].fees += deal.totalFee || 0;
  });
  
  const hoursByStage: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  deals.forEach(deal => {
    if (!hoursByStage[deal.stage]) {
      hoursByStage[deal.stage] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByStage[deal.stage].preSigning += deal.preSigningHours ?? 0;
    hoursByStage[deal.stage].postSigning += deal.postSigningHours ?? 0;
    hoursByStage[deal.stage].fees += deal.totalFee || 0;
  });
  
  return {
    totalPreSigning, totalPostSigning, totalHours, totalFees, totalRetainer, totalMilestone, avgSuccessFee, revenuePerHour,
    dealsWithHoursCount, avgHoursPerDeal,
    byManager: Object.entries(hoursByManager).map(([name, data]) => ({
      name, preSigning: data.preSigning, postSigning: data.postSigning, total: data.preSigning + data.postSigning,
      fees: data.fees, revenuePerHour: (data.preSigning + data.postSigning) > 0 ? data.fees / (data.preSigning + data.postSigning) : 0,
    })),
    byStage: Object.entries(hoursByStage).map(([name, data]) => ({
      name, preSigning: data.preSigning, postSigning: data.postSigning, total: data.preSigning + data.postSigning,
      fees: data.fees, revenuePerHour: (data.preSigning + data.postSigning) > 0 ? data.fees / (data.preSigning + data.postSigning) : 0,
    })),
  };
};

const getChartData = (dataSource: string, allDeals: Deal[], dateRange?: DateRange) => {
  const filteredDeals = dateRange?.from && dateRange?.to 
    ? allDeals.filter(deal => {
        const dealDate = new Date(deal.createdAt);
        return isWithinInterval(dealDate, { start: dateRange.from!, end: dateRange.to! });
      })
    : allDeals;
  switch (dataSource) {
    case 'deals-by-stage':
      const stageCounts: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        stageCounts[deal.stage] = (stageCounts[deal.stage] || 0) + 1;
      });
      return Object.entries(stageCounts).map(([name, value]) => ({ name, value }));
    
    case 'monthly-value':
      return [
        { name: 'Jan', value: 12500000 },
        { name: 'Feb', value: 15000000 },
        { name: 'Mar', value: 18000000 },
        { name: 'Apr', value: 22000000 },
        { name: 'May', value: 19500000 },
        { name: 'Jun', value: 25000000 },
      ];
    
    case 'deals-by-status':
      const statusCounts: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        statusCounts[deal.status] = (statusCounts[deal.status] || 0) + 1;
      });
      return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    
    case 'lender-activity':
      const activityCounts: Record<string, number> = { Active: 0, 'On Deck': 0, Passed: 0, 'On Hold': 0 };
      filteredDeals.forEach(deal => {
        deal.lenders?.forEach(lender => {
          if (lender.trackingStatus === 'active') activityCounts['Active']++;
          else if (lender.trackingStatus === 'on-deck') activityCounts['On Deck']++;
          else if (lender.trackingStatus === 'passed') activityCounts['Passed']++;
          else if (lender.trackingStatus === 'on-hold') activityCounts['On Hold']++;
        });
      });
      return Object.entries(activityCounts).map(([name, value]) => ({ name, value }));
    
    case 'deal-value-distribution':
      const valueBuckets = { '$0-5M': 0, '$5-10M': 0, '$10-20M': 0, '$20M+': 0 };
      filteredDeals.forEach(deal => {
        if (deal.value < 5000000) valueBuckets['$0-5M']++;
        else if (deal.value < 10000000) valueBuckets['$5-10M']++;
        else if (deal.value < 20000000) valueBuckets['$10-20M']++;
        else valueBuckets['$20M+']++;
      });
      return Object.entries(valueBuckets).map(([name, value]) => ({ name, value }));
    
    case 'lender-pass-reasons':
      const passReasonCounts: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        deal.lenders?.forEach(lender => {
          if (lender.trackingStatus === 'passed' && lender.passReason) {
            passReasonCounts[lender.passReason] = (passReasonCounts[lender.passReason] || 0) + 1;
          }
        });
      });
      if (Object.keys(passReasonCounts).length === 0) {
        return [
          { name: 'Deal size too small', value: 5 },
          { name: 'Industry mismatch', value: 8 },
          { name: 'Risk profile', value: 4 },
          { name: 'Timing issues', value: 3 },
          { name: 'Terms not competitive', value: 6 },
        ];
      }
      return Object.entries(passReasonCounts).map(([name, value]) => ({ name, value }));
    
    case 'hours-by-manager':
      const hoursData = getHoursData(allDeals);
      return hoursData.byManager.map(m => ({ name: m.name, value: m.total }));
    
    case 'hours-by-stage':
      const hoursDataByStage = getHoursData(allDeals);
      return hoursDataByStage.byStage.map(s => ({ name: s.name, value: s.total }));
    
    case 'fee-breakdown':
      const totalRetainer = filteredDeals.reduce((sum, deal) => sum + (deal.retainerFee ?? 0), 0);
      const totalMilestone = filteredDeals.reduce((sum, deal) => sum + (deal.milestoneFee ?? 0), 0);
      const totalSuccessFee = filteredDeals.reduce((sum, deal) => {
        if (deal.successFeePercent && deal.value) {
          return sum + (deal.value * deal.successFeePercent / 100);
        }
        return sum;
      }, 0);
      return [
        { name: 'Retainer', value: totalRetainer },
        { name: 'Milestone', value: totalMilestone },
        { name: 'Success Fee', value: totalSuccessFee },
      ].filter(item => item.value > 0);
    
    case 'revenue-per-hour':
      const revenueHoursData = getHoursData(filteredDeals);
      return [
        { name: 'Revenue/Hour', value: Math.round(revenueHoursData.revenuePerHour) },
      ];
    
    case 'avg-hours-per-deal':
      const dealsWithHours = filteredDeals.filter(d => (d.preSigningHours ?? 0) + (d.postSigningHours ?? 0) > 0);
      const avgPreSigning = dealsWithHours.length > 0
        ? dealsWithHours.reduce((sum, d) => sum + (d.preSigningHours ?? 0), 0) / dealsWithHours.length
        : 0;
      const avgPostSigning = dealsWithHours.length > 0
        ? dealsWithHours.reduce((sum, d) => sum + (d.postSigningHours ?? 0), 0) / dealsWithHours.length
        : 0;
      return [
        { name: 'Pre-Signing', value: Math.round(avgPreSigning * 10) / 10 },
        { name: 'Post-Signing', value: Math.round(avgPostSigning * 10) / 10 },
        { name: 'Total', value: Math.round((avgPreSigning + avgPostSigning) * 10) / 10 },
      ];
    
    case 'revenue-per-hour-by-manager':
      const managerRevenueData = getHoursData(filteredDeals);
      return managerRevenueData.byManager
        .filter(m => m.total > 0)
        .map(m => ({ name: m.name, value: Math.round(m.revenuePerHour) }));
    
    case 'deals-by-referral-source':
      const referralCounts: Record<string, { count: number; value: number }> = {};
      filteredDeals.forEach(deal => {
        const sourceName = deal.referredBy?.name || 'Direct / No Referral';
        if (!referralCounts[sourceName]) {
          referralCounts[sourceName] = { count: 0, value: 0 };
        }
        referralCounts[sourceName].count++;
        referralCounts[sourceName].value += deal.value || 0;
      });
      return Object.entries(referralCounts)
        .map(([name, data]) => ({ name, value: data.count, dealValue: data.value }))
        .sort((a, b) => b.value - a.value);
    
    case 'deal-value-by-referral-source':
      const referralValues: Record<string, number> = {};
      filteredDeals.forEach(deal => {
        const sourceName = deal.referredBy?.name || 'Direct / No Referral';
        referralValues[sourceName] = (referralValues[sourceName] || 0) + (deal.value || 0);
      });
      return Object.entries(referralValues)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    
    default:
      return [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
        { name: 'C', value: 15 },
        { name: 'D', value: 25 },
      ];
  }
};

const DATA_SOURCES = [
  { id: 'deals-by-stage', label: 'Deals by Stage' },
  { id: 'monthly-value', label: 'Monthly Deal Value' },
  { id: 'deals-by-status', label: 'Deals by Status' },
  { id: 'lender-activity', label: 'Lender Activity' },
  { id: 'deal-value-distribution', label: 'Deal Value Distribution' },
  { id: 'lender-pass-reasons', label: 'Lender Pass Reasons' },
  { id: 'hours-by-manager', label: 'Hours by Manager' },
  { id: 'hours-by-stage', label: 'Hours by Stage' },
  { id: 'fee-breakdown', label: 'Fee Breakdown ($K)' },
  { id: 'revenue-per-hour', label: 'Revenue per Hour ($/hr)' },
  { id: 'avg-hours-per-deal', label: 'Avg Hours per Deal' },
  { id: 'revenue-per-hour-by-manager', label: 'Revenue/Hour by Manager' },
  { id: 'deals-by-referral-source', label: 'Deals by Referral Source' },
  { id: 'deal-value-by-referral-source', label: 'Deal Value by Referral Source' },
];

const CHART_COLORS = [
  '#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'
];

const ChartTypeIcon = ({ type }: { type: ChartType }) => {
  switch (type) {
    case 'bar': return <BarChart3 className="h-4 w-4" />;
    case 'line': return <LineChart className="h-4 w-4" />;
    case 'pie': return <PieChart className="h-4 w-4" />;
    case 'area': return <AreaChart className="h-4 w-4" />;
  }
};

function ChartRenderer({ chart, deals, dateRange, compact = false }: { chart: ChartConfig; deals: Deal[]; dateRange?: DateRange; compact?: boolean }) {
  const data = getChartData(chart.dataSource, deals, dateRange);
  const chartHeight = compact ? 180 : 250;
  
  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Bar dataKey="value" fill={chart.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color }} />
          </RechartsLineChart>
        </ResponsiveContainer>
      );
    
    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={compact ? 30 : 40}
              outerRadius={compact ? 60 : 80}
              paddingAngle={2}
              dataKey="value"
              label={compact ? undefined : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      );
    
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsAreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Area type="monotone" dataKey="value" stroke={chart.color} fill={chart.color} fillOpacity={0.3} />
          </RechartsAreaChart>
        </ResponsiveContainer>
      );
  }
}

// Sortable Chart Card Component
function SortableChartCard({ 
  chart,
  deals,
  dateRange, 
  onEdit, 
  onDelete,
  compact = false
}: { 
  chart: ChartConfig;
  deals: Deal[];
  dateRange?: DateRange;
  onEdit: (chart: ChartConfig) => void;
  onDelete: (chartId: string) => void;
  compact?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chart.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className={cn("group transition-all duration-300", isDragging && "shadow-lg ring-2 ring-primary/20")}>
      <CardHeader className={cn(
        "flex flex-row items-center justify-between space-y-0 pb-2",
        compact && "py-3"
      )}>
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <GripVertical className={cn("h-4 w-4", compact && "h-3 w-3")} />
          </button>
          <ChartTypeIcon type={chart.type} />
          <CardTitle className={cn("text-lg", compact && "text-base")}>{chart.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-8 w-8", compact && "h-6 w-6")}
            onClick={() => onEdit(chart)}
          >
            <Pencil className={cn("h-4 w-4", compact && "h-3 w-3")} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-8 w-8 text-destructive hover:text-destructive", compact && "h-6 w-6")}
            onClick={() => onDelete(chart.id)}
          >
            <Trash2 className={cn("h-4 w-4", compact && "h-3 w-3")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0 pb-3" : undefined}>
        <ChartRenderer chart={chart} deals={deals} dateRange={dateRange} compact={compact} />
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { charts, addChart, updateChart, deleteChart, reorderCharts } = useCharts();
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets, resetToDefaults, presets, savePreset, loadPreset, deletePreset } = useAnalyticsWidgets();
  const { deals } = useDealsContext();
  
  // Chart dialogs
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [deleteChartDialogOpen, setDeleteChartDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null);
  
  // Widget dialogs
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [deleteWidgetDialogOpen, setDeleteWidgetDialogOpen] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);

  // Preset dialogs
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [deletePresetDialogOpen, setDeletePresetDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [datePreset, setDatePreset] = useState<string>('all');
  const [layoutMode, setLayoutMode] = useState<'compact' | 'expanded'>(() => {
    const saved = localStorage.getItem('analytics-layout-mode');
    return (saved === 'compact' || saved === 'expanded') ? saved : 'expanded';
  });

  useEffect(() => {
    localStorage.setItem('analytics-layout-mode', layoutMode);
  }, [layoutMode]);
  
  const [chartFormData, setChartFormData] = useState({
    title: '',
    type: 'bar' as ChartType,
    dataSource: 'deals-by-stage',
    color: '#9333ea',
  });

  const [widgetFormData, setWidgetFormData] = useState({
    title: '',
    dataSource: 'total-fees' as WidgetDataSource,
    size: 'small' as 'small' | 'medium' | 'large',
  });

  // Memoize hours data to avoid recalculating on every render
  const hoursData = useMemo(() => getHoursData(deals), [deals]);

  // Separate widgets by type
  const statWidgets = widgets.filter(w => w.type === 'stat');
  const listWidgets = widgets.filter(w => w.type === 'list');

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    switch (preset) {
      case 'last7':
        setDateRange({ from: subDays(today, 7), to: today });
        break;
      case 'last30':
        setDateRange({ from: subDays(today, 30), to: today });
        break;
      case 'thisMonth':
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
      case 'last3Months':
        setDateRange({ from: subMonths(today, 3), to: today });
        break;
      case 'all':
      default:
        setDateRange({ from: undefined, to: undefined });
        break;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Chart drag handling
  const handleChartDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = charts.findIndex(c => c.id === active.id);
      const newIndex = charts.findIndex(c => c.id === over.id);
      reorderCharts(arrayMove(charts, oldIndex, newIndex));
    }
  };

  // Widget drag handling
  const handleWidgetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  // Chart form handlers
  const resetChartForm = () => {
    setChartFormData({
      title: '',
      type: 'bar',
      dataSource: 'deals-by-stage',
      color: '#9333ea',
    });
    setEditingChart(null);
  };

  const handleOpenChartDialog = (chart?: ChartConfig) => {
    if (chart) {
      setEditingChart(chart);
      setChartFormData({
        title: chart.title,
        type: chart.type,
        dataSource: chart.dataSource,
        color: chart.color,
      });
    } else {
      resetChartForm();
    }
    setChartDialogOpen(true);
  };

  const handleSaveChart = () => {
    if (!chartFormData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a chart title', variant: 'destructive' });
      return;
    }

    if (editingChart) {
      updateChart(editingChart.id, chartFormData);
      toast({ title: 'Chart updated', description: `"${chartFormData.title}" has been updated.` });
    } else {
      addChart(chartFormData);
      toast({ title: 'Chart added', description: `"${chartFormData.title}" has been created.` });
    }
    
    setChartDialogOpen(false);
    resetChartForm();
  };

  const handleDeleteChart = () => {
    if (chartToDelete) {
      const chart = charts.find(c => c.id === chartToDelete);
      deleteChart(chartToDelete);
      toast({ title: 'Chart deleted', description: `"${chart?.title}" has been removed.` });
      setChartToDelete(null);
      setDeleteChartDialogOpen(false);
    }
  };

  const confirmDeleteChart = (chartId: string) => {
    setChartToDelete(chartId);
    setDeleteChartDialogOpen(true);
  };

  // Widget form handlers
  const resetWidgetForm = () => {
    setWidgetFormData({
      title: '',
      dataSource: 'total-fees',
      size: 'small',
    });
    setEditingWidget(null);
  };

  const handleOpenWidgetDialog = (widget?: WidgetConfig) => {
    if (widget) {
      setEditingWidget(widget);
      setWidgetFormData({
        title: widget.title,
        dataSource: widget.dataSource,
        size: widget.size,
      });
    } else {
      resetWidgetForm();
    }
    setWidgetDialogOpen(true);
  };

  const handleSaveWidget = () => {
    if (!widgetFormData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a widget title', variant: 'destructive' });
      return;
    }

    const widgetType = WIDGET_DATA_SOURCES.find(s => s.id === widgetFormData.dataSource)?.type || 'stat';

    if (editingWidget) {
      updateWidget(editingWidget.id, { ...widgetFormData, type: widgetType });
      toast({ title: 'Widget updated', description: `"${widgetFormData.title}" has been updated.` });
    } else {
      addWidget({ ...widgetFormData, type: widgetType });
      toast({ title: 'Widget added', description: `"${widgetFormData.title}" has been created.` });
    }
    
    setWidgetDialogOpen(false);
    resetWidgetForm();
  };

  const handleDeleteWidget = () => {
    if (widgetToDelete) {
      const widget = widgets.find(w => w.id === widgetToDelete);
      deleteWidget(widgetToDelete);
      toast({ title: 'Widget deleted', description: `"${widget?.title}" has been removed.` });
      setWidgetToDelete(null);
      setDeleteWidgetDialogOpen(false);
    }
  };

  const confirmDeleteWidget = (widgetId: string) => {
    setWidgetToDelete(widgetId);
    setDeleteWidgetDialogOpen(true);
  };

  const handleResetWidgets = () => {
    resetToDefaults();
    toast({ title: 'Widgets reset', description: 'All widgets have been reset to defaults.' });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast({ title: 'Error', description: 'Please enter a preset name', variant: 'destructive' });
      return;
    }
    savePreset(presetName.trim(), charts, layoutMode);
    toast({ title: 'Preset saved', description: `"${presetName}" has been saved.` });
    setPresetName('');
    setSavePresetDialogOpen(false);
  };

  const handleLoadPreset = (presetId: string) => {
    const result = loadPreset(presetId);
    if (result) {
      reorderCharts(result.charts);
      setLayoutMode(result.layoutMode);
      const preset = presets.find(p => p.id === presetId);
      toast({ title: 'Preset loaded', description: `"${preset?.name}" has been loaded.` });
    }
  };

  const handleDeletePreset = () => {
    if (presetToDelete) {
      const preset = presets.find(p => p.id === presetToDelete);
      deletePreset(presetToDelete);
      toast({ title: 'Preset deleted', description: `"${preset?.name}" has been removed.` });
      setPresetToDelete(null);
      setDeletePresetDialogOpen(false);
    }
  };

  const confirmDeletePreset = (presetId: string) => {
    setPresetToDelete(presetId);
    setDeletePresetDialogOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Analytics | nAltive</title>
        <meta name="description" content="View and manage analytics charts for your deals pipeline" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <DealsHeader />
        
        <main className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Analytics</h1>
              <p className="text-muted-foreground mt-1">
                View insights and manage your custom widgets and charts. Drag to reorder.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={datePreset} onValueChange={handleDatePreset}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="last3Months">Last 3 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              
              {datePreset === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick dates</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Widgets Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Widgets</h2>
                <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
                  <Button
                    variant={layoutMode === 'compact' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => setLayoutMode('compact')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Compact</span>
                  </Button>
                  <Button
                    variant={layoutMode === 'expanded' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => setLayoutMode('expanded')}
                  >
                    <Grid2X2 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Expanded</span>
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Presets Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <FolderOpen className="h-4 w-4" />
                      <span className="hidden sm:inline">Presets</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setSavePresetDialogOpen(true)}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Current as Preset
                    </DropdownMenuItem>
                    {presets.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          Saved Presets
                        </div>
                        {presets.map((preset) => (
                          <DropdownMenuItem
                            key={preset.id}
                            className="flex items-center justify-between group"
                          >
                            <span
                              className="flex-1 cursor-pointer"
                              onClick={() => handleLoadPreset(preset.id)}
                            >
                              {preset.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeletePreset(preset.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={handleResetWidgets} className="gap-1">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button variant="gradient" size="sm" onClick={() => handleOpenWidgetDialog()} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Widget
                </Button>
              </div>
            </div>

            {widgets.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">No widgets yet</h3>
                    <p className="text-muted-foreground mt-1">
                      Add widgets to display key metrics
                    </p>
                  </div>
                  <Button variant="gradient" onClick={() => handleOpenWidgetDialog()} className="gap-2 mt-2">
                    <Plus className="h-4 w-4" />
                    Add Widget
                  </Button>
                </div>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWidgetDragEnd}
              >
                <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                  {/* Stat Widgets Grid */}
                  {statWidgets.length > 0 && (
                    <div className={cn(
                      "grid gap-4 mb-6 transition-all duration-300",
                      layoutMode === 'compact' 
                        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
                    )}>
                      {statWidgets.map(widget => (
                        <SortableStatWidget
                          key={widget.id}
                          widget={widget}
                          hoursData={hoursData}
                          onEdit={handleOpenWidgetDialog}
                          onDelete={confirmDeleteWidget}
                          compact={layoutMode === 'compact'}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* List Widgets Grid */}
                  {listWidgets.length > 0 && (
                    <div className={cn(
                      "grid gap-6 transition-all duration-300",
                      layoutMode === 'compact' 
                        ? "grid-cols-1 lg:grid-cols-3"
                        : "grid-cols-1 lg:grid-cols-2"
                    )}>
                      {listWidgets.map(widget => (
                        <SortableListWidget
                          key={widget.id}
                          widget={widget}
                          hoursData={hoursData}
                          onEdit={handleOpenWidgetDialog}
                          onDelete={confirmDeleteWidget}
                          compact={layoutMode === 'compact'}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Charts Section */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Charts</h2>
            <Button variant="gradient" size="sm" onClick={() => handleOpenChartDialog()} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Chart
            </Button>
          </div>

          {charts.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">No charts yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Add your first chart to start visualizing your data
                  </p>
                </div>
                <Button variant="gradient" onClick={() => handleOpenChartDialog()} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  Add Chart
                </Button>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleChartDragEnd}
            >
              <SortableContext items={charts.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className={cn(
                  "grid gap-6 transition-all duration-300",
                  layoutMode === 'compact' 
                    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2"
                )}>
                  {charts.map(chart => (
                    <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      deals={deals}
                      dateRange={dateRange}
                      onEdit={handleOpenChartDialog}
                      onDelete={confirmDeleteChart}
                      compact={layoutMode === 'compact'}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>
      </div>

      {/* Add/Edit Chart Dialog */}
      <Dialog open={chartDialogOpen} onOpenChange={(open) => { if (!open) resetChartForm(); setChartDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingChart ? 'Edit Chart' : 'Add New Chart'}</DialogTitle>
            <DialogDescription>
              {editingChart ? 'Update your chart configuration' : 'Configure your new chart'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="chartTitle">Chart Title</Label>
              <Input
                id="chartTitle"
                value={chartFormData.title}
                onChange={(e) => setChartFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter chart title"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Type</Label>
              <div className="flex gap-2">
                {(['bar', 'line', 'pie', 'area'] as ChartType[]).map(type => (
                  <Button
                    key={type}
                    type="button"
                    variant={chartFormData.type === type ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => setChartFormData(prev => ({ ...prev, type }))}
                  >
                    <ChartTypeIcon type={type} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="chartDataSource">Data Source</Label>
              <Select
                value={chartFormData.dataSource}
                onValueChange={(value) => {
                  const source = DATA_SOURCES.find(s => s.id === value);
                  setChartFormData(prev => ({ 
                    ...prev, 
                    dataSource: value,
                    // Auto-fill title with data source label if title is empty or matches a previous data source label
                    title: !prev.title || DATA_SOURCES.some(s => s.label === prev.title) 
                      ? (source?.label || prev.title) 
                      : prev.title
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Color</Label>
              <div className="flex gap-2 flex-wrap">
                {CHART_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                      chartFormData.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setChartFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetChartForm(); setChartDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveChart}>
              {editingChart ? 'Save Changes' : 'Add Chart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Widget Dialog */}
      <Dialog open={widgetDialogOpen} onOpenChange={(open) => { if (!open) resetWidgetForm(); setWidgetDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWidget ? 'Edit Widget' : 'Add New Widget'}</DialogTitle>
            <DialogDescription>
              {editingWidget ? 'Update your widget configuration' : 'Configure your new widget'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="widgetTitle">Widget Title</Label>
              <Input
                id="widgetTitle"
                value={widgetFormData.title}
                onChange={(e) => setWidgetFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter widget title"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="widgetDataSource">Data Source</Label>
              <Select
                value={widgetFormData.dataSource}
                onValueChange={(value: WidgetDataSource) => setWidgetFormData(prev => ({ ...prev, dataSource: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {WIDGET_DATA_SOURCES.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Widget Size</Label>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map(size => (
                  <Button
                    key={size}
                    type="button"
                    variant={widgetFormData.size === size ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setWidgetFormData(prev => ({ ...prev, size }))}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetWidgetForm(); setWidgetDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveWidget}>
              {editingWidget ? 'Save Changes' : 'Add Widget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Chart Confirmation Dialog */}
      <AlertDialog open={deleteChartDialogOpen} onOpenChange={setDeleteChartDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chart</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chart? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChart} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Widget Confirmation Dialog */}
      <AlertDialog open={deleteWidgetDialogOpen} onOpenChange={setDeleteWidgetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Widget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this widget? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWidget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Preset Dialog */}
      <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Preset</DialogTitle>
            <DialogDescription>
              Save your current widget and chart configuration as a preset.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="My Custom Layout"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPresetName(''); setSavePresetDialogOpen(false); }}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSavePreset}>
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Preset Confirmation Dialog */}
      <AlertDialog open={deletePresetDialogOpen} onOpenChange={setDeletePresetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this preset? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePreset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
