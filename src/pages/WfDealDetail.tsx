import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useWfDeal, useWfTasks, useWfWorkflowsLog, useWfTermSheets, useWfInvoices, useUpdateWfDealStage, useUpdateWfTaskStatus, DEAL_STAGE_LABELS, DEAL_STAGES } from "@/hooks/useWorkflowSystem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Clock, FileText, DollarSign, Activity } from "lucide-react";
import { format } from "date-fns";

export default function WfDealDetail() {
  const { id } = useParams();
  const { data: deal, isLoading } = useWfDeal(id);
  const { data: tasks = [] } = useWfTasks(id);
  const { data: logs = [] } = useWfWorkflowsLog(id);
  const { data: termSheets = [] } = useWfTermSheets(id);
  const { data: invoices = [] } = useWfInvoices(id);
  const updateStage = useUpdateWfDealStage();
  const updateTask = useUpdateWfTaskStatus();

  if (isLoading || !deal) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const taskStatusIcon = (s: string) => {
    if (s === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === 'in_progress') return <Clock className="h-4 w-4 text-yellow-500" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>{deal.name} | Workflow Deal</title></Helmet>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{deal.name}</h1>
          {deal.company_name && <p className="text-muted-foreground">{deal.company_name}</p>}
          <div className="flex gap-2 mt-2">
            {deal.manager?.name && <Badge variant="outline">Manager: {deal.manager.name}</Badge>}
            {deal.analyst?.name && <Badge variant="outline">Analyst: {deal.analyst.name}</Badge>}
            {deal.ops?.name && <Badge variant="outline">Ops: {deal.ops.name}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={deal.stage} onValueChange={(v) => updateStage.mutate({ dealId: deal.id, stage: v })}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEAL_STAGES.map(s => (
                <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="terms">Term Sheets ({termSheets.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="log">Workflow Log ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet</p>}
          {tasks.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateTask.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done' })}>
                    {taskStatusIcon(t.status)}
                  </button>
                  <div>
                    <p className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.assignee?.name && `Assigned: ${t.assignee.name}`}
                      {t.due_at && ` · Due: ${format(new Date(t.due_at), 'MMM d')}`}
                      {t.workflow_key && ` · ${t.workflow_key}`}
                    </p>
                  </div>
                </div>
                <Badge variant={t.status === 'done' ? 'default' : t.status === 'in_progress' ? 'secondary' : 'outline'}>{t.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="terms" className="space-y-2">
          {termSheets.length === 0 && <p className="text-sm text-muted-foreground">No term sheets yet</p>}
          {termSheets.map((ts: any) => (
            <Card key={ts.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{ts.lender?.name || 'Unknown Lender'}</p>
                    <p className="text-xs text-muted-foreground">
                      {ts.received_at && `Received: ${format(new Date(ts.received_at), 'MMM d, yyyy')}`}
                    </p>
                  </div>
                </div>
                <Badge>{ts.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-2">
          {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet</p>}
          {invoices.map((inv: any) => (
            <Card key={inv.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{inv.type} – ${inv.amount || 0}</p>
                    <p className="text-xs text-muted-foreground">{inv.status}</p>
                  </div>
                </div>
                <Badge variant={inv.status === 'paid' ? 'default' : 'outline'}>{inv.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="log" className="space-y-2">
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No workflow activity yet</p>}
          {logs.map((log: any) => (
            <Card key={log.id}>
              <CardContent className="p-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{log.workflow_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.trigger_type} · {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    {log.metadata_json?.from_stage && ` · ${DEAL_STAGE_LABELS[log.metadata_json.from_stage] || log.metadata_json.from_stage} → ${DEAL_STAGE_LABELS[log.metadata_json.to_stage] || log.metadata_json.to_stage}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
