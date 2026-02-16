import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DealWriteUpData, KeyItem } from '../DealWriteUp';
import { FlexChangedFieldWrapper } from './FlexChangedFieldWrapper';
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

interface WriteUpKeyItemsTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
  changedFields?: Set<string>;
}

function SortableKeyItem({
  item,
  onUpdate,
  onDelete,
}: {
  item: KeyItem;
  onUpdate: (id: string, field: 'title' | 'description', value: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 space-y-3 relative">
      <div className="absolute top-3 left-2 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <div className="space-y-2 pl-6 pr-10">
        <Label>Title</Label>
        <Input
          value={item.title}
          onChange={(e) => onUpdate(item.id, 'title', e.target.value)}
          placeholder="Strong Market Position"
        />
      </div>
      <div className="space-y-2 pl-6">
        <Label>Description</Label>
        <Textarea
          value={item.description}
          onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
          placeholder="Detailed description of this key item..."
          className="min-h-[60px]"
        />
      </div>
    </div>
  );
}

export function WriteUpKeyItemsTab({ data, updateField, changedFields }: WriteUpKeyItemsTabProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addKeyItem = () => {
    const newItem: KeyItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('keyItems', [...data.keyItems, newItem]);
  };

  const updateKeyItem = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'keyItems',
      data.keyItems.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteKeyItem = (id: string) => {
    updateField('keyItems', data.keyItems.filter(item => item.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.keyItems.findIndex(i => i.id === active.id);
      const newIndex = data.keyItems.findIndex(i => i.id === over.id);
      updateField('keyItems', arrayMove(data.keyItems, oldIndex, newIndex));
    }
  };

  return (
    <FlexChangedFieldWrapper fieldKey="keyItems" changedFields={changedFields} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Key Items</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Additional notes and considerations</p>
        </div>
        <Button variant="outline" size="sm" onClick={addKeyItem}>
          <Plus className="h-4 w-4 mr-1" />
          Add Key Item
        </Button>
      </div>
      
      {data.keyItems.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-sm">No key items added yet.</p>
          <p className="text-xs mt-1">Click "Add Key Item" to add important notes.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={data.keyItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {data.keyItems.map((item) => (
                <SortableKeyItem
                  key={item.id}
                  item={item}
                  onUpdate={updateKeyItem}
                  onDelete={deleteKeyItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </FlexChangedFieldWrapper>
  );
}
