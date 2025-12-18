import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, AreaChart, GripVertical, CalendarIcon } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
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
import { mockDeals } from '@/data/mockDeals';
import { Deal } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
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
const getHoursData = () => {
  const totalPreSigning = mockDeals.reduce((sum, deal) => sum + (deal.preSigningHours ?? 0), 0);
  const totalPostSigning = mockDeals.reduce((sum, deal) => sum + (deal.postSigningHours ?? 0), 0);
  const totalHours = totalPreSigning + totalPostSigning;
  const totalFees = mockDeals.reduce((sum, deal) => sum + (deal.totalFee || 0), 0);
  const totalRetainer = mockDeals.reduce((sum, deal) => sum + (deal.retainerFee ?? 0), 0);
  const totalMilestone = mockDeals.reduce((sum, deal) => sum + (deal.milestoneFee ?? 0), 0);
  const avgSuccessFee = mockDeals.filter(d => d.successFeePercent != null).length > 0
    ? mockDeals.reduce((sum, deal) => sum + (deal.successFeePercent ?? 0), 0) / mockDeals.filter(d => d.successFeePercent != null).length
    : 0;
  const revenuePerHour = totalHours > 0 ? totalFees / totalHours : 0;
  
  const hoursByManager: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  mockDeals.forEach(deal => {
    if (!hoursByManager[deal.manager]) {
      hoursByManager[deal.manager] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByManager[deal.manager].preSigning += deal.preSigningHours ?? 0;
    hoursByManager[deal.manager].postSigning += deal.postSigningHours ?? 0;
    hoursByManager[deal.manager].fees += deal.totalFee || 0;
  });
  
  const hoursByStage: Record<string, { preSigning: number; postSigning: number; fees: number }> = {};
  mockDeals.forEach(deal => {
    if (!hoursByStage[deal.stage]) {
      hoursByStage[deal.stage] = { preSigning: 0, postSigning: 0, fees: 0 };
    }
    hoursByStage[deal.stage].preSigning += deal.preSigningHours ?? 0;
    hoursByStage[deal.stage].postSigning += deal.postSigningHours ?? 0;
    hoursByStage[deal.stage].fees += deal.totalFee || 0;
  });
  
  return {
    totalPreSigning, totalPostSigning, totalHours, totalFees, totalRetainer, totalMilestone, avgSuccessFee, revenuePerHour,
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

const getChartData = (dataSource: string, dateRange?: DateRange) => {
  const filteredDeals = dateRange?.from && dateRange?.to 
    ? mockDeals.filter(deal => {
        const dealDate = new Date(deal.createdAt);
        return isWithinInterval(dealDate, { start: dateRange.from!, end: dateRange.to! });
      })
    : mockDeals;
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
      const hoursData = getHoursData();
      return hoursData.byManager.map(m => ({ name: m.name, value: m.total }));
    
    case 'hours-by-stage':
      const hoursDataByStage = getHoursData();
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
        { name: 'Retainer', value: totalRetainer / 1000 },
        { name: 'Milestone', value: totalMilestone / 1000 },
        { name: 'Success Fee', value: totalSuccessFee / 1000 },
      ].filter(item => item.value > 0);
    
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

function ChartRenderer({ chart, dateRange }: { chart: ChartConfig; dateRange?: DateRange }) {
  const data = getChartData(chart.dataSource, dateRange);
  
  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={250}>
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
        <ResponsiveContainer width="100%" height={250}>
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
        <ResponsiveContainer width="100%" height={250}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
        <ResponsiveContainer width="100%" height={250}>
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
  dateRange, 
  onEdit, 
  onDelete 
}: { 
  chart: ChartConfig;
  dateRange?: DateRange;
  onEdit: (chart: ChartConfig) => void;
  onDelete: (chartId: string) => void;
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
    <Card ref={setNodeRef} style={style} className={cn(isDragging && "shadow-lg ring-2 ring-primary/20")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <ChartTypeIcon type={chart.type} />
          <CardTitle className="text-lg">{chart.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => onEdit(chart)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(chart.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ChartRenderer chart={chart} dateRange={dateRange} />
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { charts, addChart, updateChart, deleteChart, reorderCharts } = useCharts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [datePreset, setDatePreset] = useState<string>('all');
  
  const [formData, setFormData] = useState({
    title: '',
    type: 'bar' as ChartType,
    dataSource: 'deals-by-stage',
    color: '#9333ea',
  });

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = charts.findIndex(c => c.id === active.id);
      const newIndex = charts.findIndex(c => c.id === over.id);
      reorderCharts(arrayMove(charts, oldIndex, newIndex));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'bar',
      dataSource: 'deals-by-stage',
      color: '#9333ea',
    });
    setEditingChart(null);
  };

  const handleOpenDialog = (chart?: ChartConfig) => {
    if (chart) {
      setEditingChart(chart);
      setFormData({
        title: chart.title,
        type: chart.type,
        dataSource: chart.dataSource,
        color: chart.color,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSaveChart = () => {
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a chart title', variant: 'destructive' });
      return;
    }

    if (editingChart) {
      updateChart(editingChart.id, formData);
      toast({ title: 'Chart updated', description: `"${formData.title}" has been updated.` });
    } else {
      addChart(formData);
      toast({ title: 'Chart added', description: `"${formData.title}" has been created.` });
    }
    
    setDialogOpen(false);
    resetForm();
  };

  const handleDeleteChart = () => {
    if (chartToDelete) {
      const chart = charts.find(c => c.id === chartToDelete);
      deleteChart(chartToDelete);
      toast({ title: 'Chart deleted', description: `"${chart?.title}" has been removed.` });
      setChartToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const confirmDelete = (chartId: string) => {
    setChartToDelete(chartId);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Analytics | nAltive</title>
        <meta name="description" content="View and manage analytics charts for your deals pipeline" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        
        <main className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Analytics</h1>
              <p className="text-muted-foreground mt-1">
                View insights and manage your custom charts. Drag to reorder.
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
              
              <Button onClick={() => handleOpenDialog()} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Chart
              </Button>
            </div>
          </div>

          {/* Hours Summary Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Hours Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Pre-Signing Hours</p>
                    <p className="text-3xl font-bold text-purple-600">{getHoursData().totalPreSigning.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Post-Signing Hours</p>
                    <p className="text-3xl font-bold text-purple-600">{getHoursData().totalPostSigning.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="text-3xl font-bold text-purple-600">{getHoursData().totalHours.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Fees</p>
                    <p className="text-3xl font-bold text-purple-600">${getHoursData().totalFees.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Revenue per Hour</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {getHoursData().revenuePerHour > 0 
                        ? `$${getHoursData().revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : '-'
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Fee Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Retainer</p>
                    <p className="text-2xl font-bold text-purple-600">${(getHoursData().totalRetainer / 1000).toFixed(1)}K</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Milestone</p>
                    <p className="text-2xl font-bold text-purple-600">${(getHoursData().totalMilestone / 1000).toFixed(1)}K</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Avg Success Fee</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {getHoursData().avgSuccessFee > 0 ? `${getHoursData().avgSuccessFee.toFixed(1)}%` : '-'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Hours by Manager</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {getHoursData().byManager.length > 0 ? (
                      getHoursData().byManager.map((manager) => (
                        <div key={manager.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <span className="font-medium">{manager.name}</span>
                          <div className="flex gap-4 text-sm">
                            <span className="text-muted-foreground">{manager.total.toFixed(1)}h</span>
                            <span className="text-muted-foreground">${manager.fees.toLocaleString()}</span>
                            <span className="font-semibold text-purple-600">
                              {manager.revenuePerHour > 0 ? `$${manager.revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr` : '-'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-center py-4">No hours recorded yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Hours by Stage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {getHoursData().byStage.length > 0 ? (
                      getHoursData().byStage.map((stage) => (
                        <div key={stage.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <span className="font-medium capitalize">{stage.name.replace('-', ' ')}</span>
                          <div className="flex gap-4 text-sm">
                            <span className="text-muted-foreground">{stage.total.toFixed(1)}h</span>
                            <span className="text-muted-foreground">${stage.fees.toLocaleString()}</span>
                            <span className="font-semibold text-purple-600">
                              {stage.revenuePerHour > 0 ? `$${stage.revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr` : '-'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-center py-4">No hours recorded yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Charts</h2>

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
                <Button onClick={() => handleOpenDialog()} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  Add Chart
                </Button>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={charts.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {charts.map(chart => (
                    <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      dateRange={dateRange}
                      onEdit={handleOpenDialog}
                      onDelete={confirmDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>
      </div>

      {/* Add/Edit Chart Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingChart ? 'Edit Chart' : 'Add New Chart'}</DialogTitle>
            <DialogDescription>
              {editingChart ? 'Update your chart configuration' : 'Configure your new chart'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Chart Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
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
                    variant={formData.type === type ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => setFormData(prev => ({ ...prev, type }))}
                  >
                    <ChartTypeIcon type={type} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="dataSource">Data Source</Label>
              <Select
                value={formData.dataSource}
                onValueChange={(value) => setFormData(prev => ({ ...prev, dataSource: value }))}
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
                      formData.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveChart}>
              {editingChart ? 'Save Changes' : 'Add Chart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
    </>
  );
}
