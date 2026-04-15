import { useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useWfTasks, useUpdateWfTaskStatus } from "@/hooks/useWorkflowSystem";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ManagerDecisionDialog } from "@/components/workflows/ManagerDecisionDialog";
import { TaskCompletionCheckbox } from "@/components/tasks/TaskCompletionCheckbox";
import { cn } from "@/lib/utils";

export default function WfTasks({ embedded }: { embedded?: boolean }) {
  const { data: tasks = [] } = useWfTasks();
  const updateTask = useUpdateWfTaskStatus();
  const [decisionTask, setDecisionTask] = useState<any>(null);
  // Track recently-completed task ids for optimistic UI + undo
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  const openTasks = tasks.filter((t: any) => t.status === 'open');
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress');
  const doneTasks = tasks.filter((t: any) => t.status === 'done');

  const needsDecision = (task: any) => {
    if (!task.is_recurring || task.status === 'done') return false;
    const conditions = task.recurrence_stop_conditions as Array<{ field: string }> | null;
    if (!conditions) return false;
    return conditions.some((c) => c.field === 'manager_move_forward_decision');
  };

  const handleComplete = useCallback((task: any) => {
    const wasCompleted = task.status === 'done';
    const newStatus = wasCompleted ? 'open' : 'done';

    if (!wasCompleted) {
      // Optimistic: mark as recently completed immediately
      setRecentlyCompleted(prev => new Set(prev).add(task.id));
    }

    updateTask.mutate(
      { taskId: task.id, status: newStatus },
      {
        onSuccess: () => {
          if (!wasCompleted) {
            // Show undo toast
            toast.success("Task completed", {
              action: {
                label: "Undo",
                onClick: () => {
                  updateTask.mutate({ taskId: task.id, status: 'open' });
                  setRecentlyCompleted(prev => {
                    const next = new Set(prev);
                    next.delete(task.id);
                    return next;
                  });
                },
              },
              duration: 5000,
            });
            // Clear from recently completed after animation
            setTimeout(() => {
              setRecentlyCompleted(prev => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
              });
            }, 500);
          }
        },
      }
    );
  }, [updateTask]);

  const handleToggleComplete = useCallback((task: any) => {
    handleComplete(task); // done ↔ open toggle
  }, [handleComplete]);

  const TaskCard = ({ task }: { task: any }) => {
    const isDone = task.status === 'done';
    const isJustCompleted = recentlyCompleted.has(task.id);

    return (
      <Card
        className={cn(
          "transition-all duration-300 ease-out",
          isDone && "bg-muted/30 border-border/50",
          isJustCompleted && "animate-task-row-settle"
        )}
      >
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TaskCompletionCheckbox
              checked={isDone}
              onChange={() => handleCycleStatus(task)}
            />
            {!isDone && task.status === 'in_progress' && (
              <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium truncate transition-all duration-300",
                  isDone
                    ? "line-through text-muted-foreground/60"
                    : "text-foreground"
                )}
              >
                {task.title}
              </p>
              <p
                className={cn(
                  "text-xs truncate transition-colors duration-300",
                  isDone ? "text-muted-foreground/40" : "text-muted-foreground"
                )}
              >
                {task.deal?.name && `Deal: ${task.deal.name}`}
                {task.assignee?.name && ` · ${task.assignee.name}`}
                {task.due_at && ` · Due: ${format(new Date(task.due_at), 'MMM d')}`}
              </p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-2 shrink-0 transition-opacity duration-300",
            isDone && "opacity-50"
          )}>
            {needsDecision(task) && (
              <button
                onClick={() => setDecisionTask(task)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
              >
                <AlertTriangle className="h-3 w-3" />
                Decision Required
              </button>
            )}
            {task.is_recurring && <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">Recurring</Badge>}
            {task.workflow_key && <Badge variant="outline" className="text-xs">{task.workflow_key}</Badge>}
            <Badge variant={isDone ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>{task.status}</Badge>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && <Helmet><title>Workflow Tasks | Naitive</title></Helmet>}
      {!embedded && <h1 className="text-2xl font-bold text-foreground">Workflow Tasks</h1>}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="done">Done ({doneTasks.length})</TabsTrigger>
          <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-2">
          {openTasks.map((t: any) => <TaskCard key={t.id} task={t} />)}
          {openTasks.length === 0 && <p className="text-sm text-muted-foreground">No open tasks</p>}
        </TabsContent>
        <TabsContent value="in_progress" className="space-y-2">
          {inProgress.map((t: any) => <TaskCard key={t.id} task={t} />)}
          {inProgress.length === 0 && <p className="text-sm text-muted-foreground">No in-progress tasks</p>}
        </TabsContent>
        <TabsContent value="done" className="space-y-2">
          {doneTasks.map((t: any) => <TaskCard key={t.id} task={t} />)}
          {doneTasks.length === 0 && <p className="text-sm text-muted-foreground">No completed tasks</p>}
        </TabsContent>
        <TabsContent value="all" className="space-y-2">
          {tasks.map((t: any) => <TaskCard key={t.id} task={t} />)}
        </TabsContent>
      </Tabs>

      {decisionTask && (
        <ManagerDecisionDialog
          open={!!decisionTask}
          onOpenChange={(open) => !open && setDecisionTask(null)}
          task={decisionTask}
          onDecisionMade={() => setDecisionTask(null)}
        />
      )}
    </div>
  );
}
