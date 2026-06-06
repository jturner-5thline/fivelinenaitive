import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sparkles } from 'lucide-react';
import { AddToDealCalendarForm, type AddToDealCalendarPrefill } from './AddToDealCalendarForm';

export type { AddToDealCalendarPrefill } from './AddToDealCalendarForm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: AddToDealCalendarPrefill | null;
}

/**
 * Modal wrapper kept for the highlight-selection flow (HighlightCalendarMenu).
 * Inline entry points (MeetingCreateFollowUpAction) anchor the form via a
 * Popover instead.
 */
export function AddToDealCalendarDialog({ open, onOpenChange, prefill }: Props) {
  if (!prefill) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Create follow-up
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create a task and/or add an event to the deal calendar.
          </DialogDescription>
        </DialogHeader>
        <AddToDealCalendarForm
          prefill={prefill}
          onClose={() => onOpenChange(false)}
          compact
          resetKey={open ? `${prefill.ctx.recordId}:${prefill.ctx.sourceTimestamp}` : 'closed'}
        />
      </DialogContent>
    </Dialog>
  );
}
