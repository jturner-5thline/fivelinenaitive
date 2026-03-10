import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface Props {
  model: SaaSModelData;
  activeTab: string;
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

export function AnalysisChatPanel({ model, activeTab }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
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
    <>
      {/* Toggle Button */}
      <Button
        size="sm"
        className="gap-1.5 text-xs"
        style={{ backgroundColor: '#2ED3B7', color: '#050814' }}
        onClick={() => setOpen(o => !o)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </Button>

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 transition-transform duration-300 ease-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          width: 380,
          backgroundColor: '#0D1225',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#E8E9ED' }}>How can I help you today?</h3>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-[rgba(255,255,255,0.06)]">
            <X className="h-4 w-4" style={{ color: '#8B8FA3' }} />
          </button>
        </div>

        {/* Context Tags */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {CONTEXT_TAGS.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: 'rgba(46,211,183,0.1)', color: '#2ED3B7' }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div className="space-y-2 pt-4">
              <p className="text-xs text-center mb-4" style={{ color: '#4A4E63' }}>Ask about your financial model</p>
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    color: '#8B8FA3',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className="max-w-[85%] rounded-lg px-3 py-2 text-xs"
                style={msg.role === 'user' ? {
                  backgroundColor: '#141A33',
                  color: '#E8E9ED',
                } : {
                  backgroundColor: '#0D1225',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#E8E9ED',
                }}
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
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#8B8FA3' }}>
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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
              className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#E8E9ED',
                maxHeight: 120,
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-lg transition-colors disabled:opacity-30"
              style={{ backgroundColor: '#2ED3B7', color: '#050814' }}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(5,8,20,0.3)' }}
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
