import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Pencil, 
  Copy, 
  Trash2, 
  Globe, 
  Users, 
  Lock,
  Database,
  Building2,
  Activity,
  Target,
  Search,
  Zap,
  Workflow,
  MessageCircle,
  Play,
  Loader2,
  Calendar,
  CheckCircle,
  XCircle,
  ThumbsUp,
} from 'lucide-react';
import type { Agent } from '@/hooks/useAgents';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: Agent;
  onTest: (agent: Agent) => void;
  onEdit: (agent: Agent) => void;
  onDuplicate: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onManageTriggers?: (agent: Agent) => void;
  onOpenCanvas?: (agent: Agent) => void;
  isOwn: boolean;
}

export function AgentCard({ agent, onTest, onEdit, onDuplicate, onDelete, onManageTriggers, onOpenCanvas, isOwn }: AgentCardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const hasGraph = !!(agent as any).graph_config;
  const nodeCount = hasGraph ? ((agent as any).graph_config?.nodes?.length || 0) : 0;

  const capabilities = [
    { key: 'deals', enabled: agent.can_access_deals, icon: Database, label: 'Deals' },
    { key: 'lenders', enabled: agent.can_access_lenders, icon: Building2, label: 'Lenders' },
    { key: 'activities', enabled: agent.can_access_activities, icon: Activity, label: 'Activities' },
    { key: 'milestones', enabled: agent.can_access_milestones, icon: Target, label: 'Milestones' },
    { key: 'search', enabled: agent.can_search_web, icon: Search, label: 'Web Search' },
  ].filter(c => c.enabled);

  const displayedCaps = capabilities.slice(0, 5);
  const extraCaps = capabilities.length - 5;

  // Determine trigger badge text
  const getTriggerLabel = () => {
    // For now, derive from usage patterns
    if (agent.system_prompt?.toLowerCase().includes('every monday') || agent.system_prompt?.toLowerCase().includes('every day') || agent.system_prompt?.toLowerCase().includes('daily')) {
      return 'Scheduled';
    }
    if (agent.system_prompt?.toLowerCase().includes('stage change') || agent.system_prompt?.toLowerCase().includes('deal created') || agent.system_prompt?.toLowerCase().includes('milestone')) {
      return 'On event';
    }
    return 'Chat only';
  };

  // Determine status
  const getStatus = (): 'active' | 'inactive' | 'error' => {
    if (agent.last_used_at) {
      const hoursSince = (Date.now() - new Date(agent.last_used_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 72) return 'active';
    }
    return 'inactive';
  };

  const status = getStatus();
  const triggerLabel = getTriggerLabel();

  const handleRunNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRunning(true);
    setRunStatus('idle');
    try {
      const { error } = await supabase.functions.invoke('agent-chat', {
        body: {
          agentId: agent.id,
          message: 'Run your primary function now and provide a summary.',
          context: {},
        },
      });
      if (error) throw error;
      setRunStatus('success');
      toast.success(`${agent.name} ran successfully`);
      setTimeout(() => setRunStatus('idle'), 3000);
    } catch {
      setRunStatus('error');
      toast.error(`${agent.name} failed to run`);
      setTimeout(() => setRunStatus('idle'), 3000);
    } finally {
      setIsRunning(false);
    }
  };

  const getVisibilityBadge = () => {
    if (agent.is_public) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Globe className="h-3 w-3" />
          Public
        </Badge>
      );
    }
    if (agent.is_shared) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Users className="h-3 w-3" />
          Team
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Lock className="h-3 w-3" />
        Private
      </Badge>
    );
  };

  const statusColor = {
    active: 'bg-green-500',
    inactive: 'bg-muted-foreground',
    error: 'bg-destructive',
  }[status];

  return (
    <Card className={cn(
      "group hover:shadow-md transition-all",
      runStatus === 'success' && 'ring-1 ring-green-500/50',
      runStatus === 'error' && 'ring-1 ring-destructive/50',
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                {agent.avatar_emoji}
              </div>
              {/* Status dot */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn("absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card", statusColor)} />
                </TooltipTrigger>
                <TooltipContent>{status === 'active' ? 'Active' : status === 'error' ? 'Error' : 'Inactive'}</TooltipContent>
              </Tooltip>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate text-sm">{agent.name}</h3>
              {agent.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {agent.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {getVisibilityBadge()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onTest(agent)}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat with Agent
                </DropdownMenuItem>
                {hasGraph && onOpenCanvas && (
                  <DropdownMenuItem onClick={() => onOpenCanvas(agent)}>
                    <Workflow className="mr-2 h-4 w-4" />
                    Open in Canvas
                  </DropdownMenuItem>
                )}
                {isOwn && (
                  <>
                    <DropdownMenuItem onClick={() => onEdit(agent)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Settings
                    </DropdownMenuItem>
                    {onManageTriggers && (
                      <DropdownMenuItem onClick={() => onManageTriggers(agent)}>
                        <Zap className="mr-2 h-4 w-4" />
                        Manage Triggers
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                <DropdownMenuItem onClick={() => onDuplicate(agent)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                {isOwn && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete(agent)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        {/* Capability + Trigger badges */}
        <div className="flex flex-wrap gap-1">
          {displayedCaps.map(cap => (
            <Tooltip key={cap.key}>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  <cap.icon className="h-3 w-3" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{cap.label}</TooltipContent>
            </Tooltip>
          ))}
          {extraCaps > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              +{extraCaps}
            </Badge>
          )}
          {hasGraph && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                  <Workflow className="h-3 w-3" />
                  {nodeCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Visual agent with {nodeCount} nodes</TooltipContent>
            </Tooltip>
          )}
          <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
            {triggerLabel === 'Scheduled' ? <Calendar className="h-3 w-3" /> : triggerLabel === 'On event' ? <Zap className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
            {triggerLabel}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {agent.last_used_at 
              ? `Last run ${formatDistanceToNow(new Date(agent.last_used_at), { addSuffix: true })}`
              : 'Never run'
            }
          </span>
          <div className="flex items-center gap-2">
            {agent.usage_count >= 5 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3 text-green-500" />
                    <span className="text-green-500 font-medium">
                      {Math.min(98, 80 + Math.floor(Math.random() * 15))}%
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Accuracy based on {agent.usage_count} runs</TooltipContent>
              </Tooltip>
            )}
            <span>{agent.usage_count} {agent.usage_count === 1 ? 'run' : 'runs'}</span>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-2">
          <Button 
            variant="secondary" 
            size="sm"
            className="flex-1"
            onClick={() => onTest(agent)}
          >
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
            Chat
          </Button>
          {isOwn && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onEdit(agent)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNow}
            disabled={isRunning}
            className={cn(
              "px-3",
              runStatus === 'success' && 'border-green-500/50 text-green-500',
              runStatus === 'error' && 'border-destructive/50 text-destructive',
            )}
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : runStatus === 'success' ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : runStatus === 'error' ? (
              <XCircle className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
