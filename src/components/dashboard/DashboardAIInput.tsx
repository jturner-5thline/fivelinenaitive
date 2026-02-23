import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`;

const suggestions = [
  "What deals need attention this week?",
  "Suggest tasks for my pipeline",
  "Which lenders are most active?",
  "Show me overdue milestones",
  "How do I create a new deal?",
  "Summarize recent activity",
];

export function DashboardAIInput() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    let assistantContent = '';

    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (resp.status === 429) {
        toast.error('Rate limit reached. Please wait a moment.');
        setIsLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast.error('AI credits exhausted. Please contact your administrator.');
        setIsLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) throw new Error('Failed to start stream');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
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
          if (jsonStr === '[DONE]') { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('Dashboard chat error:', err);
      toast.error('Failed to get response. Please try again.');
      upsertAssistant('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInputValue('');
  };

  const handleLinkClick = (href: string) => {
    if (href.startsWith('/')) {
      navigate(href);
    }
  };

  return (
    <div className="relative">
      <Card className="p-4 shadow-lg overflow-hidden">
        {/* Chat messages area */}
        {messages.length > 0 && (
          <ScrollArea className="max-h-[400px] mb-4">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2.5',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  )}
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown
                          components={{
                            a: ({ href, children }) => (
                              <button
                                type="button"
                                className="text-primary underline hover:text-primary/80 cursor-pointer"
                                onClick={() => href && handleLinkClick(href)}
                              >
                                {children}
                              </button>
                            ),
                            h1: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                            h2: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                            h3: ({ children }) => <h4 className="font-medium text-sm mt-2 mb-1">{children}</h4>,
                            ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li className="text-sm">{children}</li>,
                            p: ({ children }) => <p className="my-1">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-2.5 items-start">
                  <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
        )}

        {/* Suggestions when no messages */}
        {messages.length === 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent text-xs"
                  onClick={() => setInputValue(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-3 h-4 w-4 text-primary" />
            <Textarea
              ref={textareaRef}
              placeholder="Ask me anything about your deals, tasks, lenders..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="pl-10 pr-3 min-h-[40px] max-h-[120px] resize-none border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
              disabled={isLoading}
            />
          </div>
          <div className="flex items-center gap-1 pb-1">
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClear}
                title="Clear conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
