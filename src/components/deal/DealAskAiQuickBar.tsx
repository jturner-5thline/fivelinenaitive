import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Sparkles,
  ArrowUp,
  Loader2,
  Maximize2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
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
  const [lastPrompt, setLastPrompt] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, isLoading, error } = useDealSpaceAI(dealId);

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
    setLastPrompt(question);
    void sendMessage(question);
  };

  const retry = () => {
    if (!lastPrompt) return;
    setExpanded(true);
    void sendMessage(lastPrompt);
  };

  const openFullTab = () => {
    onOpenDealSpace();
    setExpanded(false);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');

  const askChip = (question: string) => {
    setValue('');
    setExpanded(true);
    setLastPrompt(question);
    void sendMessage(question);
  };

  const STARTER_CHIPS = [
    'Summarize this deal',
    'What are the outstanding items?',
    'Which funding sources are active?',
    'What happened recently?',
  ];

  const FOLLOW_UP_CHIPS = [
    'Why does that matter for this deal?',
    'What should I do next?',
    'Which documents support that?',
    'Any risks or blockers?',
    'Summarize that in 3 bullets',
  ];

  const chips = messages.length === 0 ? STARTER_CHIPS : FOLLOW_UP_CHIPS;

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
      {expanded && (
        <div
          ref={scrollRef}
          className="h-72 overflow-y-auto rounded-lg border border-border/60 bg-card/60 backdrop-blur p-3"
        >
          <div className="space-y-3">
            {messages.length === 0 && !isLoading && !error && (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm font-medium">No questions yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Ask about financials, documents, funding sources, or recent activity on this deal.
                </p>
              </div>
            )}
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
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching this deal's data and documents...
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            )}
            {!isLoading && error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-destructive">Ask AI couldn't answer that</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{error}</p>
                  {lastPrompt && (
                    <Button variant="outline" size="sm" className="mt-2 h-7 gap-1 text-xs" onClick={retry}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Collapsed loading / error cues so the state is never hidden. */}
      {!expanded && isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Ask AI is working on your question...
        </div>
      )}
      {!expanded && !isLoading && error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate text-xs text-destructive">{error}</span>
          {lastPrompt && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={retry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      )}
      {/* Collapsed view: keep the latest answer on the deal page in an
          expandable section instead of forcing a trip to the Deal Space tab. */}
      {!expanded && !isLoading && !error && lastAssistant && (
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
      {expanded && !isLoading && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => askChip(chip)}
              className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {chip}
            </button>
          ))}
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
