import { useState, useMemo } from 'react';
import { Check, FileText, X, File } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  name: string;
  category: string | null;
  is_required: boolean;
}

interface ChecklistLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistItems: ChecklistItem[];
  files: File[];
  category: string;
  onConfirm: (assignments: Map<number, string | null>) => void;
  onCancel: () => void;
}

// Map upload folder categories to checklist category names (fallback for legacy categories)
const LEGACY_CATEGORY_MAPPINGS: Record<string, string[]> = {
  materials: ['materials', 'kpis & metrics', 'kpi'],
  financials: ['financials'],
  agreements: ['agreements', 'legal', 'contracts'],
  other: ['other'],
};

export function ChecklistLinkDialog({
  open,
  onOpenChange,
  checklistItems,
  files,
  category,
  onConfirm,
  onCancel,
}: ChecklistLinkDialogProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isNaSelected, setIsNaSelected] = useState(false);

  // Show all checklist items so users can link uploads to any item
  const filteredItems = useMemo(() => {
    return checklistItems;
  }, [checklistItems]);

  const handleToggleItem = (itemId: string) => {
    if (isNaSelected) {
      setIsNaSelected(false);
    }
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleToggleNa = () => {
    if (!isNaSelected) {
      setSelectedItemIds(new Set());
    }
    setIsNaSelected(!isNaSelected);
  };

  const handleConfirm = () => {
    // Create assignments map - all files get linked to all selected checklist items
    const assignments = new Map<number, string | null>();
    if (isNaSelected) {
      files.forEach((_, index) => {
        assignments.set(index, null);
      });
    } else {
      // For multiple selections, we pass the first item ID per file
      // The actual linking will handle multiple items
      const itemIds = Array.from(selectedItemIds);
      files.forEach((_, index) => {
        // Store comma-separated IDs for multiple selections
        assignments.set(index, itemIds.length > 0 ? itemIds.join(',') : null);
      });
    }
    onConfirm(assignments);
    setSelectedItemIds(new Set());
    setIsNaSelected(false);
  };

  const handleCancel = () => {
    setSelectedItemIds(new Set());
    setIsNaSelected(false);
    onCancel();
  };

  const hasSelection = isNaSelected || selectedItemIds.size > 0;

  // Group filtered items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  const categoryKeys = Object.keys(groupedItems);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Link to Checklist Item
          </DialogTitle>
          <DialogDescription>
            <div className="flex items-center justify-between gap-4">
              <span>
                Uploading to <span className="font-medium">{categoryLabel}</span> — select checklist items to link, or N/A.
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {files.length} file{files.length > 1 ? 's' : ''}: {files.slice(0, 3).map(f => f.name).join(', ')}{files.length > 3 ? ` +${files.length - 3} more` : ''}
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Kanban-style columns */}
          <div className="flex gap-3 min-h-[200px]">
            {/* N/A column */}
            <div className="flex-shrink-0 w-36">
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors h-full",
                  isNaSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button[role="checkbox"]')) return;
                  handleToggleNa();
                }}
              >
                <Checkbox 
                  checked={isNaSelected} 
                  onCheckedChange={handleToggleNa}
                />
                <div className="flex items-center gap-1.5">
                  <X className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm">N/A</span>
                </div>
              </div>
            </div>

            {/* Category columns */}
            {categoryKeys.map((categoryName) => (
              <div
                key={categoryName}
                className="flex-1 min-w-[160px] flex flex-col rounded-lg border border-border bg-muted/20 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-border bg-muted/40">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {categoryName}
                  </h3>
                  <span className="text-[10px] text-muted-foreground/70">
                    {groupedItems[categoryName].length} item{groupedItems[categoryName].length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {groupedItems[categoryName].map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm",
                        selectedItemIds.has(item.id)
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-transparent bg-background hover:border-border hover:bg-muted/30",
                        isNaSelected && "opacity-40 pointer-events-none"
                      )}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button[role="checkbox"]')) return;
                        handleToggleItem(item.id);
                      }}
                    >
                      <Checkbox 
                        checked={selectedItemIds.has(item.id)} 
                        onCheckedChange={() => handleToggleItem(item.id)}
                        disabled={isNaSelected}
                        className="flex-shrink-0 mt-0.5"
                      />
                      <span className="font-medium leading-tight">
                        {item.name}
                        {item.is_required && (
                          <span className="text-xs text-destructive ml-1">*</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No checklist items found</p>
              <p className="text-xs mt-1">Select N/A to upload without linking</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!hasSelection}>
            {isNaSelected 
              ? `Upload ${files.length > 1 ? `${files.length} Files` : 'File'} Without Linking` 
              : selectedItemIds.size > 1
                ? `Upload & Link to ${selectedItemIds.size} Items`
                : `Upload & Link ${files.length > 1 ? `${files.length} Files` : 'File'}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
