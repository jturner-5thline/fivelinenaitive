import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Plus, Search, Users, Globe, Lock, Zap, History, Sparkles } from 'lucide-react';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, useDuplicateAgent, type Agent, type CreateAgentData } from '@/hooks/useAgents';
import { useAuth } from '@/contexts/AuthContext';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentBuilder } from '@/components/agents/AgentBuilder';
import { AgentTestChat } from '@/components/agents/AgentTestChat';
import { AgentTriggersManager } from '@/components/agents/AgentTriggersManager';
import { AgentRunsHistory } from '@/components/agents/AgentRunsHistory';
import { AgentTemplatesGallery } from '@/components/agents/AgentTemplatesGallery';
import { AgentSuggestionsPanel } from '@/components/agents/AgentSuggestionsPanel';
import { type AgentSuggestion } from '@/hooks/useAgentSuggestions';

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

  return (
    <AppLayout>
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
          <Button onClick={() => setIsBuilderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Button>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
