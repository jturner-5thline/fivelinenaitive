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

interface WidgetsSectionProps {
  deals: Deal[];
}

export function WidgetsSection({ deals }: WidgetsSectionProps) {
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets, specialWidgets, toggleSpecialWidget } = useWidgets();
  const { formatCurrencyValue } = usePreferences();
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
                onEdit={() => handleEdit(widget)}
                onDelete={() => deleteWidget(widget.id)}
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
    </div>
  );
}
