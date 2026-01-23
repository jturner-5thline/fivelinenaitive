import { useState } from 'react';
import { Ban, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LenderPassReasonCategory,
  PASS_REASON_LABELS,
  DisqualifyLenderParams,
} from '@/hooks/useLenderDisqualifications';

interface DisqualifyLenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenderName: string;
  dealId: string;
  dealLenderId?: string;
  masterLenderId?: string;
  dealContext?: {
    dealSize?: number;
    industry?: string;
    geography?: string;
  };
  onDisqualify: (params: DisqualifyLenderParams) => Promise<void>;
}

export function DisqualifyLenderDialog({
  open,
  onOpenChange,
  lenderName,
  dealId,
  dealLenderId,
  masterLenderId,
  dealContext,
  onDisqualify,
}: DisqualifyLenderDialogProps) {
  const [reasonCategory, setReasonCategory] = useState<LenderPassReasonCategory>('deal_size_mismatch');
  const [reasonDetails, setReasonDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onDisqualify({
        dealId,
        dealLenderId,
        lenderName,
        masterLenderId,
        reasonCategory,
        reasonDetails: reasonDetails.trim() || undefined,
        dealSize: dealContext?.dealSize,
        dealIndustry: dealContext?.industry,
        dealGeography: dealContext?.geography,
      });
      onOpenChange(false);
      setReasonCategory('deal_size_mismatch');
      setReasonDetails('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Disqualify Lender
          </DialogTitle>
          <DialogDescription>
            Disqualify <span className="font-medium text-foreground">{lenderName}</span> from this deal. 
            This information helps the system learn and improve future lender suggestions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason-category">Reason Category *</Label>
            <Select
              value={reasonCategory}
              onValueChange={(value) => setReasonCategory(value as LenderPassReasonCategory)}
            >
              <SelectTrigger id="reason-category">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PASS_REASON_LABELS) as LenderPassReasonCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {PASS_REASON_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason-details">Additional Details (Optional)</Label>
            <Textarea
              id="reason-details"
              placeholder="Provide any specific details about why this lender isn't a fit..."
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" />
              <div>
                <p className="font-medium">Learning from this decision</p>
                <p className="text-muted-foreground mt-1">
                  This disqualification will be used to improve future lender suggestions. 
                  Similar deals may show warnings for this lender based on the pattern.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Disqualifying...' : 'Disqualify Lender'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
