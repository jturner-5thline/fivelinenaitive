import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Sparkles, User, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useDealAssistant } from '@/hooks/useDealAssistant';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DealContext {
  company: string;
  value: number;
  stage: string;
  status: string;
  manager?: string;
  lenders?: Array<{ name: string; stage: string; notes?: string }>;
  milestones?: Array<{ title: string; completed: boolean; dueDate?: string }>;
  activities?: Array<{ type: string; description: string; timestamp: string }>;
  notes?: string;
}

interface DealAssistantPanelProps {
  dealContext: DealContext;
}

const SUGGESTED_PROMPTS = [
  "Summarize this deal's current status",
  "What are the next steps for this deal?",
  "Which lenders are most engaged?",
  "Are there any risks or blockers?",
  "Draft an update email for stakeholders",
];

export function DealAssistantPanel({ dealContext }: DealAssistantPanelProps) {
  const { messages, sendMessage, clearMessages, isLoading } = useDealAssistant();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input, dealContext);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    sendMessage(prompt, dealContext);
  };

  // Format message content with basic markdown
  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Bold text
      const formattedLine = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      
      // Bullet points
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return (
          <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: formattedLine.substring(2) }} />
        );
      }
      
      // Numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        return (
          <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: numberedMatch[2] }} />
        );
      }

      if (line.trim()) {
        return <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
      }
      return null;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with badge and clear button */}
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-xs font-normal">Beta</Badge>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={clearMessages}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="h-[300px] pr-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <Sparkles className="h-10 w-10 text-primary/50 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Ask me anything about this deal
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleSuggestedPrompt(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-lg px-4 py-2.5 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <div className="text-sm">
                    {message.role === 'assistant' ? formatContent(message.content) : message.content}
                  </div>
                  <p className={cn(
                    'text-[10px] mt-1',
                    message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  )}>
                    {format(message.timestamp, 'h:mm a')}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this deal..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* More suggested prompts */}
      {messages.length > 0 && messages.length < 4 && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTED_PROMPTS.slice(3).map((prompt, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              className="text-xs h-6 text-muted-foreground"
              onClick={() => handleSuggestedPrompt(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
