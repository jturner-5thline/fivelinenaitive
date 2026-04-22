import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import { useFlexSyncSettings, type FlexSyncSettings } from '@/hooks/useFlexSyncSettings';

interface FlexAutoRemovalRulesProps {
  companyId: string | null | undefined;
  canEdit: boolean;
}

const RULES: { key: keyof FlexSyncSettings; title: string; description: string }[] = [
  {
    key: 'remove_on_due_diligence',
    title: 'Stage moves to Due Diligence',
    description:
      'Remove from FLEx when a deal enters the Due Diligence stage in the active pipeline.',
  },
  {
    key: 'remove_on_closed_won',
    title: 'Stage moves to Closed Won',
    description: 'Remove from FLEx when a deal is marked Closed Won.',
  },
  {
    key: 'remove_on_closed_lost',
    title: 'Stage moves to Closed Lost',
    description: 'Remove from FLEx when a deal is marked Closed Lost.',
  },
  {
    key: 'remove_on_archived',
    title: 'Deal is tagged Archived',
    description: 'Remove from FLEx as soon as the Archived tag is applied to a deal.',
  },
];

/**
 * Inline configuration card surfaced inside the Integrations page for users
 * with FLEx access. Lets company admins toggle each of the four auto-removal
 * triggers and explains how a deal gets re-added to FLEx.
 */
export function FlexAutoRemovalRules({ companyId, canEdit }: FlexAutoRemovalRulesProps) {
  const { settings, isLoading, isSaving, updateSetting } = useFlexSyncSettings(companyId);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">FLEx Auto-Removal Rules</CardTitle>
        <CardDescription>
          Automatically remove a deal from FLEx when any of these conditions become true.
          Triggers fire in real time on stage or tag change — not only on the nightly sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {RULES.map((rule) => (
              <div
                key={rule.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/40 p-3"
              >
                <div className="space-y-0.5">
                  <Label htmlFor={`flex-rule-${rule.key}`} className="text-sm font-medium">
                    {rule.title}
                  </Label>
                  <p className="text-xs text-muted-foreground">{rule.description}</p>
                </div>
                <Switch
                  id={`flex-rule-${rule.key}`}
                  checked={settings[rule.key]}
                  onCheckedChange={(value) => updateSetting(rule.key, value)}
                  disabled={!canEdit || isSaving}
                  aria-label={rule.title}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
          <p>
            <span className="font-medium text-foreground">Re-add behavior: </span>
            If a deal later leaves all of these states (e.g. the Archived tag is removed and the
            stage is moved back out of Due Diligence / Closed Won / Closed Lost), it can be
            re-added to FLEx using the standard publish action on the Deal Write-Up page.
            Removal is logged to the audit trail with the deal id, the trigger that fired, and
            the timestamp.
          </p>
        </div>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only company admins can change these rules.
          </p>
        )}
      </CardContent>
    </Card>
  );
}