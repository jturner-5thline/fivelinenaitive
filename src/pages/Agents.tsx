import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Plus, Search, Users, Globe, Lock, Zap, History, Sparkles, Workflow } from 'lucide-react';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, useDuplicateAgent, type Agent, type CreateAgentData } from '@/hooks/useAgents';
import { useAuth } from '@/contexts/AuthContext';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentBuilder } from '@/components/agents/AgentBuilder';
import { AgentTestChat } from '@/components/agents/AgentTestChat';
import { AgentTriggersManager } from '@/components/agents/AgentTriggersManager';
import { AgentRunsHistory } from '@/components/agents/AgentRunsHistory';
import { AgentTemplatesGallery } from '@/components/agents/AgentTemplatesGallery';
import { AgentSuggestionsPanel } from '@/components/agents/AgentSuggestionsPanel';
import { AgentCanvas } from '@/components/agents/canvas/AgentCanvas';
import { type AgentSuggestion } from '@/hooks/useAgentSuggestions';
import type { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';

export default function Agents() {
  const { user } = useAuth();
  const { data: agents, isLoading } = useAgents();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const duplicateAgent = useDuplicateAgent();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('my-agents');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [testingAgent, setTestingAgent] = useState<Agent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
  const [managingTriggersAgent, setManagingTriggersAgent] = useState<Agent | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<AgentSuggestion | null>(null);
  const [canvasAgent, setCanvasAgent] = useState<Agent | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  const myAgents = agents?.filter(a => a.user_id === user?.id) || [];
  const sharedAgents = agents?.filter(a => a.is_shared && a.user_id !== user?.id) || [];
  const publicAgents = agents?.filter(a => a.is_public && a.user_id !== user?.id) || [];

  const filterAgents = (agentList: Agent[]) => {
    if (!searchQuery) return agentList;
    const query = searchQuery.toLowerCase();
    return agentList.filter(a => 
      a.name.toLowerCase().includes(query) || 
      a.description?.toLowerCase().includes(query)
    );
  };

  const handleSave = async (data: CreateAgentData) => {
    if (editingAgent) {
      await updateAgent.mutateAsync({ id: editingAgent.id, ...data });
    } else {
      await createAgent.mutateAsync(data);
    }
    setIsBuilderOpen(false);
    setEditingAgent(null);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsBuilderOpen(true);
  };

  const handleDelete = async () => {
    if (deletingAgent) {
      await deleteAgent.mutateAsync(deletingAgent.id);
      setDeletingAgent(null);
    }
  };

  const handleDuplicate = async (agent: Agent) => {
    await duplicateAgent.mutateAsync(agent);
  };

  const handleCreateFromSuggestion = (suggestion: AgentSuggestion) => {
    setPendingSuggestion(suggestion);
    setEditingAgent(null);
    setIsBuilderOpen(true);
  };

  const handleCanvasSave = async (data: { name: string; nodes: Node[]; edges: Edge[] }) => {
    try {
      if (canvasAgent) {
        await updateAgent.mutateAsync({
          id: canvasAgent.id,
          name: data.name,
          graph_config: { nodes: data.nodes, edges: data.edges },
        } as any);
      } else {
        await createAgent.mutateAsync({
          name: data.name,
          system_prompt: 'Visual agent solution — see graph config for details.',
          description: `Multi-agent solution with ${data.nodes.length} nodes`,
          graph_config: { nodes: data.nodes, edges: data.edges },
        } as any);
      }
      toast.success('Agent solution saved');
      setShowCanvas(false);
      setCanvasAgent(null);
    } catch (err) {
      toast.error('Failed to save agent solution');
    }
  };

  const handleOpenCanvas = (agent?: Agent) => {
    setCanvasAgent(agent || null);
    setShowCanvas(true);
  };

  const renderAgentGrid = (agentList: Agent[], isOwn: boolean) => {
    const filtered = filterAgents(agentList);
    
    if (filtered.length === 0) {
      return (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No agents found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? 'Try a different search term' : 'Create your first agent to get started'}
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isOwn={isOwn}
            onTest={setTestingAgent}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={setDeletingAgent}
          />
        ))}
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-48 rounded-lg" />
      ))}
    </div>
  );

  // If canvas is open, render full-screen canvas
  if (showCanvas) {
    const graphConfig = (canvasAgent as any)?.graph_config;
    return (
      <AppLayout mainClassName="bg-background">
        <div className="h-[calc(100vh-64px)]">
          <AgentCanvas
            initialNodes={graphConfig?.nodes || []}
            initialEdges={graphConfig?.edges || []}
            agentName={canvasAgent?.name || ''}
            onSave={handleCanvasSave}
            onCancel={() => {
              setShowCanvas(false);
              setCanvasAgent(null);
            }}
            isSaving={createAgent.isPending || updateAgent.isPending}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout mainClassName="bg-background">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">AI Agents</h1>
              <p className="text-muted-foreground">Build and customize AI assistants for your workflow</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleOpenCanvas()}>
              <Workflow className="mr-2 h-4 w-4" />
              Visual Builder
            </Button>
            <Button onClick={() => setIsBuilderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-agents" className="gap-2">
              <Lock className="h-4 w-4" />
              My Agents ({myAgents.length})
            </TabsTrigger>
            <TabsTrigger value="builder" className="gap-2">
              <Workflow className="h-4 w-4" />
              Builder
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              Team ({sharedAgents.length})
            </TabsTrigger>
            <TabsTrigger value="public" className="gap-2">
              <Globe className="h-4 w-4" />
              Public ({publicAgents.length})
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <History className="h-4 w-4" />
              Run History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-agents" className="mt-6 space-y-6">
            <AgentSuggestionsPanel onCreateAgent={handleCreateFromSuggestion} />
            {isLoading ? renderSkeleton() : renderAgentGrid(myAgents, true)}
          </TabsContent>

          <TabsContent value="builder" className="mt-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Visual Agent Builder</h2>
                  <p className="text-sm text-muted-foreground">
                    Design multi-agent solutions by connecting agents, tools, memory, and human checkpoints on a visual canvas.
                  </p>
                </div>
                <Button onClick={() => handleOpenCanvas()}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Solution
                </Button>
              </div>

              {/* Show agents that have graph_config */}
              {(() => {
                const graphAgents = myAgents.filter((a: any) => a.graph_config);
                if (graphAgents.length === 0) {
                  return (
                    <div className="text-center py-16 border border-dashed border-border rounded-xl">
                      <Workflow className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <h3 className="mt-4 font-medium">No visual agent solutions yet</h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                        Use the visual builder to design multi-agent workflows with drag-and-drop. Connect LLM agents, tools, memory stores, and human approval gates.
                      </p>
                      <Button className="mt-4" onClick={() => handleOpenCanvas()}>
                        <Workflow className="mr-2 h-4 w-4" />
                        Open Visual Builder
                      </Button>
                    </div>
                  );
                }

                return (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {graphAgents.map((agent: any) => {
                      const nodeCount = agent.graph_config?.nodes?.length || 0;
                      return (
                        <div
                          key={agent.id}
                          className="border border-border rounded-xl p-4 bg-card hover:border-primary/30 transition-colors cursor-pointer"
                          onClick={() => handleOpenCanvas(agent)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Workflow className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{nodeCount} node{nodeCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <AgentTemplatesGallery onSelectTemplate={(template) => {
              setEditingAgent(null);
              setIsBuilderOpen(true);
            }} />
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            {isLoading ? renderSkeleton() : renderAgentGrid(sharedAgents, false)}
          </TabsContent>

          <TabsContent value="public" className="mt-6">
            {isLoading ? renderSkeleton() : renderAgentGrid(publicAgents, false)}
          </TabsContent>

          <TabsContent value="runs" className="mt-6">
            <AgentRunsHistory />
          </TabsContent>
        </Tabs>
      </div>

      {/* Agent Builder Dialog */}
      <Dialog open={isBuilderOpen} onOpenChange={(open) => {
        setIsBuilderOpen(open);
        if (!open) setEditingAgent(null);
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {editingAgent ? 'Edit Agent' : 'Create Agent'}
            </DialogTitle>
          </DialogHeader>
          <AgentBuilder
            initialData={editingAgent || (pendingSuggestion ? {
              id: '',
              user_id: user?.id || '',
              name: pendingSuggestion.name,
              description: pendingSuggestion.description,
              system_prompt: pendingSuggestion.suggested_prompt || '',
              personality: 'professional',
              avatar_emoji: '🤖',
              temperature: 0.7,
              is_shared: false,
              is_public: false,
              can_access_deals: true,
              can_access_lenders: true,
              can_access_activities: true,
              can_access_milestones: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as Agent : undefined)}
            onSave={handleSave}
            onCancel={() => {
              setIsBuilderOpen(false);
              setEditingAgent(null);
              setPendingSuggestion(null);
            }}
            isSaving={createAgent.isPending || updateAgent.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Agent Test Chat Sheet */}
      <Sheet open={!!testingAgent} onOpenChange={(open) => !open && setTestingAgent(null)}>
        <SheetContent className="w-full sm:max-w-lg p-0">
          {testingAgent && (
            <AgentTestChat
              agent={testingAgent}
              onClose={() => setTestingAgent(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingAgent} onOpenChange={(open) => !open && setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAgent?.name}"? This action cannot be undone.
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
    </AppLayout>
  );
}
