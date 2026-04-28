import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell } from 'lucide-react';
import { useUiPreference } from '@/hooks/useUiPreference';

/**
 * Profile-level setting controlling how priority email notifications
 * deep-link into the deal Communication tab.
 *
 * - ON  ("Jump to detected message"): the link includes the message
 *   id + signal type, so the deal page auto-scrolls to and briefly
 *   highlights the exact message that triggered the notification.
 * - OFF ("Open the thread only"): the link includes only the thread
 *   id, so the inbox opens the thread without any auto-jump inside it.
 *
 * Persisted via `useUiPreference` under the key `notif_link_mode`.
 */
export function NotificationLinkSettings() {
  const [linkMode, setLinkMode] = useUiPreference<'message' | 'thread'>(
    'notif_link_mode',
    'message',
  );
  const jumpToMessage = linkMode === 'message';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notification links
        </CardTitle>
        <CardDescription>
          Control where priority email notifications take you when
          clicked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="notif-jump-to-message" className="text-sm font-medium">
              Jump to the detected message
            </Label>
            <p className="text-xs text-muted-foreground">
              When on, clicking a priority notification opens the
              thread and auto-scrolls to the message that triggered it,
              highlighting it briefly. When off, the link just opens the
              thread and lets you read it from the top.
            </p>
          </div>
          <Switch
            id="notif-jump-to-message"
            checked={jumpToMessage}
            onCheckedChange={(v) => setLinkMode(v ? 'message' : 'thread')}
          />
        </div>
      </CardContent>
    </Card>
  );
}