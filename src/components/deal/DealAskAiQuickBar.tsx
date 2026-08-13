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
  Trash2,
  Download,
  Copy,
  Search,
  X,
  Quote,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { downloadTextAsFile } from '@/lib/downloadFile';
import { STARTER_CHIPS, buildFollowUpChips } from '@/lib/deal/askAiFollowUpChips';
import { buildCitationIndex, renderCitationAppendix, parseSource } from '@/lib/deal/askAiCitations';
import { useCitationVerification } from '@/hooks/useCitationVerification';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DealAskAiQuickBarProps {
  dealId: string;
  /** Used in the exported transcript header / file name. */
  dealName?: string;
  /** Switches the surrounding tabs over to the Deal Space tab. */
  onOpenDealSpace: () => void;
}

/**
 * Compact "Ask AI" entry point rendered above the deal panels. It expands into
 * an inline back-and-forth chat while the user is interacting with it, and
 * collapses back to the single-line bar when they click outside.
 */
export function DealAskAiQuickBar({ dealId, dealName, onOpenDealSpace }: DealAskAiQuickBarProps) {
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [latestOpen, setLatestOpen] = useState(true);
  const [lastPrompt, setLastPrompt] = useState('');
  const [search, setSearch] = useState('');
  const [includeCitations, setIncludeCitations] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, clearMessages, isLoading, isStreaming, error } = useDealSpaceAI(dealId, {
    persistKey: 'quickbar',
  });
  const {
    citations: verifiedCitations,
    statusByRaw,
    missing: missingCitations,
    checking: checkingCitations,
  } = useCitationVerification(messages, dealId);

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

  // Suggestions track the latest answer + deal context instead of being static.
  const latestAnswer = [...messages].reverse().find((m) => m.role === 'assistant')?.content;

  // ── Transcript search ──
  const query = search.trim().toLowerCase();
  const visibleMessages = query
    ? messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.content.toLowerCase().includes(query))
    : messages.map((m, i) => ({ m, i }));

  /** Highlights every occurrence of the active query inside a message. */
  const renderContent = (text: string) => {
    if (!query) return text;
    const parts: React.ReactNode[] = [];
    const lower = text.toLowerCase();
    let cursor = 0;
    let at = lower.indexOf(query);
    while (at !== -1) {
      if (at > cursor) parts.push(text.slice(cursor, at));
      parts.push(
        <mark key={`${at}`} className="rounded bg-primary/30 px-0.5 text-inherit">
          {text.slice(at, at + query.length)}
        </mark>,
      );
      cursor = at + query.length;
      at = lower.indexOf(query, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };
  const chips =
    messages.length === 0 ? STARTER_CHIPS : buildFollowUpChips(latestAnswer, dealName);

  const buildTranscript = (withCitations = includeCitations) => {
    const title = dealName ? `Ask AI transcript — ${dealName}` : 'Ask AI transcript';
    const { citations, indexByRaw } = buildCitationIndex(messages, dealId);
    const lines = [
      `# ${title}`,
      '',
      `_Exported ${new Date().toLocaleString()}_`,
      ...(dealId
        ? [`_Deal record: ${typeof window !== 'undefined' ? window.location.origin : ''}/deals/${dealId}_`]
        : []),
      '',
      '---',
      '',
    ];
    for (const m of messages) {
      const stamp = m.timestamp instanceof Date && !isNaN(m.timestamp.getTime())
        ? m.timestamp.toLocaleString()
        : '';
      lines.push(`### ${m.role === 'user' ? 'Question' : 'nAItive AI'}${stamp ? ` — ${stamp}` : ''}`);
      lines.push('');
      // Inline citation markers like "[2]" are stripped when citations are off.
      lines.push(withCitations ? m.content : m.content.replace(/\s?\[\d+\]/g, ''));
      if (withCitations && m.sources?.length) {
        lines.push('');
        lines.push('**Sources:**');
        for (const raw of m.sources) {
          const n = indexByRaw.get(raw.trim());
          const { label, url } = parseSource(raw.trim(), dealId);
          const flag = statusByRaw.get(raw.trim()) === 'missing' ? ' ⚠️ _source not found on this deal_' : '';
          lines.push(url ? `- [${n}] ${label} — ${url}${flag}` : `- [${n}] ${label}${flag}`);
        }
      }
      lines.push('');
    }
    if (withCitations) {
      lines.push(
        ...renderCitationAppendix(citations).map((line) => {
          const m = line.match(/^(\d+)\. \*\*(.+?)\*\*/);
          if (!m) return line;
          const cite = citations[Number(m[1]) - 1];
          return cite && statusByRaw.get(cite.raw.trim()) === 'missing'
            ? `${line} ⚠️ **Unresolved:** this document could not be found on the deal.`
            : line;
        }),
      );
      if (missingCitations.length) {
        lines.push('');
        lines.push(
          `> ⚠️ ${missingCitations.length} cited source${missingCitations.length === 1 ? '' : 's'} could not be resolved to a document on this deal and may need manual verification.`,
        );
        lines.push('');
      }
    }
    return lines.join('\n');
  };

  const slug = (dealName || 'deal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const exportTranscript = () => {
    if (!messages.length) return;
    downloadTextAsFile(
      buildTranscript(),
      `ask-ai-transcript-${slug}-${new Date().toISOString().slice(0, 10)}.md`,
      'text/markdown;charset=utf-8',
    );
    toast({ title: 'Transcript exported', description: 'Saved as a Markdown report you can share.' });
  };

  const copyTranscript = async () => {
    if (!messages.length) return;
    try {
      await navigator.clipboard.writeText(buildTranscript());
      toast({ title: 'Transcript copied', description: 'Paste it into an email or doc to share.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Use Export to download the transcript instead.', variant: 'destructive' });
    }
  };

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
          <>
            {messages.length > 0 && (
              <>
              <Button
                variant={includeCitations ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-7 gap-1 text-xs',
                  includeCitations ? 'text-foreground' : 'text-muted-foreground',
                )}
                aria-pressed={includeCitations}
                title={
                  includeCitations
                    ? 'Citations on — inline markers and the Sources appendix are included in exports'
                    : 'Citations off — exports omit inline markers and the Sources appendix'
                }
                onClick={() => setIncludeCitations((v) => !v)}
              >
                <Quote className="h-3.5 w-3.5" />
                Citations {includeCitations ? 'on' : 'off'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={copyTranscript}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={exportTranscript}
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={clearMessages}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
              </>
            )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openFullTab}>
            <Maximize2 className="h-3.5 w-3.5" />
            Open full chat
          </Button>
          </>
        )}
      </div>
      {expanded && messages.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this deal's chat history..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {query && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {visibleMessages.length} of {messages.length} messages match
            </p>
          )}
        </div>
      )}
      {expanded && (
        <div
          ref={scrollRef}
          data-transcript
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
            {query && visibleMessages.length === 0 && messages.length > 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No messages match "{search.trim()}"
              </p>
            )}
            {visibleMessages.map(({ m, i }) => {
              const isLive =
                isStreaming && i === messages.length - 1 && m.role === 'assistant';
              return (
              <div
                key={i}
                className={cn(
                  'text-sm whitespace-pre-wrap leading-relaxed',
                  m.role === 'user'
                    ? 'ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground'
                    : 'text-foreground',
                )}
              >
                {renderContent(m.content)}
                {isLive && (
                  <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary align-middle" />
                )}
              </div>
              );
            })}
            {isLoading && !isStreaming && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                  </span>
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
          {isStreaming ? 'Ask AI is responding...' : 'Ask AI is working on your question...'}
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
