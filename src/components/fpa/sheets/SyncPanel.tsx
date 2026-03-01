import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw, Clock, ArrowDownToLine, ArrowUpFromLine, CheckCircle2,
  AlertCircle, Zap, Calendar, Play, Pause, ChevronDown, ChevronRight,
  FileSpreadsheet, Database, GitBranch
} from 'lucide-react';

interface SyncJob {
  id: string;
  name: string;
  direction: 'pull' | 'push' | 'bi-directional';
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: 'active' | 'paused' | 'error';
  rowsAffected: number;
}

interface AutomationStep {
  id: string;
  name: string;
  type: 'refresh' | 'ai_scan' | 'notify' | 'export';
  target: string;
  status: 'pending' | 'running' | 'complete' | 'error';
}

const SYNC_JOBS: SyncJob[] = [
  {
    id: '1',
    name: 'Weekly P&L Refresh',
    direction: 'pull',
    schedule: 'Every Monday 12:00 AM',
    lastRun: 'Jan 27, 2025 12:00 AM',
    nextRun: 'Feb 3, 2025 12:00 AM',
    status: 'active',
    rowsAffected: 847,
  },
  {
    id: '2',
    name: 'Budget Sync (Bi-directional)',
    direction: 'bi-directional',
    schedule: 'Every 15 minutes',
    lastRun: '2 min ago',
    nextRun: 'in 13 min',
    status: 'active',
    rowsAffected: 45,
  },
  {
    id: '3',
    name: 'Monthly Close Package',
    direction: 'push',
    schedule: '1st of month, 8:00 AM',
    lastRun: 'Jan 1, 2025 8:00 AM',
    nextRun: 'Feb 1, 2025 8:00 AM',
    status: 'active',
    rowsAffected: 1240,
  },
  {
    id: '4',
    name: 'Headcount → Model',
    direction: 'pull',
    schedule: 'Daily 6:00 AM',
    lastRun: 'Today 6:00 AM',
    nextRun: 'Tomorrow 6:00 AM',
    status: 'paused',
    rowsAffected: 156,
  },
];

const AUTOMATION_PIPELINE: AutomationStep[] = [
  { id: '1', name: 'Refresh Actuals Sheet', type: 'refresh', target: 'Income Statement', status: 'complete' },
  { id: '2', name: 'Refresh Budget Sheet', type: 'refresh', target: 'Budget FY25', status: 'complete' },
  { id: '3', name: 'Run AI Variance Scan', type: 'ai_scan', target: 'P&L Variance', status: 'running' },
  { id: '4', name: 'Notify #finance Slack', type: 'notify', target: 'Slack Channel', status: 'pending' },
  { id: '5', name: 'Export Board Deck', type: 'export', target: 'Google Slides', status: 'pending' },
];

export function SyncPanel() {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showAutomation, setShowAutomation] = useState(true);

  const directionIcons = {
    pull: <ArrowDownToLine className="h-3 w-3" />,
    push: <ArrowUpFromLine className="h-3 w-3" />,
    'bi-directional': <RefreshCw className="h-3 w-3" />,
  };

  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  const stepStatusIcons = {
    pending: <Clock className="h-3 w-3 text-muted-foreground" />,
    running: <RefreshCw className="h-3 w-3 text-primary animate-spin" />,
    complete: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
    error: <AlertCircle className="h-3 w-3 text-destructive" />,
  };

  return (
    <div className="space-y-3">
      {/* Sync Overview */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Scheduled Syncs
            </CardTitle>
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> New Schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="space-y-1.5">
            {SYNC_JOBS.map((job) => (
              <div key={job.id} className="border border-border/50 rounded-md">
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                >
                  {expandedJob === job.id ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{directionIcons[job.direction]}</span>
                  <span className="text-[11px] font-medium flex-1">{job.name}</span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 h-4 ${statusColors[job.status]}`}>
                    {job.status}
                  </Badge>
                </div>
                {expandedJob === job.id && (
                  <div className="px-2 pb-2 pt-0 space-y-1.5 border-t border-border/30">
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="text-[9px]">
                        <span className="text-muted-foreground">Schedule:</span>
                        <p className="font-medium">{job.schedule}</p>
                      </div>
                      <div className="text-[9px]">
                        <span className="text-muted-foreground">Last run:</span>
                        <p className="font-medium">{job.lastRun}</p>
                      </div>
                      <div className="text-[9px]">
                        <span className="text-muted-foreground">Next run:</span>
                        <p className="font-medium">{job.nextRun}</p>
                      </div>
                      <div className="text-[9px]">
                        <span className="text-muted-foreground">Rows affected:</span>
                        <p className="font-medium">{job.rowsAffected.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1 flex-1">
                        <Play className="h-2.5 w-2.5" /> Run Now
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1 flex-1">
                        {job.status === 'paused' ? (
                          <><Play className="h-2.5 w-2.5" /> Resume</>
                        ) : (
                          <><Pause className="h-2.5 w-2.5" /> Pause</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Automation Pipeline */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Active Pipeline
            </CardTitle>
            <Badge variant="secondary" className="text-[9px] px-1.5 h-4">Running</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Triggered: New Actuals landed for Jan 2025
          </p>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="space-y-0">
            {AUTOMATION_PIPELINE.map((step, index) => (
              <div key={step.id} className="flex items-start gap-2">
                {/* Vertical line */}
                <div className="flex flex-col items-center">
                  <div className="mt-0.5">{stepStatusIcons[step.status]}</div>
                  {index < AUTOMATION_PIPELINE.length - 1 && (
                    <div className="w-px h-6 bg-border/50 my-0.5" />
                  )}
                </div>
                <div className="pb-2">
                  <p className="text-[11px] font-medium leading-tight">{step.name}</p>
                  <p className="text-[9px] text-muted-foreground">{step.target}</p>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">
              Step 3 of 5 · Est. 2 min remaining
            </div>
            <Progress value={50} className="w-20 h-1.5" />
          </div>
        </CardContent>
      </Card>

      {/* Event Triggers */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Event Triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          {[
            { event: 'New Actuals Land', action: 'Refresh all BvA sheets + run variance scan', enabled: true },
            { event: 'Budget Updated', action: 'Re-sync Budget sheet → Model', enabled: true },
            { event: 'Month-End Close', action: 'Generate close package + notify team', enabled: false },
          ].map((trigger, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-border/50">
              <Switch checked={trigger.enabled} className="mt-0.5 scale-75" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium">{trigger.event}</p>
                <p className="text-[9px] text-muted-foreground">{trigger.action}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}
