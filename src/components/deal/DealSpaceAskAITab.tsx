import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Loader2, Bot, User, History, X, Filter, ChevronDown, Info, FileText, Mail, Settings2, Database, Save, FileBarChart, Clock } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { useDealSpaceConversations } from '@/hooks/useDealSpaceConversations';
import { useDealSpaceDocuments, type DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { useDealSpaceFinancials } from '@/hooks/useDealSpaceFinancials';
import { useDealAiInstructions } from '@/hooks/useDealAiInstructions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DealSpaceConversationHistory } from './DealSpaceConversationHistory';
import { DealSpaceDocumentPreview } from './DealSpaceDocumentPreview';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DraftSubmissionEmailsModal, type EmailDraft, type LenderContactOption, draftBodyToPlainText } from './email/DraftSubmissionEmailsModal';
import { AskAiActionBar, extractAskAiActions, type AskAiAction } from './AskAiActionBar';
import { parseCitations, uniqueCitedIds, renderWithCitations, type ParsedCitation } from './AskAiCitations';
import { ReviewExcludeLendersDialog } from './email/ReviewExcludeLendersDialog';
import { BaseSubmissionEmailDialog, type BaseSubmissionDraft } from './email/BaseSubmissionEmailDialog';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { PostCallFollowupModal } from './PostCallFollowupModal';
import { CheckInOutstandingItemsModal } from './CheckInOutstandingItemsModal';
import { ClientCheckInDraftModal } from './ClientCheckInDraftModal';
import { useDealClientCadence } from '@/hooks/useDealClientCadence';
import {
  fetchLenderProfilesForDeal,
  renderLenderProfileBlock,
  type LenderProfileSnapshot,
} from './email/lenderPersonalization';
import { downloadUrlAsFile } from '@/lib/downloadFile';

interface DealSpaceAskAITabProps {
  dealId: string;
}

type DocumentScope = 'all' | 'financial' | 'transcripts' | 'custom';

const SCOPE_LABELS: Record<DocumentScope, string> = {
  all: 'All Sources',
  financial: 'Financial Model Only',
  transcripts: 'Transcripts Only',
  custom: 'Custom',
};

// Source citation chip component
//
// ───────────────────────────────────────────────────────────────────────────
// Financial-figure highlighting
//
// Detects monetary amounts, percentages, and common finance shorthand
// (e.g. $12.5M, 8.25%, 3.2x, 1.4B EBITDA) inside any rendered text node and
// wraps each match in a styled span with a tooltip. The tooltip surfaces the
// citation excerpt for the figure — currently the list of source documents
// the AI used to compose this message, since the deal-space-ai edge function
// returns sources at the message level rather than per-claim. This is a pure
// presentational enhancement: it never mutates `msg.content`.
// ───────────────────────────────────────────────────────────────────────────
const FINANCIAL_REGEX =
  /(\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[KMB]|million|billion|thousand)?\b|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]*(?:\.\d+)?x\b|\d[\d,]*(?:\.\d+)?\s?(?:bps|basis points))/gi;

function HighlightedFinancials({
  text,
  sources,
}: {
  text: string;
  sources?: string[];
}) {
  if (!text) return <>{text}</>;
  const parts: Array<string | { match: string; key: number }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  // Re-create the regex per call so we get a fresh `lastIndex`.
  const re = new RegExp(FINANCIAL_REGEX.source, FINANCIAL_REGEX.flags);
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ match: m[0], key: key++ });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.every((p) => typeof p === 'string')) return <>{text}</>;

  const excerpt = sources && sources.length > 0
    ? sources.slice(0, 4).join(' · ')
    : 'Source not specified';

  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <span key={`t-${i}`}>{p}</span>;
        return (
          <Tooltip key={`f-${p.key}`} delayDuration={150}>
            <TooltipTrigger asChild>
              <mark
                className="cursor-help rounded-sm bg-amber-400/20 px-0.5 py-px text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-400/30 transition-colors"
              >
                {p.match}
              </mark>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[280px] text-[11px] leading-relaxed"
            >
              <div className="font-medium text-foreground/90 mb-0.5">Cited source</div>
              <div className="text-muted-foreground break-words">{excerpt}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

function highlightChildren(
  children: React.ReactNode,
  sources?: string[],
  onCitationClick?: (c: ParsedCitation) => void,
): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child !== 'string') return child;
    // 1) split out citation tokens into chips; 2) wrap remaining text in
    //    HighlightedFinancials so financial figures still get tooltips.
    const { nodes } = renderWithCitations(child, onCitationClick);
    return (
      <React.Fragment key={idx}>
        {nodes.map((n, i) =>
          typeof n === 'string' ? (
            <HighlightedFinancials key={`f-${i}`} text={n} sources={sources} />
          ) : (
            <React.Fragment key={`c-${i}`}>{n}</React.Fragment>
          ),
        )}
      </React.Fragment>
    );
  });
}

