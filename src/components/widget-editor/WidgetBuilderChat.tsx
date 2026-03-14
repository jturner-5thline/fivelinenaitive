import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Send, Loader2, X, Bot, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WidgetConfig } from './widgetTypes';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface WidgetBuilderChatProps {
  config: WidgetConfig;
  onConfigUpdate: (config: WidgetConfig) => void;
  onClose?: () => void;
}

export function WidgetBuilderChat({ config, onConfigUpdate, onClose }: WidgetBuilderChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('widget-builder-chat', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          currentConfig: config,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Apply config update if returned
      if (data?.configUpdate) {
        const update = data.configUpdate;
        const newConfig = { ...config };

        if (update.name) newConfig.name = update.name;
        if (update.type) newConfig.type = update.type;
        if (update.xAxis) newConfig.xAxis = { ...newConfig.xAxis, ...update.xAxis };
        if (update.series) newConfig.series = { ...newConfig.series, ...update.series };
        if (update.values) {
          newConfig.values = update.values.map((v: any) => ({
            fieldId: v.fieldId,
            agg: v.agg || 'sum',
            format: v.format || 'currency',
          }));
        }
        if (update.filters) {
          newConfig.filters = update.filters.map((f: any, i: number) => ({
            id: `filter-ai-${Date.now()}-${i}`,
            fieldId: f.fieldId,
            operator: f.operator || 'eq',
            values: f.values || [],
            scope: f.scope || 'widget',
          }));
        }

        onConfigUpdate(newConfig);
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: data?.content || 'Done!',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I ran into an error: ${errMsg}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, config, onConfigUpdate]);



  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">AI Widget Builder</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6 space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px] mx-auto">
                Describe the widget you want to build and I'll configure it for you.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {[
                  'Revenue by month',
                  'Budget vs Actual',
                  'KPI for net income',
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); }}
                    className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
              <div className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs max-w-[85%] leading-relaxed',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              )}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-xs prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_li]:m-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2 items-start">
              <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <div className="bg-secondary rounded-lg px-2.5 py-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-2 border-t border-border">
        <div className="flex gap-1.5">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Describe your widget..."
            className="h-8 text-xs"
            disabled={isLoading}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendMessage} disabled={isLoading || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
