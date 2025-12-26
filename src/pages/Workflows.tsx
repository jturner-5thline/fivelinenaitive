import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Workflow, Plus, MoreVertical, Trash2, Edit, Zap, Clock, Bell, Mail, History, CheckCircle2, XCircle, AlertCircle, Loader2, Play, FileText, Copy, TrendingUp, Activity } from 'lucide-react';
import { formatDistanceToNow, format, subDays, startOfDay, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { DealsHeader } from '@/components/dashboard/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { WorkflowBuilder, WorkflowData, TriggerType, ActionType, WorkflowAction } from '@/components/workflows/WorkflowBuilder';
import { useWorkflows, Workflow as WorkflowType } from '@/hooks/useWorkflows';
import { useWorkflowRuns } from '@/hooks/useWorkflowRuns';
import { supabase } from '@/integrations/supabase/client';

const TRIGGER_LABELS: Record<TriggerType, string> = {
  deal_stage_change: 'Deal Stage Change',
  lender_stage_change: 'Lender Stage Change',
  new_deal: 'New Deal Created',
  deal_closed: 'Deal Closed',
  scheduled: 'Scheduled',
};

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  send_notification: <Bell className="h-3 w-3" />,
  send_email: <Mail className="h-3 w-3" />,
  webhook: <Zap className="h-3 w-3" />,
  update_field: <Zap className="h-3 w-3" />,
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Completed', className: 'text-green-600 dark:text-green-400' },
  partial: { icon: <AlertCircle className="h-4 w-4" />, label: 'Partial', className: 'text-yellow-600 dark:text-yellow-400' },
  failed: { icon: <XCircle className="h-4 w-4" />, label: 'Failed', className: 'text-red-600 dark:text-red-400' },
  running: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: 'Running', className: 'text-blue-600 dark:text-blue-400' },
  pending: { icon: <Clock className="h-4 w-4" />, label: 'Pending', className: 'text-muted-foreground' },
};

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  actions: WorkflowAction[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'new-deal-notification',
    name: 'New Deal Alert',
    description: 'Get notified when a new deal is created',
    icon: <Bell className="h-5 w-5" />,
    triggerType: 'new_deal',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'New Deal Created',
          message: 'A new deal has been added to your pipeline',
        },
      },
    ],
  },
  {
    id: 'deal-closed-webhook',
    name: 'Deal Closed Webhook',
    description: 'Send data to external system when a deal closes',
    icon: <Zap className="h-5 w-5" />,
    triggerType: 'deal_closed',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'webhook',
        config: {
          url: 'https://your-webhook-url.com/deal-closed',
        },
      },
    ],
  },
  {
    id: 'stage-change-email',
    name: 'Stage Change Email',
    description: 'Email notification when deal moves to a new stage',
    icon: <Mail className="h-5 w-5" />,
    triggerType: 'deal_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_email',
        config: {
          subject: 'Deal Stage Updated',
          body: 'A deal has moved to a new stage in your pipeline.',
        },
      },
    ],
  },
  {
    id: 'lender-update-notify',
    name: 'Lender Status Update',
    description: 'Notify when a lender changes stage',
    icon: <Bell className="h-5 w-5" />,
    triggerType: 'lender_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Lender Stage Changed',
          message: 'A lender has been updated to a new stage',
        },
      },
    ],
  },
  {
    id: 'deal-closed-celebration',
    name: 'Deal Won Celebration',
    description: 'Multiple notifications when a deal is closed won',
    icon: <CheckCircle2 className="h-5 w-5" />,
    triggerType: 'deal_closed',
    triggerConfig: { closedStatus: 'won' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Deal Closed Won! 🎉',
          message: 'Congratulations on closing a deal!',
        },
      },
      {
        id: 'action-2',
        type: 'send_email',
        config: {
          subject: 'Deal Closed Successfully',
          body: 'Great news! A deal has been closed won.',
        },
      },
    ],
  },
];

