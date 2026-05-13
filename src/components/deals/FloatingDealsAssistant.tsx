import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Loader2, ChevronLeft, ChevronRight, Check, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';
import { useDealAssistant, type DealAction } from '@/hooks/useDealAssistant';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { XCircle } from 'lucide-react';

function ActionCard({
  action,
  onConfirm,
  onCancel,
  status,
  isExecuting,
}: {
  action: DealAction;
  onConfirm: () => void;
  onCancel: () => void;
  status?: 'pending' | 'confirmed' | 'cancelled';
  isExecuting: boolean;
}) {
  const isResolved = status === 'confirmed' || status === 'cancelled';
  return (
    <div className={cn(
      "rounded-lg border p-3 mt-2 text-sm",
      status === 'confirmed' && "border-green-500/30 bg-green-500/5",
      status === 'cancelled' && "border-muted bg-muted/30 opacity-60",
      status === 'pending' && "border-primary/30 bg-primary/5",
    )}>
      <div className="flex items-start gap-2">
        <div className={cn(
          "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0",
          status === 'confirmed' ? "bg-green-500/20 text-green-500" :
          status === 'cancelled' ? "bg-muted text-muted-foreground" :
          "bg-primary/20 text-primary"
        )}>
          {status === 'confirmed' ? <Check className="h-3 w-3" /> :
           status === 'cancelled' ? <XCircle className="h-3 w-3" /> :
           <ArrowRight className="h-3 w-3" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs">{action.label}</p>
          {action.currentValue && action.newValue && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="line-through">{action.currentValue}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="font-medium text-foreground">{action.newValue}</span>
            </div>
          )}
          {action.description && !action.currentValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
          )}
        </div>
      </div>
      {!isResolved && (
        <div className="flex gap-2 mt-2.5 ml-7">
          <Button size="sm" className="h-7 text-xs px-3 gap-1" onClick={onConfirm} disabled={isExecuting}>
            {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Confirm
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-3 gap-1" onClick={onCancel} disabled={isExecuting}>
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export function FloatingDealsAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const { messages, sendMessage, clearMessages, isLoading, isExecuting, executeAction, cancelAction } = useDealAssistant();
  const { state: sidebarState, isHovering } = useSidebar();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pipelineContext = {
    company: 'Pipeline Overview',
    value: 0,
    stage: '',
    status: '',
  };

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;
    const q = question.trim();
    setQuestion('');
    sendMessage(q, pipelineContext);
  }, [question, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const suggestedQuestions = [
    "Pipeline overview?",
    "Which deals need attention?",
    "Move deal X to next stage",
  ];

  return createPortal(
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
      <div className="fixed bottom-6 right-16 z-[9999] group transition-all duration-300">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Button
                size="sm"
                className={cn("relative rounded-full h-12 min-w-12 shadow-lg animate-fade-in transition-all duration-300 overflow-visible flex items-center justify-center border-0", isOpen ? "px-4" : "px-0 group-hover:px-4")}
                style={{
                  background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
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
                <p className="text-xs text-muted-foreground mt-0.5">Ask about your deals or take actions</p>
              </div>
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearMessages} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
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
                      <Button key={i} variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap shrink-0" onClick={() => setQuestion(q)}>
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
                              {(typeof message.content === 'string' ? message.content : '').replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')}
                            </ReactMarkdown>
                            {/* Action Confirmation Cards */}
                            {message.actions && message.actions.map((action) => (
                              <ActionCard
                                key={action.id}
                                action={action}
                                status={message.actionStatus}
                                isExecuting={isExecuting}
                                onConfirm={() => executeAction(index, action.id)}
                                onCancel={() => cancelAction(index)}
                              />
                            ))}
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
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask or command: 'Move Niki's Store to...'..."
                  rows={1}
                  className="flex-1 min-h-9 max-h-40 resize-none text-sm border-primary/20 bg-background/80 focus-visible:ring-primary/30"
                  disabled={isLoading || isExecuting}
                />
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={handleSendQuestion}
                  disabled={!question.trim() || isLoading || isExecuting}
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
    </>,
    document.body
  );
}
