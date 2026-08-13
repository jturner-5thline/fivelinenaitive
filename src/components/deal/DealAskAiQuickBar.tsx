import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles, ArrowUp, Loader2, Maximize2, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { cn } from '@/lib/utils';

interface DealAskAiQuickBarProps {
  dealId: string;
  /** Switches the surrounding tabs over to the Deal Space tab. */
  onOpenDealSpace: () => void;
}

/**
 * Compact "Ask AI" entry point rendered above the deal panels. It expands into
 * an inline back-and-forth chat while the user is interacting with it, and
 * collapses back to the single-line bar when they click outside.
 */
export function DealAskAiQuickBar({ dealId, onOpenDealSpace }: DealAskAiQuickBarProps) {
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [latestOpen, setLatestOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, isLoading } = useDealSpaceAI(dealId);

  // Collapse back to the default bar height when the user clicks outside.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, expanded]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const question = value.trim();
    if (!question) return;
    setValue('');
    setExpanded(true);
    void sendMessage(question);
  };

  const openFullTab = () => {
    onOpenDealSpace();
    setExpanded(false);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <div ref={containerRef} className="space-y-2" onFocusCapture={() => setExpanded(true)}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-none">Ask AI</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ask questions about this deal's data, documents, and activity
          </p>
        </div>
        {expanded && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openFullTab}>
            <Maximize2 className="h-3.5 w-3.5" />
            Open full chat
          </Button>
        )}
      </div>
      {expanded && (messages.length > 0 || isLoading) && (
        <div
          ref={scrollRef}
          className="h-72 overflow-y-auto rounded-lg border border-border/60 bg-card/60 backdrop-blur p-3"
        >
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'text-sm whitespace-pre-wrap leading-relaxed',
                  m.role === 'user'
                    ? 'ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground'
                    : 'text-foreground',
                )}
              >
                {m.content}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
              </div>
            )}
          </div>
        </div>
      )}
      {/* Collapsed view: keep the latest answer on the deal page in an
          expandable section instead of forcing a trip to the Deal Space tab. */}
      {!expanded && lastAssistant && (
        <div className="rounded-lg border border-border/60 bg-card/60 backdrop-blur">
          <button
            type="button"
            onClick={() => setLatestOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-muted-foreground">Latest AI response</span>
              {lastQuestion && (
                <span className="block truncate text-xs text-muted-foreground/80">{lastQuestion.content}</span>
              )}
            </span>
            {latestOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          {latestOpen && (
            <div className="max-h-56 overflow-y-auto border-t border-border/60 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
              {lastAssistant.content}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border/60 px-3 py-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(true)}>
              Continue chat
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openFullTab}>
              <Maximize2 className="h-3.5 w-3.5" />
              Open full chat
            </Button>
          </div>
        </div>
      )}
      <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 backdrop-blur px-3 py-2"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder={messages.length ? 'Ask a follow-up...' : 'Ask AI about this deal...'}
        aria-label="Ask AI about this deal"
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!value.trim() || isLoading}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      </form>
    </div>
  );
}
