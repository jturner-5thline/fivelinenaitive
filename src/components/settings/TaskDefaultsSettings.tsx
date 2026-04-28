import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Link2 } from 'lucide-react';
import { useUiPreference } from '@/hooks/useUiPreference';

/**
 * Profile-level defaults that affect how new tasks are created across
 * the app (currently: AI-suggested task cards in the email assistant).
 * Per-card toggles continue to override these defaults on a one-off
 * basis — this only sets the initial position of the switch.
 */
export function TaskDefaultsSettings() {
  const [defaultAsanaSync, setDefaultAsanaSync] = useUiPreference<boolean>(
    'default_asana_sync',
    true,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Task defaults
        </CardTitle>
        <CardDescription>
          Defaults applied when you create tasks from AI suggestions.
          Individual cards can still override these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="default-asana-sync" className="text-sm font-medium">
              Sync new tasks to Asana by default
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the Asana toggle on each suggested task card
              starts in the on position. You can still turn it off per
              task before clicking Create.
            </p>
          </div>
          <Switch
            id="default-asana-sync"
            checked={defaultAsanaSync}
            onCheckedChange={(v) => setDefaultAsanaSync(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}