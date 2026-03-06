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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign } from 'lucide-react';

interface DealSizeConfirmDialogProps {
  open: boolean;
  dealName: string;
  currentValue: number;
  newStage: string;
  onConfirm: (updatedValue: number) => void;
  onCancel: () => void;
}

export function DealSizeConfirmDialog({
  open,
  dealName,
  currentValue,
  newStage,
  onConfirm,
  onCancel,
}: DealSizeConfirmDialogProps) {
  const [value, setValue] = useState<string>(currentValue.toString());

  useEffect(() => {
    if (open) {
      setValue(currentValue.toString());
    }
  }, [open, currentValue]);

  const handleConfirm = () => {
    const numericValue = parseFloat(value) || 0;
    onConfirm(numericValue);
  };

  const formattedCurrent = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(currentValue);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Confirm Deal Size
          </DialogTitle>
          <DialogDescription>
            <strong>{dealName}</strong> is moving to <strong>{newStage}</strong>. Please confirm the deal size is accurate, or update it below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Current Deal Size</p>
            <p className="text-lg font-semibold">{formattedCurrent}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-size-input">Deal Size ($)</Label>
            <Input
              id="deal-size-input"
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter deal size..."
              className="text-lg"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm & Update Stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
