import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  WidgetConfig,
  DEFAULT_WIDGET_CONFIG,
  ValueConfig,
  FilterConfig,
  SEED_FIELDS,
} from './widgetTypes';
import { FieldCatalog } from './FieldCatalog';
import { WidgetPreview } from './WidgetPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWidgetEditorData } from '@/hooks/useWidgetEditorData';

interface DatarailsWidgetEditorProps {
  initialWidgetConfig?: WidgetConfig;
  onChange?: (widget: WidgetConfig) => void;
  onSave?: (widget: WidgetConfig) => void;
  onCancel?: () => void;
}

export function DatarailsWidgetEditor({
  initialWidgetConfig,
  onChange,
  onSave,
  onCancel,
}: DatarailsWidgetEditorProps) {
  const [config, setConfig] = useState<WidgetConfig>(initialWidgetConfig ?? DEFAULT_WIDGET_CONFIG);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { accounts, entities, isLoading } = useWidgetEditorData();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const updateConfig = useCallback(
    (next: WidgetConfig) => {
      setConfig(next);
      onChange?.(next);
    },
    [onChange]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as { fieldId: string; dataType: string; isMeasure: boolean } | undefined;
    if (!data) return;

    const target = over.id as string;

    if (target === 'drop-xaxis') {
      if (data.dataType === 'date' || !data.isMeasure) {
        updateConfig({ ...config, xAxis: { ...config.xAxis, fieldId: data.fieldId } });
      }
    } else if (target === 'drop-series') {
      if (!data.isMeasure) {
        updateConfig({ ...config, series: { ...config.series, fieldId: data.fieldId } });
      }
    } else if (target === 'drop-values') {
      if (data.isMeasure || data.dataType === 'number') {
        const newValue: ValueConfig = { fieldId: data.fieldId, agg: 'sum', format: 'currency' };
        updateConfig({ ...config, values: [...config.values, newValue] });
      }
    } else if (target === 'drop-filters') {
      const newFilter: FilterConfig = {
        id: `filter-${Date.now()}`,
        fieldId: data.fieldId,
        operator: 'eq',
        values: [],
        scope: 'widget',
      };
      updateConfig({ ...config, filters: [...config.filters, newFilter] });
    }
  };

  // Resolve drag overlay label from seed fields or accounts
  const getActiveLabel = (): string | null => {
    if (!activeId) return null;
    const seedField = SEED_FIELDS.find((f) => f.id === activeId);
    if (seedField) return seedField.name;
    const account = accounts.find((a) => `qb-account-${a.id}` === activeId);
    if (account) return account.name;
    return null;
  };

  const activeLabel = getActiveLabel();

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
          <Input
            value={config.name}
            onChange={(e) => updateConfig({ ...config, name: e.target.value })}
            className="h-8 max-w-[260px] text-sm font-semibold border-none shadow-none focus-visible:ring-1"
            placeholder="Widget name"
          />
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => { onCancel?.(); setConfig(initialWidgetConfig ?? DEFAULT_WIDGET_CONFIG); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave?.(config)}>
            Save
          </Button>
        </div>

        {/* Two-panel */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[280px] shrink-0">
            <FieldCatalog accounts={accounts} entities={entities} isLoading={isLoading} />
          </div>
          <div className="flex-1 min-w-0">
            <WidgetPreview config={config} />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeLabel && (
          <div className="rounded-md border border-primary bg-card px-3 py-1.5 text-sm font-medium shadow-lg">
            {activeLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
