import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface GmailSyncSettingsModalProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  onDisconnect?: () => void;
}

export function GmailSyncSettingsModal({ open, onClose, email, onDisconnect }: GmailSyncSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gmail Sync Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium">Connected Account</p>
            <p className="text-sm text-muted-foreground">{email || 'Unknown'}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">What naitive does with your Gmail:</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>Reads email metadata (sender, recipient, subject, date) to build deal communication timelines</li>
              <li>Email body content is NOT stored or displayed in naitive</li>
              <li>No emails are sent on your behalf from this page</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground italic">
            To send or read emails, open Gmail directly.
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          {onDisconnect && (
            <Button variant="destructive" size="sm" onClick={onDisconnect}>
              Disconnect Gmail
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
