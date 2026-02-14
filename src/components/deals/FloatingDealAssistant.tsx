import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';

interface FloatingDealAssistantProps {
  dealId: string;
  dealName?: string;
}

export function FloatingDealAssistant({ dealId, dealName }: FloatingDealAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const { messages, sendMessage, isLoading, clearMessages } = useDealSpaceAI(dealId);
  const { state: sidebarState, isHovering } = useSidebar();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sidebar appears expanded when actually expanded OR when hovering over collapsed sidebar
  const isEffectivelyExpanded = sidebarState === 'expanded' || isHovering;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;
    sendMessage(question);
    setQuestion('');
  }, [question, sendMessage, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const suggestedQuestions = [
    "What are the key terms?",
    "Summarize main risks",
    "Financial highlights?",
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 group transition-all duration-300">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Button
              variant="gradient"
              size="sm"
              className="relative rounded-full h-12 min-w-12 group-hover:px-4 px-0 shadow-lg animate-fade-in transition-all duration-300 overflow-visible flex items-center justify-center"
            >
              <span 
                className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
              >
                <span 
                  className="absolute -inset-full animate-[shimmer_5s_ease-in-out_infinite]"
                  style={{
                    background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
                  }}
                />
              </span>
              <div className="flex items-center justify-center relative z-10">
                <img 
                  src={naitiveAiIcon} 
                  alt="AI" 
                  className="h-7 w-7 shrink-0 brightness-0 invert"
                />
                <span className="max-w-0 group-hover:max-w-32 group-hover:ml-2 overflow-hidden whitespace-nowrap transition-all duration-300">
                  Ask AI
                </span>
              </div>
            </Button>
          </div>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          className="w-96 p-0 animate-scale-in border-primary/20 overflow-hidden"
          sideOffset={8}
          style={{
            background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, hsl(var(--primary) / 0.06) 100%)',
          }}
        >
          <div className="p-4 border-b border-primary/10 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, transparent 70%)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <img src={naitiveAiIcon} alt="AI" className="h-4 w-4" />
                Deal Assistant
              </h3>
              {dealName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[250px]">{dealName}</p>
              )}
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}
          </div>
          
          <ScrollArea className="h-72 p-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center py-2">
                  Ask questions about this deal
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setQuestion(q);
                      }}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex flex-col gap-1",
                      message.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                    {message.sources && message.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {message.sources.map((source, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                            {source}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start">
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="p-3 border-t border-primary/10">
            <div className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this deal..."
                className="flex-1 h-9 text-sm border-primary/20 bg-background/80 focus-visible:ring-primary/30"
                disabled={isLoading}
              />
              <Button
                size="sm"
                onClick={handleSendQuestion}
                disabled={!question.trim() || isLoading}
                className="h-9 w-9 p-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
