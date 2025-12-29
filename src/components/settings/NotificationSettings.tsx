import { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone, Loader2, AlertCircle, Activity, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/use-toast';

export function NotificationSettings() {
  const { profile, isLoading, updateProfile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  
  const [preferences, setPreferences] = useState({
    email_notifications: true,
    deal_updates_email: true,
    lender_updates_email: true,
    weekly_summary_email: true,
    in_app_notifications: true,
    deal_updates_app: true,
    lender_updates_app: true,
    // Bell notification preferences
    notify_stale_alerts: true,
    notify_activity_lender_added: true,
    notify_activity_lender_updated: true,
    notify_activity_stage_changed: true,
    notify_activity_status_changed: true,
    notify_activity_milestone_added: true,
    notify_activity_milestone_completed: true,
    notify_activity_milestone_missed: true,
  });

  useEffect(() => {
    if (profile) {
      setPreferences({
        email_notifications: profile.email_notifications ?? true,
        deal_updates_email: profile.deal_updates_email ?? true,
        lender_updates_email: profile.lender_updates_email ?? true,
        weekly_summary_email: profile.weekly_summary_email ?? true,
        in_app_notifications: profile.in_app_notifications ?? true,
        deal_updates_app: profile.deal_updates_app ?? true,
        lender_updates_app: profile.lender_updates_app ?? true,
        // Bell notification preferences
        notify_stale_alerts: (profile as any).notify_stale_alerts ?? true,
        notify_activity_lender_added: (profile as any).notify_activity_lender_added ?? true,
        notify_activity_lender_updated: (profile as any).notify_activity_lender_updated ?? true,
        notify_activity_stage_changed: (profile as any).notify_activity_stage_changed ?? true,
        notify_activity_status_changed: (profile as any).notify_activity_status_changed ?? true,
        notify_activity_milestone_added: (profile as any).notify_activity_milestone_added ?? true,
        notify_activity_milestone_completed: (profile as any).notify_activity_milestone_completed ?? true,
        notify_activity_milestone_missed: (profile as any).notify_activity_milestone_missed ?? true,
      });
    }
  }, [profile]);

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    setIsSaving(true);
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    try {
      await updateProfile({ [key]: value }, false);
      toast({
        title: 'Preference updated',
        description: 'Your notification preference has been saved.',
      });
    } catch (error) {
      // Revert on error
      setPreferences(preferences);
      toast({
        title: 'Error',
        description: 'Failed to update preference. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>Manage how you receive notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Email Notifications</h3>
          </div>
          
          <div className="space-y-4 pl-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="email_notifications" className="flex flex-col gap-1">
                <span>Enable email notifications</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Receive notifications via email
                </span>
              </Label>
              <Switch
                id="email_notifications"
                checked={preferences.email_notifications}
                onCheckedChange={(checked) => handleToggle('email_notifications', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="deal_updates_email" className="flex flex-col gap-1">
                <span>Deal updates</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Get notified when deals are updated
                </span>
              </Label>
              <Switch
                id="deal_updates_email"
                checked={preferences.deal_updates_email}
                onCheckedChange={(checked) => handleToggle('deal_updates_email', checked)}
                disabled={isSaving || !preferences.email_notifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="lender_updates_email" className="flex flex-col gap-1">
                <span>Lender updates</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Get notified when lender status changes
                </span>
              </Label>
              <Switch
                id="lender_updates_email"
                checked={preferences.lender_updates_email}
                onCheckedChange={(checked) => handleToggle('lender_updates_email', checked)}
                disabled={isSaving || !preferences.email_notifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="weekly_summary_email" className="flex flex-col gap-1">
                <span>Weekly summary</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Receive a weekly summary of your activity
                </span>
              </Label>
              <Switch
                id="weekly_summary_email"
                checked={preferences.weekly_summary_email}
                onCheckedChange={(checked) => handleToggle('weekly_summary_email', checked)}
                disabled={isSaving || !preferences.email_notifications}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* In-App Notifications Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">In-App Notifications</h3>
          </div>
          
          <div className="space-y-4 pl-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="in_app_notifications" className="flex flex-col gap-1">
                <span>Enable in-app notifications</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Show notifications within the app
                </span>
              </Label>
              <Switch
                id="in_app_notifications"
                checked={preferences.in_app_notifications}
                onCheckedChange={(checked) => handleToggle('in_app_notifications', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="deal_updates_app" className="flex flex-col gap-1">
                <span>Deal updates</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Show notifications for deal updates
                </span>
              </Label>
              <Switch
                id="deal_updates_app"
                checked={preferences.deal_updates_app}
                onCheckedChange={(checked) => handleToggle('deal_updates_app', checked)}
                disabled={isSaving || !preferences.in_app_notifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="lender_updates_app" className="flex flex-col gap-1">
                <span>Lender updates</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Show notifications for lender changes
                </span>
              </Label>
              <Switch
                id="lender_updates_app"
                checked={preferences.lender_updates_app}
                onCheckedChange={(checked) => handleToggle('lender_updates_app', checked)}
                disabled={isSaving || !preferences.in_app_notifications}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Bell Notification Preferences */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Notification Bell Preferences</h3>
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            Control which notifications appear in the notification bell dropdown
          </p>
          
          <div className="space-y-4 pl-6">
            {/* Stale Alerts */}
            <div className="flex items-center justify-between">
              <Label htmlFor="notify_stale_alerts" className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Stale lender reminders
                </span>
                <span className="text-sm text-muted-foreground font-normal">
                  Show alerts when lenders haven't been updated
                </span>
              </Label>
              <Switch
                id="notify_stale_alerts"
                checked={preferences.notify_stale_alerts}
                onCheckedChange={(checked) => handleToggle('notify_stale_alerts', checked)}
                disabled={isSaving}
              />
            </div>

            <Separator className="my-2" />

            {/* Lender Activity Types */}
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Lender Activity</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_lender_added" className="flex flex-col gap-1">
                <span>Lender added</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When lenders are added to deals
                </span>
              </Label>
              <Switch
                id="notify_activity_lender_added"
                checked={preferences.notify_activity_lender_added}
                onCheckedChange={(checked) => handleToggle('notify_activity_lender_added', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_lender_updated" className="flex flex-col gap-1">
                <span>Lender status changed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When lender stage or status changes
                </span>
              </Label>
              <Switch
                id="notify_activity_lender_updated"
                checked={preferences.notify_activity_lender_updated}
                onCheckedChange={(checked) => handleToggle('notify_activity_lender_updated', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_stage_changed" className="flex flex-col gap-1">
                <span>Lender stage changed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When lender stages are updated
                </span>
              </Label>
              <Switch
                id="notify_activity_stage_changed"
                checked={preferences.notify_activity_stage_changed}
                onCheckedChange={(checked) => handleToggle('notify_activity_stage_changed', checked)}
                disabled={isSaving}
              />
            </div>

            <Separator className="my-2" />

            {/* Deal Activity */}
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Deal Activity</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_status_changed" className="flex flex-col gap-1">
                <span>Deal status changed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When deal status is updated
                </span>
              </Label>
              <Switch
                id="notify_activity_status_changed"
                checked={preferences.notify_activity_status_changed}
                onCheckedChange={(checked) => handleToggle('notify_activity_status_changed', checked)}
                disabled={isSaving}
              />
            </div>

            <Separator className="my-2" />

            {/* Milestone Activity */}
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Milestone Activity</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_milestone_added" className="flex flex-col gap-1">
                <span>Milestone added</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When new milestones are created
                </span>
              </Label>
              <Switch
                id="notify_activity_milestone_added"
                checked={preferences.notify_activity_milestone_added}
                onCheckedChange={(checked) => handleToggle('notify_activity_milestone_added', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_milestone_completed" className="flex flex-col gap-1">
                <span>Milestone completed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When milestones are marked complete
                </span>
              </Label>
              <Switch
                id="notify_activity_milestone_completed"
                checked={preferences.notify_activity_milestone_completed}
                onCheckedChange={(checked) => handleToggle('notify_activity_milestone_completed', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify_activity_milestone_missed" className="flex flex-col gap-1">
                <span>Milestone missed</span>
                <span className="text-sm text-muted-foreground font-normal">
                  When milestones pass their due date
                </span>
              </Label>
              <Switch
                id="notify_activity_milestone_missed"
                checked={preferences.notify_activity_milestone_missed}
                onCheckedChange={(checked) => handleToggle('notify_activity_milestone_missed', checked)}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
