import { useState, useRef, useEffect, useMemo } from 'react';
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
import { useDealTypes } from '@/contexts/DealTypesContext';
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

type GroupByKey = 'stage' | 'status' | 'manager' | 'owner' | 'fund-type';

const GROUP_BY_LABELS: Record<GroupByKey, string> = {
  stage: 'Stage',
  status: 'Status',
  manager: 'Manager',
  owner: 'Deal Owner',
  'fund-type': 'Fund Type',
};

/**
 * Stage IDs that count as "Active Deals" — Final Credit Items through
 * Terms Issued (inclusive). Mirrors the canonical slug order in
 * `STAGE_CONFIG` for the Active (default) pipeline.
 */
const ACTIVE_DEAL_STAGES = new Set<string>([
  'final-credit-items',
  'client-strategy-review',
  'write-up-pending',
  'submitted-to-lenders',
  'lenders-in-review',
  'terms-issued',
]);

/**
 * Stage IDs that count as the "Sales Pipeline" — NDA/Needs List Sent
 * through Proposal Issued (inclusive). Includes both observed slug
 * variants for NDA/Needs List Sent.
 */
const SALES_PIPELINE_STAGES = new Set<string>([
  'nda-needs-list-sent',
  'ndaneeds-list-sent',
  'proposal-issued',
]);

const isActiveDealStage = (stage?: string | null) =>
  !!stage && ACTIVE_DEAL_STAGES.has(stage);
