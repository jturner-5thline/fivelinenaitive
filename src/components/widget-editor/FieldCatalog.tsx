import { useState } from 'react';
import { Field, SEED_FIELDS, DataType, FieldSource, QB_ENTITIES, getCOAForEntity, COAAccount } from './widgetTypes';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Hash, Calendar, Type, Building2, Check, ArrowLeft } from 'lucide-react';
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

const SOURCE_FILTERS: { value: FieldSource | 'all'; label: string; dotClass: string }[] = [
  { value: 'all', label: 'All', dotClass: '' },
  { value: 'quickbooks', label: 'QuickBooks', dotClass: 'bg-[hsl(142,71%,45%)]' },
  { value: 'hubspot', label: 'HubSpot', dotClass: 'bg-[hsl(17,100%,59%)]' },
  { value: 'naitive', label: 'naitive', dotClass: 'bg-primary' },
];

const COA_TYPE_GROUPS: { type: COAAccount['accountType']; label: string }[] = [
  { type: 'Income', label: 'Income' },
  { type: 'COGS', label: 'Cost of Goods Sold' },
  { type: 'Expense', label: 'Expenses' },
  { type: 'Asset', label: 'Assets' },
  { type: 'Liability', label: 'Liabilities' },
  { type: 'Equity', label: 'Equity' },
  { type: 'Other', label: 'Other' },
];

function SourceBadge({ source }: { source: FieldSource }) {
  const cfg: Record<FieldSource, { label: string; className: string }> = {
    quickbooks: { label: 'QB', className: 'bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,35%)]' },
    hubspot: { label: 'HS', className: 'bg-[hsl(17,100%,59%)]/15 text-[hsl(17,100%,45%)]' },
    naitive: { label: 'NT', className: 'bg-primary/10 text-primary' },
  };
  const c = cfg[source];
  return (
    <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide', c.className)}>
      {c.label}
    </span>
  );
}

function DraggableField({ field }: { field: Field | COAAccount }) {
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
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-sm touch-none',
        isDragging && 'opacity-40 ring-2 ring-primary/30'
      )}
    >
      <span className="truncate flex-1 text-foreground font-medium">
        {'fullName' in field ? field.name : field.name}
      </span>
      <SourceBadge source={field.source} />
      <span className={cn('inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase', badge.className)}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    </div>
  );
}

function DraggableCOAField({ account }: { account: COAAccount }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: account.id,
    data: { fieldId: account.id, dataType: account.dataType, isMeasure: account.isMeasure },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-xs touch-none',
        isDragging && 'opacity-40 ring-2 ring-primary/30'
      )}
    >
      <span className="truncate flex-1 text-foreground font-medium">{account.name}</span>
      <span className="text-[9px] text-muted-foreground font-medium">{account.accountType}</span>
    </div>
  );
}

interface FieldCatalogProps {
  selectedEntityId?: string | null;
  onEntityChange?: (entityId: string | null) => void;
}

export function FieldCatalog({ selectedEntityId, onEntityChange }: FieldCatalogProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sourceFilter, setSourceFilter] = useState<FieldSource | 'all'>('all');
  const [coaCollapsed, setCoaCollapsed] = useState<Record<string, boolean>>({});

  const isQB = sourceFilter === 'quickbooks';
  const hasEntity = isQB && selectedEntityId;

  const coaAccounts = hasEntity ? getCOAForEntity(selectedEntityId!) : [];
  const filteredCOA = coaAccounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const filtered = SEED_FIELDS.filter((f) => {
    if (sourceFilter !== 'all' && f.source !== sourceFilter) return false;
    return f.name.toLowerCase().includes(search.toLowerCase());
  });

  const groups = Object.keys(GROUP_LABELS) as Field['group'][];

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="px-4 py-3 border-b border-border space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Fields</h2>
        <Input
          placeholder={hasEntity ? "Search accounts…" : "Search fields…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
        {/* Source filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {SOURCE_FILTERS.map((sf) => (
            <button
              key={sf.value}
              onClick={() => {
                setSourceFilter(sf.value);
                if (sf.value !== 'quickbooks') {
                  onEntityChange?.(null);
                }
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                sourceFilter === sf.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {sf.dotClass && (
                <span className={cn('h-1.5 w-1.5 rounded-full', sf.dotClass)} />
              )}
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {/* QuickBooks entity selector */}
      {isQB && !hasEntity && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Select Entity
          </p>
          <div className="space-y-1.5">
            {QB_ENTITIES.map((entity) => (
              <button
                key={entity.id}
                onClick={() => onEntityChange?.(entity.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border transition-all text-left',
                  'border-border bg-card hover:border-primary/40 hover:bg-primary/5'
                )}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[hsl(142,71%,45%)]/10 shrink-0">
                  <Building2 className="h-4 w-4 text-[hsl(142,71%,45%)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{entity.name}</p>
                  <p className="text-[10px] text-muted-foreground">Realm {entity.realmId.slice(0, 8)}…</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Entity selected — show back button + COA */}
      {hasEntity && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <button
            onClick={() => onEntityChange?.(null)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Entities
          </button>
          <span className="text-xs text-muted-foreground">|</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 text-[hsl(142,71%,45%)] shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {QB_ENTITIES.find(e => e.id === selectedEntityId)?.name}
            </span>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* Show COA when entity is selected */}
          {hasEntity && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                Chart of Accounts
              </p>
              {COA_TYPE_GROUPS.map(({ type, label }) => {
                const items = filteredCOA.filter(a => a.accountType === type);
                if (items.length === 0) return null;
                const isCollapsed = coaCollapsed[type];
                return (
                  <div key={type}>
                    <button
                      onClick={() => setCoaCollapsed((s) => ({ ...s, [type]: !s[type] }))}
                      className="flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 hover:text-foreground transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {label}
                      <span className="ml-auto text-[10px] font-normal">{items.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1 pb-2">
                        {items.map((a) => (
                          <DraggableCOAField key={a.id} account={a} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredCOA.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No accounts match your search</p>
              )}

              {/* Divider + standard QB fields below */}
              <div className="border-t border-border my-3 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                  Standard Fields
                </p>
              </div>
            </>
          )}

          {/* Standard grouped fields */}
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
          {filtered.length === 0 && !hasEntity && (
            <p className="text-xs text-muted-foreground text-center py-6">No fields match your filters</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}