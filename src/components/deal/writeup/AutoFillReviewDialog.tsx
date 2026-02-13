import { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ExtractedField {
  key: string;
  label: string;
  value: string | string[];
  currentValue?: string | string[];
  hasExisting: boolean;
}

interface AutoFillReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: ExtractedField[];
  onApply: (selectedFields: string[]) => void;
  companyName?: string;
}

export function AutoFillReviewDialog({
  open,
  onOpenChange,
  fields,
  onApply,
  companyName,
}: AutoFillReviewDialogProps) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // Reset selection whenever fields change (e.g., dialog re-opens with new data)
  useEffect(() => {
    setSelectedFields(new Set(fields.filter(f => !f.hasExisting).map(f => f.key)));
  }, [fields]);

  const handleToggle = (key: string) => {
    const newSet = new Set(selectedFields);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedFields(newSet);
  };

  const handleApply = () => {
    onApply(Array.from(selectedFields));
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    setSelectedFields(new Set(fields.map(f => f.key)));
  };

  const handleSelectNone = () => {
    setSelectedFields(new Set());
  };

  const formatValue = (value: string | string[]): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Review Extracted Information</DialogTitle>
          <DialogDescription>
            {companyName
              ? `Select which fields to apply from ${companyName}'s website.`
              : 'Select which fields to apply from the company website.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectNone}>
            Select None
          </Button>
        </div>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {fields.map((field) => (
              <div
                key={field.key}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedFields.has(field.key)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                )}
                onClick={() => handleToggle(field.key)}
              >
                <Checkbox
                  id={field.key}
                  checked={selectedFields.has(field.key)}
                  onCheckedChange={() => handleToggle(field.key)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={field.key}
                      className="font-medium cursor-pointer"
                    >
                      {field.label}
                    </Label>
                    {field.hasExisting && (
                      <Badge variant="secondary" className="text-xs">
                        Will overwrite
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 break-words">
                    {formatValue(field.value)}
                  </p>
                  {field.hasExisting && field.currentValue && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Current: {formatValue(field.currentValue)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={selectedFields.size === 0}>
            Apply {selectedFields.size} Field{selectedFields.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
