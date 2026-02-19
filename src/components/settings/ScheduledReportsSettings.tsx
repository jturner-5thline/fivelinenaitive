import { useState } from 'react';
import { Plus, Play, Pause, Trash2, Clock, BarChart3, ChevronDown, ChevronRight, Loader2, FileText, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useScheduledReports,
  useReportRuns,
  useCreateScheduledReport,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
  useRunReportNow,
  REPORT_TYPES,
  SCHEDULE_PRESETS,
  ScheduledReport,
  ReportRun,
} from '@/hooks/useScheduledReports';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function CreateReportDialog({ onClose }: { onClose: () => void }) {
  const createReport = useCreateScheduledReport();
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0].id);
  const [scheduleCron, setScheduleCron] = useState<string>(SCHEDULE_PRESETS[1].cron);
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    createReport.mutate({
      name: name || REPORT_TYPES.find(r => r.id === reportType)?.label || 'Report',
      description: description || undefined,
      report_type: reportType,
      schedule_cron: scheduleCron,
    }, { onSuccess: onClose });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Report Type</Label>
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map(type => (
              <SelectItem key={type.id} value={type.id}>
                <span className="flex items-center gap-2">
                  {type.emoji} {type.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {REPORT_TYPES.find(r => r.id === reportType)?.description}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          placeholder={REPORT_TYPES.find(r => r.id === reportType)?.label}
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Schedule</Label>
        <Select value={scheduleCron} onValueChange={setScheduleCron}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_PRESETS.map(preset => (
              <SelectItem key={preset.cron} value={preset.cron}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea
          placeholder="Add notes about this report..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={createReport.isPending}>
          {createReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Schedule
        </Button>
      </DialogFooter>
    </div>
  );
}

function ReportRunHistory({ reportId }: { reportId: string }) {
  const { data: runs, isLoading } = useReportRuns(reportId);

  if (isLoading) return <div className="text-sm text-muted-foreground py-2">Loading history...</div>;
  if (!runs?.length) return <div className="text-sm text-muted-foreground py-2">No runs yet</div>;

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {runs.map(run => (
        <div key={run.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 text-sm">
          <div className={cn(
            'mt-0.5 h-2 w-2 rounded-full shrink-0',
            run.status === 'completed' ? 'bg-green-500' :
            run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{run.status}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(run.created_at), 'MMM d, h:mm a')}
              </span>
            </div>
            {run.summary_text && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{run.summary_text}</p>
            )}
            {run.error_message && (
              <p className="text-xs text-destructive mt-1">{run.error_message}</p>
            )}
            {run.duration_ms && (
              <span className="text-xs text-muted-foreground">{(run.duration_ms / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: ScheduledReport }) {
  const [expanded, setExpanded] = useState(false);
  const updateReport = useUpdateScheduledReport();
  const deleteReport = useDeleteScheduledReport();
  const runNow = useRunReportNow();

  const typeInfo = REPORT_TYPES.find(t => t.id === report.report_type);
  const scheduleLabel = SCHEDULE_PRESETS.find(p => p.cron === report.schedule_cron)?.label || report.schedule_cron;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">{typeInfo?.emoji || '📊'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{report.name}</span>
              <Badge variant={report.is_active ? 'default' : 'secondary'} className="text-[10px] h-4">
                {report.is_active ? 'Active' : 'Paused'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />
              {scheduleLabel}
              {report.last_run_at && (
                <>
                  <span>·</span>
                  <span>Last: {format(new Date(report.last_run_at), 'MMM d')}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={report.is_active}
              onCheckedChange={(checked) => updateReport.mutate({ id: report.id, is_active: checked })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => runNow.mutate(report.id)}
              disabled={runNow.isPending}
            >
              {runNow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-3">
            {report.description && (
              <p className="text-sm text-muted-foreground">{report.description}</p>
            )}
            <ReportRunHistory reportId={report.id} />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7 text-xs"
                onClick={() => deleteReport.mutate(report.id)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ScheduledReportsSettings() {
  const { data: reports, isLoading } = useScheduledReports();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Scheduled Reports
            </CardTitle>
            <CardDescription>Automated AI-powered reports delivered on schedule</CardDescription>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Scheduled Report</DialogTitle>
              </DialogHeader>
              <CreateReportDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading reports...</div>
        ) : !reports?.length ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No scheduled reports yet</p>
            <p className="text-xs text-muted-foreground/70">Create a schedule to get automated insights</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(report => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
