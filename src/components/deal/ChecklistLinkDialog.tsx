import { useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  onConfirm: (selectedItemId: string | null) => void;
  onCancel: () => void;
}

export function ChecklistLinkDialog({
  open,
  onOpenChange,
  checklistItems,
  files,
  category,
  onConfirm,
  onCancel,
}: ChecklistLinkDialogProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const handleConfirm = () => {
    onConfirm(selectedItemId === 'na' ? null : selectedItemId);
    setSelectedItemId(null);
  };

  const handleCancel = () => {
    setSelectedItemId(null);
    onCancel();
  };

  const fileNames = files.map(f => f.name).join(', ');
  const truncatedNames = fileNames.length > 50 ? fileNames.slice(0, 50) + '...' : fileNames;

  // Group items by category
  const groupedItems = checklistItems.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Link to Checklist Item
          </DialogTitle>
          <DialogDescription>
            You're uploading <span className="font-medium">{files.length} file{files.length > 1 ? 's' : ''}</span> to{' '}
            <span className="font-medium capitalize">{category}</span>.
            <br />
            Select which checklist item this supports, or choose N/A if none apply.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          <RadioGroup
            value={selectedItemId || ''}
            onValueChange={setSelectedItemId}
            className="space-y-2"
          >
            {/* N/A Option at the top */}
            <div
              className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                selectedItemId === 'na'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
              onClick={() => setSelectedItemId('na')}
            >
              <RadioGroupItem value="na" id="na" />
              <Label htmlFor="na" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">N/A - Not applicable</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This file doesn't match any checklist item
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
                      selectedItemId === item.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <RadioGroupItem value={item.id} id={item.id} />
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

            {checklistItems.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                No checklist items available
              </div>
            )}
          </RadioGroup>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedItemId}>
            {selectedItemId === 'na' ? 'Upload Without Linking' : 'Upload & Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
