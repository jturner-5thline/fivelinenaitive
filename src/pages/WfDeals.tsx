import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useWfDeals, useCreateWfDeal, useUpdateWfDealStage, DEAL_STAGE_LABELS, DEAL_STAGES } from "@/hooks/useWorkflowSystem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, List, Columns3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WfDeals() {
  const { data: deals = [], isLoading } = useWfDeals();
  const createDeal = useCreateWfDeal();
  const [createOpen, setCreateOpen] = useState(false);
  const [newDeal, setNewDeal] = useState({ name: "", company_name: "", client_email: "" });
  const navigate = useNavigate();

  const handleCreate = () => {
    createDeal.mutate(newDeal, {
      onSuccess: () => {
        setCreateOpen(false);
        setNewDeal({ name: "", company_name: "", client_email: "" });
      },
    });
  };

  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage] = deals.filter((d: any) => d.stage === stage);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Workflow Deals | Naitive</title></Helmet>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Workflow Deals</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Deal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Deal</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Deal Name</Label><Input value={newDeal.name} onChange={e => setNewDeal(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Company</Label><Input value={newDeal.company_name} onChange={e => setNewDeal(p => ({ ...p, company_name: e.target.value }))} /></div>
              <div><Label>Client Email</Label><Input value={newDeal.client_email} onChange={e => setNewDeal(p => ({ ...p, client_email: e.target.value }))} /></div>
              <Button onClick={handleCreate} disabled={!newDeal.name || createDeal.isPending} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban"><Columns3 className="h-4 w-4 mr-1" />Pipeline</TabsTrigger>
          <TabsTrigger value="list"><List className="h-4 w-4 mr-1" />List</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-4 min-w-max">
              {DEAL_STAGES.map(stage => (
                <div key={stage} className="w-64 flex-shrink-0">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2 truncate" title={DEAL_STAGE_LABELS[stage]}>
                      {DEAL_STAGE_LABELS[stage]}
                      <Badge variant="secondary" className="ml-1">{dealsByStage[stage]?.length || 0}</Badge>
                    </h3>
                    <div className="space-y-2">
                      {dealsByStage[stage]?.map((deal: any) => (
                        <Card key={deal.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/wf-deals/${deal.id}`)}>
                          <CardContent className="p-3">
                            <p className="font-medium text-sm text-foreground">{deal.name}</p>
                            {deal.company_name && <p className="text-xs text-muted-foreground">{deal.company_name}</p>}
                            {deal.manager?.name && <p className="text-xs text-muted-foreground mt-1">Mgr: {deal.manager.name}</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Deal</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Company</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Stage</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal: any) => (
                    <tr key={deal.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/wf-deals/${deal.id}`)}>
                      <td className="p-3 text-sm font-medium text-foreground">{deal.name}</td>
                      <td className="p-3 text-sm text-muted-foreground">{deal.company_name}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{DEAL_STAGE_LABELS[deal.stage] || deal.stage}</Badge></td>
                      <td className="p-3 text-sm text-muted-foreground">{deal.manager?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
