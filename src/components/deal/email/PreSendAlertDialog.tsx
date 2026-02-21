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
import { Paperclip, FileWarning } from 'lucide-react';
import type { PreSendAlert } from './usePreSendChecks';

interface PreSendAlertDialogProps {
  alert: PreSendAlert;
  onClose: () => void;
  onSendAnyway: () => void;
  onAddAttachment: () => void;
  onAddSubject: () => void;
}

export function PreSendAlertDialog({
  alert,
  onClose,
  onSendAnyway,
  onAddAttachment,
  onAddSubject,
}: PreSendAlertDialogProps) {
  if (!alert) return null;

  if (alert === 'missing-attachment') {
    return (
      <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-amber-500" />
              Missing attachment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It looks like you mentioned an attachment in your email, but no files are attached. Would you like to add one before sending?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onSendAnyway}>Send anyway</AlertDialogCancel>
            <AlertDialogAction onClick={onAddAttachment}>
              <Paperclip className="h-3.5 w-3.5 mr-1.5" />
              Add attachment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-amber-500" />
            No subject line
          </AlertDialogTitle>
          <AlertDialogDescription>
            This email doesn't have a subject line. Recipients may overlook it or mark it as spam. Would you like to add one?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onSendAnyway}>Send without subject</AlertDialogCancel>
          <AlertDialogAction onClick={onAddSubject}>Add subject</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
