import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DealWriteUpData, CompanyHighlight } from '../DealWriteUp';
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

interface WriteUpCompanyHighlightsTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
  changedFields?: Set<string>;
}

function SortableHighlightItem({
  item,
  onUpdate,
  onDelete,
}: {
  item: CompanyHighlight;
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
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 space-y-3 relative bg-muted/30">
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
          placeholder="Exclusive Importer Status"
        />
      </div>
      <div className="space-y-2 pl-6">
        <Label>Description</Label>
        <Textarea
          value={item.description}
          onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
          placeholder="Sole U.S. importer for premium brand portfolio..."
          className="min-h-[60px]"
        />
      </div>
    </div>
  );
}

export function WriteUpCompanyHighlightsTab({ data, updateField, changedFields }: WriteUpCompanyHighlightsTabProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addCompanyHighlight = () => {
    const newHighlight: CompanyHighlight = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('companyHighlights', [...data.companyHighlights, newHighlight]);
  };

  const updateCompanyHighlight = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'companyHighlights',
      data.companyHighlights.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteCompanyHighlight = (id: string) => {
    updateField('companyHighlights', data.companyHighlights.filter(item => item.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.companyHighlights.findIndex(i => i.id === active.id);
      const newIndex = data.companyHighlights.findIndex(i => i.id === over.id);
      updateField('companyHighlights', arrayMove(data.companyHighlights, oldIndex, newIndex));
    }
  };

  return (
    <FlexChangedFieldWrapper fieldKey="companyHighlights" changedFields={changedFields} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Company Highlights</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Key differentiators and strengths of the company</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCompanyHighlight}>
          <Plus className="h-4 w-4 mr-1" />
          Add Highlight
        </Button>
      </div>
      
      {data.companyHighlights.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-sm">No company highlights added yet.</p>
          <p className="text-xs mt-1">Click "Add Highlight" to showcase key differentiators.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={data.companyHighlights.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {data.companyHighlights.map((item) => (
                <SortableHighlightItem
                  key={item.id}
                  item={item}
                  onUpdate={updateCompanyHighlight}
                  onDelete={deleteCompanyHighlight}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </FlexChangedFieldWrapper>
  );
}
