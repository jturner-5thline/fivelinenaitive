import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Workflow, Plus, MoreVertical, Trash2, Edit, Zap, Clock, Bell, Mail, History, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { WorkflowBuilder, WorkflowData, TriggerType, ActionType } from '@/components/workflows/WorkflowBuilder';
import { useWorkflows, Workflow as WorkflowType } from '@/hooks/useWorkflows';
import { useWorkflowRuns, WorkflowRun } from '@/hooks/useWorkflowRuns';

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

export default function Workflows() {
  const { workflows, isLoading, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow } = useWorkflows();
  const { runs, isLoading: isLoadingRuns } = useWorkflowRuns();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<WorkflowType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const handleCreateNew = () => {
    setEditingWorkflow(null);
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

  return (
    <>
      <Helmet>
        <title>Workflows - nAItive</title>
        <meta name="description" content="Manage your automated workflows" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

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
              <Button className="gap-2" onClick={handleCreateNew}>
                <Plus className="h-4 w-4" />
                New Workflow
              </Button>
            </div>

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
                              <DropdownMenuItem onClick={() => handleEdit(workflow)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
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
            } : undefined}
            onSave={handleSave}
            onCancel={() => setIsDialogOpen(false)}
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
    </>
  );
}
