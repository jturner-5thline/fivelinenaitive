import { useState, useRef, useEffect } from 'react';
import { Plus, Settings2, PieChartIcon, BarChart3, TrendingUp, Download, Image, FileText } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Area, AreaChart } from 'recharts';
import { format, startOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useWidgets, Widget, WidgetMetric, SPECIAL_WIDGET_OPTIONS } from '@/contexts/WidgetsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { WidgetCard } from './WidgetCard';
import { WidgetEditor } from './WidgetEditor';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Deal } from '@/types/deal';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';

interface WidgetsSectionProps {
  deals: Deal[];
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(292, 46%, 72%)',
  'hsl(200, 70%, 50%)',
  'hsl(150, 60%, 45%)',
];

// Muted tonal palette for donut chart – primary accent + tonal variations + neutral for "Other"
const DONUT_PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--primary) / 0.7)',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--primary) / 0.35)',
  'hsl(var(--primary) / 0.22)',
  'hsl(var(--muted-foreground) / 0.25)',
];

export function WidgetsSection({ deals }: WidgetsSectionProps) {
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets, specialWidgets, toggleSpecialWidget } = useWidgets();
  const { formatCurrencyValue } = usePreferences();
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const handler = () => setIsEditMode(prev => !prev);
    window.addEventListener('toggle-widgets-edit-mode', handler);
    return () => window.removeEventListener('toggle-widgets-edit-mode', handler);
  }, []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | undefined>();
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [chartDialogType, setChartDialogType] = useState<'count' | 'value' | null>(null);
  const [chartDialogTitle, setChartDialogTitle] = useState('');
  const [chartGroupBy, setChartGroupBy] = useState<'stage' | 'status' | 'manager'>('stage');
  const [chartFilterFn, setChartFilterFn] = useState<((d: Deal) => boolean) | null>(null);
  const [chartViewType, setChartViewType] = useState<'pie' | 'bar' | 'line'>('pie');

  const [activeDonutIndex, setActiveDonutIndex] = useState<number | null>(null);
  const [drilldownStage, setDrilldownStage] = useState<string | null>(null);
  const [drilldownMetric, setDrilldownMetric] = useState<'dollarVolume' | 'revenue'>('dollarVolume');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const formatStageName = (stage: string) => {
    return stage
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getChartData = () => {
    if (!chartDialogType || !chartFilterFn) return [];

    const sourceDeals = deals.filter(chartFilterFn);
    const groups: Record<string, { count: number; value: number }> = {};
    
    sourceDeals.forEach(deal => {
      let groupKey: string;
      if (chartGroupBy === 'status') {
        groupKey = deal.status || 'Unknown';
      } else if (chartGroupBy === 'manager') {
        groupKey = deal.manager || 'Unassigned';
      } else {
        groupKey = deal.stage || 'Unknown';
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = { count: 0, value: 0 };
      }
      groups[groupKey].count += 1;
      groups[groupKey].value += deal.value || 0;
    });

    return Object.entries(groups).map(([name, data]) => ({
      name: formatStageName(name),
      value: chartDialogType === 'count' ? data.count : data.value,
    }));
  };

  // Build donut-specific data with "Other" grouping for top-5 slices
  const getDonutData = () => {
    const raw = getChartData();
    if (raw.length <= 6) return { slices: raw, otherDetails: [] };

    const sorted = [...raw].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const otherValue = rest.reduce((s, r) => s + r.value, 0);

    return {
      slices: [...top, { name: 'Other', value: otherValue }],
      otherDetails: rest,
    };
  };

  const getTimeSeriesData = () => {
    if (!chartDialogType || !chartFilterFn) return [];

    const sourceDeals = deals.filter(chartFilterFn);
    const monthlyGroups: Record<string, { count: number; value: number; date: Date }> = {};
    
    sourceDeals.forEach(deal => {
      const dealDate = deal.createdAt ? parseISO(deal.createdAt) : new Date();
      const monthStart = startOfMonth(dealDate);
      const monthKey = format(monthStart, 'yyyy-MM');
      
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = { count: 0, value: 0, date: monthStart };
      }
      monthlyGroups[monthKey].count += 1;
      monthlyGroups[monthKey].value += deal.value || 0;
    });

    return Object.entries(monthlyGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, data]) => ({
        name: format(data.date, 'MMM yyyy'),
        value: chartDialogType === 'count' ? data.count : data.value,
      }));
  };

  const chartData = chartViewType === 'line' ? getTimeSeriesData() : getChartData();

  const openChartDialog = (
    type: 'count' | 'value',
    title: string,
    groupBy: 'stage' | 'status' | 'manager',
    filterFn: (d: Deal) => boolean
  ) => {
    setChartDialogType(type);
    setChartDialogTitle(title);
    setChartGroupBy(groupBy);
    setChartFilterFn(() => filterFn);
    setChartViewType('pie');
    setDrilldownStage(null);
    setDrilldownMetric('dollarVolume');
    setChartDialogOpen(true);
  };

  const handleWidgetClick = (metric: WidgetMetric) => {
    switch (metric) {
      case 'active-deals':
        openChartDialog('count', 'Active Deals by Stage', 'stage', d => d.status !== 'archived');
        break;
      case 'active-deal-volume':
        openChartDialog('value', 'Active Deal Volume by Stage', 'stage', d => d.status !== 'archived');
        break;
      case 'deals-in-diligence':
        openChartDialog('count', 'Deals in Diligence by Status', 'status', d => d.stage === 'in-due-diligence');
        break;
      case 'dollars-in-diligence':
        openChartDialog('value', 'Dollars in Diligence by Status', 'status', d => d.stage === 'in-due-diligence');
        break;
      case 'total-deals':
        openChartDialog('count', 'All Deals by Stage', 'stage', () => true);
        break;
      case 'archived-deals':
        openChartDialog('count', 'Archived Deals by Stage', 'stage', d => d.status === 'archived');
        break;
      case 'on-track-deals':
        openChartDialog('count', 'On Track Deals by Stage', 'stage', d => d.status === 'on-track');
        break;
      case 'at-risk-deals':
        openChartDialog('count', 'At Risk Deals by Stage', 'stage', d => d.status === 'at-risk');
        break;
      case 'total-pipeline-value':
        openChartDialog('value', 'Pipeline Value by Stage', 'stage', () => true);
        break;
      case 'average-deal-size':
        openChartDialog('value', 'Deal Value by Manager', 'manager', d => d.status !== 'archived');
        break;
    }
  };

  const isClickableMetric = (metric: WidgetMetric) => {
    return true; // All metrics are now clickable
  };

  const chartRef = useRef<HTMLDivElement>(null);

  const exportToCSV = () => {
    if (chartData.length === 0) return;
    
    const headers = ['Name', chartDialogType === 'count' ? 'Count' : 'Value'];
    const rows = chartData.map(item => [
      item.name,
      item.value.toString()
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${chartDialogTitle.replace(/\s+/g, '_').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: 'CSV exported',
      description: `${chartData.length} rows exported to CSV.`
    });
  };

  const exportToImage = async () => {
    if (!chartRef.current) return;
    
    try {
      const svgElement = chartRef.current.querySelector('svg');
      if (!svgElement) {
        toast({ title: 'Export failed', description: 'Could not find chart to export.', variant: 'destructive' });
        return;
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      
      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx?.scale(2, 2);
        ctx!.fillStyle = 'white';
        ctx!.fillRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${chartDialogTitle.replace(/\s+/g, '_').toLowerCase()}.png`;
            link.click();
            URL.revokeObjectURL(link.href);
            
            toast({
              title: 'Image exported',
              description: 'Chart exported as PNG.'
            });
          }
        }, 'image/png');
      };
      
      img.src = URL.createObjectURL(svgBlob);
    } catch (error) {
      toast({ title: 'Export failed', description: 'Could not export chart image.', variant: 'destructive' });
    }
  };

  const donutData = getDonutData();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const total = donutData.slices.reduce((s: number, d: any) => s + d.value, 0);
      const pct = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0';

      if (data.name === 'Other' && donutData.otherDetails.length > 0) {
        return (
          <div className="bg-popover border border-border rounded-lg p-3 shadow-lg max-w-[220px]">
            <p className="font-medium text-foreground text-xs mb-1">Other ({pct}%)</p>
            <div className="space-y-0.5">
              {donutData.otherDetails.map((d: any) => {
                const itemPct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                return (
                  <div key={d.name} className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="truncate">{d.name}</span>
                    <span className="tabular-nums shrink-0">
                      {chartDialogType === 'count' ? d.value : formatCurrencyValue(d.value)} ({itemPct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground text-xs">{data.name}</p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {chartDialogType === 'count' 
              ? `${data.value} deal${data.value !== 1 ? 's' : ''}`
              : formatCurrencyValue(data.value)
            } · {pct}%
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ percent }: any) => {
    return `${(percent * 100).toFixed(0)}%`;
  };

  const calculateMetric = (metric: WidgetMetric): string | number => {
    switch (metric) {
      case 'active-deals':
        return deals.filter(d => d.status !== 'archived').length;
      case 'active-deal-volume':
        return formatCurrencyValue(deals.filter(d => d.status !== 'archived').reduce((sum, d) => sum + d.value, 0));
      case 'deals-in-diligence':
        return deals.filter(d => d.stage === 'in-due-diligence').length;
      case 'dollars-in-diligence':
        return formatCurrencyValue(deals.filter(d => d.stage === 'in-due-diligence').reduce((sum, d) => sum + d.value, 0));
      case 'total-deals':
        return deals.length;
      case 'archived-deals':
        return deals.filter(d => d.status === 'archived').length;
      case 'on-track-deals':
        return deals.filter(d => d.status === 'on-track').length;
      case 'at-risk-deals':
        return deals.filter(d => d.status === 'at-risk').length;
      case 'total-pipeline-value':
        return formatCurrencyValue(deals.reduce((sum, d) => sum + d.value, 0));
      case 'average-deal-size':
        return deals.length > 0 
          ? formatCurrencyValue(deals.reduce((sum, d) => sum + d.value, 0) / deals.length)
          : '$0';
      default:
        return 0;
    }
  };

  const handleEdit = (widget: Widget) => {
    setEditingWidget(widget);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditingWidget(undefined);
    setEditorOpen(true);
  };

  const handleSave = (widgetData: Omit<Widget, 'id'>) => {
    if (editingWidget) {
      updateWidget(editingWidget.id, widgetData);
    } else {
      addWidget(widgetData);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  return (
    <div className="relative border border-border rounded-lg py-1.5 px-4">

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {widgets.map((widget) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                value={calculateMetric(widget.metric)}
                isEditMode={isEditMode}
                isClickable={isClickableMetric(widget.metric)}
                onEdit={() => handleEdit(widget)}
                onDelete={() => deleteWidget(widget.id)}
                onClick={() => handleWidgetClick(widget.metric)}
              />
            ))}
            {widgets.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                No widgets configured. Click the settings icon to add some.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {isEditMode && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          {/* Special widgets toggles */}
          <div className="flex items-center gap-4 flex-1">
            {SPECIAL_WIDGET_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <Switch
                  id={`toggle-${option.value}`}
                  checked={specialWidgets[option.value]}
                  onCheckedChange={() => toggleSpecialWidget(option.value)}
                />
                <Label 
                  htmlFor={`toggle-${option.value}`} 
                  className="text-xs text-muted-foreground cursor-pointer"
                  title={option.description}
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Add Widget
          </Button>
        </div>
      )}

      <WidgetEditor
        widget={editingWidget}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingWidget(undefined);
        }}
        onSave={handleSave}
      />

      <Dialog open={chartDialogOpen} onOpenChange={setChartDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">{chartDialogTitle}</DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                  <Button
                    variant={chartViewType === 'pie' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('pie')}
                  >
                    <PieChartIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartViewType === 'bar' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('bar')}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartViewType === 'line' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('line')}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-7 w-7">
                      <Download className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportToCSV}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportToImage}>
                      <Image className="h-4 w-4 mr-2" />
                      Export as Image
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogHeader>
          <div ref={chartRef} className="h-[320px] w-full">
            {chartData.length > 0 ? (
              <>
                {chartViewType === 'pie' ? (
                  <div className="flex items-center h-full gap-4">
                    {/* Donut */}
                    <div className="relative w-[200px] h-[200px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData.slices}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            dataKey="value"
                            paddingAngle={1.5}
                            stroke="none"
                            onMouseEnter={(_, index) => setActiveDonutIndex(index)}
                            onMouseLeave={() => setActiveDonutIndex(null)}
                          >
                            {donutData.slices.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={DONUT_PALETTE[index % DONUT_PALETTE.length]}
                                opacity={activeDonutIndex === null || activeDonutIndex === index ? 1 : 0.45}
                                style={{ transition: 'opacity 150ms ease' }}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-muted-foreground leading-tight">Active Deals</span>
                        <span className="text-lg font-semibold text-foreground tabular-nums leading-tight">
                          {chartDialogType === 'count'
                            ? donutData.slices.reduce((s, d) => s + d.value, 0)
                            : formatCurrencyValue(donutData.slices.reduce((s, d) => s + d.value, 0))
                          }
                        </span>
                      </div>
                    </div>
                    {/* Right-side legend */}
                    <div className="flex flex-col gap-1.5 min-w-0 overflow-y-auto max-h-[260px] pr-1">
                      {donutData.slices.map((entry, index) => {
                        const total = donutData.slices.reduce((s, d) => s + d.value, 0);
                        const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
                        return (
                          <div
                            key={entry.name}
                            className="flex items-center gap-2 cursor-default rounded px-1.5 py-0.5 transition-colors"
                            style={{
                              backgroundColor: activeDonutIndex === index ? 'hsl(var(--muted))' : 'transparent',
                            }}
                            onMouseEnter={() => setActiveDonutIndex(index)}
                            onMouseLeave={() => setActiveDonutIndex(null)}
                          >
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                            />
                            <span className="text-[11px] text-muted-foreground truncate">{entry.name}</span>
                            <span className="text-[11px] text-foreground font-medium tabular-nums ml-auto shrink-0">
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {chartViewType === 'bar' ? (
                      <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={100} 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          fill="url(#colorValue)" 
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No data available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
