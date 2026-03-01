import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, X, Minimize2, Maximize2 } from 'lucide-react';
import { AgentTestChat } from './AgentTestChat';
import type { Agent } from '@/hooks/useAgents';
import { cn } from '@/lib/utils';

interface FloatingAgentChatProps {
  agents: Agent[];
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
}

export function FloatingAgentChat({ agents, activeAgent, onSelectAgent }: FloatingAgentChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <Card className={cn(
      "fixed z-50 flex flex-col shadow-2xl border-border overflow-hidden transition-all duration-200",
      isExpanded
        ? "bottom-4 right-4 w-[500px] h-[700px]"
        : "bottom-4 right-4 w-[380px] h-[520px]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MessageCircle className="h-4 w-4 text-primary shrink-0" />
          {agents.length > 0 ? (
            <Select
              value={activeAgent?.id || ''}
              onValueChange={(id) => {
                const agent = agents.find(a => a.id === id);
                onSelectAgent(agent || null);
              }}
            >
              <SelectTrigger className="h-7 text-xs border-none bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="Pick an agent…" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <span className="mr-1">{a.avatar_emoji}</span> {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">No agents available</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 overflow-hidden">
        {activeAgent ? (
          <AgentTestChat agent={activeAgent} onClose={() => onSelectAgent(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-medium text-sm">Select an agent to chat</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Pick an agent from the dropdown above to start a conversation.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
