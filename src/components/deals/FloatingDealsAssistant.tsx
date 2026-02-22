import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function FloatingDealsAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { state: sidebarState, isHovering } = useSidebar();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isEffectivelyExpanded = sidebarState === 'expanded' || isHovering;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;
    
    const userMessage = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('deal-assistant', {
        body: { messages: [{ role: 'user', content: userMessage }], dealContext: { company: 'Pipeline', value: 0, stage: 'all', status: 'active' } },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.content || data.answer }]);
    } catch (err) {
      console.error('Deals assistant error:', err);
      toast({
        title: 'Failed to get response',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  }, [question, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const clearMessages = () => {
    setMessages([]);
  };

  const suggestedQuestions = [
    "Pipeline overview?",
    "Which deals need attention?",
    "Recent activity summary",
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
      <div className="fixed bottom-6 right-16 z-50 group transition-all duration-300">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Button
                size="sm"
                className={cn("relative rounded-full h-12 min-w-12 shadow-lg animate-fade-in transition-all duration-300 overflow-visible flex items-center justify-center border-0", isOpen ? "px-4" : "px-0 group-hover:px-4")}
                style={{
                  background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 72%))',
                }}
              >
                <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
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
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <img src={naitiveAiIcon} alt="AI" className="h-4 w-4" />
                  Pipeline Assistant
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Ask about your deals</p>
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
            
            {messages.length === 0 && (
              <div className="relative px-4 pt-3 pb-1">
                <button
                  onClick={() => {
                    const el = document.getElementById('pipeline-prompt-carousel');
                    if (el) el.scrollBy({ left: -120, behavior: 'smooth' });
                  }}
                  className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div
                  id="pipeline-prompt-carousel"
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
                    const el = document.getElementById('pipeline-prompt-carousel');
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
                          <div className="max-w-none">
                            <ReactMarkdown
                              components={{
                                h2: ({ children }) => (
                                  <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>
                                ),
                                h3: ({ children }) => (
                                  <h4 className="font-medium text-sm mt-2 mb-1">{children}</h4>
                                ),
                                ul: ({ children }) => (
                                  <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>
                                ),
                                li: ({ children }) => (
                                  <li className="text-sm">{children}</li>
                                ),
                                p: ({ children }) => (
                                  <p className="my-1">{children}</p>
                                ),
                              }}
                            >
                              {message.content.replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          message.content
                        )}
                      </div>
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
                  placeholder="Ask about your pipeline..."
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