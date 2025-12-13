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
import { useWidgets, Widget, WidgetMetric } from '@/contexts/WidgetsContext';
import { WidgetCard } from './WidgetCard';
import { WidgetEditor } from './WidgetEditor';
import { Deal } from '@/types/deal';

interface WidgetsSectionProps {
  deals: Deal[];
}

export function WidgetsSection({ deals }: WidgetsSectionProps) {
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets } = useWidgets();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  const calculateMetric = (metric: WidgetMetric): string | number => {
    switch (metric) {
      case 'active-deals':
        return deals.filter(d => d.status !== 'archived').length;
      case 'active-deal-volume':
        return formatValue(deals.filter(d => d.status !== 'archived').reduce((sum, d) => sum + d.value, 0));
      case 'deals-in-diligence':
        return deals.filter(d => d.stage === 'due-diligence').length;
      case 'dollars-in-diligence':
        return formatValue(deals.filter(d => d.stage === 'due-diligence').reduce((sum, d) => sum + d.value, 0));
      case 'total-deals':
        return deals.length;
      case 'archived-deals':
        return deals.filter(d => d.status === 'archived').length;
      case 'on-track-deals':
        return deals.filter(d => d.status === 'on-track').length;
      case 'at-risk-deals':
        return deals.filter(d => d.status === 'at-risk').length;
      case 'total-pipeline-value':
        return formatValue(deals.reduce((sum, d) => sum + d.value, 0));
      case 'average-deal-size':
        return deals.length > 0 
          ? formatValue(deals.reduce((sum, d) => sum + d.value, 0) / deals.length)
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
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {isEditMode && (
          <Button variant="outline" size="sm" className="gap-1" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Add Widget
          </Button>
        )}
        <Button
          variant={isEditMode ? 'default' : 'outline'}
          size="sm"
          className="gap-1"
          onClick={() => setIsEditMode(!isEditMode)}
        >
          <Settings2 className="h-4 w-4" />
          {isEditMode ? 'Done' : 'Edit Widgets'}
        </Button>
      </div>

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
                No widgets configured. Click "Edit Widgets" to add some.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

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
