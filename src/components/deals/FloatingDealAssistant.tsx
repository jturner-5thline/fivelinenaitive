import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    "Are we missing anything?",
    "What are the key terms?",
    "Summarize main risks",
    "Financial highlights?",
  ];

  return (
    <>
      <style>{`
        @keyframes slide-up-fade {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slide-down-fade {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(20px) scale(0.97); }
        }
      `}</style>
      <div className="fixed bottom-6 right-20 z-50 group transition-all duration-300">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Button
              variant="gradient"
              size="sm"
              className={cn("relative rounded-full h-12 min-w-12 shadow-lg animate-fade-in transition-all duration-300 overflow-visible flex items-center justify-center", isOpen ? "px-4" : "px-0 group-hover:px-4")}
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
                <span className={cn("overflow-hidden whitespace-nowrap transition-all duration-300", isOpen ? "max-w-32 ml-2" : "max-w-0 group-hover:max-w-32 group-hover:ml-2")}>
                  Ask AI
                </span>
              </div>
            </Button>
          </div>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          className="w-96 p-0 border-primary/20 overflow-hidden shadow-[0_6px_30px_-10px_hsl(var(--primary)/0.2),0_0_40px_-20px_hsl(var(--primary)/0.1)] data-[state=open]:animate-[slide-up-fade_0.35s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[slide-down-fade_0.2s_ease-in]"
          sideOffset={8}
          style={{
            background: 'linear-gradient(145deg, hsl(230 25% 10%) 0%, hsl(235 28% 13%) 50%, hsl(245 35% 18%) 80%, hsl(220 50% 22%) 100%)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="p-4 border-b border-primary/10 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, hsl(230 25% 10%) 0%, hsl(230 30% 14%) 50%, hsl(220 45% 20%) 100%)' }}>
            <h3 className="font-semibold flex items-center gap-2">
              <img src={naitiveAiIcon} alt="AI" className="h-4 w-4" />
              Deal Assistant
            </h3>
            <div className="flex items-center gap-2">
              {dealName && (
                <p className="text-xs text-foreground truncate max-w-[150px]">{dealName}</p>
              )}
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
          </div>
          
          {messages.length === 0 && (
            <div className="relative px-4 pt-3 pb-1">
              <button
                onClick={() => {
                  const el = document.getElementById('prompt-carousel');
                  if (el) el.scrollBy({ left: -120, behavior: 'smooth' });
                }}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <div
                id="prompt-carousel"
                className="overflow-x-auto scrollbar-none mx-5"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="flex gap-2 min-w-max">
                  {suggestedQuestions.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 whitespace-nowrap shrink-0"
                      onClick={() => {
                        setQuestion(q);
                      }}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  const el = document.getElementById('prompt-carousel');
                  if (el) el.scrollBy({ left: 120, behavior: 'smooth' });
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <ScrollArea className="h-[22.5rem] p-4">
            {messages.length > 0 && (
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
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1 [&_ul_ul]:pl-3 [&_ul_ul]:my-0.5">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => {
                                if (href?.startsWith('#tab-')) {
                                  const tab = href.replace('#tab-', '');
                                  return (
                                    <button
                                      className="text-primary underline hover:text-primary/80 transition-colors font-medium"
                                      onClick={() => {
                                        setIsOpen(false);
                                        const tabTrigger = document.querySelector(`[data-state][value="${tab}"]`) as HTMLElement;
                                        tabTrigger?.click();
                                      }}
                                    >
                                      {children}
                                    </button>
                                  );
                                }
                                if (href === '#open-deal-memo') {
                                  return (
                                    <button
                                      className="text-primary underline hover:text-primary/80 transition-colors font-medium"
                                      onClick={() => {
                                        setIsOpen(false);
                                        const memoBtn = document.querySelector('[data-deal-memo-trigger]') as HTMLElement;
                                        memoBtn?.click();
                                      }}
                                    >
                                      {children}
                                    </button>
                                  );
                                }
                                return <a href={href} className="text-primary underline">{children}</a>;
                              }
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
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
                variant="gradient"
                size="sm"
                onClick={handleSendQuestion}
                disabled={!question.trim() || isLoading}
                className="h-9 w-9 p-0 relative overflow-hidden"
              >
                {question.trim() && !isLoading && (
                  <span className="absolute inset-0 rounded overflow-hidden pointer-events-none">
                    <span
                      className="absolute -inset-full animate-[shimmer_5s_ease-in-out_infinite]"
                      style={{
                        background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
                      }}
                    />
                  </span>
                )}
                <span className="relative z-10">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </span>
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      </div>
    </>
  );
}
