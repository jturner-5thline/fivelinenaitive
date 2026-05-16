import { useState, useMemo, useCallback } from 'react';
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Network } from 'lucide-react';
import { useChannelEntries, useUpdateChannelEntry, type ChannelType, type ChannelEntry } from '@/hooks/useChannelEntries';
import { ChannelCard } from './ChannelCard';
import { AddChannelDialog } from './AddChannelDialog';
import { ChannelDetailDialog } from './ChannelDetailDialog';
import { ChannelEntityDetailModal } from './ChannelEntityDetailModal';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';

const COLUMNS: { type: ChannelType; label: string; color: string }[] = CHANNEL_TYPE_OPTIONS.map(o => ({
  type: o.value,
  label: o.label,
  color: '',
})).map((c, i) => ({
  ...c,
  color: ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-slate-500'][i] || 'bg-slate-500',
}));

const COLUMN_TYPES = new Set(COLUMNS.map(c => c.type));

function DroppableColumn({ type, label, color, entries, onCardClick, onEntityClick }: {
  type: ChannelType; label: string; color: string;
  entries: ChannelEntry[];
  onCardClick: (e: ChannelEntry) => void;
  onEntityClick: (e: ChannelEntry, entityType: 'company' | 'contact') => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: type });

  return (
    <div
      ref={setNodeRef}
      className={`w-full flex flex-col bg-slate-800/50 rounded-lg border border-slate-700 transition-colors ${isOver ? 'ring-2 ring-primary/30' : ''}`}
    >
      <div className="flex items-center gap-2 p-3 border-b border-slate-700">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} />
        <span className="text-sm font-medium text-white truncate">{label}</span>
        <span className="text-xs text-slate-400 bg-slate-700 rounded px-1.5 ml-auto">{entries.length}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto flex-1">
        <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {entries.map((entry) => (
            <ChannelCard key={entry.id} entry={entry} onClick={() => onCardClick(entry)} onEntityClick={(entityType) => onEntityClick(entry, entityType)} />
          ))}
        </SortableContext>
        {entries.length === 0 && (
          <div className="flex items-center justify-center min-h-[80px]">
            <p className="text-xs text-slate-500">Drop company here</p>
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
  const [entityDetailEntry, setEntityDetailEntry] = useState<ChannelEntry | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleEntityClick = useCallback((entry: ChannelEntry, _entityType: 'company' | 'contact') => {
    setEntityDetailEntry(entry);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<ChannelType, ChannelEntry[]> = CHANNEL_TYPE_OPTIONS.reduce(
      (acc, o) => ({ ...acc, [o.value]: [] }),
      {} as Record<ChannelType, ChannelEntry[]>,
    );
    entries.forEach((e) => {
      if (map[e.channel_type]) map[e.channel_type].push(e);
    });
    return map;
  }, [entries]);

  const resolveTargetColumn = useCallback((overId: string | number): ChannelType | null => {
    const overStr = String(overId);
    if (COLUMN_TYPES.has(overStr as ChannelType)) return overStr as ChannelType;
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
        <p className="text-sm text-destructive">Failed to load companies.</p>
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
          <h3 className="text-sm font-medium text-foreground">No companies yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Add your first company to start tracking your channel network. Each company belongs to a channel category.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Company
        </Button>
        <AddChannelDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">{entries.length} compan{entries.length !== 1 ? 'ies' : 'y'} · Drag cards between channels to reclassify</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Company
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.type}
              type={col.type}
              label={col.label}
              color={col.color}
              entries={grouped[col.type]}
              onCardClick={(entry) => {
                if (entry.crm_company_id || entry.contact_id) {
                  setEntityDetailEntry(entry);
                } else {
                  setDetailEntry(entry);
                }
              }}
              onEntityClick={handleEntityClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeEntry && (
            <div className="bg-slate-800 border border-slate-500 rounded-md p-3 shadow-lg scale-[1.02] w-64 opacity-90">
              <span className="font-medium text-sm text-white">{activeEntry.crm_company?.name || activeEntry.contact?.full_name || 'Source'}</span>
              <p className="text-xs text-slate-400 mt-0.5">{activeEntry.channel_type}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <AddChannelDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {detailEntry && <ChannelDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />}
      {entityDetailEntry && <ChannelEntityDetailModal entry={entityDetailEntry} onClose={() => setEntityDetailEntry(null)} />}
    </div>
  );
}
