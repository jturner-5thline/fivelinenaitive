import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Users, Lock, Save, Loader2 } from 'lucide-react';
import { usePermissionSettings, CompanyPermissionSettings } from '@/hooks/usePermissionSettings';
import { useCompany } from '@/hooks/useCompany';
import { Skeleton } from '@/components/ui/skeleton';

export function RolePermissionsSettings() {
  const { settings, isLoading, isSaving, saveSettings } = usePermissionSettings();
  const { isAdmin, userRole } = useCompany();
  const [localSettings, setLocalSettings] = useState<CompanyPermissionSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
    setHasChanges(false);
  }, [settings]);

  const handleToggle = (key: keyof CompanyPermissionSettings['lenderEdit'], value: boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      lenderEdit: {
        ...prev.lenderEdit,
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const success = await saveSettings(localSettings);
    if (success) {
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role-Based Permissions
          </CardTitle>
          <CardDescription>
            Permission settings can only be modified by company owners and admins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>Your current role: </span>
            <Badge variant="outline">{userRole || 'Member'}</Badge>
          </div>
          
          <Separator className="my-4" />
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Edit lender stages</span>
              <Badge variant={localSettings.lenderEdit.allowMembersToEditStage ? "default" : "secondary"}>
                {localSettings.lenderEdit.allowMembersToEditStage ? 'Allowed' : 'Restricted'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Edit milestones</span>
              <Badge variant={localSettings.lenderEdit.allowMembersToEditMilestones ? "default" : "secondary"}>
                {localSettings.lenderEdit.allowMembersToEditMilestones ? 'Allowed' : 'Restricted'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Edit notes</span>
              <Badge variant={localSettings.lenderEdit.allowMembersToEditNotes ? "default" : "secondary"}>
                {localSettings.lenderEdit.allowMembersToEditNotes ? 'Allowed' : 'Restricted'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role-Based Permissions
            </CardTitle>
            <CardDescription className="mt-1">
              Control what team members can edit on deal lenders
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Member Permissions</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Owners and Admins always have full access. Configure what regular Members can do.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-stage" className="text-sm font-medium">
                  Edit Lender Stages
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allow members to move lenders between Active, On-Deck, Passed, On-Hold
                </p>
              </div>
              <Switch
                id="edit-stage"
                checked={localSettings.lenderEdit.allowMembersToEditStage}
                onCheckedChange={(checked) => handleToggle('allowMembersToEditStage', checked)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-milestones" className="text-sm font-medium">
                  Edit Lender Milestones
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allow members to change lender substage/milestone progress
                </p>
              </div>
              <Switch
                id="edit-milestones"
                checked={localSettings.lenderEdit.allowMembersToEditMilestones}
                onCheckedChange={(checked) => handleToggle('allowMembersToEditMilestones', checked)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-notes" className="text-sm font-medium">
                  Edit Lender Notes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allow members to add and modify notes on lenders
                </p>
              </div>
              <Switch
                id="edit-notes"
                checked={localSettings.lenderEdit.allowMembersToEditNotes}
                onCheckedChange={(checked) => handleToggle('allowMembersToEditNotes', checked)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium">Security Note</p>
            <p className="mt-1">
              Changes are tracked in the audit trail. All team members can always view deal data,
              these settings only control editing capabilities.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
