import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShieldAlert } from 'lucide-react';

interface OverwriteProtectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editedFieldCount: number;
  onKeepEdits: () => void;
  onOverwriteAll: () => void;
}

export function OverwriteProtectionDialog({
  open,
  onOpenChange,
  editedFieldCount,
  onKeepEdits,
  onOverwriteAll,
}: OverwriteProtectionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Protect your edits?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{editedFieldCount} field{editedFieldCount !== 1 ? 's have' : ' has'}</strong> been manually edited.
            Auto-generated content can either skip these fields to preserve your work, or overwrite everything.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onKeepEdits}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Keep my edits
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={onOverwriteAll}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Overwrite all
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
