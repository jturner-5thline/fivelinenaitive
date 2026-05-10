import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Send, Eye, RefreshCw, FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface RecurringReport {
  id: string;
  report_key: string;
  name: string;
  description: string | null;
  recipient: string;
  frequency: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_subject: string | null;
  last_preview_html: string | null;
  last_preview_text: string | null;
}

interface ReportRun {
  id: string;
  report_key: string;
  recipient: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  rendered_html: string | null;
  rendered_text: string | null;
  triggered_by: string;
  created_at: string;
}

const REPORT_TYPES = [
  { value: "deal-activity", label: "Deal Activity" },
  { value: "lender-summary", label: "Lender Summary" },
  { value: "usage", label: "Usage" },
  { value: "finance", label: "Finance" },
];

const FREQUENCY_PRESETS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const DAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

interface ReportFormState {
  id: string | null;
  name: string;
  reportType: string;
  recipients: string;
  frequency: string;
  day: string;
  time: string;
}

const blankForm: ReportFormState = {
  id: null,
  name: "",
  reportType: "deal-activity",
  recipients: "",
  frequency: "weekly",
  day: "monday",
  time: "08:00",
};

const FREQUENCIES: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  "weekly-insights": {
    label: "Weekly Insights",
    options: [
      { value: "weekly-friday-8am-et", label: "Weekly — Friday 8am ET" },
      { value: "weekly-monday-8am-et", label: "Weekly — Monday 8am ET" },
      { value: "daily-8am-et", label: "Daily — 8am ET" },
    ],
  },
  "platform-update": {
    label: "Platform Update",
    options: [
      { value: "every-48h", label: "Every 48 hours" },
      { value: "daily", label: "Every 24 hours" },
      { value: "weekly", label: "Weekly" },
    ],
  },
};

