import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Workflow, Plus, MoreVertical, Trash2, Edit, Zap, Clock, Bell, Mail } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { WorkflowBuilder, WorkflowData, TriggerType, ActionType } from '@/components/workflows/WorkflowBuilder';
import { useWorkflows, Workflow as WorkflowType } from '@/hooks/useWorkflows';

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

export default function Workflows() {
  const { workflows, isLoading, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow } = useWorkflows();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<WorkflowType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
