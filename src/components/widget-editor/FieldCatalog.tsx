import { useState } from 'react';
import { Field, SEED_FIELDS, DataType } from './widgetTypes';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Hash, Calendar, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const GROUP_LABELS: Record<Field['group'], string> = {
  Financials: 'Financials',
  AccountDim: 'Account Dim',
  DateDim: 'Date Dim',
  General: 'General',
  System: 'System',
};

const TYPE_BADGE: Record<DataType, { icon: typeof Hash; label: string; className: string }> = {
  number: { icon: Hash, label: 'Num', className: 'bg-primary/10 text-primary' },
  date: { icon: Calendar, label: 'Date', className: 'bg-accent/10 text-accent' },
  string: { icon: Type, label: 'Text', className: 'bg-muted text-muted-foreground' },
};

function DraggableField({ field }: { field: Field }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: field.id,
    data: { fieldId: field.id, dataType: field.dataType, isMeasure: field.isMeasure },
  });

  const badge = TYPE_BADGE[field.dataType];
  const Icon = badge.icon;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-sm',
        isDragging && 'opacity-40 ring-2 ring-primary/30'
      )}
    >
      <span className="truncate flex-1 text-foreground font-medium">{field.name}</span>
      <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', badge.className)}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    </div>
  );
}

export function FieldCatalog() {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = SEED_FIELDS.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const groups = Object.keys(GROUP_LABELS) as Field['group'][];

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground mb-2">Fields</h2>
        <Input
          placeholder="Search fields…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {groups.map((group) => {
            const items = filtered.filter((f) => f.group === group);
            if (items.length === 0) return null;
            const isCollapsed = collapsed[group];
            return (
              <div key={group}>
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [group]: !s[group] }))}
                  className="flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 hover:text-foreground transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {GROUP_LABELS[group]}
                  <span className="ml-auto text-[10px] font-normal">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1 pb-2">
                    {items.map((f) => (
                      <DraggableField key={f.id} field={f} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
