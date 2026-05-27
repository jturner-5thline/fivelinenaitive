import { useState } from 'react';
import { GripVertical, RotateCcw, ChevronDown, FileText, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useCompanyWriteUpFields, CompanyWriteUpField } from '@/hooks/useCompanyWriteUpFields';
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

interface WriteUpFieldsSettingsProps {
  isAdmin?: boolean;
}

function SortableFieldItem({
  field,
  onToggleVisibility,
  onToggleRequired,
  onUpdateLabel,
}: {
  field: CompanyWriteUpField;
  onToggleVisibility: () => void;
  onToggleRequired: () => void;
  onUpdateLabel: (label: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(field.label);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSaveLabel = () => {
    if (editLabel.trim() && editLabel.trim() !== field.label) {
      onUpdateLabel(editLabel.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        !field.is_visible ? 'opacity-60' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveLabel();
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveLabel}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{field.label}</span>
            <button
              onClick={() => { setEditLabel(field.label); setIsEditing(true); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <span className="text-xs text-muted-foreground">({field.field_key})</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {field.is_required && (
          <Badge variant="secondary" className="text-xs">Required</Badge>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Switch
            checked={field.is_required}
            onCheckedChange={onToggleRequired}
            className="scale-75"
          />
          Req
        </label>
        <Switch
          checked={field.is_visible}
          onCheckedChange={onToggleVisibility}
          aria-label={`Toggle ${field.label} visibility`}
        />
      </div>
    </div>
  );
}

export function WriteUpFieldsSettings({ isAdmin = true }: WriteUpFieldsSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    fields,
    isLoading,
    reorderFields,
    toggleVisibility,
    toggleRequired,
    updateLabel,
    resetToDefaults,
  } = useCompanyWriteUpFields();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex(f => f.id === active.id);
    const newIndex = fields.findIndex(f => f.id === over.id);
    const newOrder = arrayMove(fields, oldIndex, newIndex).map(f => f.id);
    reorderFields(newOrder);
    toast({ title: 'Field order updated' });
  };

  const handleReset = () => {
    resetToDefaults();
    toast({ title: 'Reset to defaults', description: 'Write-up fields have been reset to their default configuration.' });
  };

  if (!isAdmin) return null;

  return (
    
      <Card>
        
          <CardHeader className="">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">Write-Up Fields</CardTitle>
                  <CardDescription>Configure which fields appear on deal write-ups, their labels, order, and requirements</CardDescription>
                </div>
              </div>
              
            </div>
          </CardHeader>
        
        
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Drag to reorder. Toggle visibility and required status. Click the pencil to rename fields.
              </p>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading fields...</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {fields.map(field => (
                      <SortableFieldItem
                        key={field.id}
                        field={field}
                        onToggleVisibility={() => toggleVisibility(field.id)}
                        onToggleRequired={() => toggleRequired(field.id)}
                        onUpdateLabel={(label) => updateLabel(field.id, label)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        
      </Card>
    
  );
}
