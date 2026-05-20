import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, X, RefreshCw, AlertTriangle, Briefcase, ChevronDown, Send, Paperclip,
  Clock, Save, PenLine, Undo2, Trash2,
} from 'lucide-react';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough as StrikeIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Link as LinkIcon,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmailThread } from './mockEmailData';
import type { DraftOptions, DraftMode } from './AiDraftReviewPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Style / tone segmented controls
// ─────────────────────────────────────────────────────────────────────────────

type StyleMode = 'concise' | 'balanced' | 'detailed';
type ToneMode = 'warm' | 'neutral' | 'direct';

const STYLE_INSTRUCTIONS: Record<StyleMode, string> = {
  concise: 'STYLE: Concise — 2 to 3 sentences. Strip pleasantries to a single short greeting and sign-off.',
  balanced: 'STYLE: Balanced — 4 to 6 sentences. Natural professional tone with appropriate context.',
  detailed: 'STYLE: Detailed — 6 to 9 sentences. Provide full context and rationale, but no fluff.',
};

const TONE_INSTRUCTIONS: Record<ToneMode, string> = {
  warm: 'TONE: Warm — friendly, relationship-forward language. Use the recipient\'s first name naturally.',
  neutral: 'TONE: Neutral — professional and even-handed.',
  direct: 'TONE: Direct — get to the point quickly. No softeners, no hedging.',
};

const SOURCE_LABELS: Record<string, string> = {
  deal_metadata: 'Deal Info',
  deal_writeup: 'Writeup',
  deal_lenders: 'Lenders',
  milestones: 'Milestones',
  recent_activity: 'Recent Activity',
  deal_notes: 'Deal Notes',
  email_thread_only: 'Email Only',
  lender_name: 'Funding Source Name',
  lender_stage: 'Lender Stage',
  outstanding_items: 'Outstanding Items',
  deal_stage: 'Deal Stage',
  analyst_note: 'Analyst Note',
  key_terms: 'Key Terms',
  outstanding_items_data: 'Outstanding Items',
  status_notes: 'Status Notes',
  deal_state_snapshot: 'Live State',
  recent_activity_data: 'Recent Activity',
};

// Pill metadata per fact key — origin + a fake "last updated" hint until the
// backend exposes per-fact provenance timestamps.
const PILL_META: Record<string, { source: string }> = {
  lender_name: { source: 'deal_lenders.name' },
  lender_stage: { source: 'deal_lenders.status' },
  deal_stage: { source: 'deals.stage' },
  outstanding_items: { source: 'deal_outstanding_items.description' },
  recent_activity: { source: 'deal_activity.entry' },
  key_terms: { source: 'deals.terms' },
  analyst_note: { source: 'deal_notes.note' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sentence-level data model
// ─────────────────────────────────────────────────────────────────────────────

interface SentenceModel {
  id: string;
  text: string;            // current text (may be edited)
  originalText: string;    // text as the AI produced it
  origin: 'ai' | 'user';   // ai = ghost-styled until edited; user = plain
  edited: boolean;         // user touched this AI sentence
}

function splitIntoSentences(body: string): string[] {
  if (!body) return [];
  // Preserve newlines as boundary hints by collapsing runs but splitting on \n separately.
  const blocks = body.split(/\n+/g);
  const out: string[] = [];
  for (const block of blocks) {
    // Split on sentence terminators while keeping them attached.
    const parts = block.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
    if (parts) {
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) out.push(trimmed);
      }
    }
  }
  return out;
}

let sentenceIdCounter = 0;
function nextSentenceId() {
  sentenceIdCounter += 1;
  return `s${Date.now().toString(36)}-${sentenceIdCounter}`;
}