const isSalesPipelineStage = (stage?: string | null) =>
  !!stage && SALES_PIPELINE_STAGES.has(stage);

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
  const { widgets: allWidgets, addWidget, updateWidget, deleteWidget, reorderWidgets, specialWidgets, toggleSpecialWidget } = useWidgets();
  // Hide the retired "Active Deal Volume" widget for users whose saved
  // configuration still includes it. Filtering at render keeps stored
  // layouts intact in case we want to bring it back later.
  const widgets = useMemo(
    () => allWidgets.filter(w => w.metric !== 'active-deal-volume'),
    [allWidgets],
  );
  const { formatCurrencyValue } = usePreferences();
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const { dealTypes: dealTypeOptions } = useDealTypes();
  const dealTypeLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    dealTypeOptions.forEach(dt => { map[dt.id] = dt.label; });
    return map;
  }, [dealTypeOptions]);
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
  const [chartGroupBy, setChartGroupBy] = useState<GroupByKey>('stage');
  const [allowedGroupBys, setAllowedGroupBys] = useState<GroupByKey[]>(['stage']);
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

  // For a given deal + groupBy, return one or more bucket keys.
  // Fund Type is multi-bucket (a deal in multiple types contributes to each).
  const getGroupKeys = (deal: Deal, groupBy: GroupByKey): string[] => {
    if (groupBy === 'status') return [deal.status || 'Unknown'];
    if (groupBy === 'manager') return [deal.manager || 'Unassigned'];
    if (groupBy === 'owner') return [deal.dealOwner || deal.manager || 'Unassigned'];
    if (groupBy === 'fund-type') {
      const types = deal.dealTypes ?? [];
      if (!types.length) return ['Unassigned'];
      return types.map(id => dealTypeLabelById[id] || id);
    }
    return [deal.stage || 'Unknown'];
  };

  // Some bucket keys are already display-ready (owner/fund-type/manager).
  // Stage/status slugs still need formatStageName.
  const formatBucketName = (raw: string, groupBy: GroupByKey) =>
    groupBy === 'stage' || groupBy === 'status' ? formatStageName(raw) : raw;

  const getChartData = () => {
    if (!chartDialogType || !chartFilterFn) return [];

    const sourceDeals = deals.filter(chartFilterFn);
    const groups: Record<string, { count: number; value: number }> = {};

    sourceDeals.forEach(deal => {
      const keys = getGroupKeys(deal, chartGroupBy);
      keys.forEach(groupKey => {
        if (!groups[groupKey]) groups[groupKey] = { count: 0, value: 0 };
        groups[groupKey].count += 1;
        groups[groupKey].value += deal.value || 0;
      });
    });

    return Object.entries(groups).map(([name, data]) => ({
      name: formatBucketName(name, chartGroupBy),
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
    groupBy: GroupByKey,
    filterFn: (d: Deal) => boolean,
    allowed: GroupByKey[] = [groupBy],
  ) => {
    setChartDialogType(type);
    setChartDialogTitle(title);
    setChartGroupBy(groupBy);
    setAllowedGroupBys(allowed);
    setChartFilterFn(() => filterFn);
    setChartViewType('pie');
    setDrilldownStage(null);
    setDrilldownMetric('dollarVolume');
    setChartDialogOpen(true);
  };

  const handleWidgetClick = (metric: WidgetMetric) => {
    switch (metric) {
      case 'active-deals':
        openChartDialog('count', 'Active Deals', 'stage', d => d.status !== 'archived' && isActiveDealStage(d.stage), ['stage', 'owner', 'fund-type']);
        break;
      case 'active-deal-volume':
        openChartDialog('value', 'Active Deal Volume', 'stage', d => d.status !== 'archived' && isActiveDealStage(d.stage), ['stage', 'owner', 'fund-type']);
        break;
      case 'sales-pipeline-deals':
        openChartDialog('count', 'Sales Pipeline', 'stage', d => d.status !== 'archived' && isSalesPipelineStage(d.stage), ['stage', 'owner', 'fund-type']);
        break;
      case 'sales-pipeline-volume':
        openChartDialog('value', 'Sales Pipeline Volume', 'stage', d => d.status !== 'archived' && isSalesPipelineStage(d.stage), ['stage', 'owner', 'fund-type']);
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

  // --- Drilldown logic ---
  const handleSliceClick = (sliceName: string) => {
    if (sliceName === 'Other') return; // disable drill-down for "Other"
    if (drilldownStage === sliceName) {
      setDrilldownStage(null); // toggle off
    } else {
      setDrilldownStage(sliceName);
      setDrilldownMetric('dollarVolume');
    }
  };

  const getDrilldownDeals = (): { name: string; company: string; manager: string; dollarVolume: number; revenue: number }[] => {
    if (!drilldownStage || !chartFilterFn) return [];
    const sourceDeals = deals.filter(chartFilterFn);
    const matchingDeals = sourceDeals.filter(d => {
      const keys = getGroupKeys(d, chartGroupBy).map(k => formatBucketName(k, chartGroupBy));
      return keys.includes(drilldownStage);
    });
    return matchingDeals
      .map(d => ({
        name: d.name || d.company || 'Unnamed Deal',
        company: d.company || '',
        manager: d.manager || '',
        dollarVolume: d.value ?? 0,
        revenue: d.totalFee ?? 0,
      }))
      .sort((a, b) => b[drilldownMetric === 'dollarVolume' ? 'dollarVolume' : 'revenue'] - a[drilldownMetric === 'dollarVolume' ? 'dollarVolume' : 'revenue']);
  };

  const drilldownDeals = getDrilldownDeals();
  const drilldownTotal = drilldownDeals.reduce((s, d) => s + d[drilldownMetric], 0);

  const DrilldownTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg max-w-[240px]">
          <p className="font-medium text-foreground text-xs">{d.name}</p>
          {d.company && <p className="text-muted-foreground text-[10px]">{d.company}</p>}
          {d.manager && <p className="text-muted-foreground text-[10px]">Manager: {d.manager}</p>}
          <p className="text-foreground text-[11px] tabular-nums mt-1">
            {drilldownMetric === 'dollarVolume' ? 'Volume' : 'Revenue'}: {formatCurrencyValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

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
        return deals.filter(d => d.status !== 'archived' && isActiveDealStage(d.stage)).length;
      case 'active-deal-volume':
        return formatCurrencyValue(
          deals
            .filter(d => d.status !== 'archived' && isActiveDealStage(d.stage))
            .reduce((sum, d) => sum + d.value, 0)
        );
      case 'sales-pipeline-deals':
        return deals.filter(d => d.status !== 'archived' && isSalesPipelineStage(d.stage)).length;
      case 'sales-pipeline-volume':
        return formatCurrencyValue(
          deals
            .filter(d => d.status !== 'archived' && isSalesPipelineStage(d.stage))
            .reduce((sum, d) => sum + d.value, 0)
        );
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

  if (widgets.length === 0 && !isEditMode) {
    return null;
  }

  return (
    <div className="relative py-1.5 bg-transparent">

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
          {/*
            Responsive grid for the Active Pipeline summary widgets.

            The column count is intentionally double the deal-tile grid
            below (which uses `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`)
            and the gap matches exactly. This makes two widgets + one gap
            equal one deal-tile width at every breakpoint, so the KPI row
            and the deal board stay perfectly aligned as the sidebar /
            viewport width changes.

              < 640px (base) → 2 up   (deal tiles: 1 up)
              ≥ 640px (sm)   → 4 up   (deal tiles: 2 up)
              ≥ 1024px (lg)  → 6 up   (deal tiles: 3 up)

            items-stretch keeps every card the same height across the row.
          */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 items-stretch">
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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">{chartDialogTitle}</DialogTitle>
              <div className="flex items-center gap-2">
                {allowedGroupBys.length > 1 && (
                  <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5">
                    {allowedGroupBys.map((g) => (
                      <button
                        key={g}
                        onClick={() => { setChartGroupBy(g); setDrilldownStage(null); }}
                        className={`px-2 py-1 text-[11px] rounded transition-colors ${
                          chartGroupBy === g
                            ? (chartDialogTitle === 'Active Deal Volume'
                                ? 'bg-[rgba(126,184,247,0.12)] border border-[rgba(126,184,247,0.35)] text-foreground font-medium backdrop-blur-xl shadow-glass'
                                : 'bg-primary/10 text-primary font-medium')
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {GROUP_BY_LABELS[g]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                  <Button
                    variant={chartViewType === 'pie' ? (chartDialogTitle === 'Active Deal Volume' ? 'liquid-glass' : 'default') : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('pie')}
                  >
                    <PieChartIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartViewType === 'bar' ? (chartDialogTitle === 'Active Deal Volume' ? 'liquid-glass' : 'default') : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('bar')}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartViewType === 'line' ? (chartDialogTitle === 'Active Deal Volume' ? 'liquid-glass' : 'default') : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setChartViewType('line')}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={chartDialogTitle === 'Active Deal Volume' ? 'liquid-glass' : 'outline'} size="icon" className="h-7 w-7">
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
                            onClick={(_, index) => handleSliceClick(donutData.slices[index]?.name)}
                            style={{ cursor: 'pointer' }}
                          >
                            {donutData.slices.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={DONUT_PALETTE[index % DONUT_PALETTE.length]}
                                opacity={
                                  drilldownStage
                                    ? donutData.slices[index]?.name === drilldownStage ? 1 : 0.3
                                    : activeDonutIndex === null || activeDonutIndex === index ? 1 : 0.45
                                }
                                strokeWidth={donutData.slices[index]?.name === drilldownStage ? 2 : 0}
                                stroke={donutData.slices[index]?.name === drilldownStage ? 'hsl(var(--foreground))' : 'none'}
                                style={{ transition: 'opacity 150ms ease', cursor: donutData.slices[index]?.name === 'Other' ? 'default' : 'pointer' }}
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
                            className={`flex items-center gap-2 rounded px-1.5 py-0.5 transition-colors ${entry.name === 'Other' ? 'cursor-default' : 'cursor-pointer'}`}
                            style={{
                              backgroundColor: drilldownStage === entry.name
                                ? 'hsl(var(--primary) / 0.1)'
                                : activeDonutIndex === index ? 'hsl(var(--muted))' : 'transparent',
                            }}
                            onMouseEnter={() => setActiveDonutIndex(index)}
                            onMouseLeave={() => setActiveDonutIndex(null)}
                            onClick={() => handleSliceClick(entry.name)}
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
                          strokeWidth={1}
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
          {/* Drilldown section */}
          {drilldownStage && chartViewType === 'pie' && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {drilldownMetric === 'dollarVolume' ? 'Dollar Volume' : 'Revenue'} by Deal — {drilldownStage}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {drilldownDeals.length} deal{drilldownDeals.length !== 1 ? 's' : ''} · {formatCurrencyValue(drilldownTotal)}
                    {drilldownDeals.length > 0 && drilldownTotal === 0 && (
                      <span className="ml-1 italic">({drilldownMetric === 'dollarVolume' ? 'no dollar volume' : 'no revenue'} recorded)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
                    <button
                      onClick={() => setDrilldownMetric('dollarVolume')}
                      className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                        drilldownMetric === 'dollarVolume'
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Dollar Volume
                    </button>
                    <button
                      onClick={() => setDrilldownMetric('revenue')}
                      className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                        drilldownMetric === 'revenue'
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Revenue
                    </button>
                  </div>
                  <button
                    onClick={() => setDrilldownStage(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back to overview
                  </button>
                </div>
              </div>
              <div style={{ height: Math.max(120, drilldownDeals.length * 36 + 40) }}>
                {drilldownDeals.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={drilldownDeals}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickFormatter={(v: number) => formatCurrencyValue(v)}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={120}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + '…' : v}
                      />
                      <Tooltip content={<DrilldownTooltip />} />
                      <Bar
                        dataKey={drilldownMetric}
                        radius={[0, 3, 3, 0]}
                        fill="hsl(var(--primary))"
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No deals found in this group
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
