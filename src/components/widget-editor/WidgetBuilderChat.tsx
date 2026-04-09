import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Send, Loader2, X, Bot, User, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WidgetConfig } from './widgetTypes';
import { SEED_FIELDS, getField } from './widgetTypes';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hadConfigUpdate?: boolean;
}

interface WidgetBuilderChatProps {
  config: WidgetConfig;
  onConfigUpdate: (config: WidgetConfig) => void;
  onClose?: () => void;
}

// --- Helpers ---

const SOURCE_ABBR: Record<string, string> = { quickbooks: 'QB', hubspot: 'HS', naitive: 'NT' };
const SOURCE_COLORS: Record<string, string> = {
  QB: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  HS: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  NT: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
};

function SourceBadge({ tag }: { tag: string }) {
  return (
    <span className={cn('inline-flex text-[9px] font-semibold px-1 py-0.5 rounded ml-0.5', SOURCE_COLORS[tag] || 'bg-muted text-muted-foreground')}>
      {tag}
    </span>
  );
}

function flattenChildren(children: any): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (children == null) return '';
  if (Array.isArray(children)) return children.map(flattenChildren).join('');
  if (typeof children === 'object' && children.props) {
    // React element — extract its children recursively
    return flattenChildren(children.props.children);
  }
  return String(children);
}

function renderContentWithBadges(children: any) {
  const text = flattenChildren(children);
  // Split on (QB), (HS), (NT) and render badges inline
  const parts = text.split(/(\(QB\)|\(HS\)|\(NT\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\((QB|HS|NT)\)$/);
    if (match) return <SourceBadge key={i} tag={match[1]} />;
    return <span key={i}>{part}</span>;
  });
}

function MarkdownWithBadges({ content }: { content: string }) {
  return (
    <div className="prose prose-xs max-w-none [&_p]:m-0 [&_ul]:m-0 [&_li]:m-0 [&_ol]:m-0 text-inherit">
      <ReactMarkdown
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          p: ({ node, ...props }) => <p>{renderContentWithBadges(props.children)}</p>,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          li: ({ node, ...props }) => <li>{renderContentWithBadges(props.children)}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function buildConfigDiff(prev: WidgetConfig, next: WidgetConfig): string {
  const lines: string[] = [];
  if (prev.name !== next.name) lines.push(`• **Name:** ${prev.name} → ${next.name}`);
  if (prev.type !== next.type) lines.push(`• **Chart type:** ${prev.type} → ${next.type}`);

  const prevX = getField(prev.xAxis.fieldId);
  const nextX = getField(next.xAxis.fieldId);
  if (prev.xAxis.fieldId !== next.xAxis.fieldId || prev.xAxis.grain !== next.xAxis.grain) {
    const prevLabel = prevX ? `${prevX.name} (${prev.xAxis.grain ?? ''})` : '(none)';
    const nextLabel = nextX ? `${nextX.name} (${next.xAxis.grain ?? ''} grain)` : '(none)';
    lines.push(`• **X-Axis:** ${prevLabel} → ${nextLabel}`);
  }
  if (prev.xAxis.window !== next.xAxis.window) {
    lines.push(`• **Window:** ${prev.xAxis.window ?? 'all'} → ${next.xAxis.window ?? 'all'}`);
  }

  const prevS = getField(prev.series.fieldId);
  const nextS = getField(next.series.fieldId);
  if (prev.series.fieldId !== next.series.fieldId) {
    lines.push(`• **Series:** ${prevS?.name ?? '(none)'} → ${nextS?.name ?? '(none)'}`);
  }

  const prevValIds = prev.values.map(v => v.fieldId).sort().join(',');
  const nextValIds = next.values.map(v => v.fieldId).sort().join(',');
  if (prevValIds !== nextValIds) {
    const added = next.values.filter(v => !prev.values.some(p => p.fieldId === v.fieldId));
    const removed = prev.values.filter(v => !next.values.some(n => n.fieldId === v.fieldId));
    if (added.length) {
      const names = added.map(v => {
        const f = getField(v.fieldId);
        const src = f ? SOURCE_ABBR[f.source] : '';
        const fmt = v.format === 'currency' ? '$' : v.format === 'percent' ? '%' : '#';
        return `${f?.name ?? '?'} (${src}) (${v.agg}, ${fmt})`;
      });
      lines.push(`• **Values added:** ${names.join(', ')}`);
    }
    if (removed.length) {
      const names = removed.map(v => getField(v.fieldId)?.name ?? '?');
      lines.push(`• **Values removed:** ${names.join(', ')}`);
    }
  }

  if (prev.filters.length !== next.filters.length) {
    lines.push(`• **Filters:** ${prev.filters.length} → ${next.filters.length}`);
  }

  if (lines.length === 0) return '';
  return `✅ Widget updated:\n${lines.join('\n')}`;
}

function getSuggestions(config: WidgetConfig): string[] {
  const s: string[] = [];
  if (config.filters.length === 0) s.push('Add a filter');
  if (config.values.length > 0) {
    s.push('Change chart type');
    s.push('Change aggregation');
  }
  s.push('Rename widget');
  return s.slice(0, 4);
}

// --- Main Component ---

export function WidgetBuilderChat({ config, onConfigUpdate, onClose }: WidgetBuilderChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [configHistory, setConfigHistory] = useState<WidgetConfig[]>([]);
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

  const pushHistory = useCallback((cfg: WidgetConfig) => {
    setConfigHistory(prev => [...prev.slice(-19), cfg]);
  }, []);

  const handleUndo = useCallback(() => {
    if (configHistory.length === 0) return;
    const prev = configHistory[configHistory.length - 1];
    setConfigHistory(h => h.slice(0, -1));
    onConfigUpdate(prev);
    setMessages(m => [...m, { role: 'assistant', content: '↩ Reverted to previous configuration.' }]);
  }, [configHistory, onConfigUpdate]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Local undo detection
    if (/^undo(\s+that)?$/i.test(text)) {
      setInput('');
      setMessages(m => [...m, { role: 'user', content: text }]);
      handleUndo();
      return;
    }

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
          availableFields: SEED_FIELDS,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      let diffSummary = '';

      // Apply config update if returned
      if (data?.configUpdate) {
        const prevConfig = { ...config };
        pushHistory(prevConfig);

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
        diffSummary = buildConfigDiff(prevConfig, newConfig);
      }

      const aiContent = data?.content || '';
      const finalContent = diffSummary
        ? (aiContent ? `${diffSummary}\n\n${aiContent}` : diffSummary)
        : (aiContent || 'Done!');

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
        hadConfigUpdate: !!data?.configUpdate,
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
  }, [input, isLoading, messages, config, onConfigUpdate, pushHistory, handleUndo]);

  const suggestions = getSuggestions(config);

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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onClose?.()}>
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
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-[10px] px-2 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="space-y-1.5">
              <div className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
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
                    <MarkdownWithBadges content={msg.content} />
                  ) : msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Undo button for config updates */}
              {msg.role === 'assistant' && msg.hadConfigUpdate && (
                <div className="pl-7">
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-1.5" onClick={handleUndo}>
                    <Undo2 className="h-3 w-3" /> Undo
                  </Button>
                </div>
              )}

              {/* Suggestion chips after last assistant message */}
              {msg.role === 'assistant' && i === messages.length - 1 && !isLoading && (
                <div className="pl-7 flex flex-wrap gap-1.5">
                  {suggestions.map(s => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2 py-0"
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    >
                      {s}
                    </Button>
                  ))}
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
