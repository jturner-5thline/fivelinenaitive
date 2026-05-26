import * as React from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader, StatusBadge } from "./ui";

export function SettingsPage({
  theme,
  onThemeChange,
}: {
  theme: "dark" | "light";
  onThemeChange: (t: "dark" | "light") => void;
}) {
  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader
        eyebrow="Workspace"
        title="SignalStack Settings"
        description="Tune what SignalStack monitors, who owns what, and how findings get exported."
      />

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-xs text-muted-foreground">Default dark. Light available for daytime reviews.</div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Dark</Label>
            <Switch checked={theme === "light"} onCheckedChange={(v) => onThemeChange(v ? "light" : "dark")} />
            <Label className="text-xs">Light</Label>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-medium">Signal weighting</div>
        <p className="text-xs text-muted-foreground">How each signal contributes to weighted severity on issue clusters.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Behavior weight" defaultValue="0.30" />
          <Field label="Feedback weight" defaultValue="0.25" />
          <Field label="AI failure weight" defaultValue="0.25" />
          <Field label="Business impact weight" defaultValue="0.20" />
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-medium">Thresholds</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Low-confidence threshold" defaultValue="0.70" />
          <Field label="Stale corpus (days)" defaultValue="30" />
          <Field label="Critical severity score" defaultValue="85" />
          <Field label="Drop-off alert (%)" defaultValue="20" />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-medium">Owners</div>
        <p className="text-xs text-muted-foreground">Default owners by signal category.</p>
        <Field label="Behavior / Journeys" defaultValue="Priya Shah" />
        <Field label="Voice of customer" defaultValue="Dana Wright" />
        <Field label="AI Training" defaultValue="Marcus Lin" />
        <Field label="AI Action audit" defaultValue="Priya Shah" />
      </Card>

      <Card className="p-5 flex items-center justify-between">
        <div>
          <div className="font-medium">Export & integrations</div>
          <div className="text-xs text-muted-foreground">Audit log can be exported as CSV. Webhook export coming soon.</div>
        </div>
        <StatusBadge tone="info">Audit CSV: enabled</StatusBadge>
      </Card>
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input defaultValue={defaultValue} className="h-8 mt-1 text-sm" />
    </div>
  );
}