//
// Each citation string returned by the deal-space-ai edge function is the
// `name` of an underlying source. Document sources match a row in
// `useDealSpaceDocuments`; when they do, we render the badge as a clickable
// button that opens the same preview dialog used in the Documents tab so the
// user can read the exact passage the AI cited. Non-document sources
// (Deal Record, Lenders, Milestones, …) stay as static badges.
function SourceCitations({
  sources,
  documents,
  onOpenDocument,
  messageContent,
}: {
  sources?: string[];
  documents: DealSpaceDocument[];
  onOpenDocument: (doc: DealSpaceDocument) => void;
  messageContent?: string;
}) {
  const considered = sources?.length ?? 0;
  const citedIds = messageContent ? uniqueCitedIds(messageContent) : new Set<string>();
  const cited = citedIds.size;
  if (considered === 0 && cited === 0) return null;

  // Build a case-insensitive lookup by document name. The edge function
  // pushes `doc.name` directly into sourcesUsed, so an exact (case-folded)
  // match is the canonical way to resolve a citation back to a file.
  const docByName = new Map<string, DealSpaceDocument>();
  for (const d of documents) {
    if (d?.name) docByName.set(d.name.toLowerCase(), d);
  }

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors group">
          <FileText className="h-3 w-3" />
          <span>Cited: {cited} • Considered: {considered}</span>
          <ChevronDown className="h-2.5 w-2.5 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(sources ?? []).map((source, i) => {
            const matched = docByName.get(source.toLowerCase());
            if (matched) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenDocument(matched)}
                  title={`Open ${matched.name} in Deal Space`}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 h-4 text-[9px] font-normal text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors"
                >
                  <FileText className="h-2.5 w-2.5" />
                  <span className="max-w-[160px] truncate">{source}</span>
                </button>
              );
            }
            return (
              <Badge key={i} variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-muted/50 font-normal">
                {source}
              </Badge>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lender-contact enrichment for submission drafts
//
// For each generated draft, look up the matching `master_lenders` record by
// case-insensitive name (RLS scopes by user/company), pull its `lender_contacts`,
// and pre-populate the To field with the primary contact email. Falls back to
// the legacy single `master_lenders.email` column when no per-contact rows exist.
// Drafts whose lender isn't found stay with empty `to` and trigger the
// "no email on file" warning in the modal.
// ─────────────────────────────────────────────────────────────────────────────
async function enrichDraftsWithLenderContacts(drafts: EmailDraft[]): Promise<EmailDraft[]> {
  const names = Array.from(new Set(
    drafts.map((d) => (d.lenderName || '').trim()).filter(Boolean),
  ));
  if (names.length === 0) return drafts;

  // 1) Fetch matching master_lenders by name (case-insensitive). RLS handles scoping.
  let masterRows: Array<{ id: string; name: string; email: string | null }> = [];
  try {
    const { data, error } = await supabase
      .from('master_lenders')
      .select('id, name, email')
      .in('name', names);
    if (error) throw error;
    masterRows = data || [];

    // Case-insensitive fallback: re-fetch any names that did not exact-match.
    const matchedNamesLower = new Set(masterRows.map((r) => r.name.toLowerCase()));
    const unmatched = names.filter((n) => !matchedNamesLower.has(n.toLowerCase()));
    if (unmatched.length > 0) {
      // ilike per name is fine — submission drafts are typically <10 lenders.
      const ilikeResults = await Promise.all(
        unmatched.map((n) =>
          supabase
            .from('master_lenders')
            .select('id, name, email')
            .ilike('name', n)
            .limit(1)
            .maybeSingle()
        ),
      );
      for (const r of ilikeResults) {
        if (r.data) masterRows.push(r.data as { id: string; name: string; email: string | null });
      }
    }
  } catch (err) {
    console.warn('[lender-submission] master_lenders lookup failed:', err);
    return drafts;
  }

  if (masterRows.length === 0) return drafts;

  // 2) Fetch contacts for all matched lender ids in a single round-trip.
  const lenderIds = masterRows.map((r) => r.id);
  const { data: contactRows } = await supabase
    .from('lender_contacts')
    .select('id, lender_id, name, title, email, is_primary')
    .in('lender_id', lenderIds);

  const contactsByLender = new Map<string, Array<LenderContactOption>>();
  for (const c of contactRows || []) {
    if (!c.email || !c.email.trim()) continue;
    const list = contactsByLender.get(c.lender_id) || [];
    list.push({
      id: c.id,
      name: c.name || 'Contact',
      title: c.title,
      email: c.email.trim(),
      isPrimary: !!c.is_primary,
    });
    contactsByLender.set(c.lender_id, list);
  }

  // 3) Build a name → master row lookup (lowercased).
  const masterByName = new Map<string, { id: string; name: string; email: string | null }>();
  for (const r of masterRows) masterByName.set(r.name.toLowerCase(), r);

  // 4) Apply enrichment per draft.
  return drafts.map((d) => {
    const master = masterByName.get((d.lenderName || '').toLowerCase());
    if (!master) return d;

    const contacts = contactsByLender.get(master.id) || [];
    // Sort: primary first, then by name.
    contacts.sort((a, b) => {
      if (!!b.isPrimary !== !!a.isPrimary) return b.isPrimary ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    // Legacy fallback: the master_lenders.email column (no per-contact row).
    const legacyEmail = (master.email || '').trim();
    if (contacts.length === 0 && legacyEmail) {
      contacts.push({
        id: 'legacy',
        name: 'Primary contact',
        email: legacyEmail,
        isPrimary: true,
      });
    }

    const primary = contacts[0];
    return {
      ...d,
      lenderId: master.id,
      availableContacts: contacts,
      selectedContactId: primary?.id ?? null,
      to: primary?.email ?? '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft generation helpers
//
// The submission-draft pipeline used to issue ONE giant AI call that returned
// `{drafts: [...]}` for every selected lender. When the model sometimes
// returned malformed/truncated JSON, the entire batch failed with a generic
// "AI response could not be parsed" toast.
//
// These helpers split the work per-lender, add a hard timeout per call,
// retry once with a stricter "JSON ONLY" reformat instruction on parse
// failure, and surface partial success cleanly back to the UI.
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_CALL_TIMEOUT_MS = 90_000;

/** Wrap a promise with a timeout that rejects with a recognizable error. */
function withTimeout<T>(p: Promise<T>, ms: number, label = 'AI request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Strip code fences and slice to outermost {...} so JSON.parse has a fighting chance. */
function extractDraftJson(raw: string): {
  drafts?: Array<{ lenderName?: string; subject?: string; body?: string; personalizationRationale?: string }>;
} {
  const cleaned = (raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonText = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonText);
}

/** Convert AI plain-text body (\n\n paragraphs) into safe HTML for the editor. */
function plainTextBodyToHtml(plain: string): string {
  const t = (plain || '').trim();
  if (!t) return '';
  return t
    .split(/\n{2,}/)
    .map((para) =>
      `<p>${para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
}

/**
 * Invoke `deal-space-ai` with the given prompt. On parse failure, retry once
 * with a strict "JSON ONLY, no prose, no fences" reminder appended. Throws on
 * transport errors, rate limits, credits, or unparseable responses after the
 * retry.
 */
async function callDraftAI(
  dealId: string,
  prompt: string,
): Promise<ReturnType<typeof extractDraftJson>> {
  const callOnce = async (effectivePrompt: string) => {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('deal-space-ai', {
        body: { messages: [{ role: 'user', content: effectivePrompt }], dealId, scope: 'all' },
      }),
      DRAFT_CALL_TIMEOUT_MS,
      'Draft generation',
    );
    if (error) throw new Error(error.message || 'Failed to draft email');
    if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
    const raw: string = (data as { content?: string })?.content || '';
    return raw;
  };

  let raw = await callOnce(prompt);
  try {
    return extractDraftJson(raw);
  } catch {
    // Reformat retry: keep the same context but bolt on a hard JSON-only
    // reminder. This catches cases where the model wrapped the JSON in prose
    // or accidentally returned a truncated trailing comma.
    const reformatPrompt =
      prompt +
      '\n\nREMINDER: Your previous response could not be parsed as JSON. ' +
      'Respond again with VALID JSON ONLY matching the requested schema. ' +
      'No prose, no markdown code fences, no commentary, no trailing commas.';
    raw = await callOnce(reformatPrompt);
    try {
      return extractDraftJson(raw);
    } catch {
      throw new Error('AI response could not be parsed.');
    }
  }
}

/** Generate a single personalized draft for one lender. */
async function generateOneDraftPersonalized(
  dealId: string,
  lenderName: string,
  profiles: Map<string, LenderProfileSnapshot>,
  buildPrompt: (personalize: boolean, profiles: Map<string, LenderProfileSnapshot>) => string,
): Promise<EmailDraft> {
  // Restrict the embedded profile map + the constraint block to this single
  // lender so the model has the smallest possible JSON to produce.
  const singleProfileMap = new Map<string, LenderProfileSnapshot>();
  const profile = profiles.get(lenderName) || profiles.get(lenderName.toLowerCase());
  if (profile) singleProfileMap.set(lenderName, profile);

  const promptBase = buildPrompt(true, singleProfileMap);
  const constraint =
    `\n\nIMPORTANT — RESTRICTED LENDER LIST:\n` +
    `Generate EXACTLY ONE draft entry, for the following lender (exact match, no others):\n` +
    `- ${lenderName}\n` +
    `Return {"drafts": [ … one entry … ]}.`;

  const parsed = await callDraftAI(dealId, promptBase + constraint);
  const entry = (parsed.drafts || []).find((d) => d && (d.body || d.subject));
  if (!entry) throw new Error('AI returned no draft for this funding source.');

  return {
    lenderName: entry.lenderName?.trim() || lenderName,
    to: '',
    cc: '',
    bcc: '',
    subject: entry.subject?.replace(/^subject:\s*/i, '').trim() || '',
    bodyHtml: plainTextBodyToHtml(entry.body || ''),
    status: 'draft',
    personalizationRationale: (entry.personalizationRationale || '').trim() || undefined,
  } satisfies EmailDraft;
}

/** Generate one neutral broadcast template that will be fanned out to lenders. */
async function generateBroadcastTemplate(
  dealId: string,
  lenders: string[],
  buildPrompt: (personalize: boolean, profiles: Map<string, LenderProfileSnapshot>) => string,
): Promise<EmailDraft> {
  const promptBase = buildPrompt(false, new Map());
  const constraint =
    `\n\nNOTE: This single draft will be sent to the following ${lenders.length} ` +
    `lender${lenders.length === 1 ? '' : 's'} — keep the body neutral enough to broadcast.`;
  const parsed = await callDraftAI(dealId, promptBase + constraint);
  const entry = (parsed.drafts || []).find((d) => d && (d.body || d.subject));
  if (!entry) throw new Error('AI returned no broadcast draft.');
  return {
    lenderName: entry.lenderName?.trim() || 'Lender',
    to: '',
    cc: '',
    bcc: '',
    subject: entry.subject?.replace(/^subject:\s*/i, '').trim() || '',
    bodyHtml: plainTextBodyToHtml(entry.body || ''),
    status: 'draft',
  } satisfies EmailDraft;
}

function DealSpaceAskAITabImpl({ dealId }: DealSpaceAskAITabProps) {
  // ── Deferred-mount optimization ────────────────────────────────────────
  // The Deal Space tab used to fire 6 concurrent Supabase fetches the
  // moment it mounted, which blocked the main thread and froze the modal.
  // We now paint the lightweight chat shell first, then flip `ready` on
  // the next tick so the secondary data hooks (documents, financials,
  // saved AI instructions, client cadence, conversation history) only
  // begin fetching after the first paint.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const deferredDealId = ready ? dealId : undefined;

  const { documents, getDownloadUrl } = useDealSpaceDocuments(deferredDealId);
  const { financials } = useDealSpaceFinancials(deferredDealId);

  const openStatusReport = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('naitive:open-status-report', { detail: { dealId } }),
    );
  }, [dealId]);
  const {
    messages, sendMessage, clearMessages, isLoading: isAILoading,
    setMessages, scope, setScope,
    includeDataRoom, setIncludeDataRoom,
  } = useDealSpaceAI(dealId);
  const { 
    conversations, 
    isLoading: isConversationsLoading,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    loadConversationMessages,
    saveMessage,
    ensureLoaded: ensureConversationsLoaded,
  } = useDealSpaceConversations(dealId);
  // Lazy-load the conversation history once the shell has painted, and
  // again whenever the mobile history drawer is opened.
  useEffect(() => {
    if (ready) ensureConversationsLoaded();
  }, [ready, ensureConversationsLoaded]);
  const {
    instructions: savedInstructions,
    isSaving: isSavingInstructions,
    save: saveInstructions,
  } = useDealAiInstructions(deferredDealId);
  const [draftInstructions, setDraftInstructions] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  useEffect(() => { setDraftInstructions(savedInstructions); }, [savedInstructions]);
  
  const [question, setQuestion] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Inline-citation preview: when the user clicks a source badge that
  // resolves to a Deal Space document, open the same preview dialog the
  // Documents tab uses so they can read the cited passage in context.
  const [citedDoc, setCitedDoc] = useState<DealSpaceDocument | null>(null);
  const handleOpenCitedDocument = useCallback((doc: DealSpaceDocument) => {
    setCitedDoc(doc);
  }, []);
  const handleDownloadCitedDocument = useCallback(async (doc: DealSpaceDocument) => {
    const url = await getDownloadUrl(doc);
    if (url) await downloadUrlAsFile(url, doc.name);
  }, [getDownloadUrl]);

  // Draft Submission runs as a structured product action — fully decoupled from the chat panel.
  const [isDraftingEmail, setIsDraftingEmail] = useState(false);
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  // Progress for the per-lender draft generation pipeline. `null` when no
  // batch is in flight. Surfaces a "Generating drafts for X of Y lenders…"
  // message + failure counter in the modal so the user is never staring at
  // an indefinite spinner.
  const [draftProgress, setDraftProgress] = useState<{
    completed: number;
    total: number;
    failed: number;
  } | null>(null);
  const [isPostCallModalOpen, setIsPostCallModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isClientCheckInOpen, setIsClientCheckInOpen] = useState(false);
  const [cadenceDismissedAt, setCadenceDismissedAt] = useState<string | null>(null);
  // Resolve the deal's primary borrower contact so we can monitor cadence.
  const [dealMeta, setDealMeta] = useState<{ company: string; contact: string; contactEmail: string | null }>({
    company: '', contact: '', contactEmail: null,
  });
  useEffect(() => {
    if (!ready || !dealId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('company, contact, contact_email')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled || !data) return;
      setDealMeta({
        company: data.company || '',
        contact: data.contact || '',
        contactEmail: data.contact_email || null,
      });
    })();
    return () => { cancelled = true; };
  }, [ready, dealId]);
  const cadence = useDealClientCadence(deferredDealId, dealMeta.contactEmail);

  // Names of lenders attached to THIS deal. Used to turn `**Lender Name**`
  // mentions in AI responses into clickable triggers that open the same
  // funding-source modal used on the Funding Sources tab (via a window
  // CustomEvent listened to by DealDetail). Strictly scoped to this deal,
  // so cross-deal lender mentions never become clickable here.
  const [dealLenderNames, setDealLenderNames] = useState<string[]>([]);
  useEffect(() => {
    if (!ready || !dealId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deal_lenders')
        .select('name')
        .eq('deal_id', dealId);
      if (cancelled) return;
      const names = Array.from(
        new Set((data || []).map((r: { name: string | null }) => (r.name || '').trim()).filter(Boolean)),
      );
      setDealLenderNames(names);
    })();
    return () => { cancelled = true; };
  }, [ready, dealId]);
  const lenderNameLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of dealLenderNames) m.set(n.toLowerCase(), n);
    return m;
  }, [dealLenderNames]);
  const openLenderModal = useCallback((name: string) => {
    window.dispatchEvent(
      new CustomEvent('naitive:open-lender', { detail: { name } }),
    );
  }, []);
  const cadenceVisible =
    cadence.isStale &&
    !!dealMeta.contactEmail &&
    cadence.lastContactAt !== cadenceDismissedAt;
  // ── Pre-flight review step: lets the user exclude specific lenders
  // (auto-skipping anyone already passed) before drafts are generated.
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [includedLenderNames, setIncludedLenderNames] = useState<string[] | null>(null);
  // ── Step 1: lender-agnostic base submission email. Owns the editable
  // draft until the user clicks Continue, at which point we persist it to
  // deal_space_notes and hand off to the Review & Exclude step.
  const [isBaseOpen, setIsBaseOpen] = useState(false);
  const [baseDraft, setBaseDraft] = useState<BaseSubmissionDraft | null>(null);
  // Mirror of the latest approved base draft so async callbacks (review
  // confirm timeout, per-lender retry from the drafts modal) always see the
  // user-edited copy instead of a stale render-time closure.
  const baseDraftRef = useRef<BaseSubmissionDraft | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalDocuments = documents.length + financials.length;

  const deduplicatedConversations = useMemo(() => {
    const seen = new Map<string, typeof conversations[0]>();
    for (const conv of conversations) {
      const key = (conv.title || '').trim().toLowerCase();
      if (!seen.has(key) || new Date(conv.updated_at) > new Date(seen.get(key)!.updated_at)) {
        seen.set(key, conv);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [conversations]);

  const lastMessageLen = messages.length > 0 ? (messages[messages.length - 1]?.content?.length ?? 0) : 0;
  useEffect(() => {
    // Anchor to the bottom on send and as streamed tokens arrive, so the
    // newest answer is never visually truncated at the top of the viewport.
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastMessageLen, isAILoading]);

  const handleSendQuestion = useCallback(async (overridePrompt?: string) => {
    const prompt = (typeof overridePrompt === 'string' ? overridePrompt : question).trim();
    if (!prompt) return;

    let conversationId = selectedConversationId;
    if (!conversationId) {
      const newConvo = await createConversation(prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''));
      if (newConvo) {
        conversationId = newConvo.id;
        setSelectedConversationId(conversationId);
      }
    }

    if (conversationId) {
      await saveMessage(conversationId, 'user', prompt);
    }

    sendMessage(prompt);
    setQuestion('');
  }, [question, sendMessage, selectedConversationId, createConversation, saveMessage]);

  const runQuickPrompt = useCallback((prompt: string) => {
    setQuestion(prompt);
    void handleSendQuestion(prompt);
  }, [handleSendQuestion]);

  const onQuickPromptClick = useCallback((prompt: string) => {
    setQuestion(prompt);
    void handleSendQuestion(prompt);
  }, [handleSendQuestion]);

  const openDraftSubmissionModal = useCallback(() => {
    // Step 1 of the new flow: generate a funding source-agnostic base submission
    // email. The user reviews / edits it, then Continue saves to Notes and
    // opens the Review & Exclude step.
    setBaseDraft(null);
    setIsBaseOpen(true);
  }, []);

  const openStatusReportModal = useCallback(() => {
    openStatusReport();
  }, [openStatusReport]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && selectedConversationId && !isAILoading) {
      saveMessage(selectedConversationId, 'assistant', lastMessage.content, lastMessage.sources);
    }
  }, [messages, selectedConversationId, isAILoading, saveMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsHistoryOpen(false);
    
    const loadedMessages = await loadConversationMessages(conversationId);
    const formattedMessages = loadedMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: new Date(m.created_at),
      sources: m.sources as string[] | undefined,
    }));
    setMessages(formattedMessages);
  }, [loadConversationMessages, setMessages]);

  const handleNewConversation = useCallback(() => {
    setSelectedConversationId(null);
    clearMessages();
    setIsHistoryOpen(false);
  }, [clearMessages]);

  /**
   * Build the draft-submission prompt. When `personalize` is true and we
   * have profile data for the requested lenders, the prompt:
   *   - Embeds a per-lender profile block (focus areas, deal-size range,
   *     industry, prior interaction).
   *   - Asks the model to customize the OPENING paragraph to connect the
   *     deal to that lender's stated focus.
   *   - Requires a one-line `personalizationRationale` per draft.
   *
   * When `personalize` is false, exactly ONE generic draft is produced and
   * the caller fans it out to every selected lender.
   */
  const buildDraftSubmissionPrompt = useCallback(
    (
      personalize: boolean,
      profiles: Map<string, LenderProfileSnapshot>,
      base?: BaseSubmissionDraft | null,
    ): string => {
      const personalizationBlock = personalize
        ? `

PERSONALIZATION (REQUIRED WHEN PROFILE DATA IS PROVIDED):
- For EACH lender below, customize the OPENING paragraph to explicitly connect this deal to that lender's stated focus areas (deal types, deal-size range, industry focus). Example: if a funding source focuses on SaaS growth capital $1–10MM, lead the opening with the company's ARR and SaaS positioning.
- Reference prior interaction on this deal when present (e.g. "circling back after our last conversation on <date>").
- Keep the rest of the body close to the template — only the OPENING and any natural transitions are personalized.
- For each draft, also include a "personalizationRationale" field: a single short sentence (max 18 words) explaining what you tailored to. Example: "Tailored to Founderpath's SaaS focus and $1–10MM range."
- If a funding source has no profile data, still output a draft using the generic template and set "personalizationRationale" to "" (empty string).`
        : `

BROADCAST MODE (PERSONALIZATION OFF):
- Produce EXACTLY ONE draft entry. Use lenderName: "All selected lenders". Do NOT generate per-lender variants — the caller fans this single draft out to every recipient.
- Set "personalizationRationale" to "" (empty string).`;

      const profileBlocks: string[] = [];
      if (personalize) {
        for (const p of profiles.values()) {
          const rendered = renderLenderProfileBlock(p);
          if (rendered) profileBlocks.push(rendered);
        }
      }
      const lenderProfilesSection = profileBlocks.length
        ? `\n\nLENDER PROFILES (for personalizing each opening):\n\n${profileBlocks.join('\n\n')}`
        : '';

      const baseTemplateSection = base
        ? `\n\nAPPROVED BASE TEMPLATE — AUTHORITATIVE SOURCE (the user already reviewed and EDITED this funding source-agnostic submission email). You MUST use it VERBATIM as the email body for every lender. IGNORE the EMAIL BODY TEMPLATE section above and DO NOT rewrite, reorder, shorten, paraphrase, or add any new sentences. The ONLY allowed change to the body is:\n  1. Replace the salutation line with "Hi <LENDER FIRST NAME>," (or the institution name if no contact first name is known).\nDo NOT add any lender-fit / qualification / "should align well with your investment criteria" style sentence. Do NOT add an opening line that references the lender's focus areas. Every other paragraph, sentence, attachments line, and sign-off must match the approved base EXACTLY.\nFor the subject line, use the same wording as the approved base subject but insert the funding source institution into the pipe slot if the base subject does not already include one (format: "<COMPANY NAME> | <LENDER INSTITUTION NAME> - New Deal <DEAL AMOUNT>").\n\nAPPROVED BASE SUBJECT:\n${base.subject}\n\nAPPROVED BASE BODY (use verbatim, only swap the salutation):\n${htmlToPlainText(base.bodyHtml)}\n`
        : '';

      return `You are drafting lender submission emails for this deal.${personalize ? ' Generate ONE email PER ACTIVE LENDER on this deal.' : ''}

Return your response as STRICT, VALID JSON (no markdown fences, no commentary) matching this exact shape:

{
  "drafts": [
    {
      "lenderName": "<full lender institution name>",
      "subject": "<COMPANY NAME> | <LENDER INSTITUTION NAME> - New Deal <DEAL AMOUNT>",
      "body": "<the full email body, plain text with \\n\\n between paragraphs>",
      "personalizationRationale": "<one short sentence explaining what was tailored, or empty string>"
    }
  ]
}

EMAIL BODY TEMPLATE (fill in bracketed fields using deal data):

Hi [LENDER FIRST NAME],

There's a deal we're working on I wanted to send your way:

[COMPANY NAME] is [one-paragraph company overview using the deal write-up description, memo narrative, pitch deck content, or call notes].

The Company is seeking [DEAL SIZE] to [USE OF FUNDS from the deal write-up].

I've attached the credit file [include the data_room_url as a hyperlink if available]. Inside, you'll find a Deal Overview summarizing the company and the transaction ask along with the financials & supporting information.

Let us know your initial thoughts or feedback!

Thank you,

CRITICAL RULES:
- Output VALID JSON ONLY. No prose before/after. No markdown code fences.
- ${personalize ? 'Generate one entry in "drafts" for EACH active lender on this deal.' : 'Generate EXACTLY ONE draft entry — do not produce per-lender variants.'}
- LENDER FIRST NAME = the first name of the contact person for that lender. If only the institution name is available, use the institution name.
- LENDER INSTITUTION NAME = the full lender institution/company name (used in the subject line).
- COMPANY NAME = the deal's company name.
- DEAL AMOUNT/DEAL SIZE = use abbreviated currency: $6MM, $1.5MM, $500K, $2B (K=thousands, MM=millions, B=billions).
- Do NOT include any (Source:...) citations or source references.
- Use \\n\\n between paragraphs in the body for readability.
- The "subject" field must NOT include a "Subject:" prefix — just the line itself.${personalizationBlock}${lenderProfilesSection}${baseTemplateSection}`;
    },
    [],
  );

  // Entry point for the funding source submission flow. We now ALWAYS open the
  // base-email step first; the user can edit that draft, then we save it
  // to Notes and open Review & Exclude before per-lender drafts run.
  const handleDraftSubmission = useCallback(async () => {
    baseDraftRef.current = null;
    setBaseDraft(null);
    setIsBaseOpen(true);
  }, []);

  // Silent background handler — invokes the AI directly via the edge function,
  // bypassing the chat hook entirely. The Ask AI panel is never touched.
  // `onlyLenders` (when provided) restricts which lenders the AI drafts for,
  // and `personalize` toggles per-lender opening customization.
  const generateDraftsForLenders = useCallback(async (
    onlyLenders: string[],
    personalize: boolean,
    base?: BaseSubmissionDraft | null,
  ) => {
    setIsDraftingEmail(true);
    setEmailDrafts([]);
    setActiveDraftIndex(0);
    setIsDraftDialogOpen(true);
    setDraftProgress({ completed: 0, total: onlyLenders.length, failed: 0 });
    try {
      // Pre-fetch lender profiles so we can embed them directly in the prompt
      // (instead of the model guessing). Profiles are scoped to the workspace
      // via RLS on master_lenders / deal_lenders.
      const profiles = personalize
        ? await fetchLenderProfilesForDeal(dealId, onlyLenders)
        : new Map<string, LenderProfileSnapshot>();

      // ── Per-lender pipeline ───────────────────────────────────────────
      // We run one AI call per funding source (small concurrent batches) instead of
      // one giant batched JSON response. This way:
      //   • One malformed reply only kills that lender, not the whole run.
      //   • The user sees partial successes immediately as drafts stream in.
      //   • Each call has its own timeout + retry/reformat fallback.
      // For broadcast mode we still issue one AI call and fan out the
      // resulting template across the selected lenders.
      let filteredDrafts: EmailDraft[];

      // When the user already approved a base draft, we ALWAYS skip the AI
      // and fan that exact copy out — both in broadcast mode AND in
      // "personalize per lender" mode. This:
      //   • Preserves the rich-text/HTML body verbatim, including hyperlinks,
      //     bold/italic/underline, lists, and paragraph structure.
      //   • Prevents the model from injecting an auto-generated lender-fit
      //     sentence (e.g. "…should align well with your investment criteria.")
      //     into the body — that behavior was a regression and is no longer
      //     wanted for any lender.
      // Per-lender contact info / salutation is still personalized downstream
      // when the draft is enriched with lender contacts.
      if (base) {
        const template: EmailDraft = {
          lenderName: 'All selected lenders',
          to: '', cc: '', bcc: '',
          subject: base.subject,
          bodyHtml: base.bodyHtml,
          status: 'draft',
        };
        filteredDrafts = onlyLenders.map((name) => ({
          ...template,
          lenderName: name,
          subject: template.subject.includes('|')
            ? template.subject.replace(/\|[^|]+(?= -|$)/, `| ${name}`)
            : template.subject,
          personalizationRationale: undefined,
        }));
        setDraftProgress({ completed: onlyLenders.length, total: onlyLenders.length, failed: 0 });
      } else if (!personalize) {
        // When the user already approved a funding source-agnostic base draft we
        // skip the AI entirely and fan that exact copy out (preserves edits).
        const template: EmailDraft = await generateBroadcastTemplate(dealId, onlyLenders, buildDraftSubmissionPrompt);
        filteredDrafts = onlyLenders.map((name) => ({
          ...template,
          lenderName: name,
          subject: template.subject.includes('|')
            ? template.subject.replace(/\|[^|]+(?= -|$)/, `| ${name}`)
            : template.subject,
          personalizationRationale: undefined,
        }));
        setDraftProgress({ completed: onlyLenders.length, total: onlyLenders.length, failed: 0 });
      } else {
        // Personalized: per-lender concurrent generation with progress updates.
        const collected: EmailDraft[] = new Array(onlyLenders.length);
        let completed = 0;
        let failed = 0;
        const CONCURRENCY = 3;
        let cursor = 0;

        const worker = async () => {
          while (cursor < onlyLenders.length) {
            const idx = cursor++;
            const name = onlyLenders[idx];
            try {
              const draft = await generateOneDraftPersonalized(
                dealId,
                name,
                profiles,
                (p, prof) => buildDraftSubmissionPrompt(p, prof, base ?? null),
              );
              collected[idx] = draft;
            } catch (e) {
              failed += 1;
              const message = e instanceof Error ? e.message : 'Draft generation failed';
              // Surface the failure as a placeholder draft so the user can
              // see exactly which lender broke and retry it from the modal.
              collected[idx] = {
                lenderName: name,
                to: '',
                cc: '',
                bcc: '',
                subject: '',
                bodyHtml: '',
                status: 'failed',
                errorMessage: message,
              } satisfies EmailDraft;
            } finally {
              completed += 1;
              setDraftProgress({ completed, total: onlyLenders.length, failed });
              // Stream visible drafts in as soon as they arrive — keep them
              // in the original lender order to match the pager.
              setEmailDrafts(collected.filter(Boolean) as EmailDraft[]);
            }
          }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, onlyLenders.length) }, worker);
        await Promise.all(workers);

        const successful = collected.filter((d) => d && d.status !== 'failed') as EmailDraft[];
        if (successful.length === 0) {
          throw new Error(
            `Drafts could not be generated for any of the ${onlyLenders.length} selected lenders. Please retry.`,
          );
        }
        if (failed > 0) {
          toast({
            title: 'Some drafts failed',
            description: `${successful.length} draft${successful.length === 1 ? '' : 's'} ready · ${failed} failed. Retry them individually from the dialog.`,
          });
        }
        filteredDrafts = collected.filter(Boolean) as EmailDraft[];
      }

      // Enrich only the actionable drafts with lender contacts. Failed
      // placeholders are passed through untouched so the user still sees
      // the funding source + error in the pager.
      const successfulOnly = filteredDrafts.filter((d) => d.status !== 'failed');
      const failedPlaceholders = filteredDrafts.filter((d) => d.status === 'failed');
      const enriched = await enrichDraftsWithLenderContacts(successfulOnly);
      // Preserve original lender ordering when merging back.
      const enrichedByName = new Map(enriched.map((d) => [d.lenderName.toLowerCase(), d]));
      const merged = filteredDrafts.map((d) =>
        d.status === 'failed' ? d : enrichedByName.get(d.lenderName.toLowerCase()) || d,
      );
      setEmailDrafts(merged);
      void failedPlaceholders;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to draft submission email';
      const lower = rawMessage.toLowerCase();
      const isTimeout =
        lower.includes('timeout') ||
        lower.includes('timed out') ||
        lower.includes('deadline') ||
        lower.includes('aborted') ||
        lower.includes('504');
      const isRateLimited = lower.includes('rate limit') || lower.includes('429');
      const isAiCredits = lower.includes('credits') || lower.includes('402');

      if (isTimeout) {
        toast({
          title: 'Draft generation timed out',
          description: 'Please try again.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Retry" onClick={() => { void handleDraftSubmission(); }}>
              Retry
            </ToastAction>
          ),
        });
      } else if (isRateLimited) {
        toast({ title: 'Too many requests', description: 'Please wait a moment and try again.', variant: 'destructive' });
      } else if (isAiCredits) {
        toast({ title: 'AI credits exhausted', description: 'Add credits to continue drafting.', variant: 'destructive' });
      } else {
        toast({
          title: 'Draft failed',
          description: rawMessage,
          variant: 'destructive',
          action: (
            <ToastAction altText="Retry" onClick={() => { void handleDraftSubmission(); }}>
              Retry
            </ToastAction>
          ),
        });
      }
      // Keep the dialog open if we already streamed at least one draft —
      // the user shouldn't lose partial work or have to reselect lenders.
      setEmailDrafts((prev) => {
        if (prev.length === 0) setIsDraftDialogOpen(false);
        return prev;
      });
    } finally {
      setIsDraftingEmail(false);
      setDraftProgress(null);
    }
  }, [dealId, buildDraftSubmissionPrompt]);

  // Native in-app send via the connected email account (Nylas-backed).
  // No mailto:, no external clients — the request is fully handled inside the platform.
  const sendDraftAtIndex = useCallback(async (index: number) => {
    const draft = emailDrafts[index];
    if (!draft) return;
    const recipient = (draft.to || '').trim();
    if (!recipient) {
      setEmailDrafts((prev) => prev.map((d, i) => (
        i === index ? { ...d, status: 'failed', errorMessage: 'Add a recipient email address before sending.' } : d
      )));
      return;
    }
    if (!draft.subject?.trim() || !draft.bodyHtml?.trim()) {
      setEmailDrafts((prev) => prev.map((d, i) => (
        i === index ? { ...d, status: 'failed', errorMessage: 'Subject and body are required.' } : d
      )));
      return;
    }

    const splitEmails = (s: string) =>
      (s || '').split(',').map((x) => x.trim()).filter(Boolean);

    setEmailDrafts((prev) => prev.map((d, i) => (
      i === index ? { ...d, status: 'sending', errorMessage: undefined } : d
    )));

    try {
      const plainTextFallback = draftBodyToPlainText(draft.bodyHtml);

      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: [recipient],
          cc: splitEmails(draft.cc),
          bcc: splitEmails(draft.bcc),
          subject: draft.subject,
          body: plainTextFallback,
          body_html: draft.bodyHtml,
          deal_id: dealId,
        },
      });
      if (error) throw new Error(error.message || 'Send failed');
      if (data?.error) throw new Error(data.error);

      setEmailDrafts((prev) => prev.map((d, i) => (
        i === index ? { ...d, status: 'sent', errorMessage: undefined } : d
      )));
      toast({ title: 'Email sent', description: `Sent to ${draft.lenderName}` });

      // Log to deal activity timeline so the recipient + lender are auditable.
      // Fire-and-forget — never block UX on logging failures.
      void supabase.from('activity_logs').insert({
        deal_id: dealId,
        activity_type: 'email_sent',
        description: `Sent submission email to ${draft.lenderName} (${recipient}): "${draft.subject}"`,
        metadata: {
          source: 'naitive_lender_submission',
          lender_name: draft.lenderName,
          lender_id: draft.lenderId ?? null,
          contact_id: draft.selectedContactId ?? null,
          to_email: recipient,
          cc: splitEmails(draft.cc),
          bcc: splitEmails(draft.bcc),
          subject: draft.subject,
          sent_at: new Date().toISOString(),
        },
      }).then(({ error: logErr }) => {
        if (logErr) console.warn('[lender-submission] activity log failed:', logErr.message);
      });

      // Auto-advance to next unsent draft, staying inside the modal.
      setActiveDraftIndex((curr) => {
        if (curr !== index) return curr;
        const next = emailDrafts.findIndex((d, i) => i > index && d.status !== 'sent');
        return next === -1 ? curr : next;
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to send email';
      const lower = rawMessage.toLowerCase();
      const isGmailMissing =
        lower.includes('gmail') ||
        lower.includes('not connected') ||
        lower.includes('no email account') ||
        lower.includes('grant_id') ||
        lower.includes('nylas') ||
        lower.includes('reauthorize') ||
        lower.includes('connect your');
      const friendly = isGmailMissing ? 'Connect your Gmail to draft emails' : rawMessage;
      setEmailDrafts((prev) => prev.map((d, i) => (
        i === index ? { ...d, status: 'failed', errorMessage: friendly } : d
      )));
      if (isGmailMissing) {
        toast({
          title: 'Gmail not connected',
          description: 'Connect your Gmail to draft and send lender emails.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Open integrations" onClick={() => { window.location.href = '/integrations'; }}>
              Connect Gmail
            </ToastAction>
          ),
        });
      } else {
        toast({ title: 'Send failed', description: rawMessage, variant: 'destructive' });
      }
    }
  }, [emailDrafts]);


  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ask AI
            </CardTitle>
            <CardDescription>
              Ask questions about this deal's data, documents, and activity
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {totalDocuments > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalDocuments} file{totalDocuments !== 1 ? 's' : ''}
              </Badge>
            )}
            {/* Mobile-only toggle: on desktop the conversations panel is
                always visible, so the explicit open/close button is hidden. */}
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => {
                const next = !isHistoryOpen;
                setIsHistoryOpen(next);
                if (next) ensureConversationsLoaded();
              }}
            >
              <History className="h-4 w-4 mr-2" />
              Previous conversations
            </Button>
          </div>
        </div>
        {/* Active scope indicator */}
        {scope !== 'all' && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] gap-1 bg-primary/5 border-primary/20 text-primary">
              <Filter className="h-3 w-3" />
              Scope: {SCOPE_LABELS[scope]}
            </Badge>
            <button
              onClick={() => setScope('all')}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset to All
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex gap-4 overflow-hidden">
        {/* Conversation History Sidebar — persistent on desktop/tablet,
            collapsible on mobile via the header toggle. Previous
            conversations are core navigation, not optional chrome. */}
        <div
          className={cn(
            'w-64 flex-shrink-0 border-r pr-4 flex flex-col min-h-0',
            'md:block',
            isHistoryOpen ? 'block' : 'hidden',
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Conversations</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 md:hidden"
              onClick={() => setIsHistoryOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DealSpaceConversationHistory
              conversations={deduplicatedConversations}
              isLoading={isConversationsLoading}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={deleteConversation}
              onUpdateTitle={updateConversationTitle}
            />
          </div>

          {/* Bottom utility area: source scope, custom instructions, and the
              Data Room context toggle. Moved out of the chat header so the
              main Ask AI panel stays focused on the active conversation. */}
          <div className="mt-3 pt-3 border-t space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {SCOPE_LABELS[scope]}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs">Source Scope</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as DocumentScope)}>
                  <DropdownMenuRadioItem value="all" className="text-xs">
                    All Sources
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="financial" className="text-xs">
                    Financial Model Only ({financials.length})
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="transcripts" className="text-xs">
                    Transcripts Only
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover open={instructionsOpen} onOpenChange={setInstructionsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'w-full justify-start gap-1.5 text-xs',
                    savedInstructions && 'border-primary/40 text-primary',
                  )}
                  title="Custom AI instructions for this deal"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Instructions
                  {savedInstructions ? <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-primary" /> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[380px]" align="start" side="right">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Custom AI instructions</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pre-pended to every AI request on this deal. Use it for formatting templates, lender-specific guidance, or context the AI should always remember.
                    </p>
                  </div>
                  <Textarea
                    value={draftInstructions}
                    onChange={(e) => setDraftInstructions(e.target.value)}
                    placeholder="e.g. Always format financial outputs for TriplePoint Capital's template. This is a senior secured ABL deal."
                    rows={6}
                    className="text-xs"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => { setDraftInstructions(''); saveInstructions(''); }}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      disabled={isSavingInstructions || !savedInstructions}
                    >
                      Clear
                    </button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const ok = await saveInstructions(draftInstructions);
                        if (ok) setInstructionsOpen(false);
                      }}
                      disabled={isSavingInstructions || draftInstructions === savedInstructions}
                      className="gap-1.5"
                    >
                      {isSavingInstructions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div
              className="flex items-center gap-1.5 px-2 h-8 rounded-md border bg-background"
              title="When on, files in the Data Room are included as context for AI answers."
            >
              <Database className={cn('h-3.5 w-3.5', includeDataRoom ? 'text-primary' : 'text-muted-foreground')} />
              <Label htmlFor="data-room-toggle" className="text-[11px] font-medium cursor-pointer flex-1">
                Data Room
              </Label>
              <Switch
                id="data-room-toggle"
                checked={includeDataRoom}
                onCheckedChange={setIncludeDataRoom}
                className="scale-75 -mr-1"
              />
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <ScrollArea className="flex-1 mb-4">
            {cadenceVisible && (
              <div className="mb-3 mr-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
                <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground">
                    No contact with{' '}
                    <span className="font-medium">
                      {dealMeta.contact || dealMeta.company || 'the client'}
                    </span>
                    {dealMeta.company && dealMeta.contact ? ` (${dealMeta.company})` : ''} on{' '}
                    <span className="font-medium">{dealMeta.company || 'this deal'}</span> in{' '}
                    <span className="font-medium">{cadence.daysSince}</span> day
                    {cadence.daysSince === 1 ? '' : 's'}. Want to send a check-in?
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" className="h-7 gap-1" onClick={() => setIsClientCheckInOpen(true)}>
                      <Mail className="h-3.5 w-3.5" /> Draft check-in
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-muted-foreground"
                      onClick={() => setCadenceDismissedAt(cadence.lastContactAt)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-2">
                  {totalDocuments === 0 
                    ? "Ask about lender statuses, notes, deal activity, and more"
                    : "Ask questions about your deal data and documents"
                  }
                </p>
                {totalDocuments === 0 && (
                  <p className="text-[11px] text-muted-foreground/60 mb-4 max-w-xs">
                    No documents uploaded yet — but Ask AI can still analyze deal details, lender statuses, notes, outstanding items, and activity logs.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground/60 mb-4 max-w-xs">
                  Tip: ask relationship or history questions (e.g. "Have we worked with this sponsor before?" or "What's our history with this lender?") and Ask AI will expand the search across all deals, contacts, and activity.
                </p>
                <div className="space-y-2 w-full max-w-sm">
                  <button
                    type="button"
                    disabled={isDraftingEmail}
                    onClick={openDraftSubmissionModal}
                    className="w-full text-left text-sm p-3 rounded-lg transition-colors flex items-center gap-2.5 disabled:opacity-50 bg-primary/10 hover:bg-primary/20 border border-primary/20 font-medium text-primary"
                  >
                    {isDraftingEmail
                      ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                      : <Mail className="h-4 w-4 flex-shrink-0" />}
                    {isDraftingEmail ? 'Drafting submission email…' : 'Draft Submission Email'}
                  </button>

                  <button
                    type="button"
                    onClick={openStatusReportModal}
                    className="w-full text-left text-sm p-3 rounded-lg transition-colors flex items-center gap-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 font-medium text-primary"
                  >
                    <FileBarChart className="h-4 w-4 flex-shrink-0" />
                    Generate Status Report
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPostCallModalOpen(true)}
                    className="w-full text-left text-sm p-3 rounded-lg transition-colors flex items-center gap-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 font-medium text-primary"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    Post-Call Follow-Up Emails
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCheckInModalOpen(true)}
                    className="w-full text-left text-sm p-3 rounded-lg transition-colors flex items-center gap-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 font-medium text-primary"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    Check in with client on outstanding items
                  </button>

                </div>
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg p-3",
                        msg.role === 'user' 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        (() => {
                          const { cleanContent, actions } = extractAskAiActions(msg.content);
                          const handleAction = (a: AskAiAction) => {
                            if (a.type === 'draft_email' || a.type === 'send_followup') {
                              openDraftSubmissionModal();
                              return;
                            }
                            if (a.type === 'ask_followup') {
                              const q = a.params.q || a.params.question || a.label;
                              if (q) sendMessage(q);
                              return;
                            }
                            // Other intents surface via toast with payload preview
                            // until dedicated confirmation modals are wired up.
                            const TITLES: Record<string, string> = {
                              create_task: 'Create task',
                              add_outstanding_item: 'Add outstanding item',
                              request_document: 'Request document',
                              update_status: 'Update deal status',
                              schedule_task: 'Schedule meeting',
                            };
                            const payloadStr = Object.entries(a.params)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ');
                            toast({
                              title: TITLES[a.type] ?? a.label,
                              description: payloadStr || a.label,
                            });
                          };
                          const onCitationClick = (c: ParsedCitation) => {
                            if (c.kind === 'doc') {
                              const doc = documents.find((d) => d.id === c.id);
                              if (doc) { handleOpenCitedDocument(doc); return; }
                            }
                            const KIND_LABEL: Record<string, string> = {
                              doc: 'Document', tx: 'Transcript', note: 'Note',
                              email: 'Email', field: 'Field', lender: 'Lender',
                            };
                            toast({
                              title: `${KIND_LABEL[c.kind] ?? 'Source'} citation`,
                              description: `${c.id}${c.anchor ? ` · ${c.anchor}` : ''}`,
                            });
                          };
                          return (
                        <>
                          <TooltipProvider delayDuration={150}>
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  // Highlight financial figures inside any
                                  // text-bearing block. We walk children and
                                  // replace bare strings with the highlighter
                                  // so nested markdown (bold/italic/links)
                                  // continues to render normally.
                                  p: ({ children }) => (
                                    <p>{highlightChildren(children, msg.sources, onCitationClick)}</p>
                                  ),
                                  li: ({ children }) => (
                                    <li>{highlightChildren(children, msg.sources, onCitationClick)}</li>
                                  ),
                                  strong: ({ children }) => (
                                    (() => {
                                      // If the bolded text matches a lender
                                      // attached to THIS deal, render it as a
                                      // clickable trigger that opens the same
                                      // funding-source modal used on the
                                      // Funding Sources tab. Otherwise fall
                                      // back to a normal <strong>.
                                      const flat = React.Children.toArray(children)
                                        .map((c) => (typeof c === 'string' ? c : ''))
                                        .join('')
                                        .trim();
                                      const matched = flat
                                        ? lenderNameLookup.get(flat.toLowerCase())
                                        : undefined;
                                      if (matched) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => openLenderModal(matched)}
                                            title={`Open ${matched}`}
                                            className="font-semibold text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80 hover:decoration-solid transition-colors"
                                          >
                                            {matched}
                                          </button>
                                        );
                                      }
                                      return (
                                        <strong>{highlightChildren(children, msg.sources, onCitationClick)}</strong>
                                      );
                                    })()
                                  ),
                                  em: ({ children }) => (
                                    <em>{highlightChildren(children, msg.sources, onCitationClick)}</em>
                                  ),
                                }}
                              >
                                {cleanContent}
                              </ReactMarkdown>
                            </div>
                          </TooltipProvider>
                          <SourceCitations
                            sources={msg.sources}
                            documents={documents}
                            onOpenDocument={handleOpenCitedDocument}
                            messageContent={cleanContent}
                          />
                          <AskAiActionBar actions={actions} onAction={handleAction} disabled={isAILoading} />
                        </>
                          );
                        })()
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isAILoading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Analyzing deal data…</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-2 items-end">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this deal..."
              disabled={isAILoading}
              rows={1}
              className="flex-1 min-h-9 max-h-40 resize-none"
            />
            <Button
              onClick={() => handleSendQuestion()}
              disabled={!question.trim() || isAILoading}
            >
              {isAILoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Draft Submission Email — multi-lender review modal (kept entirely separate from chat). */}
      <DraftSubmissionEmailsModal
        open={isDraftDialogOpen}
        onOpenChange={setIsDraftDialogOpen}
        isGenerating={isDraftingEmail}
        progress={draftProgress}
        drafts={emailDrafts}
        setDrafts={setEmailDrafts}
        activeIndex={activeDraftIndex}
        setActiveIndex={setActiveDraftIndex}
        onSend={sendDraftAtIndex}
        onRegenerate={async (index) => {
          const target = emailDrafts[index];
          if (!target) return;
          const lenderName = target.lenderName;
          setEmailDrafts((prev) => prev.map((d, i) =>
            i === index ? { ...d, status: 'sending', errorMessage: undefined } : d,
          ));
          try {
            const profiles = await fetchLenderProfilesForDeal(dealId, [lenderName]);
            const fresh = await generateOneDraftPersonalized(
              dealId,
              lenderName,
              profiles,
              (p, prof) => buildDraftSubmissionPrompt(p, prof, baseDraftRef.current),
            );
            const [enriched] = await enrichDraftsWithLenderContacts([fresh]);
            setEmailDrafts((prev) => prev.map((d, i) => (i === index ? enriched : d)));
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Draft regeneration failed';
            setEmailDrafts((prev) => prev.map((d, i) =>
              i === index ? { ...d, status: 'failed', errorMessage: msg } : d,
            ));
            toast({ title: 'Draft retry failed', description: msg, variant: 'destructive' });
          }
        }}
      />

      {/* Review & Exclude — gates the draft modal so the user can drop
          lenders (auto-skipping anyone already passed) and the round is
          recorded on the deal activity timeline before any AI work runs. */}
      <ReviewExcludeLendersDialog
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        dealId={dealId}
        onConfirm={(names, personalize) => {
          setIncludedLenderNames(names);
          // Defer one tick so the review dialog fully closes before the
          // drafts dialog mounts (avoids overlapping aria-modal layers).
          setTimeout(
            () => generateDraftsForLenders(names, personalize, baseDraftRef.current),
            50,
          );
        }}
      />

      {/* Step 1 — lender-agnostic base submission email. The user edits
          it, then Continue persists it to the deal's Notes and opens the
          Review & Exclude lenders step. */}
      <BaseSubmissionEmailDialog
        open={isBaseOpen}
        onOpenChange={setIsBaseOpen}
        dealId={dealId}
        dealName={dealMeta.company || null}
        generate={async () => {
          // Build an explicitly lender-agnostic prompt: reuse the broadcast
          // path (single draft, no per-lender variants) and instruct the
          // model to use a neutral salutation and zero lender-specific
          // references — the funding source-specific personalization happens later.
          const base = buildDraftSubmissionPrompt(false, new Map(), null);
          const constraint =
            `\n\nBASE EMAIL MODE (LENDER-AGNOSTIC):\n` +
            `- Produce EXACTLY ONE draft entry. Set lenderName to "Base submission email".\n` +
            `- The salutation MUST be exactly: "Hi [Name],"\n` +
            `- Do NOT mention any specific lender, institution name, or lender focus area.\n` +
            `- The subject must read: "<COMPANY NAME> - New Deal <DEAL AMOUNT>" (no lender token, no pipe).\n` +
            `- Keep the body as a reusable submission template for this deal.`;
          const parsed = await callDraftAI(dealId, base + constraint);
          const entry = (parsed.drafts || []).find((d) => d && (d.body || d.subject));
          if (!entry) throw new Error('AI returned no base draft.');
          return {
            subject: (entry.subject || '').replace(/^subject:\s*/i, '').trim(),
            bodyHtml: plainTextBodyToHtml(entry.body || ''),
          };
        }}
        onContinue={(base) => {
          baseDraftRef.current = base;
          setBaseDraft(base);
          // Defer a tick so the base dialog fully closes before Review opens.
          setTimeout(() => setIsReviewOpen(true), 50);
        }}
      />

      {/* Cited-source preview — opened by clicking an inline citation
          badge that matches a Deal Space document by name. */}
      <DealSpaceDocumentPreview
        document={citedDoc}
        isOpen={citedDoc !== null}
        onClose={() => setCitedDoc(null)}
        onDownload={handleDownloadCitedDocument}
      />

      <PostCallFollowupModal
        open={isPostCallModalOpen}
        onOpenChange={setIsPostCallModalOpen}
        dealId={dealId}
      />

      <CheckInOutstandingItemsModal
        open={isCheckInModalOpen}
        onOpenChange={setIsCheckInModalOpen}
        dealId={dealId}
      />

      <ClientCheckInDraftModal
        open={isClientCheckInOpen}
        onOpenChange={setIsClientCheckInOpen}
        dealId={dealId}
        dealName={dealMeta.company || 'your deal'}
        contactName={dealMeta.contact}
        contactEmail={dealMeta.contactEmail || ''}
        onSent={() => { cadence.refresh(); setCadenceDismissedAt(cadence.lastContactAt); }}
      />
    </Card>
  );
}

export const DealSpaceAskAITab = React.memo(DealSpaceAskAITabImpl);