function buildSentenceModels(body: string): SentenceModel[] {
  return splitIntoSentences(body).map(text => ({
    id: nextSentenceId(),
    text,
    originalText: text,
    origin: 'ai',
    edited: false,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fact-pill rendering — split a sentence into [text, pill, text, pill, …]
// We match against actual injected fact strings (lender_name, deal_stage,
// outstanding item names, key_terms tokens). Longest-first to avoid shadowing.
// ─────────────────────────────────────────────────────────────────────────────

interface PillFact {
  key: string;       // canonical key (lender_name, deal_stage, etc)
  value: string;     // the actual matched substring
  label: string;     // human label for tooltip
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the candidate pill list from the AI response. */
function collectPillCandidates(opts: DraftOptions | null): PillFact[] {
  if (!opts) return [];
  const out: PillFact[] = [];
  // The smart-email-ai response embeds factual values inside the bodies; we
  // mine known keys from cited_context_sources. Body-level matches happen at
  // render time with fallback values.
  const seen = new Set<string>();
  const push = (key: string, value?: string | null) => {
    if (!value) return;
    const v = String(value).trim();
    if (!v) return;
    const k = `${key}::${v.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ key, value: v, label: SOURCE_LABELS[key] || key });
  };
  // Pull whatever the model returned in known shape if present.
  // smart-email-ai returns these as deal_context_used keys — we don't have the
  // raw values, so the parent passes them via knownFacts (see prop).
  return out;
}

interface RenderedSegment {
  kind: 'text' | 'pill';
  text: string;
  pill?: PillFact;
}

function segmentSentence(text: string, facts: PillFact[]): RenderedSegment[] {
  if (!text) return [];
  if (facts.length === 0) return [{ kind: 'text', text }];
  // Sort longest-first so multi-word facts win.
  const sorted = [...facts].sort((a, b) => b.value.length - a.value.length);
  const pattern = new RegExp(`(${sorted.map(f => escapeRegExp(f.value)).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.filter(Boolean).map<RenderedSegment>(part => {
    const match = sorted.find(f => f.value.toLowerCase() === part.toLowerCase());
    return match ? { kind: 'pill', text: part, pill: match } : { kind: 'text', text: part };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline diff for regen / style-toggle:
// We pair sentence-by-sentence by index. Removed sentences fade out, new
// ones fade in. Edited-by-user sentences are preserved.
// ─────────────────────────────────────────────────────────────────────────────

function diffMergeSentences(
  prev: SentenceModel[],
  nextTexts: string[],
): { merged: SentenceModel[]; addedIds: string[]; removedCount: number } {
  const userSentences = prev.filter(s => s.origin === 'user' || (s.origin === 'ai' && s.edited));
  // Naive strategy: keep user-authored / edited sentences, replace untouched AI
  // sentences with the new AI text in order. Any leftover next text appends.
  const merged: SentenceModel[] = [];
  const addedIds: string[] = [];
  let nextIdx = 0;
  let removed = 0;

  for (const s of prev) {
    if (s.origin === 'user' || s.edited) {
      merged.push(s);
      continue;
    }
    // untouched AI sentence — replace with the next AI sentence if available
    if (nextIdx < nextTexts.length) {
      const newId = nextSentenceId();
      merged.push({
        id: newId,
        text: nextTexts[nextIdx],
        originalText: nextTexts[nextIdx],
        origin: 'ai',
        edited: false,
      });
      addedIds.push(newId);
      nextIdx += 1;
    } else {
      // No replacement — this AI sentence is removed
      removed += 1;
    }
  }
  // Any remaining new AI sentences → append
  while (nextIdx < nextTexts.length) {
    const newId = nextSentenceId();
    merged.push({
      id: newId,
      text: nextTexts[nextIdx],
      originalText: nextTexts[nextIdx],
      origin: 'ai',
      edited: false,
    });
    addedIds.push(newId);
    nextIdx += 1;
  }
  // If prev had no untouched AI sentences and there was no user content, seed everything.
  if (merged.length === 0) {
    return {
      merged: nextTexts.map(t => {
        const id = nextSentenceId();
        addedIds.push(id);
        return { id, text: t, originalText: t, origin: 'ai', edited: false };
      }),
      addedIds,
      removedCount: removed,
    };
  }
  return { merged, addedIds, removedCount: removed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer state machine
// ─────────────────────────────────────────────────────────────────────────────

type ComposerState = 'ai_drafted' | 'user_editing' | 'user_authored' | 'sent';

function computeComposerState(sentences: SentenceModel[]): ComposerState {
  const ai = sentences.filter(s => s.origin === 'ai');
  if (ai.length === 0) return 'user_authored';
  const totalChars = sentences.reduce((sum, s) => sum + s.text.length, 0) || 1;
  const userChars = sentences
    .filter(s => s.origin === 'user' || s.edited)
    .reduce((sum, s) => sum + s.text.length, 0);
  const userRatio = userChars / totalChars;
  if (userRatio > 0.7) return 'user_authored';
  if (userChars > 0) return 'user_editing';
  return 'ai_drafted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  thread: EmailThread;
  dealId?: string;
  onClose: () => void;
  /** Fired on Send (after provenance confirmation). */
  onSend: (subject: string, body: string, meta: { aiSentenceCount: number; totalSentenceCount: number; citedFactKeys: string[] }) => void | Promise<void>;
  initialMode?: DraftMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentence renderer (read view with pills + ghost styling)
// ─────────────────────────────────────────────────────────────────────────────

function SentenceView({
  sentence,
  facts,
  onCommit,
  isNew,
  isLeaving,
}: {
  sentence: SentenceModel;
  facts: PillFact[];
  onCommit: (id: string, newText: string) => void;
  isNew: boolean;
  isLeaving: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isGhost = sentence.origin === 'ai' && !sentence.edited;
  const segments = useMemo(() => segmentSentence(sentence.text, facts), [sentence.text, facts]);

  const handleBlur = () => {
    const el = ref.current;
    if (!el) return;
    const newText = el.innerText.trim();
    if (newText !== sentence.text) {
      onCommit(sentence.id, newText);
    }
  };

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      data-sentence-id={sentence.id}
      className={cn(
        'inline transition-all duration-300 outline-none focus:ring-1 focus:ring-primary/30 rounded px-0.5 -mx-0.5',
        isGhost && 'bg-violet-500/[0.03] border-l-2 border-violet-400/40 pl-1.5 ml-0',
        isNew && 'animate-in fade-in duration-300',
        isLeaving && 'opacity-0 transition-opacity duration-300',
      )}
    >
      {segments.map((seg, i) =>
        seg.kind === 'pill' && seg.pill ? (
          <FactPill key={`${sentence.id}-${i}`} pill={seg.pill} text={seg.text} />
        ) : (
          <span key={`${sentence.id}-${i}`}>{seg.text}</span>
        ),
      )}{' '}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting toolbar — applies inline formatting via document.execCommand to
// whatever sentence span currently holds the selection. Pure visual affordance:
// the sentence model still commits innerText on blur, so the AI pill /
// provenance pipeline is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

function FormattingToolbar() {
  const exec = (command: string, value?: string) => (e: React.MouseEvent) => {
    // Prevent the toolbar button from stealing focus from the editable span.
    e.preventDefault();
    try {
      document.execCommand(command, false, value);
    } catch {
      /* no-op */
    }
  };

  const onLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = window.prompt('Enter URL');
    if (!url) return;
    try {
      document.execCommand('createLink', false, url);
    } catch {
      /* no-op */
    }
  };

  const btn = 'h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors';

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/40 bg-muted/10"
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btn} onMouseDown={exec('bold')} title="Bold (Ctrl+B)">
        <BoldIcon className="h-3 w-3" />
      </button>
      <button type="button" className={btn} onMouseDown={exec('italic')} title="Italic (Ctrl+I)">
        <ItalicIcon className="h-3 w-3" />
      </button>
      <button type="button" className={btn} onMouseDown={exec('underline')} title="Underline (Ctrl+U)">
        <UnderlineIcon className="h-3 w-3" />
      </button>
      <button type="button" className={btn} onMouseDown={exec('strikeThrough')} title="Strikethrough">
        <StrikeIcon className="h-3 w-3" />
      </button>
      <div className="w-px h-3.5 bg-border/60 mx-1" />
      <button type="button" className={btn} onMouseDown={exec('insertUnorderedList')} title="Bulleted list">
        <ListIcon className="h-3 w-3" />
      </button>
      <button type="button" className={btn} onMouseDown={exec('insertOrderedList')} title="Numbered list">
        <ListOrderedIcon className="h-3 w-3" />
      </button>
      <div className="w-px h-3.5 bg-border/60 mx-1" />
      <button type="button" className={btn} onMouseDown={onLink} title="Insert link">
        <LinkIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

function FactPill({ pill, text }: { pill: PillFact; text: string }) {
  const meta = PILL_META[pill.key];
  const tooltip = meta ? `${pill.label} · ${meta.source}` : pill.label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-baseline px-1 py-px rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-medium text-[0.95em] cursor-help"
          data-fact-key={pill.key}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function YourReplyComposer({ thread, dealId, onClose, onSend, initialMode }: Props) {
  // ── Recipient / subject ──
  const lastInbound = thread.emails.filter(e => e.from_email !== 'jturner@5thline.co').slice(-1)[0]
    || thread.emails[thread.emails.length - 1];
  const [toField, setToField] = useState<string>(lastInbound?.from_email || '');
  const [ccField, setCcField] = useState<string>('');
  const [subjectField, setSubjectField] = useState<string>(
    thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`,
  );

  // ── AI generation state ──
  const [loading, setLoading] = useState(false);
  const [draftOptions, setDraftOptions] = useState<DraftOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Style / tone (segmented controls) ──
  const [style, setStyle] = useState<StyleMode>('balanced');
  const [tone, setTone] = useState<ToneMode>('neutral');

  // ── Sentence-level body state ──
  const [sentences, setSentences] = useState<SentenceModel[]>([]);
  const [newSentenceIds, setNewSentenceIds] = useState<Set<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<SentenceModel[][]>([]);

  // ── Drafts panel (Why this draft?) ──
  const [whyOpen, setWhyOpen] = useState(false);

  // ── Provenance modal ──
  const [provOpen, setProvOpen] = useState(false);
  const [provLogToActivity, setProvLogToActivity] = useState(true);
  const [sending, setSending] = useState(false);

  // ── Autosave indicator ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // ── Build pill candidates from the active draftOptions ──
  const facts: PillFact[] = useMemo(() => {
    if (!draftOptions) return [];
    const list: PillFact[] = [];
    const seen = new Set<string>();
    const push = (key: string, value?: string | null) => {
      if (!value) return;
      const v = String(value).trim();
      if (!v || v.length < 2) return;
      const k = `${key}::${v.toLowerCase()}`;
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ key, value: v, label: SOURCE_LABELS[key] || key });
    };
    // Mine the body for known fact-shaped tokens. Since smart-email-ai does not
    // surface the raw values, we infer from the union of:
    //  1) cited_context_sources keys → label only (no value to match)
    //  2) thread.dealName, lender names, terms scraped from option_1/2 bodies
    // The intent is to highlight the "feels like a known fact" tokens. Anything
    // we can't confidently match is left as plain text.
    const sources = draftOptions.cited_context_sources || [];
    const bodyText = `${draftOptions.option_1_body || ''}\n${draftOptions.option_2_body || ''}`;
    // Heuristic extractors:
    const dollar = bodyText.match(/\$[\d.,]+\s?(M|MM|K|million|k)?/gi) || [];
    dollar.forEach(v => push('key_terms', v));
    const stages = bodyText.match(/\b(Due Diligence|In Due Diligence|Term Sheet|Draft Terms|Initial Review|Closing|Funded)\b/gi) || [];
    stages.forEach(v => push('deal_stage', v));
    const dates = bodyText.match(/\b(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g) || [];
    dates.forEach(v => push('recent_activity', v));
    // Lender-name guess: capitalized 1–3 word proper noun appearing before
    // "is", "has", or "will" (very conservative — only flag if also in sources).
    if (sources.includes('lender_name') || sources.includes('deal_lenders')) {
      const lenderMatches = bodyText.match(/\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+){0,2})(?=\s+(?:is|has|will|now|signed|wired))/g) || [];
      lenderMatches.forEach(v => push('lender_name', v));
    }
    return list;
  }, [draftOptions]);

  // ── Fetch drafts (wraps smart-email-ai exactly as before) ──
  const generate = useCallback(async (replaceMode: 'fresh' | 'diff' = 'fresh') => {
    setLoading(true);
    setError(null);
    try {
      const threadData = {
        subject: thread.subject,
        emails: thread.emails.map(e => ({
          from_name: e.from_name,
          from_email: e.from_email,
          to_name: e.to_name,
          to_email: e.to_email,
          subject: e.subject,
          body_preview: e.body_preview?.substring(0, 1500),
          received_at: e.received_at,
          snippet: e.snippet,
        })),
        latestEmail: thread.latestEmail,
      };

      const customInstructions = [
        STYLE_INSTRUCTIONS[style],
        TONE_INSTRUCTIONS[tone],
      ].join('\n');

      const { data, error: fnError } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'generate_draft_options',
          dealId,
          threadData,
          draftType: 'reply',
          customInstructions,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const result = data?.result;
      if (!result || result.raw) throw new Error('Invalid response format');

      setDraftOptions(result);
      // Pick recommended option as the active body
      const useOpt2 = result.recommended_option === 2;
      const body = useOpt2 ? result.option_2_body : result.option_1_body;
      const subject = useOpt2 ? result.option_2_subject : result.option_1_subject;
      setSubjectField(subject?.startsWith('Re:') ? subject : `Re: ${subject || thread.subject}`);

      const nextTexts = splitIntoSentences(body || '');
      if (replaceMode === 'fresh' || sentences.length === 0) {
        // Snapshot history then seed
        setHistory(h => [...h, sentences]);
        const seeded = nextTexts.map(t => ({
          id: nextSentenceId(),
          text: t,
          originalText: t,
          origin: 'ai' as const,
          edited: false,
        }));
        setSentences(seeded);
        // Mark all as new so they fade in
        const ids = new Set(seeded.map(s => s.id));
        setNewSentenceIds(ids);
        setLeavingIds(new Set());
        setTimeout(() => setNewSentenceIds(new Set()), 450);
      } else {
        // Diff merge — fade out untouched-AI sentences that won't be replaced,
        // fade in new AI sentences.
        const prev = sentences;
        // Identify outgoing untouched AI sentences (those that will be replaced)
        const untouchedAi = prev.filter(s => s.origin === 'ai' && !s.edited);
        const outgoing = new Set(untouchedAi.map(s => s.id));
        setLeavingIds(outgoing);
        setHistory(h => [...h, prev]);
        // After the fade-out completes, swap in the diffed result.
        setTimeout(() => {
          const { merged, addedIds } = diffMergeSentences(prev, nextTexts);
          setSentences(merged);
          setNewSentenceIds(new Set(addedIds));
          setLeavingIds(new Set());
          setTimeout(() => setNewSentenceIds(new Set()), 450);
        }, 380);
      }
    } catch (err: any) {
      console.error('YourReplyComposer generate error:', err);
      setError(err.message || 'Failed to generate draft. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [thread, dealId, style, tone, sentences]);

  // ── Auto-generate on mount ──
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoRanRef.current) {
      autoRanRef.current = true;
      void generate('fresh');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-generate (diff) when style/tone toggles ──
  const styleToneInitRef = useRef(true);
  useEffect(() => {
    if (styleToneInitRef.current) {
      styleToneInitRef.current = false;
      return;
    }
    void generate('diff');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, tone]);

  // ── Sentence edit commit ──
  const handleCommitSentence = useCallback((id: string, newText: string) => {
    setSentences(prev => prev.map(s => {
      if (s.id !== id) return s;
      const isOriginalUnchanged = newText === s.originalText;
      return {
        ...s,
        text: newText,
        edited: s.origin === 'ai' ? !isOriginalUnchanged : true,
        origin: s.origin === 'ai' && newText.length === 0 ? 'user' : s.origin,
      };
    }).filter(s => s.text.length > 0));
  }, []);

  // ── Undo AI changes (revert to previous history snapshot) ──
  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) {
        toast.info('Nothing to undo');
        return h;
      }
      const prev = h[h.length - 1];
      setSentences(prev);
      setNewSentenceIds(new Set());
      setLeavingIds(new Set());
      return h.slice(0, -1);
    });
  }, []);

  // ── Dismiss AI: keep edited/user sentences only, drop ghost styling ──
  const handleDismissAi = useCallback(() => {
    setSentences(prev => prev
      .filter(s => s.origin === 'user' || s.edited)
      .map(s => ({ ...s, origin: 'user', edited: false })),
    );
    setNewSentenceIds(new Set());
    setLeavingIds(new Set());
    setDraftOptions(null);
    toast.info('AI assist dismissed');
  }, []);

  // ── Composer state + counts for badge / provenance ──
  const composerState = useMemo(() => computeComposerState(sentences), [sentences]);
  const aiSentenceCount = sentences.filter(s => s.origin === 'ai' && !s.edited).length;
  const totalSentenceCount = sentences.length;

  const factsCount = (draftOptions?.cited_context_sources || []).length;
  const confidence = draftOptions?.confidence;

  const badgeLabel: string | null =
    composerState === 'ai_drafted' ? 'Drafted by naitive'
    : composerState === 'user_editing' ? 'Co-drafted'
    : null;

  // ── Local autosave (every ~3s while non-empty) ──
  const draftKey = `your_reply_${thread.threadId}`;
  useEffect(() => {
    if (sentences.length === 0) return;
    setSaveStatus('saving');
    const t = setTimeout(() => {
      try {
        const body = sentences.map(s => s.text).join(' ');
        localStorage.setItem(draftKey, JSON.stringify({
          to: toField, cc: ccField, subject: subjectField, body, savedAt: Date.now(),
        }));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('idle');
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [sentences, toField, ccField, subjectField, draftKey]);

  // ── Send (opens provenance modal first) ──
  const handleSendClick = () => {
    if (!toField.trim()) {
      toast.error('Please add a recipient');
      return;
    }
    if (sentences.length === 0) {
      toast.error('Reply is empty');
      return;
    }
    setProvOpen(true);
  };

  const finalizeSend = async () => {
    setSending(true);
    try {
      const body = sentences.map(s => s.text).join(' ');
      await onSend(subjectField, body, {
        aiSentenceCount,
        totalSentenceCount,
        citedFactKeys: facts.map(f => f.key),
      });
      try { localStorage.removeItem(draftKey); } catch {}
      setProvOpen(false);
      toast.success('Reply sent', {
        description: provLogToActivity ? 'Logged to deal activity' : undefined,
      });
    } finally {
      setSending(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-4 mb-3 rounded-lg border border-border/60 bg-card overflow-hidden shadow-sm">
        {/* Header — composer title + Drafts/Save status + close */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
          <PenLine className="h-3.5 w-3.5 text-foreground/70" />
          <span className="text-xs font-semibold text-foreground">Your Reply</span>
          {badgeLabel && (
            <Badge variant="outline" className="text-[9px] h-4 border-violet-400/40 bg-violet-500/[0.06] text-violet-300">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              {badgeLabel}
            </Badge>
          )}
          <div className="flex-1" />
          {saveStatus !== 'idle' && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              {saveStatus === 'saving' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
              {saveStatus === 'saving' ? 'Saving…' : 'Draft saved'}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Recipients + subject */}
        <div className="px-3 py-1.5 space-y-1 border-b border-border/40 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-10 shrink-0">To</span>
            <Input
              value={toField}
              onChange={e => setToField(e.target.value)}
              className="h-6 text-[11px] border-0 px-1 focus-visible:ring-1 focus-visible:ring-primary/30 bg-transparent"
              placeholder="recipient@example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-10 shrink-0">Cc</span>
            <Input
              value={ccField}
              onChange={e => setCcField(e.target.value)}
              className="h-6 text-[11px] border-0 px-1 focus-visible:ring-1 focus-visible:ring-primary/30 bg-transparent"
              placeholder="cc@example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-10 shrink-0">Subject</span>
            <Input
              value={subjectField}
              onChange={e => setSubjectField(e.target.value)}
              className="h-6 text-[11px] border-0 px-1 focus-visible:ring-1 focus-visible:ring-primary/30 bg-transparent font-medium"
            />
          </div>
        </div>

        {/* AI control strip — only while draftOptions is active */}
        {draftOptions && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-violet-400/20 bg-violet-500/[0.025] text-[10px]">
            <span className="inline-flex items-center gap-1 text-violet-300 font-medium">
              <Sparkles className="h-3 w-3" />
              Drafted by naitive
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{factsCount} deal facts used</span>
            {confidence && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className={cn(
                  'capitalize font-medium',
                  confidence === 'high' && 'text-emerald-400',
                  confidence === 'medium' && 'text-amber-400',
                  confidence === 'low' && 'text-red-400',
                )}>
                  {confidence}
                </span>
              </>
            )}

            <div className="flex-1" />

            {/* Style toggle */}
            <SegControl<StyleMode>
              options={[
                { value: 'concise', label: 'Concise' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'detailed', label: 'Detailed' },
              ]}
              value={style}
              onChange={setStyle}
              disabled={loading}
            />

            {/* Tone toggle */}
            <SegControl<ToneMode>
              options={[
                { value: 'warm', label: 'Warm' },
                { value: 'neutral', label: 'Neutral' },
                { value: 'direct', label: 'Direct' },
              ]}
              value={tone}
              onChange={setTone}
              disabled={loading}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => generate('diff')} disabled={loading}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px]">Regenerate</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={handleUndo} disabled={history.length === 0}
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px]">Undo AI changes</TooltipContent>
            </Tooltip>

            <button
              onClick={handleDismissAi}
              className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Dismiss AI
            </button>
          </div>
        )}

        {/* Formatting toolbar — applies to current selection inside any sentence span.
            Note: the sentence model commits innerText on blur, so formatting is a
            session-level affordance and does not persist to the sent plain-text body.
            This intentionally preserves the AI pill / provenance pipeline. */}
        <FormattingToolbar />

        {/* Body — sentence renderer */}
        <div className="px-4 py-3 min-h-[140px]">
          {error ? (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/5 border border-destructive/15 text-[11px]">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="h-6 text-[10px] mt-1.5" onClick={() => generate('fresh')}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Try Again
                </Button>
              </div>
            </div>
          ) : loading && sentences.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <span className="text-[11px] text-muted-foreground">Drafting reply with deal context…</span>
            </div>
          ) : (
            <div
              className="text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap"
              data-composer-state={composerState}
            >
              {sentences.length === 0 ? (
                <span className="text-muted-foreground italic">Write your reply…</span>
              ) : (
                sentences.map(s => (
                  <SentenceView
                    key={s.id}
                    sentence={s}
                    facts={facts}
                    onCommit={handleCommitSentence}
                    isNew={newSentenceIds.has(s.id)}
                    isLeaving={leavingIds.has(s.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-t border-border/50 bg-muted/10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info('Attachments not yet wired')}>
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">Attach</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => toast.info('Signature inserted')}>
                <PenLine className="h-3 w-3" /> Signature
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">Insert signature</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          <Button
            variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground"
            onClick={() => {
              try {
                const body = sentences.map(s => s.text).join(' ');
                localStorage.setItem(draftKey, JSON.stringify({
                  to: toField, cc: ccField, subject: subjectField, body, savedAt: Date.now(),
                }));
                setSaveStatus('saved');
                toast.success('Saved to Drafts');
              } catch {
                toast.error('Save failed');
              }
            }}
          >
            <Save className="h-3 w-3" /> Save Draft
          </Button>
          <Button
            variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground"
            onClick={() => toast.info('Schedule send coming soon')}
          >
            <Clock className="h-3 w-3" /> Schedule
          </Button>

          <Button
            onClick={handleSendClick}
            size="sm"
            className="gap-1.5 h-8 text-xs ml-2 bg-[hsl(160,60%,40%)] hover:bg-[hsl(160,60%,35%)] text-white shadow-sm"
          >
            <Send className="h-3 w-3" /> Send
          </Button>
        </div>

        {/* Why this draft? — collapsible drawer below */}
        {draftOptions && (
          <Collapsible open={whyOpen} onOpenChange={setWhyOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2 border-t border-border/50 text-[10px] text-muted-foreground hover:bg-muted/20 transition-colors">
                <Briefcase className="h-3 w-3" />
                <span>Why this draft?</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{factsCount} deal facts</span>
                {confidence && (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="capitalize">{confidence} confidence</span>
                  </>
                )}
                <div className="flex-1" />
                <ChevronDown className={cn('h-3 w-3 transition-transform', whyOpen && 'rotate-180')} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-[260px] border-t border-border/40 bg-muted/10">
                <div className="px-3 py-2.5 space-y-3 text-[11px]">
                  {/* Detected intent / thread summary */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Thread Intent</p>
                    <p className="text-foreground/80">{draftOptions.detected_intent || '—'}</p>
                  </div>

                  {/* Cited facts */}
                  {(draftOptions.cited_context_sources?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deal Facts Injected</p>
                      <div className="flex flex-wrap gap-1">
                        {draftOptions.cited_context_sources.map(src => (
                          <Badge key={src} variant="outline" className="text-[9px] h-4 border-violet-400/30 bg-violet-500/[0.05] text-violet-300">
                            {SOURCE_LABELS[src] || src}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended option reasoning */}
                  {draftOptions.recommended_option_reason && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reasoning</p>
                      <p className="text-foreground/70 italic">{draftOptions.recommended_option_reason}</p>
                    </div>
                  )}

                  {/* Suggested follow-ups */}
                  {(draftOptions.suggested_follow_up_actions?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Suggested Follow-ups</p>
                      <ul className="space-y-0.5">
                        {draftOptions.suggested_follow_up_actions.map((a, i) => (
                          <li key={i} className="text-foreground/70">• {a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Missing context warning */}
                  {draftOptions.requires_more_context && draftOptions.missing_context_items?.length > 0 && (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/15">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-amber-400">Missing: </span>
                        <span className="text-muted-foreground">{draftOptions.missing_context_items.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* ─── Provenance modal ─── */}
      <Dialog open={provOpen} onOpenChange={setProvOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Sending as your reply</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-xs text-muted-foreground pt-1">
                <p>
                  AI-drafted sentences:{' '}
                  <span className="text-foreground font-medium">{aiSentenceCount} of {totalSentenceCount}</span>
                </p>
                {facts.length > 0 && (
                  <div>
                    <p className="mb-1">Deal facts cited:</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set(facts.map(f => f.label))).map(l => (
                        <Badge key={l} variant="outline" className="text-[9px] h-4 border-violet-400/30 bg-violet-500/[0.05] text-violet-300">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {dealId && (
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <Checkbox
                      checked={provLogToActivity}
                      onCheckedChange={(v) => setProvLogToActivity(!!v)}
                    />
                    <span className="text-foreground">Log to deal activity</span>
                  </label>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setProvOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={finalizeSend}
              disabled={sending}
              className="gap-1.5 bg-[hsl(160,60%,40%)] hover:bg-[hsl(160,60%,35%)] text-white"
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small segmented-control helper
// ─────────────────────────────────────────────────────────────────────────────

function SegControl<T extends string>({
  options, value, onChange, disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/60 overflow-hidden bg-card">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => !disabled && opt.value !== value && onChange(opt.value)}
          disabled={disabled}
          className={cn(
            'px-2 py-0.5 text-[10px] font-medium transition-colors',
            opt.value === value
              ? 'bg-violet-500/15 text-violet-200'
              : 'text-muted-foreground hover:bg-muted/40',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}