export const RecurringReportsPanel = () => {
  const [reports, setReports] = useState<RecurringReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<RecurringReport | null>(null);
  const [runs, setRuns] = useState<Record<string, ReportRun[]>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReportFormState>(blankForm);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recurring_reports")
      .select("*")
      .order("report_key");
    if (error) {
      toast.error("Failed to load reports: " + error.message);
    } else {
      setReports((data ?? []) as RecurringReport[]);
    }
    const { data: runData } = await supabase
      .from("recurring_report_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);
    const grouped: Record<string, ReportRun[]> = {};
    (runData ?? []).forEach((r: any) => {
      grouped[r.report_key] = grouped[r.report_key] || [];
      grouped[r.report_key].push(r as ReportRun);
    });
    setRuns(grouped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(blankForm);
    setFormOpen(true);
  };

  const openEdit = (r: RecurringReport) => {
    const overrides = (r as any).schedule_overrides ?? {};
    setForm({
      id: r.id,
      name: r.name,
      reportType: overrides.report_type ?? "deal-activity",
      recipients: r.recipient,
      frequency: overrides.frequency_preset ?? "weekly",
      day: overrides.day ?? "monday",
      time: overrides.time ?? "08:00",
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.recipients.trim()) {
      toast.error("Name and recipients are required");
      return;
    }
    setSubmitting(true);
    const overrides = {
      report_type: form.reportType,
      frequency_preset: form.frequency,
      day: form.day,
      time: form.time,
    };
    const payload: any = {
      name: form.name.trim(),
      recipient: form.recipients.trim(),
      frequency: `${form.frequency}-${form.day}-${form.time}`,
      schedule_overrides: overrides,
      enabled: true,
    };
    if (form.id) {
      const { error } = await supabase.from("recurring_reports").update(payload).eq("id", form.id);
      setSubmitting(false);
      if (error) return toast.error("Save failed: " + error.message);
      toast.success("Report updated");
    } else {
      payload.report_key = `${form.reportType}-${Date.now()}`;
      const { error } = await supabase.from("recurring_reports").insert(payload);
      setSubmitting(false);
      if (error) return toast.error("Create failed: " + error.message);
      toast.success("Report created");
    }
    setFormOpen(false);
    setForm(blankForm);
    await load();
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Delete this scheduled report?")) return;
    const { error } = await supabase.from("recurring_reports").delete().eq("id", id);
    if (error) return toast.error("Delete failed: " + error.message);
    toast.success("Report deleted");
    await load();
  };

  const updateReport = async (id: string, patch: Partial<RecurringReport>) => {
    setSavingId(id);
    const { error } = await supabase
      .from("recurring_reports")
      .update(patch as any)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error("Save failed: " + error.message);
    } else {
      toast.success("Saved");
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }
  };

  const runNow = async (report: RecurringReport) => {
    setRunningKey(report.report_key);
    const { data, error } = await supabase.functions.invoke("send-ux-insights-email", {
      body: { report_key: report.report_key, triggered_by: "manual" },
    });
    setRunningKey(null);
    if (error) {
      toast.error("Run failed: " + error.message);
    } else {
      toast.success(`Sent to ${report.recipient}`);
      await load();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Scheduled Reports</h3>
          <p className="text-sm text-muted-foreground">
            Automated UX & engagement insights delivered on a schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Create Report
          </Button>
        </div>
      </div>

      {reports.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border rounded-md">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No scheduled reports. Create one to automate reporting.</p>
        </div>
      )}

      {reports.map((r) => {
        const freqCfg = FREQUENCIES[r.report_key] ?? { label: r.name, options: [{ value: r.frequency, label: r.frequency }] };
        const recentRuns = runs[r.report_key]?.slice(0, 5) ?? [];
        return (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    {r.name}
                    {r.enabled ? (
                      <Badge variant="default" className="text-xs">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Disabled</Badge>
                    )}
                  </CardTitle>
                  {r.description && <CardDescription>{r.description}</CardDescription>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    disabled={savingId === r.id}
                    onCheckedChange={(v) => updateReport(r.id, { enabled: v })}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteReport(r.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient email</Label>
                  <Input
                    type="email"
                    defaultValue={r.recipient}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== r.recipient) updateReport(r.id, { recipient: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequency</Label>
                  <Select
                    value={r.frequency}
                    onValueChange={(v) => updateReport(r.id, { frequency: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {freqCfg.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div className="space-x-3">
                  <span className="text-muted-foreground">Last run:</span>
                  <span className="font-medium">
                    {r.last_run_at ? format(new Date(r.last_run_at), "MMM d, yyyy HH:mm") : "Never"}
                  </span>
                  {r.last_status && (
                    <Badge variant={r.last_status === "sent" ? "default" : "destructive"} className="text-xs">
                      {r.last_status}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.last_preview_html && !r.last_preview_text}
                    onClick={() => setPreviewReport(r)}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Preview last
                  </Button>
                  <Button size="sm" disabled={runningKey === r.report_key} onClick={() => runNow(r)}>
                    {runningKey === r.report_key ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    Send now
                  </Button>
                </div>
              </div>

              {r.last_error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{r.last_error}</p>
              )}

              {recentRuns.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Recent runs</p>
                  <div className="space-y-1">
                    {recentRuns.map((run) => (
                      <div key={run.id} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                        <span className="text-muted-foreground">
                          {format(new Date(run.created_at), "MMM d, HH:mm")} · {run.triggered_by}
                        </span>
                        <Badge
                          variant={run.status === "sent" ? "default" : "destructive"}
                          className="text-xs"
                        >
                          {run.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Report" : "Create Report"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Report Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly Deal Activity" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Report Type</Label>
              <Select value={form.reportType} onValueChange={(v) => setForm({ ...form, reportType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipients (comma-separated emails)</Label>
              <Input
                value={form.recipients}
                onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                placeholder="alice@example.com, bob@example.com"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_PRESETS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Day</Label>
                <Select value={form.day} onValueChange={(v) => setForm({ ...form, day: v })} disabled={form.frequency === "daily"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Time (ET)</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={submitForm} disabled={submitting}>
                {submitting && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                {form.id ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewReport} onOpenChange={(o) => !o && setPreviewReport(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{previewReport?.last_subject || previewReport?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {previewReport?.last_preview_html ? (
              <iframe
                title="report-preview"
                srcDoc={previewReport.last_preview_html}
                className="w-full min-h-[60vh] border-0 bg-white rounded"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-xs font-mono p-4">
                {previewReport?.last_preview_text || "No preview available"}
              </pre>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
