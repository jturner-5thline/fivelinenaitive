import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mail, Building2, User, Loader2 } from 'lucide-react';
import type { FlexInfoNotification } from '@/hooks/useFlexInfoNotifications';

const DEFAULT_MESSAGE = `Thanks for your request. We're not able to grant this information request at this time. Please reach out if you have questions.`;

interface DenyInfoRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: FlexInfoNotification | null;
  onConfirmDeny: (notificationId: string, message: string) => Promise<boolean>;
}

export function DenyInfoRequestModal({ open, onOpenChange, notification, onConfirmDeny }: DenyInfoRequestModalProps) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSending) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setMessage(DEFAULT_MESSAGE);
        setError(null);
      }
    }
  };

  const handleSend = async () => {
    if (!notification || !message.trim()) return;

    setIsSending(true);
    setError(null);

    try {
      const success = await onConfirmDeny(notification.id, message.trim());
      if (success) {
        handleOpenChange(false);
      } else {
        setError('Failed to send message. Please try again.');
      }
    } catch {
      setError('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  if (!notification) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send message to lender</DialogTitle>
          <DialogDescription>
            You are denying this info request. Send a note to the requesting lender.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Recipient display */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Recipient</Label>
            <div className="space-y-1">
              {notification.lender_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{notification.lender_name}</span>
                </div>
              )}
              {notification.company_name && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{notification.company_name}</span>
                </div>
              )}
              {notification.user_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{notification.user_email}</span>
                </div>
              )}
              {!notification.lender_name && !notification.user_email && (
                <p className="text-sm text-muted-foreground italic">No contact information available</p>
              )}
            </div>
          </div>

          {/* Message field */}
          <div className="space-y-2">
            <Label htmlFor="deny-message">Message</Label>
            <Textarea
              id="deny-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message to the lender..."
              rows={5}
              disabled={isSending}
              className="resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            variant="destructive"
          >
            {isSending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
