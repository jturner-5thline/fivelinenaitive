import { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone, Loader2 } from 'lucide-react';
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
      </CardContent>
    </Card>
  );
}
