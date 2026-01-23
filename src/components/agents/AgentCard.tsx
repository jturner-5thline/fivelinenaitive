import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Play, 
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
  Search
  MoreHorizontal, 
  Play, 
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
  Zap
} from 'lucide-react';
import type { Agent } from '@/hooks/useAgents';
import { formatDistanceToNow } from 'date-fns';

interface AgentCardProps {
  agent: Agent;
  onTest: (agent: Agent) => void;
  onEdit: (agent: Agent) => void;
  onDuplicate: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onManageTriggers?: (agent: Agent) => void;
  isOwn: boolean;
}

export function AgentCard({ agent, onTest, onEdit, onDuplicate, onDelete, isOwn }: AgentCardProps) {
  const capabilities = [
    { key: 'deals', enabled: agent.can_access_deals, icon: Database, label: 'Deals' },
    { key: 'lenders', enabled: agent.can_access_lenders, icon: Building2, label: 'Lenders' },
    { key: 'activities', enabled: agent.can_access_activities, icon: Activity, label: 'Activities' },
    { key: 'milestones', enabled: agent.can_access_milestones, icon: Target, label: 'Milestones' },
    { key: 'search', enabled: agent.can_search_web, icon: Search, label: 'Web Search' },
  ].filter(c => c.enabled);

  const getVisibilityBadge = () => {
    if (agent.is_public) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Globe className="h-3 w-3" />
          Public
        </Badge>
      );
    }
    if (agent.is_shared) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" />
          Team
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        <Lock className="h-3 w-3" />
        Private
      </Badge>
    );
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
              {agent.avatar_emoji}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{agent.name}</h3>
              {agent.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {agent.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {getVisibilityBadge()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onTest(agent)}>
                  <Play className="mr-2 h-4 w-4" />
                  Test Agent
                </DropdownMenuItem>
                {isOwn && (
                  <DropdownMenuItem onClick={() => onEdit(agent)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
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
        <div className="flex flex-wrap gap-1">
          {capabilities.map(cap => (
            <Badge key={cap.key} variant="outline" className="text-xs gap-1">
              <cap.icon className="h-3 w-3" />
              {cap.label}
            </Badge>
          ))}
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {agent.usage_count} {agent.usage_count === 1 ? 'use' : 'uses'}
          </span>
          <span>
            {agent.last_used_at 
              ? `Last used ${formatDistanceToNow(new Date(agent.last_used_at), { addSuffix: true })}`
              : 'Never used'
            }
          </span>
        </div>
        
        <Button 
          variant="secondary" 
          className="w-full"
          onClick={() => onTest(agent)}
        >
          <Play className="mr-2 h-4 w-4" />
          Test Agent
        </Button>
      </CardContent>
    </Card>
  );
}
