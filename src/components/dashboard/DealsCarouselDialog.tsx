import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-dashboard-chat`;
const REQUEST_TIMEOUT_MS = 70_000;

interface DealsCarouselDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DealPage {
  prompt: string;
  subtitle: string;
}

const PAGES: DealPage[] = [
  { prompt: 'What are we waiting on', subtitle: 'Outstanding items by deal' },
  { prompt: 'Who are our most active lenders', subtitle: 'Most-sent and most-active lenders' },
  { prompt: 'Stale deals analysis', subtitle: 'Deals at risk of going stale' },
];

type PageStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PageState {
  status: PageStatus;
  content: string;
  error?: string;
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractTextContent).filter(Boolean).join('');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if ('content' in record) return extractTextContent(record.content);
  }
  return '';
}

function extractAssistantPayloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, any>;
  return [
    extractTextContent(record.choices?.[0]?.delta?.content),
    extractTextContent(record.choices?.[0]?.message?.content),
    extractTextContent(record.choices?.[0]?.text),
    extractTextContent(record.response),
    extractTextContent(record.content),
  ].find(Boolean) || '';
}

export function DealsCarouselDialog({ open, onOpenChange }: DealsCarouselDialogProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageStates, setPageStates] = useState<PageState[]>(
    () => PAGES.map(() => ({ status: 'idle', content: '' })),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const wheelAccum = useRef(0);
  const wheelLockRef = useRef(false);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= PAGES.length) return;
    setActiveIndex(idx);
  }, []);

  const next = useCallback(() => {
    setActiveIndex((i) => Math.min(i + 1, PAGES.length - 1));
  }, []);
  const prev = useCallback(() => {
    setActiveIndex((i) => Math.max(i - 1, 0));
  }, []);

  const runPrompt = useCallback(async (idx: number, force = false) => {
    setPageStates((prev) => {
      const current = prev[idx];
      if (!force && (current.status === 'ready' || current.status === 'loading')) return prev;
      const copy = [...prev];
      copy[idx] = { status: 'loading', content: '' };
      return copy;
    });

    const prompt = PAGES[idx].prompt;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Please sign in again to use the assistant.');

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal,
      });

      if (resp.status === 429) throw new Error('Rate limit reached. Please try again in a moment.');
      if (resp.status === 402) throw new Error('AI credits exhausted.');
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'Unknown error');
        throw new Error(errText || `AI request failed (${resp.status})`);
      }

      const contentType = resp.headers.get('content-type') || '';
      let assistantContent = '';

      if (contentType.includes('application/json')) {
        const json = await resp.json();
        assistantContent = extractAssistantPayloadText(json).trim();
        if (!assistantContent && json?.error) throw new Error(String(json.error));
      } else if (resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = '';
        let streamDone = false;
        const flushChunk = (chunk: string) => {
          setPageStates((prev) => {
            const copy = [...prev];
            copy[idx] = { status: 'loading', content: (copy[idx].content || '') + chunk };
            return copy;
          });
          assistantContent += chunk;
        };

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });
          let nlIdx: number;
          while ((nlIdx = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, nlIdx);
            textBuffer = textBuffer.slice(nlIdx + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') { streamDone = true; break; }
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = extractTextContent(parsed?.choices?.[0]?.delta?.content);
              if (delta) { flushChunk(delta); continue; }
              const full = extractAssistantPayloadText(parsed).trim();
              if (full) {
                assistantContent = full;
                setPageStates((prev) => {
                  const copy = [...prev];
                  copy[idx] = { status: 'loading', content: full };
                  return copy;
                });
              }
            } catch {
              textBuffer = line + '\n' + textBuffer;
              break;
            }
          }
        }
      }

      if (!assistantContent.trim()) {
        throw new Error('The assistant returned an empty response.');
      }

      setPageStates((prev) => {
        const copy = [...prev];
        copy[idx] = { status: 'ready', content: assistantContent };
        return copy;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setPageStates((prev) => {
        const copy = [...prev];
        copy[idx] = { status: 'error', content: '', error: message };
        return copy;
      });
      toast.error('Assistant request failed', { description: message });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  // Auto-run prompt on first activation of each page
  useEffect(() => {
    if (!open) return;
    const state = pageStates[activeIndex];
    if (state.status === 'idle') {
      runPrompt(activeIndex);
    }
  }, [open, activeIndex, pageStates, runPrompt]);

  // Reset cache when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, next, prev]);

  // Touch swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    const dx = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) next(); else prev();
  };

  // Trackpad horizontal wheel
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    wheelAccum.current += e.deltaX;
    if (wheelLockRef.current) return;
    if (Math.abs(wheelAccum.current) > 60) {
      if (wheelAccum.current > 0) next(); else prev();
      wheelLockRef.current = true;
      wheelAccum.current = 0;
      window.setTimeout(() => { wheelLockRef.current = false; }, 400);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden',
          'w-[calc(100vw-1rem)] sm:w-full max-w-[640px]',
          'pb-[env(safe-area-inset-bottom)]',
        )}
        aria-label="Deals insights"
      >
        <DialogTitle className="sr-only">Deals insights</DialogTitle>
        <DialogDescription className="sr-only">
          Swipeable carousel of three AI-generated deal insights.
        </DialogDescription>

        {/* Page viewport */}
        <div
          ref={containerRef}
          className="relative overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {PAGES.map((page, idx) => {
              const state = pageStates[idx];
              return (
                <div
                  key={page.prompt}
                  role="tabpanel"
                  id={`deals-page-${idx}`}
                  aria-labelledby={`deals-tab-${idx}`}
                  aria-hidden={idx !== activeIndex}
                  className="shrink-0 grow-0 basis-full min-w-0"
                >
                  <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/60 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
                        {page.prompt}
                      </h2>
                      <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                        {page.subtitle}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => runPrompt(idx, true)}
                      disabled={state.status === 'loading'}
                      aria-label={`Refresh ${page.prompt}`}
                    >
                      <RefreshCw className={cn('h-4 w-4', state.status === 'loading' && 'animate-spin')} />
                    </Button>
                  </div>

                  <div className="px-5 sm:px-6 py-5 min-h-[260px] max-h-[60vh] overflow-y-auto">
                    {state.status === 'loading' && !state.content && (
                      <div className="space-y-3" aria-live="polite" aria-busy="true">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-2/3" />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating insight…
                        </div>
                      </div>
                    )}

                    {state.status === 'error' && (
                      <div className="flex flex-col items-start gap-3 text-sm">
                        <div className="flex items-start gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-medium">Couldn't load this insight</div>
                            <div className="text-muted-foreground text-xs mt-0.5">{state.error}</div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => runPrompt(idx, true)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Retry
                        </Button>
                      </div>
                    )}

                    {(state.status === 'ready' || (state.status === 'loading' && state.content)) && (
                      <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                        {state.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chevron buttons */}
          <button
            type="button"
            onClick={prev}
            disabled={activeIndex === 0}
            aria-label="Previous insight"
            className={cn(
              'absolute left-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full',
              'flex items-center justify-center',
              'bg-background/80 backdrop-blur-sm border border-border/60',
              'text-foreground hover:bg-background transition-colors',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={activeIndex === PAGES.length - 1}
            aria-label="Next insight"
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full',
              'flex items-center justify-center',
              'bg-background/80 backdrop-blur-sm border border-border/60',
              'text-foreground hover:bg-background transition-colors',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Indicator dots */}
        <div
          role="tablist"
          aria-label="Deals insight pages"
          className="flex items-center justify-center gap-2 py-3 border-t border-border/60"
        >
          {PAGES.map((page, idx) => (
            <button
              key={page.prompt}
              type="button"
              role="tab"
              id={`deals-tab-${idx}`}
              aria-selected={idx === activeIndex}
              aria-controls={`deals-page-${idx}`}
              aria-label={`Go to page ${idx + 1}: ${page.prompt}`}
              onClick={() => goTo(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-200',
                idx === activeIndex
                  ? 'w-6 bg-foreground/80'
                  : 'w-2 bg-foreground/25 hover:bg-foreground/40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              )}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
