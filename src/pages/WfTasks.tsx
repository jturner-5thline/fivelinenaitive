import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useWfTasks, useUpdateWfTaskStatus, DEAL_STAGE_LABELS } from "@/hooks/useWorkflowSystem";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ManagerDecisionDialog } from "@/components/workflows/ManagerDecisionDialog";

export default function WfTasks({ embedded }: { embedded?: boolean }) {
  const { data: tasks = [] } = useWfTasks();
  const updateTask = useUpdateWfTaskStatus();
  const [decisionTask, setDecisionTask] = useState<any>(null);

  const openTasks = tasks.filter((t: any) => t.status === 'open');
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress');
  const doneTasks = tasks.filter((t: any) => t.status === 'done');

  const taskStatusIcon = (s: string) => {
    if (s === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === 'in_progress') return <Clock className="h-4 w-4 text-yellow-500" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  const needsDecision = (task: any) => {
    if (!task.is_recurring || task.status === 'done') return false;
    const conditions = task.recurrence_stop_conditions as Array<{ field: string }> | null;
    if (!conditions) return false;
    return conditions.some((c) => c.field === 'manager_move_forward_decision');
  };

  const TaskCard = ({ task }: { task: any }) => (
    <Card>
      <CardContent className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => updateTask.mutate({ taskId: task.id, status: task.status === 'done' ? 'open' : task.status === 'open' ? 'in_progress' : 'done' })}>
            {taskStatusIcon(task.status)}
          </button>
          <div>
            <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</p>
            <p className="text-xs text-muted-foreground">
              {task.deal?.name && `Deal: ${task.deal.name}`}
              {task.assignee?.name && ` · ${task.assignee.name}`}
              {task.due_at && ` · Due: ${format(new Date(task.due_at), 'MMM d')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Badge variant={task.status === 'done' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>{task.status}</Badge>
        </div>
      </CardContent>
    </Card>
  );

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