export default function Workflows() {
  const { workflows, isLoading, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow } = useWorkflows();
  const { runs, isLoading: isLoadingRuns } = useWorkflowRuns();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<WorkflowType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [templateData, setTemplateData] = useState<WorkflowData | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // Test trigger state
  const [testingWorkflow, setTestingWorkflow] = useState<WorkflowType | null>(null);
  const [testDealName, setTestDealName] = useState('Test Deal');
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = runs.length;
    const completed = runs.filter(r => r.status === 'completed').length;
    const partial = runs.filter(r => r.status === 'partial').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const activeWorkflows = workflows.filter(w => w.is_active).length;
    
    return { total, completed, partial, failed, successRate, activeWorkflows };
  }, [runs, workflows]);

  // Chart data for runs over time (last 7 days)
  const chartData = useMemo(() => {
    const days = 7;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = startOfDay(subDays(new Date(), i));
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayRuns = runs.filter(run => {
        const runDate = format(startOfDay(parseISO(run.started_at)), 'yyyy-MM-dd');
        return runDate === dateStr;
      });
      
      data.push({
        date: format(date, 'MMM d'),
        total: dayRuns.length,
        successful: dayRuns.filter(r => r.status === 'completed').length,
        failed: dayRuns.filter(r => r.status === 'failed' || r.status === 'partial').length,
      });
    }
    
    return data;
  }, [runs]);

  const chartConfig = {
    successful: {
      label: "Successful",
      color: "hsl(var(--chart-2))",
    },
    failed: {
      label: "Failed",
      color: "hsl(var(--destructive))",
    },
  };

  const handleCreateNew = () => {
    setEditingWorkflow(null);
    setTemplateData(null);
    setIsDialogOpen(true);
  };

  const handleUseTemplate = (template: WorkflowTemplate) => {
    setTemplateData({
      name: template.name,
      description: template.description,
      isActive: true,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      actions: template.actions,
    });
    setEditingWorkflow(null);
    setShowTemplates(false);
    setIsDialogOpen(true);
  };

  const handleEdit = (workflow: WorkflowType) => {
    setEditingWorkflow(workflow);
    setIsDialogOpen(true);
  };

  const handleSave = async (data: WorkflowData) => {
    setIsSaving(true);
    try {
      if (editingWorkflow) {
        await updateWorkflow(editingWorkflow.id, data);
      } else {
        await createWorkflow(data);
      }
      setIsDialogOpen(false);
      setEditingWorkflow(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWorkflow) return;
    await deleteWorkflow(deletingWorkflow.id);
    setDeletingWorkflow(null);
  };

  const handleToggle = async (workflow: WorkflowType) => {
    await toggleWorkflow(workflow.id, !workflow.is_active);
  };

  const handleDuplicate = async (workflow: WorkflowType) => {
    const duplicatedData: WorkflowData = {
      name: `${workflow.name} (Copy)`,
      description: workflow.description || '',
      isActive: false,
      triggerType: workflow.trigger_type,
      triggerConfig: workflow.trigger_config,
      actions: workflow.actions.map(action => ({
        ...action,
        id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })),
    };
    
    const result = await createWorkflow(duplicatedData);
    if (result) {
      toast.success(`Workflow "${workflow.name}" duplicated`);
    }
  };

  const handleTestWorkflow = async () => {
    if (!testingWorkflow) return;
    
    setIsRunningTest(true);
    try {
      const triggerData = {
        dealId: 'test-deal-id',
        dealName: testDealName,
        dealStage: 'Test Stage',
        previousStage: 'Previous Stage',
        lenderName: 'Test Lender',
        lenderStage: 'Test Lender Stage',
        isManualTest: true,
      };

      const { error } = await supabase.functions.invoke('execute-workflow', {
        body: {
          workflowId: testingWorkflow.id,
          triggerType: testingWorkflow.trigger_type,
          triggerData,
          actions: testingWorkflow.actions,
        },
      });

      if (error) throw error;
      
      toast.success('Workflow test executed successfully');
      setTestingWorkflow(null);
      setTestDealName('Test Deal');
    } catch (error) {
      console.error('Error testing workflow:', error);
      toast.error('Failed to test workflow');
    } finally {
      setIsRunningTest(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Workflows - nAItive</title>
        <meta name="description" content="Manage your automated workflows" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Workflows
                </h1>
                <p className="text-muted-foreground">Automate your deal and lender processes</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setShowTemplates(true)}>
                  <FileText className="h-4 w-4" />
                  Templates
                </Button>
                <Button className="gap-2" onClick={handleCreateNew}>
                  <Plus className="h-4 w-4" />
                  New Workflow
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Runs</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{stats.successRate}%</p>
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{stats.completed}</p>
                    <p className="text-xs text-muted-foreground">Successful</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <XCircle className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{stats.failed + stats.partial}</p>
                    <p className="text-xs text-muted-foreground">Failed/Partial</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Runs Over Time Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Runs Over Time
                </CardTitle>
                <CardDescription>
                  Workflow executions in the last 7 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                    No run data available yet
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[200px] w-full">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillSuccessful" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="fillFailed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fontSize: 12 }}
                        tickMargin={8}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fontSize: 12 }}
                        tickMargin={8}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="successful"
                        stackId="1"
                        stroke="hsl(var(--chart-2))"
                        fill="url(#fillSuccessful)"
                      />
                      <Area
                        type="monotone"
                        dataKey="failed"
                        stackId="1"
                        stroke="hsl(var(--destructive))"
                        fill="url(#fillFailed)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Your Workflows
                </CardTitle>
                <CardDescription>
                  Create automated workflows to streamline your processes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-4 w-60" />
                        </div>
                        <Skeleton className="h-6 w-10" />
                      </div>
                    ))}
                  </div>
                ) : workflows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Workflow className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No workflows yet</p>
                    <p className="text-sm mt-1">
                      Create your first workflow to automate repetitive tasks
                    </p>
                    <Button className="mt-4 gap-2" onClick={handleCreateNew}>
                      <Plus className="h-4 w-4" />
                      Create Workflow
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workflows.map(workflow => (
                      <div
                        key={workflow.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{workflow.name}</h3>
                            {!workflow.is_active && (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Zap className="h-3 w-3" />
                              {TRIGGER_LABELS[workflow.trigger_type]}
                            </Badge>
                            {workflow.actions.length > 0 && (
                              <span className="flex items-center gap-1">
                                →
                                {workflow.actions.slice(0, 2).map((action, i) => (
                                  <Badge key={i} variant="outline" className="text-xs gap-1">
                                    {ACTION_ICONS[action.type]}
                                  </Badge>
                                ))}
                                {workflow.actions.length > 2 && (
                                  <span className="text-xs">+{workflow.actions.length - 2}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {workflow.description && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {workflow.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Switch
                            checked={workflow.is_active}
                            onCheckedChange={() => handleToggle(workflow)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTestingWorkflow(workflow)}>
                                <Play className="h-4 w-4 mr-2" />
                                Test
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(workflow)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(workflow)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletingWorkflow(workflow)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Run History Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Run History
                </CardTitle>
                <CardDescription>
                  Recent workflow executions and their results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingRuns ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-5 w-16" />
                      </div>
                    ))}
                  </div>
                ) : runs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No runs yet</p>
                    <p className="text-sm mt-1">
                      Workflow runs will appear here when triggered
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2">
                      {runs.map(run => {
                        const statusConfig = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
                        const isExpanded = expandedRun === run.id;
                        
                        return (
                          <Collapsible key={run.id} open={isExpanded} onOpenChange={() => setExpandedRun(isExpanded ? null : run.id)}>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={statusConfig.className}>{statusConfig.icon}</span>
                                    <span className="font-medium text-sm truncate">{run.workflow_name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>{formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</span>
                                    {run.trigger_data.dealName && (
                                      <>
                                        <span>•</span>
                                        <span className="truncate">{run.trigger_data.dealName}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
                                  {statusConfig.label}
                                </Badge>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-1 ml-4 p-3 bg-muted/30 rounded-lg border-l-2 border-muted space-y-2">
                                {run.results && run.results.length > 0 ? (
                                  run.results.map((result, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm">
                                      {result.success ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                      )}
                                      <div>
                                        <span className="font-medium capitalize">{result.type.replace('_', ' ')}</span>
                                        <p className="text-xs text-muted-foreground">{result.message}</p>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No action results available</p>
                                )}
                                {run.error_message && (
                                  <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                                    {run.error_message}
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWorkflow ? 'Edit Workflow' : 'Create Workflow'}
            </DialogTitle>
          </DialogHeader>
          <WorkflowBuilder
            initialData={editingWorkflow ? {
              name: editingWorkflow.name,
              description: editingWorkflow.description || '',
              isActive: editingWorkflow.is_active,
              triggerType: editingWorkflow.trigger_type,
              triggerConfig: editingWorkflow.trigger_config,
              actions: editingWorkflow.actions,
            } : templateData || undefined}
            onSave={handleSave}
            onCancel={() => {
              setIsDialogOpen(false);
              setTemplateData(null);
            }}
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingWorkflow} onOpenChange={() => setDeletingWorkflow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingWorkflow?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Workflow Dialog */}
      <Dialog open={!!testingWorkflow} onOpenChange={() => setTestingWorkflow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Test Workflow</DialogTitle>
            <DialogDescription>
              Run "{testingWorkflow?.name}" with sample trigger data to test its actions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testDealName">Test Deal Name</Label>
              <Input
                id="testDealName"
                value={testDealName}
                onChange={(e) => setTestDealName(e.target.value)}
                placeholder="Enter a test deal name"
              />
              <p className="text-xs text-muted-foreground">
                This will be used as sample data for the workflow trigger.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">Trigger: {testingWorkflow && TRIGGER_LABELS[testingWorkflow.trigger_type]}</p>
              <p className="text-xs text-muted-foreground">
                Actions: {testingWorkflow?.actions.length || 0} action(s) will be executed
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestingWorkflow(null)}>
              Cancel
            </Button>
            <Button onClick={handleTestWorkflow} disabled={isRunningTest} className="gap-2">
              {isRunningTest ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow Templates</DialogTitle>
            <DialogDescription>
              Choose a pre-built template to quickly create a new workflow
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="grid gap-3 py-4">
              {WORKFLOW_TEMPLATES.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => handleUseTemplate(template)}
                >
                  <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg text-primary">
                    {template.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{template.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {TRIGGER_LABELS[template.triggerType]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {template.actions.map((action, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs gap-1">
                          {ACTION_ICONS[action.type]}
                          <span className="capitalize">{action.type.replace('_', ' ')}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <Copy className="h-4 w-4" />
                    Use
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplates(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create from Scratch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
