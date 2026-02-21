import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  Play,
  Trash2,
  MoreHorizontal,
  History,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  useScheduledReports,
  useReportRuns,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
  useRunReportNow,
  type ScheduledReport,
} from '@/hooks/useScheduledReports';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function ScheduledReportsManager() {
  const { data: schedules, isLoading } = useScheduledReports();
  const updateSchedule = useUpdateScheduledReport();
  const deleteSchedule = useDeleteScheduledReport();
  const runNow = useRunReportNow();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!schedules?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Scheduled Reports
          <Badge variant="secondary" className="ml-auto">{schedules.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Report</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[80px] pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <ScheduledReportRow
                key={schedule.id}
                schedule={schedule}
                isExpanded={expandedId === schedule.id}
                onToggleExpand={() => setExpandedId(expandedId === schedule.id ? null : schedule.id)}
                onToggleActive={(active) => updateSchedule.mutate({ id: schedule.id, is_active: active })}
                onDelete={() => deleteSchedule.mutate(schedule.id)}
                onRunNow={() => runNow.mutate(schedule.id)}
                isRunning={runNow.isPending}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ScheduledReportRow({
  schedule,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  onRunNow,
  isRunning,
}: {
  schedule: ScheduledReport;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: (active: boolean) => void;
  onDelete: () => void;
  onRunNow: () => void;
  isRunning: boolean;
}) {
  const { data: runs } = useReportRuns(isExpanded ? schedule.id : undefined);

  const describeCron = (cron: string) => {
    const parts = cron.split(' ');
    if (parts.length !== 5) return cron;
    const [min, hour, dom, , dow] = parts;
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    if (dow !== '*' && dom === '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayList = dow.split(',').map((d) => days[parseInt(d)] || d).join(', ');
      return `${dayList} at ${time}`;
    }
    if (dom !== '*') return `${dom}${getOrd(parseInt(dom))} of month at ${time}`;
    return `Daily at ${time}`;
  };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggleExpand}>
        <TableCell className="pl-6 font-medium text-sm">
          <div>
            <p>{schedule.name}</p>
            {schedule.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{schedule.description}</p>
            )}
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {describeCron(schedule.schedule_cron)}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px] capitalize">
            {schedule.delivery_method}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {schedule.last_run_at
            ? formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })
            : 'Never'}
        </TableCell>
        <TableCell>
          <StatusBadge isActive={schedule.is_active} />
        </TableCell>
        <TableCell>
          <Switch
            checked={schedule.is_active}
            onCheckedChange={onToggleActive}
            onClick={(e) => e.stopPropagation()}
          />
        </TableCell>
        <TableCell className="pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRunNow} disabled={isRunning}>
                <Play className="h-4 w-4 mr-2" /> Run Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleExpand}>
                <History className="h-4 w-4 mr-2" /> View History
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {isExpanded && runs && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-0">
            <div className="px-6 py-3">
              <p className="text-xs font-medium mb-2">Run History</p>
              {runs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No runs yet</p>
              ) : (
                <div className="space-y-1">
                  {runs.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center gap-3 text-xs py-1">
                      {run.status === 'success' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : run.status === 'failed' ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">
                        {run.started_at ? format(new Date(run.started_at), 'MMM d, h:mm a') : 'Pending'}
                      </span>
                      {run.duration_ms && (
                        <span className="text-muted-foreground">({(run.duration_ms / 1000).toFixed(1)}s)</span>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {run.delivery_status || run.status}
                      </Badge>
                      {run.error_message && (
                        <span className="text-destructive truncate max-w-[200px]">{run.error_message}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px]',
        isActive ? 'border-primary/30 text-primary' : 'text-muted-foreground'
      )}
    >
      {isActive ? 'Active' : 'Paused'}
    </Badge>
  );
}

function getOrd(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
