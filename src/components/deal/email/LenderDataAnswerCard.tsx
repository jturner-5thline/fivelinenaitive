import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, MessageSquare, ArrowRight, Copy, AlertCircle, FileText, Check, ListChecks } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { detectDataQuestions, type DetectedQuestion } from './detectDataQuestions';

interface Props {
  /** Plain text of the latest email message (HTML stripped). */
  emailBodyText: string | null | undefined;
  dealId: string;
  dealName?: string;
  /** Insert an answer string into the active reply composer. */
  onInsertIntoReply: (text: string) => void;
}

interface AnswerState {
  loading: boolean;
  content: string | null;
  sources: string[];
  /**
   * Heuristic: did the model say it can't find the data in the deal record?
   * We surface a clearer "missing info" hint when so.
   */
  missing: boolean;
  error: string | null;
}

const EMPTY: AnswerState = { loading: false, content: null, sources: [], missing: false, error: null };

/**
 * Detects phrases like "not in the deal", "no information available", "I
 * don't have access" so we can render a softer "you may need to ask the
 * client" CTA instead of pretending we have an answer.
 */
function isMissingInfo(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(not (?:found|available|in (?:the )?(?:deal|deal record|data room|deal space))|isn['’]t (?:in|available)|no (?:information|data|record)|don['’]t (?:have|see|find)|cannot (?:find|locate)|unable to (?:find|locate))\b/.test(t)
  );
}

/**
 * Compose the canonical insertable reply paragraph from a Q&A pair. Keeps
 * the funding source-facing tone neutral and explicitly attributes the answer to
 * "the deal record" — never the AI.
 */
function buildReplyInsert(question: string, answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return '';
  return `Re: ${question.replace(/\s+/g, ' ').trim()}\n\n${trimmed}\n`;
}

/**
 * Compose a single consolidated reply block that addresses every detected
 * question as bullet points. Skips entries the model couldn't answer from
 * the Deal Space (so the funding source never sees "Not in deal record" injected
 * silently into a reply — those still surface as a closing note).
 *
 * Format:
 *   Below are the answers to your questions, based on our deal record:
 *
 *   • [Question topic] — [Answer]
 *   • [Question topic] — [Answer]
 *
 *   For [topic], we don't have this on file yet — happy to follow up.
 */
