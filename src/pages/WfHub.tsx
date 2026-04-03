import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useWfWorkflows, useWfUsers, useUpdateWfWorkflow } from "@/hooks/useWorkflowSystem";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Workflow, Users, CheckCircle2, XCircle, Edit, Save } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";

const OWNER_ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  analyst: "Analyst",
  ops: "Operations",
  system: "System",
};

const TRIGGER_LABELS: Record<string, string> = {
  stage_change: "Stage Change",
  calendar_event: "Calendar Event",
  email_event: "Email Event",
  manual: "Manual",
  external: "External",
};

interface EditState {
  id: string;
  name: string;
  description: string;
  default_owner_role: string;
  default_owner_user_id: string | null;
}

export default function WfHub() {
  const { data: workflows = [], isLoading } = useWfWorkflows();
  const { data: users = [] } = useWfUsers();
  const updateWorkflow = useUpdateWfWorkflow();
  const { isAdmin } = useAdminRole();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingWorkflow, setEditingWorkflow] = useState<EditState | null>(null);

  const filtered = workflows.filter((wf: any) => {
    const matchesSearch =
      wf.name.toLowerCase().includes(search.toLowerCase()) ||
      wf.key.toLowerCase().includes(search.toLowerCase()) ||
      (wf.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "active" && wf.is_active) ||
      (activeTab === "inactive" && !wf.is_active);
    const matchesRole =
      roleFilter === "all" || wf.default_owner_role === roleFilter;
    return matchesSearch && matchesTab && matchesRole;
  });

  const activeCount = workflows.filter((w: any) => w.is_active).length;
  const inactiveCount = workflows.filter((w: any) => !w.is_active).length;

  const byRole = workflows.reduce((acc: Record<string, number>, w: any) => {
    acc[w.default_owner_role] = (acc[w.default_owner_role] || 0) + 1;
    return acc;
  }, {});

  const openEdit = (wf: any) => {
    setEditingWorkflow({
      id: wf.id,
      name: wf.name,
      description: wf.description || "",
      default_owner_role: wf.default_owner_role,
      default_owner_user_id: wf.default_owner_user_id,
    });
  };

  const saveEdit = () => {
    if (!editingWorkflow) return;
    updateWorkflow.mutate({
      id: editingWorkflow.id,
      name: editingWorkflow.name,
      description: editingWorkflow.description || null,
      default_owner_role: editingWorkflow.default_owner_role,
      default_owner_user_id: editingWorkflow.default_owner_user_id,
    });
    setEditingWorkflow(null);
  };

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Workflows | Naitive</title></Helmet>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Manage workflow definitions, owners, and activation status
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{workflows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Inactive</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{inactiveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Owner Roles</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{Object.keys(byRole).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {Object.entries(OWNER_ROLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({workflows.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({inactiveCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-2 mt-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading workflows...</p>
          )}

          {filtered.map((wf: any) => (
            <Card key={wf.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 p-1.5 rounded-md ${wf.is_active ? 'bg-green-500/10' : 'bg-muted'}`}>
                      <Workflow className={`h-4 w-4 ${wf.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{wf.name}</p>
                        <Badge variant={wf.is_active ? "default" : "outline"} className="text-xs">
                          {wf.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{wf.key}</p>
                      {wf.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{wf.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1">
                          <Users className="h-3 w-3" />
                          {OWNER_ROLE_LABELS[wf.default_owner_role] || wf.default_owner_role}
                        </Badge>
                        {wf.default_owner_user_id && (
                          <Badge variant="secondary" className="text-xs">
                            Owner: {users.find((u: any) => u.id === wf.default_owner_user_id)?.name || "Unknown"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(wf)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}

                    <Select
                      value={wf.default_owner_user_id || "none"}
                      onValueChange={(v) =>
                        updateWorkflow.mutate({
                          id: wf.id,
                          default_owner_user_id: v === "none" ? null : v,
                        })
                      }
                      disabled={!isAdmin}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Assign owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use role default</SelectItem>
                        {users.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Switch
                      checked={wf.is_active}
                      onCheckedChange={(checked) =>
                        updateWorkflow.mutate({ id: wf.id, is_active: checked })
                      }
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Workflow className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No workflows found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingWorkflow} onOpenChange={(open) => !open && setEditingWorkflow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Workflow</DialogTitle>
          </DialogHeader>
          {editingWorkflow && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingWorkflow.name}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingWorkflow.description}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
                  rows={3}
                  placeholder="What does this workflow do?"
                />
              </div>
              <div className="space-y-2">
                <Label>Default Owner Role</Label>
                <Select
                  value={editingWorkflow.default_owner_role}
                  onValueChange={(v) => setEditingWorkflow({ ...editingWorkflow, default_owner_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OWNER_ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Specific Owner Override</Label>
                <Select
                  value={editingWorkflow.default_owner_user_id || "none"}
                  onValueChange={(v) => setEditingWorkflow({ ...editingWorkflow, default_owner_user_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Use role default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use role default</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWorkflow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateWorkflow.isPending}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
