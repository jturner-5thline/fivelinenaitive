import { useState, useMemo, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverEvent, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Network } from 'lucide-react';
import { useChannelEntries, useUpdateChannelEntry, type ChannelType, type ChannelEntry } from '@/hooks/useChannelEntries';
import { ChannelCard } from './ChannelCard';
import { AddChannelDialog } from './AddChannelDialog';
import { ChannelDetailDialog } from './ChannelDetailDialog';

const COLUMNS: { type: ChannelType; label: string; color: string }[] = [
  { type: 'Banks', label: 'Banks', color: 'border-t-blue-500' },
  { type: 'M&A and Investment Bankers', label: 'M&A / IB', color: 'border-t-violet-500' },
  { type: 'Service Providers', label: 'Service Providers', color: 'border-t-amber-500' },
  { type: 'Investors', label: 'Investors', color: 'border-t-emerald-500' },
];

const COLUMN_TYPES = new Set(COLUMNS.map(c => c.type));

function DroppableColumn({ type, label, color, entries, onCardClick }: {
  type: ChannelType; label: string; color: string;
  entries: ChannelEntry[];
  onCardClick: (e: ChannelEntry) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: type });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] sm:min-w-[240px] flex-1 rounded-lg border ${color} border-t-2 bg-muted/30 transition-colors ${isOver ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
    >
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</h3>
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{entries.length}</span>
        </div>
      </div>
      <div className="p-2 flex-1 space-y-2 min-h-[100px]">
        <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {entries.map((entry) => (
            <ChannelCard key={entry.id} entry={entry} onClick={() => onCardClick(entry)} />
          ))}
        </SortableContext>
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[80px]">
            <p className="text-[11px] text-muted-foreground">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChannelsBoard() {
  const { data: entries = [], isLoading, isError } = useChannelEntries();
  const updateChannel = useUpdateChannelEntry();
  const [addOpen, setAddOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ChannelEntry | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<ChannelType, ChannelEntry[]> = {
      'Banks': [],
      'M&A and Investment Bankers': [],
      'Service Providers': [],
      'Investors': [],
    };
    entries.forEach((e) => {
      if (map[e.channel_type]) map[e.channel_type].push(e);
    });
    return map;
  }, [entries]);

  // Resolve the target column from over element: could be a column ID or a card ID
  const resolveTargetColumn = useCallback((overId: string | number): ChannelType | null => {
    const overStr = String(overId);
    if (COLUMN_TYPES.has(overStr as ChannelType)) return overStr as ChannelType;
    // It's a card ID — find which column the card belongs to
    const targetEntry = entries.find(e => e.id === overStr);
    return targetEntry?.channel_type || null;
  }, [entries]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const targetColumn = resolveTargetColumn(over.id);
    if (!targetColumn) return;
    const entry = entries.find(e => e.id === active.id);
    if (!entry || entry.channel_type === targetColumn) return;
    updateChannel.mutate({ id: entry.id, channel_type: targetColumn });
  };

  const activeEntry = activeId ? entries.find(e => e.id === activeId) : null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-destructive">Failed to load channels.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Network className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">No channels yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Add your first referral source or channel partner to start tracking your network.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add First Channel
        </Button>
        <AddChannelDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">{entries.length} channel{entries.length !== 1 ? 's' : ''} · Drag cards between columns to change type</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add to Channels
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.type}
              type={col.type}
              label={col.label}
              color={col.color}
              entries={grouped[col.type]}
              onCardClick={setDetailEntry}
            />
          ))}
        </div>

        <DragOverlay>
          {activeEntry && (
            <div className="opacity-90 rotate-2 scale-105">
              <ChannelCard entry={activeEntry} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <AddChannelDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {detailEntry && <ChannelDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </div>
  );
}
