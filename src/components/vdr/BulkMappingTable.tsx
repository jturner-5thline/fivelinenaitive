import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, FileText, Check, X, ChevronDown, Ban, Undo2, ArrowLeft, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { MappingRow, MappingStatus } from '@/hooks/useUploadedItems';

interface ChecklistItemOption {
  id: string;
  name: string;
  category: string | null;
}

interface BulkMappingTableProps {
  rows: MappingRow[];
  checklistItems: ChecklistItemOption[];
  onSetMappings: (uploadedItemId: string, checklistItemIds: string[]) => Promise<boolean>;
  onBulkSetMappings: (uploadedItemIds: string[], checklistItemIds: string[]) => Promise<boolean>;
  onSetIgnored: (uploadedItemIds: string[], ignored: boolean) => Promise<boolean>;
  onDeleteItems: (uploadedItemIds: string[]) => Promise<boolean>;
  onBack: () => void;
  onDone: () => void;
}

const STATUS_CONFIG: Record<MappingStatus, { label: string; className: string }> = {
  unmapped: { label: 'Unmapped', className: 'bg-amber-500/15 text-amber-500 border-amber-500/25' },
  mapped: { label: 'Mapped', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' },
  ignored: { label: 'Ignored', className: 'bg-muted text-muted-foreground border-border' },
};

type StatusFilter = 'all' | MappingStatus;

export function BulkMappingTable({
  rows,
  checklistItems,
  onSetMappings,
  onBulkSetMappings,
  onSetIgnored,
  onBack,
  onDone,
}: BulkMappingTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editSearch, setEditSearch] = useState('');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const editRef = useRef<HTMLDivElement>(null);

  // Filter rows
  const filteredRows = useMemo(() => {
    let result = rows;
    if (statusFilter !== 'all') result = result.filter(r => r.mappingStatus === statusFilter);
    const q = searchQuery.toLowerCase().trim();
    if (q) result = result.filter(r => r.name.toLowerCase().includes(q));
    return result;
  }, [rows, statusFilter, searchQuery]);

  // Select all visible
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Close editor on click outside
  useEffect(() => {
    if (!editingRowId) return;
    const handler = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        setEditingRowId(null);
        setEditSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingRowId]);

  const handleToggleMapping = async (rowId: string, checklistItemId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const current = new Set(row.checklistItemIds);
    if (current.has(checklistItemId)) current.delete(checklistItemId);
    else current.add(checklistItemId);
    await onSetMappings(rowId, Array.from(current));
  };

  const handleBulkMapConfirm = async () => {
    const ids = Array.from(selectedIds);
    await onBulkSetMappings(ids, Array.from(bulkSelectedIds));
    setBulkModalOpen(false);
    setBulkSelectedIds(new Set());
    setBulkSearch('');
    setSelectedIds(new Set());
  };

  const handleBulkIgnore = async (ignored: boolean) => {
    await onSetIgnored(Array.from(selectedIds), ignored);
    setSelectedIds(new Set());
  };

  // Checklist item lookup
  const checklistItemMap = useMemo(() => {
    const map = new Map<string, ChecklistItemOption>();
    checklistItems.forEach(ci => map.set(ci.id, ci));
    return map;
  }, [checklistItems]);

  // Filter checklist items in editor
  const filteredChecklistItems = useMemo(() => {
    const q = editSearch.toLowerCase().trim();
    if (!q) return checklistItems;
    return checklistItems.filter(ci => ci.name.toLowerCase().includes(q) || (ci.category || '').toLowerCase().includes(q));
  }, [checklistItems, editSearch]);

  const filteredBulkItems = useMemo(() => {
    const q = bulkSearch.toLowerCase().trim();
    if (!q) return checklistItems;
    return checklistItems.filter(ci => ci.name.toLowerCase().includes(q) || (ci.category || '').toLowerCase().includes(q));
  }, [checklistItems, bulkSearch]);

  const renderMappingCell = (row: MappingRow) => {
    const isEditing = editingRowId === row.id;
    const isIgnored = row.mappingStatus === 'ignored';

    if (isIgnored) {
      return (
        <div className="flex flex-wrap gap-1 py-1 opacity-50">
          {row.checklistItemIds.length > 0 ? row.checklistItemIds.map(id => {
            const ci = checklistItemMap.get(id);
            return <Badge key={id} variant="outline" className="text-[9px] px-1 py-0">{ci?.name || id}</Badge>;
          }) : <span className="text-[10px] text-muted-foreground italic">No mappings</span>}
        </div>
      );
    }

    if (!isEditing) {
      return (
        <div
          className="flex flex-wrap gap-1 py-1 cursor-pointer min-h-[28px] rounded-md hover:bg-secondary/40 px-1.5 -mx-1.5 transition-colors"
          onClick={() => { setEditingRowId(row.id); setEditSearch(''); }}
        >
          {row.checklistItemIds.length > 0 ? row.checklistItemIds.map(id => {
            const ci = checklistItemMap.get(id);
            return (
              <Badge key={id} variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                {ci?.name || id}
              </Badge>
            );
          }) : (
            <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
              Click to assign…
            </span>
          )}
        </div>
      );
    }

    // Inline multi-select editor
    return (
      <div ref={editRef} className="relative">
        <Input
          value={editSearch}
          onChange={e => setEditSearch(e.target.value)}
          placeholder="Search checklist items…"
          className="h-7 text-[11px] mb-1"
          autoFocus
          onKeyDown={e => { if (e.key === 'Escape') { setEditingRowId(null); setEditSearch(''); } }}
        />
        <div className="absolute z-50 top-8 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-auto">
          {filteredChecklistItems.map(ci => {
            const isSelected = row.checklistItemIds.includes(ci.id);
            return (
              <button
                key={ci.id}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-[11px] hover:bg-secondary/50 transition-colors text-left',
                  isSelected && 'bg-primary/10'
                )}
                onClick={() => handleToggleMapping(row.id, ci.id)}
              >
                <Checkbox checked={isSelected} className="h-3 w-3" />
                <span className="truncate flex-1">{ci.name}</span>
                {ci.category && <span className="text-[9px] text-muted-foreground">{ci.category}</span>}
              </button>
            );
          })}
          {filteredChecklistItems.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-muted-foreground text-center">No items match</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-border/40">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <h2 className="text-sm font-semibold">Map Items to Checklist</h2>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{rows.length} items</Badge>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 space-y-1.5 border-b border-border/20">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search uploaded items…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 text-[11px] pl-7 bg-secondary/30"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border/40 p-0.5">
            {(['all', 'unmapped', 'mapped', 'ignored'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors capitalize',
                  statusFilter === s ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="px-3 py-1.5 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
          <span className="text-[10px] font-medium text-primary">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setBulkModalOpen(true); setBulkSelectedIds(new Set()); setBulkSearch(''); }}>
              <Check className="h-3 w-3" /> Map to…
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleBulkIgnore(true)}>
              <Ban className="h-3 w-3" /> Ignore
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleBulkIgnore(false)}>
              <Undo2 className="h-3 w-3" /> Un-ignore
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b border-border/40">
              <th className="w-8 px-2 py-2">
                <Checkbox
                  checked={allVisibleSelected && filteredRows.length > 0}
                  onCheckedChange={toggleSelectAll}
                  className="h-3 w-3"
                />
              </th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[180px]">Mapping</th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground w-24">Status</th>
              <th className="w-16 px-2 py-2 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const isIgnored = row.mappingStatus === 'ignored';
              const statusCfg = STATUS_CONFIG[row.mappingStatus];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/20 transition-colors',
                    isIgnored ? 'opacity-50 bg-muted/20' : 'hover:bg-secondary/20'
                  )}
                >
                  <td className="px-2 py-1.5">
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleSelect(row.id)}
                      className="h-3 w-3"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {renderMappingCell(row)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', statusCfg.className)}>
                      {statusCfg.label}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[9px] px-1.5"
                      onClick={() => isIgnored ? onSetIgnored([row.id], false) : onSetIgnored([row.id], true)}
                    >
                      {isIgnored ? 'Un-ignore' : 'Ignore'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            No items match the current filter.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/40 flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">
          {rows.filter(r => r.mappingStatus === 'mapped').length} mapped · {rows.filter(r => r.mappingStatus === 'unmapped').length} unmapped · {rows.filter(r => r.mappingStatus === 'ignored').length} ignored
        </div>
        <Button size="sm" className="text-xs h-7" onClick={onDone}>Done</Button>
      </div>

      {/* Bulk Map Modal */}
      {bulkModalOpen && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-popover border border-border rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-3 py-2 border-b border-border/40">
              <h3 className="text-sm font-semibold">Map {selectedIds.size} items to checklist</h3>
              <p className="text-[10px] text-muted-foreground">Select checklist items to assign to all selected uploaded items.</p>
            </div>
            <div className="p-3 space-y-2">
              <Input
                placeholder="Search checklist items…"
                value={bulkSearch}
                onChange={e => setBulkSearch(e.target.value)}
                className="h-7 text-[11px]"
                autoFocus
              />
              <div className="max-h-[250px] overflow-auto space-y-0.5">
                {filteredBulkItems.map(ci => {
                  const isSelected = bulkSelectedIds.has(ci.id);
                  return (
                    <button
                      key={ci.id}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1.5 text-[11px] rounded-md hover:bg-secondary/50 transition-colors text-left',
                        isSelected && 'bg-primary/10'
                      )}
                      onClick={() => {
                        setBulkSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(ci.id)) next.delete(ci.id); else next.add(ci.id);
                          return next;
                        });
                      }}
                    >
                      <Checkbox checked={isSelected} className="h-3 w-3" />
                      <span className="truncate flex-1">{ci.name}</span>
                      {ci.category && <span className="text-[9px] text-muted-foreground">{ci.category}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-border/40 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setBulkModalOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" disabled={bulkSelectedIds.size === 0} onClick={handleBulkMapConfirm}>
                Apply to {selectedIds.size} items
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
