import { useState } from 'react';
import { GripVertical, Eye, EyeOff, RotateCcw, ChevronDown, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useDealInfoFieldOrder, DEAL_INFO_FIELD_DEFINITIONS, DEFAULT_FIELD_ORDER, DealInfoFieldId } from '@/hooks/useDealInfoFieldOrder';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DealInfoFieldsSettingsProps {
  isAdmin?: boolean;
}

function SortableFieldItem({ 
  fieldId, 
  label, 
  visible, 
  canHide, 
  onToggle 
}: { 
  fieldId: string; 
  label: string; 
  visible: boolean; 
  canHide: boolean; 
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        !visible ? 'opacity-60' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {canHide ? (
        <Switch
          checked={visible}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${label} visibility`}
        />
      ) : (
        <span className="text-xs text-muted-foreground italic">Required</span>
      )}
    </div>
  );
}

export function DealInfoFieldsSettings({ isAdmin = true }: DealInfoFieldsSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    fieldOrder,
    fieldVisibility,
    reorderFields,
    toggleFieldVisibility,
    isFieldVisible,
    resetToDefault,
  } = useDealInfoFieldOrder();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fieldOrder.indexOf(active.id as DealInfoFieldId);
    const newIndex = fieldOrder.indexOf(over.id as DealInfoFieldId);
    const newOrder = arrayMove(fieldOrder, oldIndex, newIndex);
    reorderFields(newOrder);
    toast({ title: 'Field order updated' });
  };

  const handleReset = () => {
    resetToDefault();
    toast({ title: 'Reset to defaults', description: 'Deal information fields have been reset to their default order and visibility.' });
  };

  if (!isAdmin) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutList className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">Deal Information Fields</CardTitle>
                  <CardDescription>Configure which fields appear on the Deal Information card and their order</CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Drag to reorder. Toggle visibility for each field. Changes apply to all deals in your company.
              </p>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={fieldOrder} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {fieldOrder.map(fieldId => {
                    const config = DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId);
                    if (!config) return null;
                    return (
                      <SortableFieldItem
                        key={fieldId}
                        fieldId={fieldId}
                        label={config.label}
                        visible={isFieldVisible(fieldId)}
                        canHide={config.canHide}
                        onToggle={() => toggleFieldVisibility(fieldId)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
