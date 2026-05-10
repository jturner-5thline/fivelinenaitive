import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Settings, Shield, Layers, Save, Globe, Flag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSystemSettings, useUpdateSystemSetting } from "@/hooks/useAdminConfig";
import { FeatureFlagsTable } from "@/components/admin/FeatureFlagsTable";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
];

const SESSION_TIMEOUT_OPTIONS = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 0, label: "Never" },
];

export const SystemSettingsPanel = () => {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSystemSetting();
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    if (settings) {
      const settingsMap: Record<string, any> = {};
      settings.forEach((s) => {
        settingsMap[s.key] = s.value;
      });
      setLocalSettings(settingsMap);
    }
  }, [settings]);

  const handleSave = async (key: string) => {
    try {
      await updateSetting.mutateAsync({ key, value: localSettings[key] });
      toast.success("Setting saved successfully");
    } catch (error) {
      toast.error("Failed to save setting");
    }
  };

  const updateLocalSetting = (key: string, path: string, value: any) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], [path]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const maintenanceMode = localSettings.maintenance_mode || { enabled: false, message: "" };
  const sessionTimeout = localSettings.session_timeout || { minutes: 60, warn_before_minutes: 5 };
  const require2fa = localSettings.require_2fa || { enabled: false, roles: [] };
  const platformName = localSettings.platform_name?.value ?? "naitive";
  const supportEmail = localSettings.support_email?.value ?? "";
  const defaultTimezone = localSettings.default_timezone?.value ?? "America/New_York";
  const defaultLanguage = localSettings.default_language?.value ?? "en";

  const handleSavePlatform = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: "platform_name", value: { value: platformName } }),
        updateSetting.mutateAsync({ key: "support_email", value: { value: supportEmail } }),
        updateSetting.mutateAsync({ key: "default_timezone", value: { value: defaultTimezone } }),
        updateSetting.mutateAsync({ key: "default_language", value: { value: defaultLanguage } }),
        updateSetting.mutateAsync({ key: "session_timeout", value: sessionTimeout }),
      ]);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <CardTitle className="text-lg">Platform Settings</CardTitle>
          </div>
          <CardDescription>Platform-wide configuration applied across the workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Platform Name</Label>
              <Input
                id="platform-name"
                value={platformName}
                onChange={(e) =>
                  setLocalSettings((p) => ({ ...p, platform_name: { value: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                id="support-email"
                type="email"
                placeholder="support@example.com"
                value={supportEmail}
                onChange={(e) =>
                  setLocalSettings((p) => ({ ...p, support_email: { value: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Default Timezone</Label>
              <Select
                value={defaultTimezone}
                onValueChange={(v) =>
                  setLocalSettings((p) => ({ ...p, default_timezone: { value: v } }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select
                value={defaultLanguage}
                onValueChange={(v) =>
                  setLocalSettings((p) => ({ ...p, default_language: { value: v } }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session Timeout</Label>
              <Select
                value={String(sessionTimeout.minutes ?? 60)}
                onValueChange={(v) =>
                  updateLocalSetting("session_timeout", "minutes", parseInt(v))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_TIMEOUT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSavePlatform} disabled={updateSetting.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Maintenance Mode */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle className="text-lg">Maintenance Mode</CardTitle>
            </div>
            <Badge variant={maintenanceMode.enabled ? "destructive" : "secondary"}>
              {maintenanceMode.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
          <CardDescription>
            When enabled, non-admin users will see a maintenance message
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="maintenance-toggle">Enable Maintenance Mode</Label>
            <Switch
              id="maintenance-toggle"
              checked={maintenanceMode.enabled}
              onCheckedChange={(checked) =>
                updateLocalSetting("maintenance_mode", "enabled", checked)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Maintenance Message</Label>
            <Textarea
              id="maintenance-message"
              value={maintenanceMode.message || ""}
              onChange={(e) =>
                updateLocalSetting("maintenance_mode", "message", e.target.value)
              }
              placeholder="System is under maintenance..."
            />
          </div>
          <Button onClick={() => handleSave("maintenance_mode")} disabled={updateSetting.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* 2FA Enforcement */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
          </div>
          <CardDescription>
            Require 2FA for all users or specific roles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="2fa-toggle">Require 2FA for All Users</Label>
            <Switch
              id="2fa-toggle"
              checked={require2fa.enabled}
              onCheckedChange={(checked) =>
                updateLocalSetting("require_2fa", "enabled", checked)
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            When enabled, users without 2FA will be prompted to set it up on next login
          </p>
          <Button onClick={() => handleSave("require_2fa")} disabled={updateSetting.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            <CardTitle className="text-lg">Feature Flags</CardTitle>
          </div>
          <CardDescription>
            Toggle experimental and staged features for the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeatureFlagsTable />
        </CardContent>
      </Card>

      {/* Default Stages */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            <CardTitle className="text-lg">Default Configurations</CardTitle>
          </div>
          <CardDescription>
            Default settings applied to new companies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Deal Stages</Label>
            <Textarea
              value={(localSettings.default_deal_stages?.stages || []).join(", ")}
              onChange={(e) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  default_deal_stages: {
                    ...prev.default_deal_stages,
                    stages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                }))
              }
              placeholder="Stage 1, Stage 2, Stage 3..."
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of stages</p>
          </div>
          <div className="space-y-2">
            <Label>Default Lender Stages</Label>
            <Textarea
              value={(localSettings.default_lender_stages?.stages || []).join(", ")}
              onChange={(e) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  default_lender_stages: {
                    ...prev.default_lender_stages,
                    stages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                }))
              }
              placeholder="Stage 1, Stage 2, Stage 3..."
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleSave("default_deal_stages")} disabled={updateSetting.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Deal Stages
            </Button>
            <Button onClick={() => handleSave("default_lender_stages")} disabled={updateSetting.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Lender Stages
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
