import { useState, useMemo } from 'react';
import { Field, SEED_FIELDS, DataType, FieldSource } from './widgetTypes';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Hash, Calendar, Type, Building2, ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQBEntities, useQBAccounts, QBAccount } from '@/hooks/useQBWidgetData';

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

// Group QB account types into logical categories
const COA_CLASSIFICATION_GROUPS = [
  { classification: 'Revenue', label: 'Revenue / Income', types: ['Income', 'Revenue'] },
  { classification: 'Expense', label: 'Expenses', types: ['Expense', 'Cost of Goods Sold', 'COGS'] },
  { classification: 'Asset', label: 'Assets', types: ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'] },
  { classification: 'Liability', label: 'Liabilities', types: ['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'] },
  { classification: 'Equity', label: 'Equity', types: ['Equity'] },
] as const;

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
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-sm touch-none',
        isDragging && 'opacity-40 ring-2 ring-primary/30'
      )}
    >
      <span className="truncate flex-1 text-foreground font-medium">{field.name}</span>
      <SourceBadge source={field.source} />
      <span className={cn('inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase', badge.className)}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    </div>
  );
}

function DraggableCOAAccount({ account }: { account: QBAccount }) {
  // Use the UUID id as a draggable key, and pass it as fieldId for the widget config
  const dragId = `qb-account-${account.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: {
      fieldId: dragId,
      dataType: 'number',
      isMeasure: true,
      // Extra QB metadata for the config
      qbAccountId: account.qbId,
      qbAccountName: account.name,
      qbAccountType: account.accountType,
      qbRealmId: account.realmId,
    },
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
      {account.currentBalance != null && (
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          ${Math.abs(account.currentBalance).toLocaleString()}
        </span>
      )}
      <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,35%)]">
        QB
      </span>
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

  // Live QB data
  const { data: qbEntities, isLoading: entitiesLoading } = useQBEntities();
  const { data: qbAccounts, isLoading: accountsLoading } = useQBAccounts(
    sourceFilter === 'quickbooks' ? selectedEntityId : null
  );

  const isQB = sourceFilter === 'quickbooks';
  const hasEntity = isQB && selectedEntityId && selectedEntityId !== 'all';
  const isAllEntities = isQB && selectedEntityId === 'all';

  // Group COA by classification
  const groupedAccounts = useMemo(() => {
    if (!qbAccounts) return [];
    const filtered = qbAccounts.filter(a =>
      !search || (a.name?.toLowerCase().includes(search.toLowerCase()) ||
                  a.fullyQualifiedName?.toLowerCase().includes(search.toLowerCase()))
    );

    return COA_CLASSIFICATION_GROUPS.map(group => ({
      ...group,
      accounts: filtered.filter(a => {
        const at = a.accountType ?? '';
        const cls = a.classification ?? '';
        return group.types.some(t => t.toLowerCase() === at.toLowerCase() || t.toLowerCase() === cls.toLowerCase());
      }),
    })).filter(g => g.accounts.length > 0);
  }, [qbAccounts, search]);

  // Accounts that don't match any classification group
  const ungroupedAccounts = useMemo(() => {
    if (!qbAccounts) return [];
    const allGroupedIds = new Set(groupedAccounts.flatMap(g => g.accounts.map(a => a.id)));
    return qbAccounts.filter(a =>
      !allGroupedIds.has(a.id) &&
      (!search || a.name?.toLowerCase().includes(search.toLowerCase()))
    );
  }, [qbAccounts, groupedAccounts, search]);

  const filtered = SEED_FIELDS.filter((f) => {
    if (sourceFilter !== 'all' && f.source !== sourceFilter) return false;
    return f.name.toLowerCase().includes(search.toLowerCase());
  });

  const groups = Object.keys(GROUP_LABELS) as Field['group'][];

  const selectedEntity = qbEntities?.find(e => e.realmId === selectedEntityId);

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
          {entitiesLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : qbEntities && qbEntities.length > 0 ? (
            <div className="space-y-1.5">
              {qbEntities.map((entity) => (
                <button
                  key={entity.realmId}
                  onClick={() => onEntityChange?.(entity.realmId)}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border transition-all text-left',
                    'border-border bg-card hover:border-primary/40 hover:bg-primary/5',
                    entity.isExpired && 'opacity-60'
                  )}
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[hsl(142,71%,45%)]/10 shrink-0">
                    <Building2 className="h-4 w-4 text-[hsl(142,71%,45%)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {entity.companyName || `Realm ${entity.realmId}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {entity.isExpired ? (
                        <span className="text-destructive">Needs re-auth</span>
                      ) : (
                        `Realm ${entity.realmId.slice(0, 10)}…`
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No QuickBooks companies connected.
              <br />
              <span className="text-[10px]">Connect one in Integrations.</span>
            </p>
          )}
        </div>
      )}

      {/* Entity selected — show back button */}
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
              {selectedEntity?.companyName || selectedEntityId}
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
              {accountsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {groupedAccounts.map(({ classification, label, accounts }) => {
                    const isCollapsed = coaCollapsed[classification];
                    return (
                      <div key={classification}>
                        <button
                          onClick={() => setCoaCollapsed((s) => ({ ...s, [classification]: !s[classification] }))}
                          className="flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 hover:text-foreground transition-colors"
                        >
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {label}
                          <span className="ml-auto text-[10px] font-normal">{accounts.length}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-1 pb-2">
                            {accounts.map((a) => (
                              <DraggableCOAAccount key={a.id} account={a} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {ungroupedAccounts.length > 0 && (
                    <div>
                      <button
                        onClick={() => setCoaCollapsed((s) => ({ ...s, other: !s.other }))}
                        className="flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 hover:text-foreground transition-colors"
                      >
                        {coaCollapsed.other ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        Other
                        <span className="ml-auto text-[10px] font-normal">{ungroupedAccounts.length}</span>
                      </button>
                      {!coaCollapsed.other && (
                        <div className="space-y-1 pb-2">
                          {ungroupedAccounts.map((a) => (
                            <DraggableCOAAccount key={a.id} account={a} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {groupedAccounts.length === 0 && ungroupedAccounts.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {search ? 'No accounts match your search' : 'No accounts synced for this entity'}
                    </p>
                  )}
                </>
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
