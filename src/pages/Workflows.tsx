import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Workflow, Plus, MoreVertical, Trash2, Edit, Zap, Clock, Bell, Mail, History, CheckCircle2, XCircle, AlertCircle, Loader2, Play, FileText, Copy, TrendingUp, Activity, Sparkles, MessageSquare, Lightbulb, Send, BarChart3, RotateCcw, Timer, Bookmark } from 'lucide-react';
import { formatDistanceToNow, format, subDays, startOfDay, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { WorkflowAnalytics } from '@/components/workflows/WorkflowAnalytics';
import { WorkflowVersionHistory } from '@/components/workflows/WorkflowVersionHistory';
import { WorkflowTemplatesLibrary } from '@/components/workflows/WorkflowTemplatesLibrary';
import { useWorkflows, Workflow as WorkflowType } from '@/hooks/useWorkflows';
import { useWorkflowRuns } from '@/hooks/useWorkflowRuns';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useCreateWorkflowTemplate } from '@/hooks/useWorkflowTemplates';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface WorkflowSuggestion {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actions: Array<{ type: ActionType; config: Record<string, unknown> }>;
  priority: 'high' | 'medium' | 'low';
}

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
  trigger_workflow: <Zap className="h-3 w-3" />,
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Completed', className: 'text-green-600 dark:text-green-400' },
  partial: { icon: <AlertCircle className="h-4 w-4" />, label: 'Partial', className: 'text-yellow-600 dark:text-yellow-400' },
  failed: { icon: <XCircle className="h-4 w-4" />, label: 'Failed', className: 'text-red-600 dark:text-red-400' },
  running: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: 'Running', className: 'text-blue-600 dark:text-blue-400' },
  pending: { icon: <Clock className="h-4 w-4" />, label: 'Pending', className: 'text-muted-foreground' },
};

