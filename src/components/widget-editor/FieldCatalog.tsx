import { useState, useMemo } from 'react';
import { Field, SEED_FIELDS, DataType, FieldSource } from './widgetTypes';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Hash, Calendar, Type, Building2, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QBAccountField, QBEntity } from '@/hooks/useWidgetEditorData';
import { Badge } from '@/components/ui/badge';

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

// QB classification → color mapping
const CLASSIFICATION_COLORS: Record<string, string> = {
  Asset: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Liability: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Equity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Revenue: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Expense: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

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
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-sm',
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

function DraggableAccount({ account, entityName }: { account: QBAccountField; entityName?: string }) {
  const dragId = `qb-account-${account.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { fieldId: dragId, dataType: 'number', isMeasure: true, accountId: account.id, realmId: account.realmId },
  });

  const classColor = CLASSIFICATION_COLORS[account.classification || ''] || 'bg-muted text-muted-foreground';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card cursor-grab select-none transition-all text-sm',
        isDragging && 'opacity-40 ring-2 ring-primary/30'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-foreground font-medium text-xs">{account.name}</div>
        {account.fullyQualifiedName && account.fullyQualifiedName !== account.name && (
          <div className="truncate text-[10px] text-muted-foreground">{account.fullyQualifiedName}</div>
        )}
      </div>
      {entityName && (
        <span className="text-[9px] text-muted-foreground truncate max-w-[60px]" title={entityName}>
          {entityName}
        </span>
      )}
      <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0', classColor)}>
        {account.classification?.slice(0, 3) || 'OTH'}
      </span>
    </div>
  );
}

interface FieldCatalogProps {
  accounts?: QBAccountField[];
  entities?: QBEntity[];
  isLoading?: boolean;
}

export function FieldCatalog({ accounts = [], entities = [], isLoading = false }: FieldCatalogProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sourceFilter, setSourceFilter] = useState<FieldSource | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');

  // Build entity lookup
  const entityMap = useMemo(() => {
    const map: Record<string, string> = {};
    entities.forEach((e) => { map[e.realmId] = e.companyName || e.realmId; });
    return map;
  }, [entities]);

  // Get unique account types from real data
  const accountTypes = useMemo(() => {
    const types = new Set<string>();
    accounts.forEach((a) => { if (a.accountType) types.add(a.accountType); });
    return Array.from(types).sort();
  }, [accounts]);

  // Get unique classifications
  const classifications = useMemo(() => {
    const cls = new Set<string>();
    accounts.forEach((a) => { if (a.classification) cls.add(a.classification); });
    return Array.from(cls).sort();
  }, [accounts]);

  // Filter seed fields
  const filteredSeedFields = SEED_FIELDS.filter((f) => {
    if (sourceFilter !== 'all' && f.source !== sourceFilter) return false;
    if (sourceFilter === 'quickbooks') return false; // QB accounts shown separately
    return f.name.toLowerCase().includes(search.toLowerCase());
  });

  // Filter QB accounts
  const filteredAccounts = useMemo(() => {
    if (sourceFilter !== 'all' && sourceFilter !== 'quickbooks') return [];
    return accounts.filter((a) => {
      if (entityFilter !== 'all' && a.realmId !== entityFilter) return false;
      if (accountTypeFilter !== 'all' && a.accountType !== accountTypeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
          !(a.fullyQualifiedName?.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [accounts, search, entityFilter, accountTypeFilter, sourceFilter]);

  // Group accounts by classification
  const accountsByClassification = useMemo(() => {
    const groups: Record<string, QBAccountField[]> = {};
    filteredAccounts.forEach((a) => {
      const key = a.classification || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [filteredAccounts]);

  const groups = Object.keys(GROUP_LABELS) as Field['group'][];
  const showQBSection = sourceFilter === 'all' || sourceFilter === 'quickbooks';

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="px-4 py-3 border-b border-border space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Fields</h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search fields & accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs pl-7"
          />
        </div>
        {/* Source filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {SOURCE_FILTERS.map((sf) => (
            <button
              key={sf.value}
              onClick={() => setSourceFilter(sf.value)}
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

        {/* Entity filter (shown when QB is visible) */}
        {showQBSection && entities.length > 0 && (
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-7 text-xs">
              <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.realmId} value={e.realmId}>{e.companyName || e.realmId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Account type filter */}
        {showQBSection && accountTypes.length > 0 && (
          <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="All Account Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Account Types</SelectItem>
              {accountTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* QB Chart of Accounts section */}
          {showQBSection && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-xs">Loading accounts…</span>
                </div>
              ) : filteredAccounts.length > 0 ? (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Chart of Accounts
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {filteredAccounts.length}
                    </Badge>
                  </div>
                  {Object.entries(accountsByClassification).map(([classification, accts]) => {
                    const key = `coa-${classification}`;
                    const isCollapsed = collapsed[key];
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setCollapsed((s) => ({ ...s, [key]: !s[key] }))}
                          className="flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 hover:text-foreground transition-colors"
                        >
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {classification}
                          <span className="ml-auto text-[10px] font-normal">{accts.length}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-1 pb-2">
                            {accts.map((a) => (
                              <DraggableAccount
                                key={a.id}
                                account={a}
                                entityName={entities.length > 1 ? entityMap[a.realmId] : undefined}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : accounts.length > 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No accounts match filters</p>
              ) : null}

              {/* Divider between COA and seed fields */}
              {filteredAccounts.length > 0 && filteredSeedFields.length > 0 && (
                <div className="border-t border-border my-2" />
              )}
            </>
          )}

          {/* Seed / static fields */}
          {filteredSeedFields.length > 0 && (
            <>
              {showQBSection && accounts.length > 0 && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block py-1">
                  Computed Fields
                </span>
              )}
              {groups.map((group) => {
                const items = filteredSeedFields.filter((f) => f.group === group);
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
            </>
          )}

          {filteredSeedFields.length === 0 && filteredAccounts.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-6">No fields match your filters</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
