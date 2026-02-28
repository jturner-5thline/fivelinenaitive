import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Plus, Trash2, Calculator, BarChart3, TrendingDown, Lightbulb, Sparkles, FileText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AnalysisMessage, MessageAction } from './types';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AnalysisChatProps {
  dealId: string;
  messages: AnalysisMessage[];
  onMessagesChange: (messages: AnalysisMessage[]) => void;
  onAction?: (action: MessageAction, messageContent: string) => void;
  contextSummary?: string;
  className?: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  add_to_report: <FileText className="h-3 w-3" />,
  create_chart: <BarChart3 className="h-3 w-3" />,
  stress_test: <TrendingDown className="h-3 w-3" />,
  explain: <HelpCircle className="h-3 w-3" />,
};

const QUICK_ACTIONS = [
  { label: 'Calculate ratios', icon: Calculator, prompt: 'Calculate all key leverage and coverage ratios from the available financial data.' },
  { label: 'Create analysis', icon: BarChart3, prompt: 'Provide a comprehensive financial analysis summary including revenue trends, margins, and key risks.' },
  { label: 'Stress test', icon: TrendingDown, prompt: 'Run a downside stress test with -15% revenue and 200bps margin compression. Show impact on leverage and coverage.' },
  { label: 'Key insights', icon: Lightbulb, prompt: 'What are the most important observations and red flags in this deal\'s financial data?' },
];

export function AnalysisChat({ dealId, messages, onMessagesChange, onAction, contextSummary, className }: AnalysisChatProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content || isLoading) return;

    const userMsg: AnalysisMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    onMessagesChange(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const apiMessages = newMessages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      // Include context summary as a system-level user message if available
      if (contextSummary) {
        apiMessages.unshift({
          role: 'user' as const,
          content: `[CONTEXT - Financial data available for this deal]\n${contextSummary}\n[END CONTEXT]\n\nPlease use this context to answer my questions about this deal's financials.`,
        });
      }

      const { data, error } = await supabase.functions.invoke('deal-diligence-ai', {
        body: { dealId, messages: apiMessages, action: 'chat' },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Parse actions from response
      const responseActions: MessageAction[] = (data?.actions || []).map((a: any) => ({
        label: a.label,
        type: a.type,
        payload: a.prompt ? { prompt: a.prompt } : undefined,
      }));

      const assistantMsg: AnalysisMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data?.content || 'I was unable to generate a response.',
        timestamp: new Date(),
        sources: data?.sources,
        actions: responseActions.length > 0 ? responseActions : undefined,
      };

      onMessagesChange([...newMessages, assistantMsg]);
    } catch (err) {
      console.error('Analysis chat error:', err);
      onMessagesChange([...newMessages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, dealId, contextSummary, isLoading, onMessagesChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    onMessagesChange([]);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Chat messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">How can I help you today?</h3>
              <p className="text-xs text-muted-foreground max-w-md mb-6">
                Ask anything about this deal's financials. I can calculate ratios, analyze trends,
                run stress tests, and generate IC-ready insights.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.prompt)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-muted/40 hover:border-primary/30 transition-all text-left group"
                  >
                    <action.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                "max-w-[85%] rounded-xl px-4 py-3 text-sm",
                msg.role === 'user'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 border border-border/30"
              )}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-sm prose-p:text-xs prose-li:text-xs">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs">{msg.content}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/20">
                    {msg.sources.map((src, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-colors"
                      >
                        📎 {src.fileName}{src.cellAddress ? ` ${src.cellAddress}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/20">
                    {msg.actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (action.type === 'stress_test' || action.type === 'explain' || action.type === 'create_chart') {
                            const prompt = (action.payload as any)?.prompt;
                            if (prompt) sendMessage(prompt);
                          } else if (action.type === 'add_to_report') {
                            onAction?.(action, msg.content);
                            toast.success('Added to report draft');
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        {ACTION_ICONS[action.type] || <Sparkles className="h-3 w-3" />}
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted/50 border border-border/30 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing…</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-3 border-t border-border/30">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" className="text-[10px] h-6 text-muted-foreground" onClick={clearChat}>
              <Trash2 className="h-3 w-3 mr-1" />
              New chat
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this deal's financials…"
              rows={1}
              className="w-full resize-none rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              disabled={isLoading}
            />
          </div>
          <Button
            size="sm"
            className="h-9 w-9 rounded-xl p-0 flex-shrink-0"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
