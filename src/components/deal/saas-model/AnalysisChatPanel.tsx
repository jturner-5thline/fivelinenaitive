import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface Props {
  model: SaaSModelData;
  activeTab?: string;
}

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analysis-chat`;

const CONTEXT_TAGS = ['revenue', 'margins', 'credit', 'customers', 'covenants', 'sensitivity'];

const SUGGESTED_PROMPTS = [
  "What are the key risks in this model?",
  "Summarize the revenue trend",
  "Are there any covenant compliance concerns?",
  "How does gross margin compare to benchmarks?",
];

export function AnalysisChatPanel({ model, activeTab = 'dashboard' }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const buildContext = useCallback(() => ({
    activeTab,
    companyName: model.settings.companyName,
    businessModel: model.settings.businessModel,
    metrics: {
      arr: fmtCurrency(model.arrToday, true),
      grossMargin: fmtPct(model.latestGrossMargin),
      yoyGrowth: fmtPct(model.yoyRevGrowth),
      borrowingCapacity: fmtCurrency(model.borrowingCapacity, true),
    },
  }), [model, activeTab]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Msg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          context: buildContext(),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        toast.error(err.error || 'Failed to get response');
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      toast.error('Failed to connect to AI');
    }

    setIsLoading(false);
  };

  return (
    <Card className="border-border/30 flex flex-col" style={{ minHeight: 340, maxHeight: 480 }}>
      <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Financial AI</h3>
          </div>
          <div className="flex flex-wrap gap-1">
            {CONTEXT_TAGS.map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/10 text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-center text-muted-foreground mb-3">Ask about your financial model</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-[11px] px-2.5 py-2 rounded-md transition-colors border border-border/30 text-muted-foreground hover:border-border hover:text-foreground bg-muted/20"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                  msg.role === 'user'
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted/30 border border-border/30 text-foreground"
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&_p]:text-xs [&_p]:leading-relaxed [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_code]:text-[10px] [&_code]:font-mono">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="leading-relaxed">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-2 border-t border-border/30">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about your model..."
              rows={1}
              className="flex-1 resize-none rounded-md px-3 py-2 text-xs outline-none bg-muted/30 border border-border/30 text-foreground placeholder:text-muted-foreground focus:border-primary/50"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-md transition-colors disabled:opacity-30 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
