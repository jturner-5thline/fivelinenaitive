import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical, Save, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDealSourcedViaOptions } from '@/hooks/useDealSourcedViaOptions';
import { DEFAULT_DEAL_SOURCED_VIA_OPTIONS } from '@/constants/dealSourcedVia';

interface SourcedViaSettingsProps {
  isAdmin?: boolean;
}

interface RowProps {
  id: string;
  value: string;
  isAdmin: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}

function SortableRow({ id, value, isAdmin, onChange, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2 py-1.5">
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!isAdmin}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!isAdmin}
        placeholder="Option label"
        className="h-8"
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        disabled={!isAdmin}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

type Row = { id: string; value: string };

let rowSeq = 0;
const newRow = (value = ''): Row => ({ id: `row-${Date.now()}-${++rowSeq}`, value });

export function SourcedViaSettings({ isAdmin = true }: SourcedViaSettingsProps) {
  const { options, isLoading, companyId, saveOptions } = useDealSourcedViaOptions();
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setRows(options.map((o) => newRow(o)));
    setSaved(options);
  }, [isLoading, options]);

  const current = rows.map((r) => r.value.trim()).filter(Boolean);
  const isDirty = JSON.stringify(current) !== JSON.stringify(saved);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex((r) => r.id === active.id);
      const newIndex = rows.findIndex((r) => r.id === over.id);
      setRows(arrayMove(rows, oldIndex, newIndex));
    }
  };

  const handleSave = async () => {
    const cleaned = Array.from(new Set(current));
    if (cleaned.length === 0) {
      toast.error('Add at least one option');
      return;
    }
    setIsSaving(true);
    try {
      await saveOptions(cleaned);
      setSaved(cleaned);
      setRows(cleaned.map((o) => newRow(o)));
      toast.success('Sourced Via options saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save options');
    } finally {
      setIsSaving(false);
    }
  };

  const restoreDefaults = () => {
    setRows(DEFAULT_DEAL_SOURCED_VIA_OPTIONS.map((o) => newRow(o)));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Sourced Via Options</CardTitle>
          <CardDescription>
            Customize the options shown in the "Sourced Via" dropdown when creating or filtering deals.
          </CardDescription>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={restoreDefaults} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Restore defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving} className="gap-1.5">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!companyId && !isLoading && (
          <p className="text-sm text-muted-foreground">Join a workspace to configure these options.</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <SortableRow
                  key={row.id}
                  id={row.id}
                  value={row.value}
                  isAdmin={isAdmin}
                  onChange={(value) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value } : r)))}
                  onRemove={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newRow('')])} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add option
          </Button>
        )}
      </CardContent>
    </Card>
  );
}