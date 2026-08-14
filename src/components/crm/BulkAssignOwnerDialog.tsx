import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TeamMember } from '@/hooks/useTeamMembers';

interface BulkAssignOwnerDialogProps {
  open: boolean;
  onClose: () => void;
  count: number;
  teamMembers: TeamMember[];
  isSaving?: boolean;
  onConfirm: (ownerId: string | null) => void;
}

const UNASSIGNED = '__unassigned__';

export function BulkAssignOwnerDialog({ open, onClose, count, teamMembers, isSaving, onConfirm }: BulkAssignOwnerDialogProps) {
  const [value, setValue] = useState<string>('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign Owner</DialogTitle>
          <DialogDescription>
            Select an owner for the {count} selected record{count === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>

        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {teamMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!value || isSaving}
            onClick={() => onConfirm(value === UNASSIGNED ? null : value)}
          >
            {isSaving ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
