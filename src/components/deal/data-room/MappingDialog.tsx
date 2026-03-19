import { useState, useMemo, useEffect } from 'react';
import { Link2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import { suggestMappings } from './helpers';
import type { DealAttachment } from '@/hooks/useDealAttachments';
import type { UnifiedChecklistItem, DataRoomContextValue } from './types';

interface MappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filesToMap: DealAttachment[];
  categories: string[];
  grouped: Record<string, UnifiedChecklistItem[]>;
  allItems: UnifiedChecklistItem[];
  getItemsForFile: DataRoomContextValue['getItemsForFile'];
  mapFileToItems: DataRoomContextValue['mapFileToItems'];
  unmapFile?: DataRoomContextValue['unmapFile'];
  onMarkItemsComplete?: (itemIds: string[]) => Promise<void>;
}

export function MappingDialog({
  open, onOpenChange, filesToMap, categories, grouped, allItems,
  getItemsForFile, mapFileToItems, unmapFile, onMarkItemsComplete,
}: MappingDialogProps) {
  const [selections, setSelections] = useState<Set<string>>(new Set());

  // Smart suggestions
  const suggestions = useMemo(() => {
    if (filesToMap.length === 0) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const file of filesToMap) {
      const matches = suggestMappings(file.name, allItems, 3);
      for (const m of matches) {
        if (!map.has(m.item.id)) map.set(m.item.id, new Set());
        map.get(m.item.id)!.add(file.name);
      }
    }
    return map;
  }, [filesToMap, allItems]);

  useEffect(() => {
    if (open && filesToMap.length > 0) {
      const existing = new Set<string>();
      for (const file of filesToMap) {
        getItemsForFile(file.id).forEach(m => existing.add(m.checklist_item_id));
      }
      suggestions.forEach((_, itemId) => existing.add(itemId));
      setSelections(existing);
    }
  }, [open, filesToMap, suggestions, getItemsForFile]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelections(new Set());
    }
    onOpenChange(isOpen);
  };

  const handleConfirm = async () => {
    const newItemIds = Array.from(selections);

    for (const file of filesToMap) {
      const currentMappings = getItemsForFile(file.id);
      const currentItemIds = new Set(currentMappings.map(m => m.checklist_item_id));

      // Unmap items that were deselected
      if (unmapFile) {
        for (const mapping of currentMappings) {
          if (!selections.has(mapping.checklist_item_id)) {
            await unmapFile(file.id, mapping.checklist_item_id);
          }
        }
      }

      // Map newly selected items
      const toAdd = newItemIds.filter(id => !currentItemIds.has(id));
      if (toAdd.length > 0) {
        await mapFileToItems(file.id, toAdd, 'manual_picker');
      }
    }

    if (onMarkItemsComplete && newItemIds.length > 0) {
      await onMarkItemsComplete(newItemIds);
    }
    onOpenChange(false);
    setSelections(new Set());
  };

  const hasSuggestions = suggestions.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Map Files to Checklist Items</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          Select which checklist items these {filesToMap.length} file(s) should be linked to.
          A file can be mapped to multiple items.
        </div>
        <div className="flex-1 overflow-hidden">
          {/* File list */}
          <div className="mb-3 space-y-1 max-h-20 overflow-y-auto">
            {filesToMap.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-xs p-1 bg-muted/30 rounded-md">
                <FileIcon name={f.name} className="h-3.5 w-3.5" />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>

          {/* AI Suggestions banner */}
          {hasSuggestions && (
            <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md bg-primary/5 border border-primary/20">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[10px] text-primary">
                {suggestions.size} suggested match{suggestions.size > 1 ? 'es' : ''} pre-selected based on file names
              </span>
            </div>
          )}

          <Separator className="mb-2" />
          <ScrollArea className="h-[300px]">
            <div className="space-y-1 pr-2">
              {categories.map(cat => (
                <div key={cat} className="mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</span>
                  <div className="mt-0.5 space-y-px">
                    {grouped[cat].map(item => {
                      const isSuggested = suggestions.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
                            selections.has(item.id) ? "bg-primary/10" : "hover:bg-muted/50",
                            isSuggested && !selections.has(item.id) && "ring-1 ring-primary/30",
                          )}
                        >
                          <Checkbox
                            checked={selections.has(item.id)}
                            onCheckedChange={(checked) => {
                              setSelections(prev => {
                                const next = new Set(prev);
                                checked ? next.add(item.id) : next.delete(item.id);
                                return next;
                              });
                            }}
                          />
                          <span className="truncate flex-1">{item.name}</span>
                          {isSuggested && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-primary/5 text-primary border-primary/20">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              Suggested
                            </Badge>
                          )}
                          {item.is_required && <Badge variant="secondary" className="text-[9px] h-4 px-1">REQ</Badge>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Skip</Button>
          <Button size="sm" onClick={handleConfirm} disabled={selections.size === 0}>
            Map to {selections.size} Item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
