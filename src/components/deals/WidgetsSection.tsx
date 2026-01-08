import { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
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

export function WidgetsSection({ deals }: WidgetsSectionProps) {
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets, specialWidgets, toggleSpecialWidget } = useWidgets();
  const { formatCurrencyValue } = usePreferences();
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | undefined>();
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [chartDialogType, setChartDialogType] = useState<'count' | 'value' | null>(null);
  const [chartDialogTitle, setChartDialogTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeDeals = deals.filter(d => d.status !== 'archived');

  const getChartData = () => {
    if (!chartDialogType) return [];

    const stageGroups: Record<string, { count: number; value: number }> = {};
    
    activeDeals.forEach(deal => {
      const stage = deal.stage || 'Unknown';
      if (!stageGroups[stage]) {
        stageGroups[stage] = { count: 0, value: 0 };
      }
      stageGroups[stage].count += 1;
      stageGroups[stage].value += deal.value || 0;
    });

    return Object.entries(stageGroups).map(([name, data]) => ({
      name: formatStageName(name),
      value: chartDialogType === 'count' ? data.count : data.value,
    }));
  };

  const formatStageName = (stage: string) => {
    return stage
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleWidgetClick = (metric: WidgetMetric) => {
    if (metric === 'active-deals') {
      setChartDialogType('count');
      setChartDialogTitle('Active Deals by Stage');
      setChartDialogOpen(true);
    } else if (metric === 'active-deal-volume') {
      setChartDialogType('value');
      setChartDialogTitle('Active Deal Volume by Stage');
      setChartDialogOpen(true);
    }
  };

  const isClickableMetric = (metric: WidgetMetric) => {
    return metric === 'active-deals' || metric === 'active-deal-volume';
  };

  const chartData = getChartData();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className="text-muted-foreground">
            {chartDialogType === 'count' 
              ? `${data.value} deal${data.value !== 1 ? 's' : ''}`
              : formatCurrencyValue(data.value)
            }
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
    <div className="relative border border-border rounded-lg p-4 pb-12">
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

      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        {isEditMode && (
          <>
            {/* Special widgets toggles */}
            <div className="flex items-center gap-4 mr-4 border-r border-border pr-4">
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
          </>
        )}
        <HintTooltip
          hint="Click the gear icon to customize these widgets. Add, remove, or rearrange metrics to match your workflow."
          visible={isHintVisible('widgets-section')}
          onDismiss={() => dismissHint('widgets-section')}
          side="left"
          align="center"
          showDelay={3000}
        >
          <Button
            variant={isEditMode ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsEditMode(!isEditMode)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </HintTooltip>
      </div>

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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{chartDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="h-[300px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
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
