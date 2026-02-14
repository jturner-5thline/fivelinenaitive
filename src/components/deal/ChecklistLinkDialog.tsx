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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Link to Checklist Item
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div>
              You're uploading to <span className="font-medium">{categoryLabel}</span>.
              Select which checklist item this supports, or choose N/A if none apply.
            </div>
            <div className="bg-muted/50 rounded-md p-2 text-xs">
              <div className="font-medium text-foreground mb-1">{files.length} file{files.length > 1 ? 's' : ''}:</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {files.slice(0, 5).map((file, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <File className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </li>
                ))}
                {files.length > 5 && (
                  <li className="text-muted-foreground/70">+{files.length - 5} more...</li>
                )}
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="space-y-2">
            {/* N/A Option at the top */}
            <div
              className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                isNaSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
              onClick={handleToggleNa}
            >
              <Checkbox 
                checked={isNaSelected} 
                onCheckedChange={handleToggleNa}
                id="na"
              />
              <Label htmlFor="na" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">N/A - Not applicable</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {files.length > 1 ? "These files don't" : "This file doesn't"} match any checklist item
                </p>
              </Label>
            </div>

            {/* Grouped checklist items */}
            {Object.entries(groupedItems).map(([categoryName, items]) => (
              <div key={categoryName} className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2">
                  {categoryName}
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedItemIds.has(item.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50",
                      isNaSelected && "opacity-50 pointer-events-none"
                    )}
                    onClick={() => handleToggleItem(item.id)}
                  >
                    <Checkbox 
                      checked={selectedItemIds.has(item.id)} 
                      onCheckedChange={() => handleToggleItem(item.id)}
                      id={item.id}
                      disabled={isNaSelected}
                    />
                    <Label htmlFor={item.id} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="font-medium">{item.name}</span>
                        {item.is_required && (
                          <span className="text-xs text-destructive">*</span>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No matching checklist items for {categoryLabel}</p>
                <p className="text-xs mt-1">Select N/A to upload without linking</p>
              </div>
            )}
          </div>
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
