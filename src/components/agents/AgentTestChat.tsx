import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Loader2, Trash2, Sparkles } from 'lucide-react';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useDeals } from '@/hooks/useDeals';
import type { Agent } from '@/hooks/useAgents';
import { formatDistanceToNow } from 'date-fns';

interface AgentTestChatProps {
  agent: Agent;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "What should I focus on for this deal?",
  "Analyze the current pipeline status",
  "Suggest next steps for closing",
  "What are the key risks to consider?",
];

export function AgentTestChat({ agent, onClose }: AgentTestChatProps) {
  const { deals } = useDeals();
  const [selectedDealId, setSelectedDealId] = useState<string | undefined>();
  const [inputValue, setInputValue] = useState('');
  const { messages, sendMessage, clearMessages, isLoading } = useAgentChat(agent);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedDeal = deals?.find(d => d.id === selectedDealId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    
    const dealContext = selectedDeal ? {
      id: selectedDeal.id,
      company: selectedDeal.company,
      value: selectedDeal.value,
      stage: selectedDeal.stage,
      status: selectedDeal.status,
    } : undefined;

    sendMessage(inputValue, dealContext);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Handle bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return (
          <li key={i} className="ml-4">
            {line.replace(/^[\s]*[-•]\s*/, '')}
          </li>
        );
      }
      // Handle numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <li key={i} className="ml-4 list-decimal">
            {line.replace(/^\d+\.\s*/, '')}
          </li>
        );
      }
      // Handle bold text
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <p key={i}>
            {parts.map((part, j) => 
              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
            )}
          </p>
        );
      }
      return line ? <p key={i}>{line}</p> : <br key={i} />;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
            {agent.avatar_emoji}
          </div>
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-muted-foreground">{agent.personality} mode</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearMessages}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Deal Context Selector */}
      {agent.can_access_deals && (
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Context:</span>
            <Select value={selectedDealId || 'none'} onValueChange={(v) => setSelectedDealId(v === 'none' ? undefined : v)}>
              <SelectTrigger className="w-[250px] h-8">
                <SelectValue placeholder="Select a deal (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No deal context</SelectItem>
                {deals?.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.company} - ${(deal.value / 1000000).toFixed(1)}M
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-3xl">
                {agent.avatar_emoji}
              </div>
              <div>
                <h3 className="font-medium">Chat with {agent.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Try asking a question or use one of the suggestions below
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInputValue(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
                    {agent.avatar_emoji}
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="text-sm space-y-1">
                    {message.role === 'assistant' ? formatContent(message.content) : message.content}
                  </div>
                  <p className="text-xs opacity-60 mt-2">
                    {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
                {agent.avatar_emoji}
              </div>
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
