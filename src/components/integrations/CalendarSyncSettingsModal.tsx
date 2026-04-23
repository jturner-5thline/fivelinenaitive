import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CalendarSyncSettingsModalProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  onDisconnect?: () => void;
}

export function CalendarSyncSettingsModal({ open, onClose, email, onDisconnect }: CalendarSyncSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Google Calendar Sync Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-medium">Connected Account</p>
              <p className="text-sm text-muted-foreground">{email || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Access</p>
              <p className="text-sm text-muted-foreground">Read-only ✅</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">What naitive does with your Calendar:</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>Reads meeting events and associates them with active deals based on attendees and title matching</li>
              <li>Events are used for deal timeline enrichment only — no events are created or modified</li>
              <li>To manage your calendar, open Google Calendar directly.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          {onDisconnect && (
            <Button variant="destructive" size="sm" onClick={onDisconnect}>
              Disconnect Calendar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