function buildConsolidatedInsert(
  pairs: { question: DetectedQuestion; state: AnswerState }[],
): string {
  const answered = pairs.filter((p) => p.state.content && !p.state.missing);
  const missing = pairs.filter((p) => p.state.content && p.state.missing);
  if (answered.length === 0 && missing.length === 0) return '';

  const lines: string[] = [];
  if (answered.length > 0) {
    lines.push('Below are the answers to your questions, based on our deal record:');
    lines.push('');
    for (const { question, state } of answered) {
      const topic = (question.topics[0] || question.text).trim();
      const ans = (state.content || '').trim().replace(/\s+/g, ' ');
      // Cite up to the top 3 Deal Space sources inline so the funding source (and
      // the sender reviewing the draft) can trace where each figure came
      // from. Skip silently when the model returned no sources.
      const cites = (state.sources || [])
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const citation = cites.length > 0 ? ` (Source: ${cites.join('; ')})` : '';
      lines.push(`• ${topic} — ${ans}${citation}`);
    }
  }
  if (missing.length > 0) {
    if (lines.length) lines.push('');
    const topics = missing.map((m) => (m.question.topics[0] || m.question.text).trim());
    lines.push(
      `For ${topics.join(', ')}, we don't have this on file yet — happy to follow up once available.`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function LenderDataAnswerCard({ emailBodyText, dealId, dealName, onInsertIntoReply }: Props) {
  const questions = useMemo(() => detectDataQuestions(emailBodyText), [emailBodyText]);
  const [active, setActive] = useState<DetectedQuestion | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  // Tracks the "Answer all" parallel batch so we can render a single
  // unified spinner/disabled state across the chip row instead of N
  // individual loaders racing each other.
  const [batchLoading, setBatchLoading] = useState(false);

  // Reset when the underlying email body changes (new thread / new message).
  useEffect(() => {
    setActive(null);
    setAnswers({});
  }, [emailBodyText]);

  if (questions.length === 0) return null;

  const answerState = active ? (answers[active.id] || EMPTY) : EMPTY;

  /**
   * Issue a single Deal Space query for one detected question. Pulled into
   * a standalone helper so both single-chip clicks and the parallel
   * "Answer all" path share identical prompt + parsing logic.
   */
  const fetchAnswer = useCallback(async (q: DetectedQuestion): Promise<AnswerState> => {
    // Surface the heuristic's best-guess Deal Space fields to the model so
    // it searches the right corner first (e.g. "DSCR" → debt schedule).
    // The model is still required to ground its answer in real data — the
    // hint is a starting point, not a license to invent.
    const fieldHint =
      q.suggestedFields && q.suggestedFields.length > 0
        ? `\nLIKELY SOURCES (search these first; do not invent if absent):\n- ${q.suggestedFields.join('\n- ')}\n`
        : '';
    const { data, error } = await supabase.functions.invoke('deal-space-ai', {
      body: {
        dealId,
        scope: 'all',
        messages: [
          {
            role: 'user',
            content:
`A lender asked the following question by email about this deal. Answer ONLY using data already in the Deal Space (financials, debt schedule, collateral, use of funds, write-up, transcripts, outstanding items, notes, attachments).

Rules:
- Be direct and concise — one or two sentences for the headline answer, plus a short supporting line if useful.
- Quote the figure or status exactly as it appears in the source. Do NOT round or restate.
- If the answer is NOT in the deal record, reply with exactly: "This information isn't in the deal record." Then suggest the type of document the user could request from the client. Do NOT guess.
- Never invent numbers, dates, lenders, or commitments.
${fieldHint}
QUESTION:
"${q.text}"`,
          },
        ],
      },
    });
    if (error) throw new Error(error.message || 'Request failed');
    if (data?.error) throw new Error(data.error);
    const content: string = (data?.content || '').trim();
    const sources: string[] = Array.isArray(data?.sources) ? data.sources : [];
    return {
      loading: false,
      content,
      sources,
      missing: isMissingInfo(content),
      error: null,
    };
  }, [dealId]);

  const runAnswer = useCallback(async (q: DetectedQuestion) => {
    setActive(q);
    if (answers[q.id]?.content) return; // already cached
    setAnswers((s) => ({ ...s, [q.id]: { ...EMPTY, loading: true } }));
    try {
      const next = await fetchAnswer(q);
      setAnswers((s) => ({ ...s, [q.id]: next }));
    } catch (err: any) {
      console.error('[LenderDataAnswer] error:', err);
      setAnswers((s) => ({
        ...s,
        [q.id]: { ...EMPTY, error: err?.message || 'Failed to answer.' },
      }));
    }
  }, [answers, fetchAnswer]);

  /**
   * Answer every detected question in parallel, then insert one
   * consolidated bullet-point block into the active reply. Cached answers
   * are reused — only un-answered questions hit the edge function.
   * On completion the active chip is set to the first question so the
   * user can still drill in and edit individual answers if desired.
   */
  const runAnswerAll = useCallback(async () => {
    if (questions.length === 0 || batchLoading) return;
    setBatchLoading(true);
    // Optimistically mark every uncached question as loading so chips
    // reflect the in-flight batch.
    setAnswers((s) => {
      const next = { ...s };
      for (const q of questions) {
        if (!next[q.id]?.content) {
          next[q.id] = { ...EMPTY, loading: true };
        }
      }
      return next;
    });
    try {
      const results = await Promise.all(
        questions.map(async (q) => {
          const cached = answers[q.id];
          if (cached?.content) return { q, state: cached };
          try {
            const state = await fetchAnswer(q);
            return { q, state };
          } catch (err: any) {
            console.error('[LenderDataAnswer] batch error for', q.id, err);
            return {
              q,
              state: { ...EMPTY, error: err?.message || 'Failed to answer.' } as AnswerState,
            };
          }
        }),
      );
      // Commit all state updates in a single render pass.
      setAnswers((s) => {
        const next = { ...s };
        for (const { q, state } of results) next[q.id] = state;
        return next;
      });
      const insert = buildConsolidatedInsert(
        results.map(({ q, state }) => ({ question: q, state })),
      );
      if (insert) {
        onInsertIntoReply(insert);
        const answeredCount = results.filter((r) => r.state.content && !r.state.missing).length;
        const missingCount = results.filter((r) => r.state.content && r.state.missing).length;
        if (answeredCount > 0) {
          toast.success(
            `Inserted ${answeredCount} answer${answeredCount === 1 ? '' : 's'}` +
            (missingCount > 0 ? ` · ${missingCount} not in deal record` : ''),
          );
        } else {
          toast.info("None of the questions could be answered from the deal record");
        }
      } else {
        toast.error('No answers returned.');
      }
      // Surface the first question so the detail panel reflects the batch.
      if (!active && questions[0]) setActive(questions[0]);
    } finally {
      setBatchLoading(false);
    }
  }, [questions, answers, fetchAnswer, batchLoading, active, onInsertIntoReply]);

  const handleCopy = async () => {
    if (!answerState.content) return;
    try {
      await navigator.clipboard.writeText(answerState.content);
      toast.success('Answer copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleInsert = () => {
    if (!active || !answerState.content || answerState.missing) return;
    onInsertIntoReply(buildReplyInsert(active.text, answerState.content));
    toast.success('Inserted into reply');
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2.5 overflow-hidden max-w-full min-w-0 w-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide text-foreground min-w-0 truncate">
          Answer from Deal Space
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/70 shrink-0">
          {questions.length} question{questions.length === 1 ? '' : 's'} detected
        </span>
      </div>

      {/* Batch action — visible whenever 2+ questions are detected.
          Runs every question in parallel against deal-space-ai and inserts
          a single consolidated bullet-point block into the reply. Cached
          answers are re-used so re-running is cheap. */}
      {questions.length >= 2 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/[0.06] px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/85 min-w-0">
            <ListChecks className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">
              Answer all {questions.length} questions and insert as bullet points
            </span>
          </div>
          <Button
            size="sm"
            className="h-6 text-[11px] gap-1 px-2 shrink-0 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
            onClick={runAnswerAll}
            disabled={batchLoading}
          >
            {batchLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ListChecks className="h-3 w-3" />
            )}
            Answer all
          </Button>
        </div>
      )}

      {/* Question chips — scrollable single row, mirrors the draft-intent chips style. */}
      <div
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden -mx-0.5 px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
        }}
        role="group"
        aria-label="Detected data questions"
      >
        {questions.map((q) => {
          const isActive = active?.id === q.id;
          const isLoading = answers[q.id]?.loading;
          const hasAnswer = !!answers[q.id]?.content;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => runAnswer(q)}
              title={q.text}
              className={cn(
                'inline-flex items-center gap-1 h-6 px-2.5 rounded-full shrink-0 whitespace-nowrap',
                'text-[11px] font-medium leading-none',
                'border border-white/10 bg-white/5 backdrop-blur-sm',
                'text-foreground/80 transition-colors',
                'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                isActive && 'bg-primary/15 border-primary/30 text-primary',
              )}
            >
              {isLoading ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : hasAnswer ? (
                <Check className="h-2.5 w-2.5" />
              ) : (
                <MessageSquare className="h-2.5 w-2.5" />
              )}
              <span className="max-w-[200px] truncate">{q.topics[0] || 'Question'}</span>
            </button>
          );
        })}
      </div>

      {/* Active question + answer panel */}
      {active && (
        <div className="space-y-2 min-w-0 max-w-full">
          <div className="text-[11px] text-muted-foreground italic line-clamp-2">
            "{active.text}"
          </div>

          {answerState.loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
              Searching {dealName ? `${dealName}'s` : 'the'} Deal Space…
            </div>
          )}

          {answerState.error && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              {answerState.error}
            </div>
          )}

          {answerState.content && !answerState.loading && (
            <div className="space-y-1.5">
              <div
                className={cn(
                  'rounded-md border p-2 text-[12px] leading-relaxed max-w-full break-words',
                  answerState.missing
                    ? 'border-amber-500/30 bg-amber-500/[0.06] text-foreground/85'
                    : 'border-white/10 bg-card/50 text-foreground/90',
                )}
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {answerState.missing && (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 mb-1">
                    <AlertCircle className="h-3 w-3" />
                    Not in Deal Space
                  </div>
                )}
                {answerState.content}
              </div>

              {answerState.sources.length > 0 && !answerState.missing && (
                <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/80">
                  <FileText className="h-3 w-3 mt-[1px] shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium text-muted-foreground">Source: </span>
                    <span className="truncate">{answerState.sources.slice(0, 4).join(' · ')}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-1.5 pt-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2"
                  onClick={handleCopy}
                  disabled={!answerState.content}
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
                  onClick={handleInsert}
                  disabled={!answerState.content || answerState.missing}
                  title={
                    answerState.missing
                      ? "Won't insert — answer isn't in the Deal Space"
                      : 'Insert this answer into your draft reply'
                  }
                >
                  Insert into reply <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
