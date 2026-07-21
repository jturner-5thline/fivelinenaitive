import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, RefreshCw, Sparkles, X, ChevronDown, ChevronRight, History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useAdminAgentKnowledgeTest,
  type KnowledgeTestQuestionResult,
  type KnowledgeTestRun,
} from '@/hooks/useAdminAgentKnowledgeTest';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string | null;
  hasReadyDocs: boolean;
}

export function KnowledgeTestDialog({ open, onOpenChange, companyId, hasReadyDocs }: Props) {
  const { run, isRunning, latestRun, setLatestRun, history, historyLoading } =
    useAdminAgentKnowledgeTest(companyId);
  const [viewingRun, setViewingRun] = useState<KnowledgeTestRun | null>(null);

  // When dialog opens, default to the most recent persisted run if we don't
  // already have one in memory from this session.
  useEffect(() => {
    if (!open) return;
    if (latestRun || viewingRun) return;
    if (history.length > 0) setViewingRun(history[0]);
  }, [open, latestRun, viewingRun, history]);

  const currentRun = latestRun ?? viewingRun;

  async function handleRun() {
    setViewingRun(null);
    await run();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Knowledge Test
          </DialogTitle>
          <DialogDescription className="text-xs">
            Auto-generates questions from your uploaded documents, asks the agent through the same
            retrieval path it uses in production, and grades whether the answer cites the right
            passage.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
          <Button size="sm" onClick={handleRun} disabled={isRunning || !companyId || !hasReadyDocs}>
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Running…
              </>
            ) : currentRun ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Re-run
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Run Knowledge Test
              </>
            )}
          </Button>
          {!hasReadyDocs && (
            <span className="text-[11px] text-muted-foreground">
              Upload at least one document to run a test.
            </span>
          )}
          {isRunning && (
            <span className="text-[11px] text-muted-foreground">
              Generating questions, retrieving passages, and grading — this takes ~30–60 seconds.
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0">
          <div className="grid grid-cols-[1fr_180px] gap-3 h-full min-h-0">
            {/* ── Scorecard ─────────────────────────────────────── */}
            <div className="h-full min-h-0 overflow-y-auto pr-2">
              {isRunning && !currentRun ? (
                <RunningPlaceholder />
              ) : currentRun ? (
                <Scorecard run={currentRun} />
              ) : (
                <EmptyState hasReadyDocs={hasReadyDocs} />
              )}
            </div>

            {/* ── History ───────────────────────────────────────── */}
            <div className="border-l border-border/50 pl-3 flex flex-col min-h-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <History className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recent runs
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {historyLoading ? (
                  <p className="text-[11px] text-muted-foreground italic">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">No prior runs.</p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((r) => {
                      const isActive = currentRun?.id === r.id;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setLatestRun(null);
                              setViewingRun(r);
                            }}
                            className={`w-full text-left rounded-md border px-2 py-1.5 transition-colors ${
                              isActive
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/50 bg-card/40 hover:bg-card'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-medium tabular-nums">
                                {r.score}/{r.total}
                              </span>
                              <ScoreBadge score={r.score} total={r.total} small />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(new Date(r.created_at), 'MMM d, h:mma')}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunningPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs font-medium">Running knowledge test…</p>
      <p className="text-[11px] text-muted-foreground max-w-sm">
        Generating questions from your docs, asking the agent through the production retrieval
        path, then grading each answer against the source passage.
      </p>
    </div>
  );
}

function EmptyState({ hasReadyDocs }: { hasReadyDocs: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-1.5">
      <Sparkles className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs font-medium">No knowledge test yet.</p>
      <p className="text-[11px] text-muted-foreground max-w-sm">
        {hasReadyDocs
          ? 'Click "Run Knowledge Test" to verify the agent has truly digested every uploaded document.'
          : 'Upload documents to the Knowledge Base first, then run a test.'}
      </p>
    </div>
  );
}

function ScoreBadge({ score, total, small }: { score: number; total: number; small?: boolean }) {
  const pct = total > 0 ? score / total : 0;
  const tone =
    pct >= 0.8
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : pct >= 0.5
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-red-500/15 text-red-300 border-red-500/30';
  return (
    <Badge
      variant="outline"
      className={`${tone} ${small ? 'text-[9px] px-1 py-0 h-4' : 'text-[10px] py-0.5'}`}
    >
      {Math.round(pct * 100)}%
    </Badge>
  );
}

function Scorecard({ run }: { run: KnowledgeTestRun }) {
  const passed = useMemo(() => run.results.filter((r) => r.grade.pass).length, [run.results]);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/60 bg-card/40 p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overall score</p>
          <p className="text-lg font-semibold tabular-nums">
            {passed}/{run.total} correct
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {format(new Date(run.created_at), "MMM d, yyyy 'at' h:mma")}
            {run.tag_filter.length > 0 ? ` · scoped to tags: ${run.tag_filter.join(', ')}` : ' · all documents'}
          </p>
        </div>
        <ScoreBadge score={passed} total={run.total} />
      </div>

      <ul className="space-y-2">
        {run.results.map((r, idx) => (
          <QuestionRow key={`${r.expected_doc_id}-${idx}`} r={r} index={idx + 1} />
        ))}
      </ul>
    </div>
  );
}

function QuestionRow({ r, index }: { r: KnowledgeTestQuestionResult; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-card/60 transition-colors"
      >
        <span
          className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0 ${
            r.grade.pass
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-red-500/15 text-red-300'
          }`}
          aria-label={r.grade.pass ? 'pass' : 'fail'}
        >
          {r.grade.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-snug">
            <span className="text-muted-foreground mr-1">Q{index}.</span>
            {r.question}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge
              variant="outline"
              className={`text-[9px] py-0 h-4 ${
                r.grade.retrieval_hit
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30'
              }`}
            >
              retrieval {r.grade.retrieval_hit ? 'hit' : 'miss'}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[9px] py-0 h-4 ${
                r.grade.answer_hit
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30'
              }`}
            >
              answer {r.grade.answer_hit ? 'correct' : 'incorrect'}
            </Badge>
            <span className="text-[10px] text-muted-foreground truncate">
              expected: {r.expected_doc_title}
            </span>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/40 bg-background/40 p-2.5 space-y-2">
          <Section label="Agent's answer">
            <p className="text-[11px] leading-snug whitespace-pre-wrap">{r.answer || <em>(no answer)</em>}</p>
          </Section>
          <Separator className="opacity-40" />
          <Section label="Expected source">
            <p className="text-[11px] text-muted-foreground italic">{r.expected_doc_title}</p>
            <blockquote className="text-[11px] leading-snug mt-1 border-l-2 border-primary/40 pl-2 text-foreground/80">
              {r.expected_snippet}
            </blockquote>
          </Section>
          <Separator className="opacity-40" />
          <Section label="Retrieved passages">
            {r.retrieved.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">Nothing retrieved.</p>
            ) : (
              <ol className="space-y-1">
                {r.retrieved.map((c, i) => {
                  const matches = c.doc_id === r.expected_doc_id;
                  return (
                    <li key={c.chunk_id || i} className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                      <span className={matches ? 'text-emerald-300' : 'text-foreground/80'}>
                        {c.title}
                      </span>
                      {matches && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 h-4 bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        >
                          expected
                        </Badge>
                      )}
                      <span className="text-muted-foreground text-[10px] tabular-nums ml-auto">
                        sim {c.similarity.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
          <Separator className="opacity-40" />
          <Section label="Grader">
            <p className="text-[11px] text-muted-foreground leading-snug">{r.grade.reason}</p>
          </Section>
        </div>
      )}
    </li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      {children}
    </div>
  );
}