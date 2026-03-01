import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap, Clock, Bell, Plus, Play, CheckCircle2, AlertTriangle,
  RefreshCw, FileSpreadsheet, Sparkles, ArrowRight, Settings2, Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTOMATIONS = [
  {
    id: 'a1',
    name: 'Weekly P&L Refresh',
    trigger: 'Schedule: Every Monday 12:00 AM',
    actions: ['Refresh Income Statement', 'Refresh Balance Sheet', 'Run AI Variance Scan', 'Notify #finance-team on Slack'],
    status: 'active' as const,
    lastRun: '3 days ago',
    nextRun: 'Mon, Mar 3 12:00 AM',
    icon: Calendar,
  },
  {
    id: 'a2',
    name: 'New Month Actuals Pipeline',
    trigger: 'Event: When new Actuals period detected',
    actions: ['Refresh all connected tables', 'Run AI Variance Scan', 'Generate Board Report', 'Email CFO summary'],
    status: 'active' as const,
    lastRun: '28 days ago',
    nextRun: 'On event',
    icon: Zap,
  },
  {
    id: 'a3',
    name: 'Daily Data Quality Check',
    trigger: 'Schedule: Daily 6:00 AM',
    actions: ['Run all data checks', 'Alert on failures via Slack'],
    status: 'active' as const,
    lastRun: '6 hrs ago',
    nextRun: 'Tomorrow 6:00 AM',
    icon: CheckCircle2,
  },
  {
    id: 'a4',
    name: 'Budget Threshold Alert',
    trigger: 'Event: OPEX exceeds budget by 5%',
    actions: ['Send Slack alert to department head', 'Create variance note'],
    status: 'paused' as const,
    lastRun: 'Never',
    nextRun: 'Paused',
    icon: AlertTriangle,
  },
];

const AUDIT_LOGS = [
  { timestamp: '2026-02-28 14:32', user: 'System', action: 'Data Sync', detail: 'QuickBooks sync completed — 234 records updated', type: 'sync' as const },
  { timestamp: '2026-02-28 14:30', user: 'AI Engine', action: 'Variance Scan', detail: 'Scan completed — 3 variances flagged above threshold', type: 'ai' as const },
  { timestamp: '2026-02-28 12:15', user: 'Sarah Chen', action: 'Mapping Accept', detail: 'Accepted 5 AI-suggested account mappings', type: 'config' as const },
  { timestamp: '2026-02-28 11:40', user: 'System', action: 'Data Check', detail: 'Check "Missing vendor names" failed — 3 records', type: 'check' as const },
  { timestamp: '2026-02-27 18:22', user: 'James Miller', action: 'Dashboard Edit', detail: 'Updated Executive Dashboard — added Runway KPI card', type: 'config' as const },
  { timestamp: '2026-02-27 16:00', user: 'AI Engine', action: 'Mapping Suggestion', detail: 'New GL account detected: "Cloud Infrastructure" → suggested "COGS"', type: 'ai' as const },
  { timestamp: '2026-02-27 09:00', user: 'System', action: 'Automation Run', detail: 'Weekly P&L Refresh completed successfully', type: 'automation' as const },
  { timestamp: '2026-02-26 14:15', user: 'Sarah Chen', action: 'Schema Change', detail: 'Added column "cost_center" to Department Roll-up table', type: 'config' as const },
];

export function AutomationsModule() {
  const [subTab, setSubTab] = useState('automations');

  const typeColors = {
    sync: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    ai: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
    config: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    check: 'text-red-600 bg-red-50 dark:bg-red-950/30',
    automation: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
  };

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="automations" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />
              Automations
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                {AUTOMATIONS.filter(a => a.status === 'active').length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Audit Log
            </TabsTrigger>
          </TabsList>
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> New Automation
          </Button>
        </div>

        {/* Automations */}
        <TabsContent value="automations" className="mt-4 space-y-3">
          {AUTOMATIONS.map((auto) => (
            <Card key={auto.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                    auto.status === 'active' ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <auto.icon className={cn("h-5 w-5", auto.status === 'active' ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium">{auto.name}</h3>
                      <Badge variant={auto.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {auto.status === 'active' ? '● Active' : '⏸ Paused'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{auto.trigger}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {auto.actions.map((action, i) => (
                        <div key={i} className="flex items-center gap-1">
                          {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
                          <Badge variant="outline" className="text-[9px] font-normal">{action}</Badge>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span>Last run: {auto.lastRun}</span>
                      <span>Next: {auto.nextRun}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch checked={auto.status === 'active'} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Finance Audit Trail</CardTitle>
                <Badge variant="outline" className="text-[10px]">{AUDIT_LOGS.length} events</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Timestamp</TableHead>
                    <TableHead className="text-[10px]">User</TableHead>
                    <TableHead className="text-[10px]">Action</TableHead>
                    <TableHead className="text-[10px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AUDIT_LOGS.map((log, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{log.timestamp}</TableCell>
                      <TableCell className="text-xs">{log.user}</TableCell>
                      <TableCell>
                        <Badge className={cn("text-[9px]", typeColors[log.type])} variant="outline">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">{log.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
