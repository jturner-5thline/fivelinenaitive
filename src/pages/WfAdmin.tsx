import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useWfWorkflows, useWfUsers, useUpdateWfWorkflow } from "@/hooks/useWorkflowSystem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Workflow } from "lucide-react";

export default function WfAdmin({ embedded }: { embedded?: boolean }) {
  const { data: workflows = [], isLoading } = useWfWorkflows();
  const { data: users = [] } = useWfUsers();
  const updateWorkflow = useUpdateWfWorkflow();
  const [search, setSearch] = useState("");

  const filtered = workflows.filter((w: any) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Workflows Admin | Naitive</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows Admin</h1>
          <p className="text-sm text-muted-foreground">Manage workflow owners and toggle active/inactive</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search workflows..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {filtered.map((wf: any) => (
          <Card key={wf.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Workflow className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{wf.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{wf.key}</p>
                  {wf.description && <p className="text-xs text-muted-foreground mt-0.5">{wf.description}</p>}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Badge variant="outline">{wf.default_owner_role}</Badge>

                <Select
                  value={wf.default_owner_user_id || "none"}
                  onValueChange={(v) => updateWorkflow.mutate({ id: wf.id, default_owner_user_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Owner (role default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use role default</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Switch
                  checked={wf.is_active}
                  onCheckedChange={(checked) => updateWorkflow.mutate({ id: wf.id, is_active: checked })}
                />
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">No workflows found. Seed workflows first.</p>
        )}
      </div>
    </div>
  );
}