export default function Workflows() {
  const { workflows, isLoading, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow } = useWorkflows();
  const { runs, isLoading: isLoadingRuns } = useWorkflowRuns();
  const { scheduledActions, isLoading: isLoadingScheduled } = useScheduledActions();
  const createTemplate = useCreateWorkflowTemplate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<WorkflowType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [templateData, setTemplateData] = useState<WorkflowData | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // Natural language workflow builder
  const [nlDescription, setNlDescription] = useState('');
  const [isParsingNL, setIsParsingNL] = useState(false);
  const [showNLInput, setShowNLInput] = useState(false);
  
  // AI Suggestions
  const [suggestions, setSuggestions] = useState<WorkflowSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Test trigger state
  const [testingWorkflow, setTestingWorkflow] = useState<WorkflowType | null>(null);
  const [testDealName, setTestDealName] = useState('Test Deal');
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Version history state
  const [versionHistoryWorkflow, setVersionHistoryWorkflow] = useState<WorkflowType | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState('workflows');

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

  const handleUseTemplate = (data: WorkflowData) => {
    setTemplateData(data);
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

  const handleSaveAsTemplate = async (workflow: WorkflowType) => {
    await createTemplate.mutateAsync({
      name: workflow.name,
      description: workflow.description || undefined,
      trigger_type: workflow.trigger_type,
      trigger_config: workflow.trigger_config,
      actions: workflow.actions,
      tags: [workflow.trigger_type.replace(/_/g, ' ')],
    });
  };

  const handleVersionRestore = async (data: WorkflowData) => {
    if (!versionHistoryWorkflow) return;
    await updateWorkflow(versionHistoryWorkflow.id, data);
    toast.success('Workflow restored to previous version');
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

  // Parse natural language workflow description
  const handleParseNL = useCallback(async () => {
    if (!nlDescription.trim()) return;
    
    setIsParsingNL(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-workflow-description', {
        body: { description: nlDescription.trim() },
      });

      if (error) throw error;
      
      if (data?.workflow) {
        setTemplateData(data.workflow);
        setShowNLInput(false);
        setNlDescription('');
        setIsDialogOpen(true);
        toast.success('Workflow parsed! Review and customize below.');
      }
    } catch (error: any) {
      console.error('Error parsing workflow:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted. Please add credits.');
      } else {
        toast.error('Failed to parse workflow description');
      }
    } finally {
      setIsParsingNL(false);
    }
  }, [nlDescription]);

  // Fetch AI suggestions
  const handleFetchSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-workflows');

      if (error) throw error;
      
      if (data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (error: any) {
      console.error('Error fetching suggestions:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted. Please add credits.');
      } else {
        toast.error('Failed to generate suggestions');
      }
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Use an AI suggestion
  const handleUseSuggestion = (suggestion: WorkflowSuggestion) => {
    setTemplateData({
      name: suggestion.title,
      description: suggestion.description,
      isActive: true,
      triggerType: suggestion.triggerType,
      triggerConfig: suggestion.triggerConfig as Record<string, any>,
      actions: suggestion.actions.map((a, idx) => ({
        id: `action-${Date.now()}-${idx}`,
        type: a.type,
        config: a.config as Record<string, any>,
      })),
    });
    setShowSuggestions(false);
    setIsDialogOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Workflows - nAItive</title>
        <meta name="description" content="Manage your automated workflows" />
      </Helmet>

      <div className="bg-background">
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
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setShowNLInput(true)}>
                  <MessageSquare className="h-4 w-4" />
                  Describe Workflow
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleFetchSuggestions}>
                  <Lightbulb className="h-4 w-4" />
                  AI Suggestions
                </Button>
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

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="workflows" className="gap-2">
                  <Workflow className="h-4 w-4" />
                  Workflows
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="gap-2">
                  <Timer className="h-4 w-4" />
                  Scheduled
                  {scheduledActions.filter(a => a.status === 'pending').length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {scheduledActions.filter(a => a.status === 'pending').length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workflows" className="space-y-6 mt-6">
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
                              <DropdownMenuItem onClick={() => setVersionHistoryWorkflow(workflow)}>
                                <History className="h-4 w-4 mr-2" />
                                Version History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSaveAsTemplate(workflow)}>
                                <Bookmark className="h-4 w-4 mr-2" />
                                Save as Template
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
              </TabsContent>

              <TabsContent value="analytics" className="mt-6">
                <WorkflowAnalytics runs={runs} workflows={workflows} />
              </TabsContent>

              <TabsContent value="scheduled" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Timer className="h-5 w-5" />
                      Scheduled Actions
                    </CardTitle>
                    <CardDescription>
                      Delayed workflow actions waiting to be executed
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingScheduled ? (
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
                    ) : scheduledActions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">No scheduled actions</p>
                        <p className="text-sm mt-1">
                          Delayed workflow actions will appear here
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[400px]">
                        <div className="space-y-2">
                          {scheduledActions.map(action => (
                            <div
                              key={action.id}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs gap-1">
                                    {ACTION_ICONS[action.action_type as ActionType] || <Zap className="h-3 w-3" />}
                                    <span className="capitalize">{action.action_type.replace('_', ' ')}</span>
                                  </Badge>
                                  <span className="text-sm font-medium truncate">
                                    {action.trigger_data.dealName || 'Unknown deal'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Scheduled for {format(new Date(action.scheduled_for), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                              <Badge 
                                variant={action.status === 'pending' ? 'secondary' : action.status === 'completed' ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {action.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
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

      {/* Templates Library */}
      <WorkflowTemplatesLibrary
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelectTemplate={handleUseTemplate}
      />

      {/* Natural Language Input Dialog */}
      <Dialog open={showNLInput} onOpenChange={setShowNLInput}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Describe Your Workflow
            </DialogTitle>
            <DialogDescription>
              Describe what you want your workflow to do in plain English. AI will parse it into a workflow configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder='e.g., "When a deal is closed won, send me an email notification and update the status to completed"'
              value={nlDescription}
              onChange={(e) => setNlDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Tips:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground/80">
                <li>Mention the trigger: "when a deal closes", "when a new deal is created"</li>
                <li>Describe actions: "send email", "notify me", "call webhook"</li>
                <li>Be specific about conditions if needed</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNLInput(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleParseNL} 
              disabled={!nlDescription.trim() || isParsingNL} 
              className="gap-2"
            >
              {isParsingNL ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Generate Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Suggestions Dialog */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              AI Workflow Suggestions
            </DialogTitle>
            <DialogDescription>
              Based on your deal activity patterns, here are some workflows that might help you.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {isLoadingSuggestions ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No suggestions available</p>
                <p className="text-sm mt-1">
                  Create some deals and activity to get personalized suggestions
                </p>
              </div>
            ) : (
              <div className="grid gap-3 py-4">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => handleUseSuggestion(suggestion)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{suggestion.title}</h3>
                          <Badge 
                            variant={suggestion.priority === 'high' ? 'default' : suggestion.priority === 'medium' ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {suggestion.priority}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {TRIGGER_LABELS[suggestion.triggerType]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {suggestion.description}
                        </p>
                        <p className="text-xs text-primary/80 mt-2 italic">
                          💡 {suggestion.reasoning}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {suggestion.actions.map((action, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs gap-1">
                              {ACTION_ICONS[action.type]}
                              <span className="capitalize">{action.type.replace('_', ' ')}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                        Use
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestions(false)}>
              Close
            </Button>
            <Button onClick={handleFetchSuggestions} disabled={isLoadingSuggestions} className="gap-2">
              {isLoadingSuggestions ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Refresh Suggestions
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <WorkflowVersionHistory
        workflowId={versionHistoryWorkflow?.id || ''}
        workflowName={versionHistoryWorkflow?.name || ''}
        isOpen={!!versionHistoryWorkflow}
        onClose={() => setVersionHistoryWorkflow(null)}
        onRestoreVersion={handleVersionRestore}
      />
    </>
  );
}
