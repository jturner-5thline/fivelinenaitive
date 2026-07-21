import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUp, Plus, Clock, Copy, Check, ThumbsUp, ThumbsDown, HelpCircle, RefreshCw, WifiOff, Wand2, ChevronDown, ChevronRight, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { AgentRunCard } from '@/components/copilot/AgentRunCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import naitiveFavicon from '@/assets/naitive-favicon.png';
import { CopilotActionConfirm } from '@/components/copilot/CopilotActionConfirm';
import { CopilotNameCollisionCard } from '@/components/copilot/CopilotNameCollisionCard';
import { CopilotDealFuzzyConfirmCard } from '@/components/copilot/CopilotDealFuzzyConfirmCard';
import { CopilotDealFuzzySuggestionsCard } from '@/components/copilot/CopilotDealFuzzySuggestionsCard';
import { CopilotDisambiguationOptionsCard, parseCopilotDisambiguationMessage } from '@/components/copilot/CopilotDisambiguationOptionsCard';
import { CopilotApprovalGroup } from '@/components/copilot/CopilotApprovalGroup';
import { DealAiSettingsPopover } from '@/components/copilot/DealAiSettingsPopover';
import { useDealCopilotMemory } from '@/hooks/useDealCopilotMemory';
import { CopilotAutoExecuted } from '@/components/copilot/CopilotAutoExecuted';
import { CopilotEmailDraft } from '@/components/copilot/CopilotEmailDraft';
import { CopilotDealCard } from '@/components/copilot/CopilotDealCard';
import { CopilotLenderCard } from '@/components/copilot/CopilotLenderCard';
import { CopilotTaskCard } from '@/components/copilot/CopilotTaskCard';
import { CopilotPipelineSummary } from '@/components/copilot/CopilotPipelineSummary';
import { SettingsMutationCard } from '@/components/copilot/SettingsMutationCard';
import { CopilotProactiveNudge } from '@/components/copilot/CopilotProactiveNudge';
import { CopilotCorrectionPopover } from '@/components/copilot/CopilotCorrectionPopover';
import { CopilotDemoConversation } from '@/components/copilot/CopilotDemoConversation';
import { CopilotWorkspacePane, type WorkspaceItem, type WorkspaceItemType } from '@/components/copilot/CopilotWorkspacePane';
import { useProactiveNudges } from '@/hooks/useProactiveNudges';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatAIResponse, getStageDisplayName } from '@/lib/copilot-utils';
import { cleanupCopilotResponse } from '@/lib/copilotResponseCleanup';
import type { ConversationMutation } from '@/lib/copilot-utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { logUsage } from '@/lib/usageLogger';
import { useCopilotChatScope, serializeScope } from '@/lib/copilotChatScope';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { matchDemoScript } from '@/lib/ai/demoScripts';
import { detectDealFilterHints } from '@/lib/detectDealFilterHints';

const COPILOT_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`;

/**
 * Per-session preference for the global Ask naitive AI scope. When the
 * user explicitly clicks "Switch to Pipeline" from the breadcrumb on a
 * deal page, we remember that choice for the rest of the tab session so
 * we don't keep snapping back to deal context as they navigate.
 */
const SCOPE_PREF_KEY = 'naitive.copilot.scope_preference';
function readScopePreference(): 'auto' | 'pipeline' {
  try {
    return sessionStorage.getItem(SCOPE_PREF_KEY) === 'pipeline' ? 'pipeline' : 'auto';
  } catch {
    return 'auto';
  }
}
function writeScopePreference(pref: 'auto' | 'pipeline') {
  try { sessionStorage.setItem(SCOPE_PREF_KEY, pref); } catch { /* ignore */ }
}

/**
 * Demo-only deterministic responder for "What deals need attention?".
 *
 * Scoped strictly to the demo@5thline.co user. Returns exactly 3 deals
 * (the 3 highest-priority by urgency in the demo dataset) as markdown
 * bullets with one-sentence reasons (<20 words each). No introductions,
 * summaries, numbering, tables, or extra deals.
 */
function isDealsNeedAttentionPrompt(raw: string): boolean {
  const t = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t.includes('deal')) return false;
  if (!t.includes('attention')) return false;
  // Match "what deals need attention", "which deals need attention",
  // "deals that need attention", "deals needing attention", etc.
  return /\b(what|which|any)?\s*deals?\s+(that\s+)?(need|needs|needing|require|requires|requiring)\s+(my\s+|some\s+)?attention\b/.test(t)
    || /\bdeals?\s+need\s+attention\b/.test(t);
}

/**
 * Daily agenda intent — "what do I have going on today", "what do I need
 * to do today", "what's on my plate today", "what's on today", etc.
 * When matched, the Copilot skips the LLM round-trip and opens the
 * existing My Tasks overlay filtered to today.
 */
function isDailyAgendaPrompt(raw: string): boolean {
  const t = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  // Must reference today (today / this morning / this afternoon).
  if (!/\b(today|this (morning|afternoon))\b/.test(t)) return false;
  // Common daily-agenda phrasings.
  return (
    /\bwhat( do|'?s| is)?\s+(i|we)\s+(have|got|need to do|gotta do|working on)\b/.test(t) ||
    /\bwhat( is|'?s)\s+(on\s+)?(my|our)\s+(plate|agenda|schedule|calendar|day|list|to\s*do)\b/.test(t) ||
    /\bwhat( is|'?s)?\s+(going on|happening|up|on)\b/.test(t) ||
    /\bshow\s+me\s+(my\s+)?(day|agenda|schedule|today'?s?\s+tasks?)\b/.test(t) ||
    /\b(my\s+)?(agenda|schedule|to\s*do( list)?)\b/.test(t)
  );
}

const DEMO_DEALS_NEED_ATTENTION_MARKDOWN = [
  '- BluePeak Logistics',
  '  - Term sheet expected early next week and the capital partner has not confirmed timing yet.',
  '  - At-risk flag is active until Meridian Capital responds with a firm date.',
  '- Harbor Ridge Dental',
  '  - Underwriting is paused pending owner clarification on add-backs.',
  '- Northstar HVAC',
  '  - Lender is waiting on updated trailing twelve-month financials before moving forward.',
].join('\n');

// Client-side rate limiter: max 20 messages per minute
const MSG_TIMESTAMPS: number[] = [];
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
function checkClientRateLimit(): boolean {
  const now = Date.now();
  while (MSG_TIMESTAMPS.length && MSG_TIMESTAMPS[0] < now - RATE_WINDOW_MS) MSG_TIMESTAMPS.shift();
  if (MSG_TIMESTAMPS.length >= RATE_LIMIT) return false;
  MSG_TIMESTAMPS.push(now);
  return true;
}

// Lightweight heuristic that mirrors structured assistant outputs into the
// expanded workspace pane. Looks for known section headings produced by the
// preview-only copilot tools (status reports, follow-up summaries, draft
// emails, Asana tasks, meetings, deal notes). Returns at most one item per
// message — the model can synthesize multiple sections in one reply but we
// surface the most distinctive one as a single card.
function detectWorkspaceItems(messageId: string, content: string): WorkspaceItem[] {
  const text = content.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const make = (type: WorkspaceItemType, title: string, previewOnly = true): WorkspaceItem => ({
    id: `${messageId}-${type}`,
    type,
    title,
    createdAt: new Date().toISOString(),
    previewOnly,
    body: text,
    sourceMessageId: messageId,
  });
  const matchers: Array<{ test: RegExp; type: WorkspaceItemType; title: string }> = [
    { test: /(^|\n)\s*#{1,3}\s*status report\b/i, type: 'status_report',     title: 'Status report' },
    { test: /\bdraft\s+status\s+report\b/i,         type: 'status_report',     title: 'Status report' },
    { test: /(^|\n)\s*#{1,3}\s*follow[- ]?up\b/i,   type: 'follow_up_summary', title: 'Follow-up summary' },
    { test: /\bfollow[- ]?up\s+summary\b/i,         type: 'follow_up_summary', title: 'Follow-up summary' },
    { test: /(^|\n)\s*(subject:|to:)\s/i,           type: 'draft_email',       title: 'Draft email' },
    { test: /\bdraft\s+email\b/i,                   type: 'draft_email',       title: 'Draft email' },
    { test: /\bcreate.*asana\s+task\b/i,            type: 'asana_task',        title: 'Asana task' },
    { test: /\basana\s+task\s+preview\b/i,          type: 'asana_task',        title: 'Asana task' },
    { test: /\bschedule\s+(a\s+)?meeting\b/i,       type: 'meeting',           title: 'Meeting' },
    { test: /\bcalendar\s+invite\b/i,               type: 'meeting',           title: 'Meeting' },
    { test: /\bdeal\s+note\b/i,                     type: 'deal_note',         title: 'Deal note' },
  ];
  for (const m of matchers) {
    if (m.test.test(text) || m.test.test(lower)) return [make(m.type, m.title)];
  }
  return [];
}

// Online status hook
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'hsl(var(--muted-foreground))',
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ShortcutsTooltip({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const shortcuts = [
    ['⌘J', 'Toggle naitive AI'],
    ['⌘K', 'Quick Command Bar'],
    ['Enter', 'Send message'],
    ['⇧Enter', 'New line'],
    ['Esc', 'Close panel'],
  ];
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 8,
        background: 'rgba(8,10,18,0.95)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        padding: '10px 14px',
        zIndex: 70,
        width: 220,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Keyboard Shortcuts
      </div>
      {shortcuts.map(([key, desc]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--foreground)' }}>{desc}</span>
          <kbd style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 11,
            fontFamily: 'inherit',
            color: 'hsl(var(--muted-foreground))',
          }}>{key}</kbd>
        </div>
      ))}
    </div>
  );
}

function getPageContext(): { page: string; entityType: string | null; entityId: string | null; activeTab: string | null; banners: string[] } {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(window.location.search);
  const overlayDealId = query.get('deal');

  // Detect active tab from DOM (Radix Tabs uses data-state="active")
  let activeTab: string | null = null;
  const activeTabEl = document.querySelector('[role="tablist"] [role="tab"][data-state="active"]');
  if (activeTabEl) {
    activeTab = activeTabEl.getAttribute('value') || activeTabEl.textContent?.trim().toLowerCase() || null;
  }

  // Detect alert banners from DOM
  const banners: string[] = [];
  document.querySelectorAll('[data-copilot-banner]').forEach(el => {
    const text = el.getAttribute('data-copilot-banner') || el.textContent?.trim();
    if (text) banners.push(text);
  });
  // Also scan for common alert patterns in the page
  document.querySelectorAll('.bg-yellow-500\\/10, .bg-red-500\\/10, .bg-amber-500\\/10, [class*="alert"], [class*="warning"]').forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length < 200 && text.length > 10 && !banners.includes(text)) {
      banners.push(text);
    }
  });

  // Deal detail — both /deal/:id (current) and legacy /deals/:id
  if ((parts[0] === 'deal' || parts[0] === 'deals') && parts[1]) {
    return { page: 'deal-detail', entityType: 'deal', entityId: parts[1], activeTab, banners };
  }
  // Deal overlay opened on top of /deals, /pipeline, /finserv, etc. via
  // the canonical `?deal=<id>` query param used by NaitiveDealOverlay.
  // When a deal overlay is open, the "current view" is that deal, even
  // though the underlying route is the pipeline/list.
  if (overlayDealId && readScopePreference() !== 'pipeline') {
    return { page: 'deal-detail', entityType: 'deal', entityId: overlayDealId, activeTab, banners };
  }
  if (parts[0] === 'deals') return { page: 'deals', entityType: null, entityId: null, activeTab, banners };
  if (parts[0] === 'tasks') return { page: 'tasks', entityType: null, entityId: null, activeTab, banners };
  // /lenders/:name/history → single lender; /lenders → directory
  if (parts[0] === 'lenders' || parts[0] === 'master-lenders') {
    if (parts[1] && parts[1] !== 'config' && parts[1] !== 'sync-history') {
      return { page: 'lender-detail', entityType: 'lender', entityId: decodeURIComponent(parts[1]), activeTab, banners };
    }
    return { page: 'lenders', entityType: null, entityId: null, activeTab, banners };
  }
  if (parts[0] === 'pipeline') return { page: 'pipeline', entityType: null, entityId: null, activeTab, banners };
  if (parts[0] === 'finance') return { page: 'finance', entityType: null, entityId: null, activeTab, banners };
  if (!parts[0] || parts[0] === 'dashboard') return { page: 'dashboard', entityType: null, entityId: null, activeTab, banners };
  return { page: parts[0], entityType: null, entityId: null, activeTab, banners };
}

const DEAL_SUGGESTIONS: Array<{ prompt: string; description: string }> = [
  { prompt: 'What are we waiting on?', description: 'Outstanding items on this deal' },
  { prompt: 'Who are our most active lenders?', description: 'Most-sent and most-active lenders for this deal' },
  { prompt: 'Stale deals analysis', description: 'Is this deal at risk of going stale' },
];

function isDealDetailPath(pathname: string): boolean {
  // Matches /deal/:id and /deals/:id (both routes exist in the app).
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && (parts[0] === 'deal' || parts[0] === 'deals') && parts[1]) {
    return true;
  }
  // Treat any page that has an `?deal=<id>` overlay open as deal-detail
  // (NaitiveDealOverlay opens on top of /deals, /pipeline, /finserv, ...).
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('deal') && readScopePreference() !== 'pipeline') return true;
  } catch { /* ignore */ }
  return false;
}

function DealSuggestionChips({
  onSelect,
  disabled,
}: {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'center',
        marginTop: 12,
        width: '100%',
      }}
      aria-label="Suggested prompts for this deal"
    >
      {DEAL_SUGGESTIONS.map((s) => (
        <button
          key={s.prompt}
          type="button"
          onClick={() => onSelect(s.prompt)}
          disabled={disabled}
          title={s.description}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            maxWidth: '100%',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid var(--glass-border)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--foreground)',
            fontSize: 12,
            lineHeight: 1.2,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'background 150ms ease, border-color 150ms ease, transform 150ms ease',
          }}
          onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
          }}
        >
          {s.prompt}
        </button>
      ))}
    </div>
  );
}

/**
 * Collapse suggested-action chips that target the same entity + action type.
 *
 * Heuristic:
 *   - Extract a leading action verb (add/create/schedule/log/update/draft/send/…)
 *   - Extract the salient entity token (proper-noun sequence right after the verb)
 *   - Extract the object-type keyword (contact, task, deal, meeting, note, email…)
 * Chips sharing the same (verb, entity, object-type) fingerprint collapse to
 * the single most specific label (the longest one — more qualifiers = more specific).
 * Order is preserved by first-occurrence so LLM-authored relevance wins.
 */
function dedupeSuggestionChips(chips: string[]): string[] {
  if (chips.length <= 1) return chips;

  const ACTION_RE =
    /^(add|create|new|schedule|book|log|record|update|edit|change|set|draft|write|compose|send|reply|assign|invite|link|attach|remove|delete|mark|complete|close|open|move|convert)\b/i;
  const OBJECT_KEYWORDS = [
    'contact', 'task', 'todo', 'deal', 'meeting', 'call', 'note',
    'email', 'reply', 'message', 'reminder', 'event', 'lender',
    'funding source', 'company', 'document', 'file', 'stage', 'status',
  ];
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'as', 'for', 'to', 'of', 'with', 'and', 'or',
    'new', 'this', 'that',
  ]);

  const fingerprint = (raw: string): string => {
    const s = raw.trim().toLowerCase();
    const verbMatch = s.match(ACTION_RE);
    const verb = verbMatch ? verbMatch[1].toLowerCase() : '';

    // Object-type keyword anywhere in the chip.
    let object = '';
    for (const kw of OBJECT_KEYWORDS) {
      if (s.includes(kw)) { object = kw; break; }
    }

    // Salient entity = tokens after the verb minus stopwords and the object kw.
    const afterVerb = verb ? s.slice(verbMatch![0].length) : s;
    const entityTokens = afterVerb
      .replace(/[.,!?;:()"']/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !STOPWORDS.has(t))
      .filter((t) => !OBJECT_KEYWORDS.includes(t))
      // Titles/roles that qualify the entity but shouldn't split it.
      .filter((t) => !/^(ceo|cfo|coo|cto|vp|founder|owner|manager|director|head|lead)$/i.test(t));
    const entity = entityTokens.slice(0, 3).sort().join(' ');

    return `${verb}|${object}|${entity}`;
  };

  // Group by fingerprint, keeping first-seen order.
  const groups = new Map<string, { firstIdx: number; labels: string[] }>();
  chips.forEach((label, idx) => {
    const fp = fingerprint(label);
    // Chips with no verb AND no object fall into unique buckets (don't over-merge).
    const key = fp === '||' ? `__unique_${idx}__` : fp;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.labels.push(label);
    } else {
      groups.set(key, { firstIdx: idx, labels: [label] });
    }
  });

  return Array.from(groups.values())
    .sort((a, b) => a.firstIdx - b.firstIdx)
    .map(({ labels }) =>
      // Most specific = longest label; ties break to first-seen (stable sort).
      labels.slice().sort((a, b) => b.length - a.length)[0]
    );
}

/** Renders assistant content with entity links, JSON formatting, and stage display names */
/**
 * Build a stable key for a create_task confirm payload. Keying on
 * normalized title + linked deal_id lets us detect when the LLM re-emits
 * the same draft with corrected fields (assignee, due date, etc.) after
 * the user asks for an edit.
 */
function supersededTaskDraftKey(parsed: any): string | null {
  if (!parsed || parsed.action !== 'confirm' || parsed.action_type !== 'create_task') return null;
  const title = String(parsed.params?.title || '').trim().toLowerCase();
  if (!title) return null;
  const dealId = String(parsed.params?.deal_id || '').trim().toLowerCase();
  return `${title}|${dealId}`;
}

/**
 * Scan every assistant message once and return the set of create_task
 * draft keys whose LATEST occurrence lives in some message. The renderer
 * then hides any occurrence that isn't in that latest message, so a
 * follow-up like "change the assignee to James Turner" leaves only the
 * updated card visible.
 */
function computeSupersededTaskDraftKeys(
  messages: Array<{ id: string; role: string; content?: string }>,
): Map<string, Set<string>> {
  // msgId → set of superseded keys within that message
  const byMsg = new Map<string, Set<string>>();
  // key → latest msgId in which it appears
  const latestByKey = new Map<string, string>();
  const perMsgKeys = new Map<string, Set<string>>();
  const re = /```json\s*(\{[\s\S]*?\})\s*```|(\{(?:[^{}]|\{[^{}]*\})*"action"\s*:\s*"[^"]+"(?:[^{}]|\{[^{}]*\})*\})/g;
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.content) continue;
    const keys = new Set<string>();
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(m.content)) !== null) {
      const jsonText = match[1] ?? match[2];
      try {
        const parsed = JSON.parse(jsonText);
        const key = supersededTaskDraftKey(parsed);
        if (key) keys.add(key);
      } catch { /* ignore */ }
    }
    if (keys.size > 0) {
      perMsgKeys.set(m.id, keys);
      for (const k of keys) latestByKey.set(k, m.id);
    }
  }
  for (const [msgId, keys] of perMsgKeys) {
    const superseded = new Set<string>();
    for (const k of keys) {
      if (latestByKey.get(k) !== msgId) superseded.add(k);
    }
    if (superseded.size > 0) byMsg.set(msgId, superseded);
  }
  return byMsg;
}

function CopilotAssistantContent({
  content,
  supersededTaskDraftKeys,
}: {
  content: string;
  /**
   * Set of `create_task` draft keys (title|deal_id) that have been
   * SUPERSEDED by a newer draft in a later assistant message. When the
   * user edits a pending draft via chat ("change the assignee to James
   * Turner"), the LLM re-emits create_task with the corrected params.
   * We suppress the older card so only the freshest one is shown.
   */
  supersededTaskDraftKeys?: Set<string>;
}) {
  const navigate = useNavigate();
  const disambiguationCandidates = useCopilotStore((s) => s.disambiguationCandidates);

  // Extract chip suggestions emitted by the copilot system prompt in the form:
  //   [[CHIPS:["A","B","C"]]]
  // Multiple blocks may appear anywhere in the message. We strip every
  // occurrence from the visible content, merge into a single deduped row, and
  // render as clickable quick-action chips below the bubble.
  let chips: string[] = [];
  let strippedContent = content;
  {
    const re = /\[\[CHIPS:\s*(\[[\s\S]*?\])\s*\]\]/g;
    const seen = new Set<string>();
    strippedContent = content.replace(re, (_full, jsonArr) => {
      try {
        const parsed = JSON.parse(jsonArr);
        if (Array.isArray(parsed)) {
          for (const c of parsed) {
            if (typeof c === 'string') {
              const label = c.trim();
              if (label && !seen.has(label)) {
                seen.add(label);
                chips.push(label);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[AICopilot] Failed to parse CHIPS token, stripping silently', err);
      }
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
  }

  // De-duplicate chips that target the same entity + action type. E.g.
  //   "Add Frank as a contact" and "Add Frank as CFO contact"
  // collapse to the single most specific label ("Add Frank as CFO contact").
  // Cap the final list at 4 chips (input order = relevance order from the LLM).
  chips = dedupeSuggestionChips(chips).slice(0, 4);

  // Fix 1: Detect and format raw JSON responses
  const formattedJson = formatAIResponse(strippedContent);
  const processedContent = formattedJson || strippedContent;
  
  // Fix 5: Replace stage slugs with display names in the content
  const displayContent = processedContent.replace(
    /(?:from|to|stage|→|->)\s*"([a-z][a-z0-9-]+)"/gi,
    (match, slug) => {
      const display = getStageDisplayName(slug);
      return display !== slug ? match.replace(`"${slug}"`, `"${display}"`) : match;
    }
  );
  
  const segments: Array<{ type: 'text' | 'confirm' | 'auto_executed' | 'email' | 'deal' | 'lender' | 'task' | 'pipeline' | 'settings_proposal' | 'name_collision' | 'deal_fuzzy_confirm' | 'deal_fuzzy_suggestions'; value: any }> = [];
  // Match either fenced ```json {...} ``` blocks OR bare {...} objects that
  // contain an "action" key. The LLM sometimes drops the fence or uses
  // alternate key names ("type" instead of "action_type", "label" instead of
  // "description") — we normalize those here so the renderer never leaks raw
  // JSON to end users.
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```|(\{(?:[^{}]|\{[^{}]*\})*"action"\s*:\s*"[^"]+"(?:[^{}]|\{[^{}]*\})*\})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Track seen confirm/auto_executed actions to prevent duplicates
  const seenActions = new Set<string>();

  const normalizeActionPayload = (raw: any): any => {
    if (!raw || typeof raw !== 'object') return raw;
    const out: any = { ...raw };
    if (!out.action_type && typeof out.type === 'string') out.action_type = out.type;
    if (!out.description && typeof out.label === 'string') out.description = out.label;
    if (!out.description && typeof out.message === 'string') out.description = out.message;
    if (!out.params && out.payload && typeof out.payload === 'object') out.params = out.payload;
    if (!out.params || typeof out.params !== 'object') out.params = {};
    if (!out.description) out.description = 'Action ready for confirmation';
    if (!out.action_type) out.action_type = 'generic_action';
    return out;
  };

  while ((match = jsonBlockRegex.exec(displayContent)) !== null) {
    const jsonText = match[1] ?? match[2];
    const matchStart = match.index;
    if (matchStart > lastIndex) segments.push({ type: 'text', value: displayContent.slice(lastIndex, matchStart) });
    try {
      const rawParsed = JSON.parse(jsonText);
      const isAction = rawParsed && (rawParsed.action === 'confirm' || rawParsed.action === 'auto_executed');
      const parsed = isAction ? normalizeActionPayload(rawParsed) : rawParsed;
      if (parsed.responseType === 'deal_card') segments.push({ type: 'deal', value: parsed.data });
      else if (parsed.responseType === 'lender_card') segments.push({ type: 'lender', value: parsed.data });
      else if (parsed.responseType === 'task_card') segments.push({ type: 'task', value: parsed.data });
      else if (parsed.responseType === 'pipeline_summary') segments.push({ type: 'pipeline', value: parsed.data });
      else if (parsed.responseType === 'settings_proposal' && parsed.data?.diff_id && parsed.data?.tool_name) {
        segments.push({ type: 'settings_proposal', value: parsed.data });
      }
      else if (parsed.responseType === 'lender_filter') {
        // Side-effect only: tell the /lenders page to filter its directory.
        try {
          const names: string[] = Array.isArray(parsed.data?.names) ? parsed.data.names : [];
          const query: string = typeof parsed.data?.query === 'string' ? parsed.data.query : '';
          if (names.length > 0) {
            window.dispatchEvent(new CustomEvent('naitive:lender-filter', { detail: { names, query } }));
          }
        } catch {/* noop */}
        // Don't render the raw JSON in chat.
      }
      else if (parsed.action === 'confirm' && parsed.action_type) {
        // Name-collision cards have their own renderer — route them out of the
        // generic confirm pipeline so they don't get a Save/Cancel approve UI.
        if (parsed.action_type === 'name_collision') {
          const key = `collision:${parsed.params?.proposed?.name || ''}:${(parsed.params?.existing || []).map((e: any) => e.id).join(',')}`;
          if (!seenActions.has(key)) {
            seenActions.add(key);
            segments.push({ type: 'name_collision', value: parsed });
          }
          lastIndex = matchStart + match[0].length;
          continue;
        }
        if (parsed.action_type === 'deal_fuzzy_confirm') {
          const key = `deal_fuzzy_confirm:${parsed.params?.query || ''}:${parsed.params?.top_match?.id || ''}`;
          if (!seenActions.has(key)) {
            seenActions.add(key);
            segments.push({ type: 'deal_fuzzy_confirm', value: parsed });
          }
          lastIndex = matchStart + match[0].length;
          continue;
        }
        if (parsed.action_type === 'deal_fuzzy_suggestions') {
          const key = `deal_fuzzy_suggestions:${parsed.params?.query || ''}:${(parsed.params?.matches || []).map((m: any) => m.id).join(',')}`;
          if (!seenActions.has(key)) {
            seenActions.add(key);
            segments.push({ type: 'deal_fuzzy_suggestions', value: parsed });
          }
          lastIndex = matchStart + match[0].length;
          continue;
        }
        // Dedup key MUST include an entity discriminator. Without it, two
        // sibling cards (e.g. "Add Wells Fargo TMT" + "Add CIT") collapse
        // into one and the user only sees the first lender. We include
        // every common entity-identifying param so multi-entity prompts
        // produce the right number of cards.
        const p = parsed.params || {};
        const discriminator = [
          p.deal_id || '',
          p.new_pipeline_id || p.new_stage || '',
          p.lender_id || p.lender_name || '',
          p.lender_names ? JSON.stringify(p.lender_names) : '',
          p.milestone_id || p.milestone_name || '',
          p.contact_id || p.contact_name || '',
          p.assignee_user_id || p.owner_id || p.owner_label || '',
          p.title || p.task_title || '',
          p.item_id || p.outstanding_item_id || '',
        ].join('|');
        const key = `confirm:${parsed.action_type}:${discriminator}`;
        if (!seenActions.has(key)) {
          seenActions.add(key);
          // Suppress `create_task` drafts that a later assistant message
          // has already superseded (user edited the pending draft via
          // chat — e.g. "change the assignee to James Turner"). The newer
          // card in the newer message is the source of truth.
          if (parsed.action_type === 'create_task') {
            const taskKey = supersededTaskDraftKey(parsed);
            if (taskKey && supersededTaskDraftKeys?.has(taskKey)) {
              lastIndex = matchStart + match[0].length;
              continue;
            }
          }
          segments.push({ type: 'confirm', value: parsed });
        }
      }
      else if (parsed.action === 'auto_executed' && parsed.action_type) {
        const key = `auto:${parsed.action_type}:${parsed.params?.deal_id || ''}:${parsed.message || ''}`;
        if (!seenActions.has(key)) {
          seenActions.add(key);
          segments.push({ type: 'auto_executed', value: parsed });
        }
      }
      else if (parsed.subject && parsed.body) segments.push({ type: 'email', value: parsed });
      else if (isAction) {
        // Unknown shape but clearly an action payload — show fallback card
        // rather than leaking JSON to the user.
        segments.push({ type: 'confirm', value: parsed });
      } else {
        // Unknown JSON shape. In dev show the raw block for debugging; in
        // production hide it entirely so tool-protocol JSON never leaks.
        if (import.meta.env.MODE !== 'production') {
          segments.push({ type: 'text', value: match[0] });
        }
      }
    } catch {
      // If the candidate looked like an action payload (bare-JSON branch)
      // but failed to parse, hide it instead of dumping JSON to the user.
      if (match[2]) {
        segments.push({ type: 'text', value: '_Action ready for confirmation_' });
      } else if (import.meta.env.MODE !== 'production') {
        segments.push({ type: 'text', value: match[0] });
      }
    }
    lastIndex = matchStart + match[0].length;
  }
  if (lastIndex < displayContent.length) segments.push({ type: 'text', value: displayContent.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', value: displayContent });

  // Pre-pass: merge consecutive single-entity add_lender_to_deal cards
  // targeting the same deal into a SINGLE multi-entity add_lenders_to_deal
  // card. This guarantees that when the LLM emits one card per lender for
  // a multi-entity prompt, the UI still shows the user a single combined
  // approval card with every lender listed, and the backend write happens
  // atomically through the batch endpoint.
  const mergedSegments: Array<{ type: string; value: any }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (
      seg.type === 'confirm' &&
      seg.value?.action_type === 'add_lender_to_deal' &&
      seg.value.params?.deal_id
    ) {
      const dealId = seg.value.params.deal_id;
      const names: string[] = [];
      const pushName = (v: any) => {
        const n = (v?.params?.lender_name || '').toString().trim();
        if (n && !names.find((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
      };
      pushName(seg.value);
      let j = i + 1;
      while (
        j < segments.length &&
        segments[j].type === 'confirm' &&
        segments[j].value?.action_type === 'add_lender_to_deal' &&
        segments[j].value.params?.deal_id === dealId
      ) {
        pushName(segments[j].value);
        j++;
      }
      if (names.length >= 2) {
        const dealName = seg.value.params.deal_name || '';
        mergedSegments.push({
          type: 'confirm',
          value: {
            action: 'confirm',
            action_type: 'add_lenders_to_deal',
            description: `Add ${names.length} lenders to ${dealName || 'deal'}`,
            params: {
              deal_id: dealId,
              deal_name: dealName,
              lender_names: names,
            },
          },
        });
        i = j - 1;
        continue;
      }
    }
    mergedSegments.push(seg);
  }

  // Coalesce consecutive 'confirm' segments that share the same action_type
  // (and are not create_task or the multi-entity lender batch, which have
  // their own dedicated UIs) into a single grouped segment so we can render
  // an "Approve all (N)" bar.
  const groupedSegments: Array<{ type: string; value: any }> = [];
  for (let i = 0; i < mergedSegments.length; i++) {
    const seg = mergedSegments[i];
    if (
      seg.type === 'confirm' &&
      seg.value?.action_type &&
      seg.value.action_type !== 'create_task' &&
      seg.value.action_type !== 'add_lenders_to_deal'
    ) {
      const batch = [seg.value];
      let j = i + 1;
      while (
        j < mergedSegments.length &&
        mergedSegments[j].type === 'confirm' &&
        mergedSegments[j].value?.action_type === seg.value.action_type
      ) {
        batch.push(mergedSegments[j].value);
        j++;
      }
      if (batch.length >= 2) {
        groupedSegments.push({ type: 'confirm_group', value: batch });
        i = j - 1;
        continue;
      }
    }
    groupedSegments.push(seg);
  }

  const parsedDisambiguationByIndex = new Map<number, ReturnType<typeof parseCopilotDisambiguationMessage>>();
  for (let i = 0; i < groupedSegments.length; i++) {
    const seg = groupedSegments[i];
    if (seg.type !== 'text' || typeof seg.value !== 'string') continue;
    const parsed = parseCopilotDisambiguationMessage(seg.value, disambiguationCandidates);
    if (parsed) parsedDisambiguationByIndex.set(i, parsed);
  }
  const shouldSuppressChips = parsedDisambiguationByIndex.size > 0;

  return (
    <>
      {groupedSegments.map((seg, i) => {
        if (seg.type === 'confirm') return <CopilotActionConfirm key={i} action={seg.value} />;
        if (seg.type === 'name_collision') return <CopilotNameCollisionCard key={i} action={seg.value} />;
        if (seg.type === 'deal_fuzzy_confirm') return <CopilotDealFuzzyConfirmCard key={i} action={seg.value} />;
        if (seg.type === 'deal_fuzzy_suggestions') return <CopilotDealFuzzySuggestionsCard key={i} action={seg.value} />;
        if (seg.type === 'confirm_group') return <CopilotApprovalGroup key={i} actions={seg.value} />;
        if (seg.type === 'auto_executed') return <CopilotAutoExecuted key={i} action={seg.value} />;
        if (seg.type === 'email') return <CopilotEmailDraft key={i} draft={seg.value} />;
        if (seg.type === 'deal') return <CopilotDealCard key={i} deal={seg.value.deal} milestones={seg.value.milestones} />;
        if (seg.type === 'lender') return <CopilotLenderCard key={i} lender={seg.value} />;
        if (seg.type === 'task') return <CopilotTaskCard key={i} task={seg.value} />;
        if (seg.type === 'pipeline') return <CopilotPipelineSummary key={i} data={seg.value} />;
        if (seg.type === 'settings_proposal') return <SettingsMutationCard key={i} proposal={seg.value} />;
        if (seg.type === 'text' && parsedDisambiguationByIndex.has(i)) {
          return <CopilotDisambiguationOptionsCard key={i} message={parsedDisambiguationByIndex.get(i)!} />;
        }
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => {
              // Preserve our internal custom schemes — react-markdown's default
              // sanitizer drops anything outside http(s)/mailto/tel and leaves
              // the anchor with an empty href, which is exactly why clicking
              // disambiguation links (e.g. `deal://<id>`) used to do nothing.
              if (!url) return url;
              if (/^(entity|deal|naitive|contact|company|lender|funding_source):/i.test(url)) {
                return url;
              }
              if (url.startsWith('/') || url.startsWith('#')) return url;
              if (/^(https?|mailto|tel):/i.test(url)) return url;
              return url;
            }}
            components={{
              h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 6px 0', lineHeight: 1.3 }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 4px 0', lineHeight: 1.3 }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 3px 0', lineHeight: 1.3 }}>{children}</h3>,
              h4: ({ children }) => <h4 style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 2px 0', lineHeight: 1.3 }}>{children}</h4>,
              p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
              em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid hsl(var(--border))', margin: '10px 0' }} />,
              table: ({ children }) => (
                <div style={{ overflowX: 'auto', margin: '6px 0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead style={{ borderBottom: '1px solid hsl(var(--border))' }}>{children}</thead>,
              th: ({ children }) => <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>{children}</th>,
              td: ({ children }) => <td style={{ padding: '3px 8px', borderBottom: '1px solid hsl(var(--border) / 0.3)', fontSize: 12 }}>{children}</td>,
              a: ({ href, children }) => (
                <a
                  href={href || '#'}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                    // Disambiguation / inline entity picker links. The LLM
                    // emits these as `deal://<id>`, `naitive://deals/<id>`,
                    // `contact://<id>`, `company://<id>`, etc. Clicking
                    // should resolve the open disambiguation by posting the
                    // user's choice back into the chat — not just navigate
                    // away from the conversation.
                    const customMatch = href ? /^(deal|contact|company|lender|funding_source|naitive):\/\/(?:([a-z_]+)\/)?([^/?#\s]+)/i.exec(href) : null;
                    if (customMatch) {
                      e.preventDefault();
                      const scheme = customMatch[1].toLowerCase();
                      const subtype = customMatch[2]?.toLowerCase();
                      const id = customMatch[3];
                      const kind = scheme === 'naitive' ? (subtype || 'deal').replace(/s$/, '') : scheme;
                      const label = typeof children === 'string'
                        ? children
                        : Array.isArray(children)
                          ? children.map((c) => (typeof c === 'string' ? c : '')).join('').trim()
                          : '';
                      const labelPart = label ? ` "${label.replace(/"/g, '\\"')}"` : '';
                      const prompt = `Use the ${kind}${labelPart} (id: ${id}). Resolve the disambiguation with this choice and continue.`;
                      window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt } }));
                      if (kind === 'deal') {
                        window.dispatchEvent(new CustomEvent('copilot-disambiguation-resolved', { detail: { deal_id: id } }));
                      }
                      return;
                    }
                    // Fallback: AI sometimes emits disambiguation deal names
                    // as `[Gabb Wireless](#)` or another non-`deal://` href,
                    // which would normally do nothing. If the link text
                    // matches one of the currently-open disambiguation
                    // candidates, treat the click as a selection.
                    {
                      const label = (typeof children === 'string'
                        ? children
                        : Array.isArray(children)
                          ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
                          : ''
                      ).trim();
                      if (label) {
                        const candidates = useCopilotStore.getState().disambiguationCandidates;
                        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
                        const hit = candidates.find(c => norm(c.name) === norm(label))
                          || candidates.find(c => norm(label).includes(norm(c.name)) || norm(c.name).includes(norm(label)));
                        if (hit) {
                          e.preventDefault();
                          const prompt = `Use the deal "${hit.name.replace(/"/g, '\\"')}" (id: ${hit.deal_id}). Resolve the disambiguation with this choice and continue.`;
                          window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt } }));
                          window.dispatchEvent(new CustomEvent('copilot-disambiguation-resolved', { detail: { deal_id: hit.deal_id } }));
                          return;
                        }
                      }
                    }
                    if (href?.startsWith('entity://')) {
                      e.preventDefault();
                      const m = /^entity:\/\/([a-z_]+)\/([^/?#\s]+)$/i.exec(href);
                      if (m) {
                        const type = m[1].toLowerCase();
                        const id = m[2];
                        const route =
                          type === 'deal' ? `/deals/${id}` :
                          type === 'contact' ? `/contacts/${id}` :
                          type === 'company' ? `/crm-companies/${id}` :
                          type === 'funding_source' ? `/lenders/${encodeURIComponent(id)}/history` :
                          null;
                        if (route) navigate(route);
                      }
                      return;
                    }
                    if (href?.startsWith('/')) {
                      e.preventDefault();
                      navigate(href);
                    }
                  }}
                  style={{
                    color: 'hsl(var(--primary))',
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {children}
                </a>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-');
                return isBlock ? (
                  <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 6, fontSize: 12, overflowX: 'auto', margin: '6px 0' }}>
                    <code>{children}</code>
                  </pre>
                ) : (
                  <code style={{ background: 'rgba(0,0,0,0.25)', padding: '2px 5px', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}>{children}</code>
                );
              },
            }}
          >
            {seg.value}
          </ReactMarkdown>
        );
      })}
      {!shouldSuppressChips && chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt: chip } }))}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 999,
                background: 'rgba(126,184,247,0.10)',
                border: '1px solid rgba(126,184,247,0.30)',
                color: 'hsl(var(--primary))',
                cursor: 'pointer',
                lineHeight: 1.3,
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function MessageActions({ msg, conversationId }: { msg: { id: string; content: string; metadata?: Record<string, any> }; conversationId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(msg.metadata?.feedback ?? null);
  const [showCorrection, setShowCorrection] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Failed to copy'); }
  };

  const handleFeedback = async (type: 'up' | 'down') => {
    const next = feedback === type ? null : type;
    setFeedback(next);
    
    // Show correction popover on thumbs-down
    if (type === 'down' && next === 'down') {
      setShowCorrection(true);
    } else {
      setShowCorrection(false);
    }
    
    if (!conversationId) return;
    try {
      const { data } = await supabase.from('copilot_conversations').select('messages').eq('id', conversationId).single();
      if (data?.messages && Array.isArray(data.messages)) {
        const updated = (data.messages as any[]).map((m: any) =>
          m.id === msg.id ? { ...m, metadata: { ...(m.metadata || {}), feedback: next } } : m
        );
        await supabase.from('copilot_conversations').update({ messages: updated as any }).eq('id', conversationId);
      }
    } catch { /* silent */ }
  };

  return (
    <div
      className="opacity-0 group-hover/msg:opacity-100 transition-opacity"
      style={{
        position: 'absolute', top: 4, right: 4,
        display: 'flex', gap: 2,
        background: 'rgba(8,10,18,0.8)', borderRadius: 6, padding: '2px 4px',
        border: '1px solid var(--glass-border)',
      }}
    >
      <button onClick={handleCopy} aria-label="Copy message" title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: copied ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))', display: 'flex' }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button onClick={() => handleFeedback('up')} aria-label="Helpful" title="Helpful" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: feedback === 'up' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', display: 'flex', opacity: feedback === 'up' ? 1 : 0.7 }}>
        <ThumbsUp size={13} />
      </button>
      <div style={{ position: 'relative' }}>
        <button onClick={() => handleFeedback('down')} aria-label="Not helpful" title="Not helpful" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: feedback === 'down' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))', display: 'flex', opacity: feedback === 'down' ? 1 : 0.7 }}>
          <ThumbsDown size={13} />
        </button>
        {showCorrection && (
          <CopilotCorrectionPopover
            originalResponse={msg.content}
            onClose={() => setShowCorrection(false)}
            onSaved={() => setFeedback('down')}
          />
        )}
      </div>
    </div>
  );
}

export function AICopilotPanel() {
  const { isOpen, isMinimized, minimizePanel, closePanel, messages, addMessage, setMessages, isProcessing, setProcessing, conversationId, setConversationId, conversationMutations, pendingPrompt, setPendingPrompt } = useCopilotStore();
  const demoMode = useCopilotStore((s) => s.demoMode);
  const [agentMode, setAgentMode] = useState(false);
  const { user } = useAuth();
  // Canonical data scope (workspace + pipeline + status) sent on every
  // request so the AI's deal queries match what the dashboard shows.
  const { scope: chatScope } = useCopilotChatScope();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; preview: string; date: string }>>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // Always reset to compact on close or minimize. Expanded mode is
  // strictly opt-in via the Expand button — never persisted across launches.
  useEffect(() => {
    if (!isOpen || isMinimized) setIsExpanded(false);
  }, [isOpen, isMinimized]);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceItemId, setActiveWorkspaceItemId] = useState<string | null>(null);
  const workspaceHydratedRef = useRef<string | null>(null);
  // ── Persist workspace state per conversation (localStorage) ───────────
  // Keyed by conversationId so reopening or switching threads restores the
  // last active preview card and the recent-items strip without round-
  // tripping to the backend. Uses an isLoaded-style guard so the initial
  // hydration from storage doesn't get overwritten by the empty defaults
  // before saved state is read in.
  useEffect(() => {
    if (!conversationId) {
      workspaceHydratedRef.current = null;
      setWorkspaceItems([]);
      setActiveWorkspaceItemId(null);
      return;
    }
    if (workspaceHydratedRef.current === conversationId) return;
    try {
      const raw = localStorage.getItem(`naitive.copilot.workspace.${conversationId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: WorkspaceItem[]; activeId?: string | null };
        setWorkspaceItems(Array.isArray(parsed.items) ? parsed.items : []);
        setActiveWorkspaceItemId(parsed.activeId ?? null);
      } else {
        setWorkspaceItems([]);
        setActiveWorkspaceItemId(null);
      }
    } catch { /* ignore */ }
    workspaceHydratedRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || workspaceHydratedRef.current !== conversationId) return;
    try {
      localStorage.setItem(
        `naitive.copilot.workspace.${conversationId}`,
        JSON.stringify({ items: workspaceItems.slice(-20), activeId: activeWorkspaceItemId }),
      );
    } catch { /* ignore */ }
  }, [conversationId, workspaceItems, activeWorkspaceItemId]);
  // Extract structured "preview" items from finalized assistant messages so
  // the right-hand workspace pane can render them as rich cards. Heuristic,
  // no copilot logic changes — purely a UI mirror of what the model writes.
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.content || last.content?.startsWith('__ERROR__') || last.isLoading) return;
    setWorkspaceItems((prev) => {
      if (prev.some((p) => p.sourceMessageId === last.id)) return prev;
      const detected = detectWorkspaceItems(last.id, last.content);
      if (detected.length === 0) return prev;
      setActiveWorkspaceItemId(detected[detected.length - 1].id);
      return [...prev, ...detected];
    });
  }, [messages]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const messageQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const { nudges, dismissNudge, dismissAllNudges } = useProactiveNudges();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const location = useLocation();
  const isDealDetail = isDealDetailPath(location.pathname);

  // Anchor: the <main class="main-scrollable"> bounding rect. We re-measure
  // on open and on viewport resize so the panel stays centered above the
  // Ask bar even as the sidebar opens/closes.
  const [anchor, setAnchor] = useState<{ left: number; width: number; bottom: number }>(() => ({
    left: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    bottom: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const el = document.querySelector('main.main-scrollable') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ left: r.left, width: r.width, bottom: r.bottom });
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    const el = document.querySelector('main.main-scrollable');
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [isOpen]);

  // ── Click-outside-to-close + Escape-to-minimize ─────────────────────
  // The panel is non-modal (no scrim), but we still want canonical
  // dismiss-on-outside-click behavior. The toggle bar shares the same
  // portal wrapper (data-copilot-root) so clicks on the launcher are
  // treated as in-bounds and don't cause a double-toggle. Clicks inside
  // any Radix overlay opened from the panel (popovers, dialogs, etc.)
  // are also preserved.
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      const insideCopilotRoot = !!target.closest?.('[data-copilot-root]');
      const insideRadixOverlay =
        !!target.closest?.('[data-radix-popper-content-wrapper]') ||
        !!target.closest?.('[role="dialog"]') ||
        !!target.closest?.('[role="menu"]') ||
        !!target.closest?.('[role="listbox"]');
      if (insidePanel || insideCopilotRoot || insideRadixOverlay) return;
      minimizePanel();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') minimizePanel();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isMinimized, minimizePanel]);

  // Per-deal AI memory (loads last ~10 exchanges; persists new ones).
  const dealIdFromPath = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'deal' || parts[0] === 'deals') && parts[1]) return parts[1];
    try {
      const q = new URLSearchParams(location.search);
      const overlay = q.get('deal');
      if (overlay && readScopePreference() !== 'pipeline') return overlay;
    } catch { /* ignore */ }
    return null;
  })();
  const dealMemory = useDealCopilotMemory(dealIdFromPath);
  const [showPrevious, setShowPrevious] = useState(false);

  // ── Auto-detected page context: resolved entity label for the chip ──
  // The chip shows e.g. "Context: Censys Technologies" or "Context: Finance — Cash Flow".
  // We resolve a friendly label client-side so the user sees it before any AI call.
  const [autoContextLabel, setAutoContextLabel] = useState<string | null>(null);

  // ── @-mention deal override ──
  // When the user types "@…", we open a small autocomplete that searches deals.
  // Selecting one sets `contextOverride`, which is sent to the edge function and
  // takes precedence over the URL-detected entity.
  const [contextOverride, setContextOverride] = useState<{ entityType: 'deal'; entityId: string; entityName: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionMatches, setMentionMatches] = useState<Array<{ id: string; company: string }>>([]);
  const mentionAbortRef = useRef<AbortController | null>(null);

  // Resolve the URL into a friendly chip label.
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const ctx = getPageContext();
      // Deal detail → fetch the company name
      if (ctx.page === 'deal-detail' && ctx.entityId) {
        const { data } = await supabase.from('deals').select('company').eq('id', ctx.entityId).maybeSingle();
        if (cancelled) return;
        setAutoContextLabel(data?.company ? `Deal — ${data.company}` : 'Deal');
        return;
      }
      if (ctx.page === 'lender-detail' && ctx.entityId) {
        if (cancelled) return;
        setAutoContextLabel(`Lender — ${ctx.entityId}`);
        return;
      }
      if (ctx.page === 'lenders') { if (!cancelled) setAutoContextLabel('Lenders directory'); return; }
      if (ctx.page === 'finance') { if (!cancelled) setAutoContextLabel('Finance — Cash Flow'); return; }
      if (ctx.page === 'tasks') { if (!cancelled) setAutoContextLabel('Tasks'); return; }
      if (ctx.page === 'pipeline' || ctx.page === 'deals') { if (!cancelled) setAutoContextLabel('Pipeline'); return; }
      if (ctx.page === 'dashboard') { if (!cancelled) setAutoContextLabel('Pipeline overview'); return; }
      if (!cancelled) setAutoContextLabel(ctx.page ? ctx.page.replace(/-/g, ' ') : null);
    }
    resolve();
    return () => { cancelled = true; };
  }, [location.pathname, location.search]);

  // Watch the input for an "@..." token at the cursor and run a deal search.
  useEffect(() => {
    if (mentionAbortRef.current) mentionAbortRef.current.abort();
    if (!mentionQuery || mentionQuery.length < 1) {
      setMentionMatches([]);
      return;
    }
    const ctrl = new AbortController();
    mentionAbortRef.current = ctrl;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, company')
        .ilike('company', `%${mentionQuery}%`)
        .limit(8);
      if (ctrl.signal.aborted) return;
      setMentionMatches((data || []) as any);
    }, 150);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [mentionQuery]);

  /** Visible chip label — override > auto-detected. */
  const effectiveContextLabel = contextOverride
    ? `Deal: ${contextOverride.entityName}`
    : autoContextLabel;

  // Non-modal: no focus trap. The Ask bar at the bottom is the input
  // surface and retains its own focus management. The panel itself is just
  // a transcript view that the user can also click into.

  // Screen reader announcement for new messages
  useEffect(() => {
    if (!liveRegionRef.current || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.content && !isProcessing) {
      liveRegionRef.current.textContent = 'Copilot responded: ' + last.content.slice(0, 120);
    }
  }, [messages, isProcessing]);

  // Cross-message pass to detect create_task drafts that have been
  // superseded by a later message (user asked to edit a pending draft).
  const supersededTaskDraftKeysByMsg = useMemo(
    () => computeSupersededTaskDraftKeys(messages as any),
    [messages],
  );

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
    setLastFailedMessage(null);
    setContextOverride(null);
    setMentionQuery(null);
    setMentionMatches([]);
    setLastFailedMessage(null);
    // Reset deal-specific conversational memory so the next turn starts
    // from a clean slate (no carry-over from prior thread on this deal).
    try { dealMemory.clear?.(); } catch {}
  }, [setConversationId, setMessages, dealMemory]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('copilot_conversations').select('id, messages, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(10);
    if (data) {
      setHistoryItems(
        data.map((c: any) => {
          const msgs = c.messages as any[];
          const firstUser = msgs?.find((m: any) => m.role === 'user');
          const preview = firstUser?.content?.slice(0, 50) || 'Empty conversation';
          return { id: c.id, preview: preview.length === 50 ? preview + '…' : preview, date: c.updated_at };
        })
      );
    }
    setShowHistory((v) => !v);
  }, [user]);

  const loadConversation = useCallback(async (id: string) => {
    const { data } = await supabase.from('copilot_conversations').select('id, messages').eq('id', id).single();
    if (data?.messages && Array.isArray(data.messages)) {
      setConversationId(data.id);
      setMessages(
        (data.messages as any[]).map((m: any) => ({
          id: m.id || crypto.randomUUID(), role: m.role, content: m.content,
          timestamp: new Date(m.timestamp || Date.now()), metadata: m.metadata,
        }))
      );
    }
    setShowHistory(false);
  }, [setConversationId, setMessages]);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from('copilot_conversations').delete().eq('id', id);
    setHistoryItems((prev) => prev.filter((h) => h.id !== id));
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
  }, [conversationId, setConversationId, setMessages]);

  const clearAllConversations = useCallback(async () => {
    if (!user) return;
    if (!window.confirm('Delete all saved conversations? This cannot be undone.')) return;
    await supabase.from('copilot_conversations').delete().eq('user_id', user.id);
    setHistoryItems([]);
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }, [user, setConversationId, setMessages]);

  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  // Every reload starts a completely fresh copilot session. We intentionally
  // do NOT auto-restore the most recent conversation here — prior threads are
  // still available via the History menu, but the panel always opens empty.

  const saveConversation = useCallback(
    async (msgs: typeof messages) => {
      if (!user) return;
      const serialized = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp }));
      const ctx = getPageContext();
      if (conversationId) {
        await supabase.from('copilot_conversations').update({ messages: serialized as any, page_context: ctx.page, updated_at: new Date().toISOString() }).eq('id', conversationId);
      } else {
        const { data } = await supabase.from('copilot_conversations').insert({ user_id: user.id, messages: serialized as any, page_context: ctx.page }).select('id').single();
        if (data) setConversationId(data.id);
      }
    },
    [user, conversationId, setConversationId]
  );

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  }, [input]);

  const lastMsgLen = messages.length > 0 ? (messages[messages.length - 1]?.content?.length ?? 0) : 0;
  useEffect(() => {
    // Anchor to the bottom on send and as streamed tokens arrive, so the
    // newest answer is never visually clipped at the top of the viewport.
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastMsgLen, isProcessing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closePanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closePanel]);

  useEffect(() => {
    // Intentionally no auto-focus inside the panel — typing happens in the
    // Ask bar below it.
  }, [isOpen]);

  // Core function that processes a single message (no guard on isProcessing)
  const processMessage = useCallback(async (text: string) => {
    // Handle /teach or /remember commands
    const teachMatch = text.match(/^\/(teach|remember)\s+(.+)$/is);
    if (teachMatch) {
      isProcessingRef.current = true;
      setProcessing(true);
      try {
        const ruleText = teachMatch[2].trim();
        // Get user's company
        const { data: member } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user!.id)
          .limit(1)
          .single();
        if (!member) throw new Error('No company found');

        const { error } = await supabase.from('copilot_user_preferences').insert({
          organization_id: member.company_id,
          rule_text: ruleText,
          category: 'behavior',
          source: 'chat_command',
          created_by: user!.id,
        });
        if (error) throw error;
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ **Rule saved!** I'll remember this going forward:\n\n> ${ruleText}\n\nYou can manage all AI rules from the Admin → AI Training page.`,
          timestamp: new Date(),
        });
        const allMsgs = useCopilotStore.getState().messages;
        await saveConversation(allMsgs);
      } catch (err: any) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, I couldn't save that rule: ${err.message || 'Unknown error'}`,
          timestamp: new Date(),
        });
      } finally {
        isProcessingRef.current = false;
        setProcessing(false);
        drainQueue();
      }
      return;
    }

    useCopilotStore.setState({ isOpen: true, isMinimized: false });
    isProcessingRef.current = true;
    setProcessing(true);

    const currentMessages = useCopilotStore.getState().messages;
    const history = currentMessages.filter(m => !m.content?.startsWith('__ERROR__')).map((m) => ({ role: m.role, content: m.content }));
    const ctx = getPageContext();
    // Telemetry: log every global Ask naitive AI invocation so we can
    // monitor regressions (e.g. deal context not auto-detected, zero docs
    // retrieved when a deal is open).
    logUsage({
      feature_type: 'AI_CHAT',
      feature_subtype: 'ask_naitive_submit',
      deal_id: contextOverride?.entityId || (ctx.entityType === 'deal' ? ctx.entityId : null) || dealIdFromPath,
      metadata: {
        resolved_context: contextOverride
          ? `override:${contextOverride.entityName}`
          : ctx.page === 'deal-detail' && ctx.entityId
            ? `deal:${ctx.entityId}`
            : ctx.page,
        active_deal_id: dealIdFromPath,
        page: ctx.page,
        entity_type: ctx.entityType,
        entity_id: ctx.entityId,
        scope_preference: readScopePreference(),
      },
    });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast.error('Not authenticated');
      isProcessingRef.current = false;
      setProcessing(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(COPILOT_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            message: text,
            context: {
              page: ctx.page,
              entityType: ctx.entityType,
              entityId: ctx.entityId,
              activeTab: ctx.activeTab,
              banners: ctx.banners,
              userRole: 'member',
              companyId: '',
              // Browser timezone so the server can normalize relative dates ("tomorrow", "in 5 days", "end of week") correctly.
              tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; } })(),
              // @-mention override takes precedence on the server.
              contextOverride: contextOverride
                ? { entityType: contextOverride.entityType, entityId: contextOverride.entityId, entityName: contextOverride.entityName }
                : null,
              // Canonical pipeline scope (workspace + pipeline + status) that
              // every deal-touching tool call must respect so the AI's
              // numbers match what the dashboard renders.
              chatScope: serializeScope(chatScope),
            },
            history,
            conversationMutations: useCopilotStore.getState().conversationMutations,
          // Active agent persona for this turn. The server uses this to
          // adopt the selected agent's system prompt + personality while
          // still exposing knowledge/tools from every activated agent.
          selectedAgent: useCopilotStore.getState().selectedAgent,
            dealMemory: dealIdFromPath
              ? {
                  deal_id: dealIdFromPath,
                  prior_messages: (dealMemory.recent || []).map((m) => ({ role: m.role, content: m.content })),
                }
              : null,
          }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantContent = '';
      const assistantId = crypto.randomUUID();
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
            if (content) {
              assistantContent += content;
              const store = useCopilotStore.getState();
              const existing = store.messages.find((m) => m.id === assistantId);
              if (existing) {
                useCopilotStore.setState({ messages: store.messages.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m) });
              } else {
                useCopilotStore.setState({ messages: [...store.messages, { id: assistantId, role: 'assistant', content: assistantContent, timestamp: new Date() }] });
              }
            }
          } catch { textBuffer = line + '\n' + textBuffer; break; }
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
            if (content) {
              assistantContent += content;
              useCopilotStore.setState({
                messages: useCopilotStore.getState().messages.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m),
              });
            }
          } catch { /* ignore */ }
        }
      }

      // If stream produced no content, add a fallback response
      if (!assistantContent.trim()) {
        const fallbackId = crypto.randomUUID();
        useCopilotStore.setState({
          messages: [...useCopilotStore.getState().messages, {
            id: fallbackId,
            role: 'assistant',
            content: "I found a match but couldn't render a response card for it. Please try again, or use a more specific deal name.",
            timestamp: new Date(),
          }],
        });
      }

      // Post-stream cleanup: dedupe near-duplicate paragraphs the LLM
      // sometimes emits (e.g. "Pipeline Summary" followed by "Pipeline
      // Breakdown by Stage" with identical bullets) and normalize money
      // formatting to $N.NNMM. The streamed view shows the raw token feed;
      // the final stored/rendered message is the cleaned form.
      if (assistantContent.trim()) {
        const cleaned = cleanupCopilotResponse(assistantContent);
        if (cleaned !== assistantContent) {
          assistantContent = cleaned;
          useCopilotStore.setState({
            messages: useCopilotStore.getState().messages.map((m) => m.id === assistantId ? { ...m, content: cleaned } : m),
          });
        }
      }

      const allMsgs = useCopilotStore.getState().messages;
      await saveConversation(allMsgs);
      // Persist last user + assistant turn to per-deal memory + activity timeline
      if (dealIdFromPath) {
        await dealMemory.append('user', text);
        if (assistantContent.trim()) {
          await dealMemory.append('assistant', assistantContent);
        }
        // Decision log: every AI exchange on a deal logs to the activity timeline
        // with the [AI Decision] tag so it's discoverable in the deal's audit trail.
        try {
          const summary = `[AI Decision] ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}`;
          await supabase.from('activity_logs').insert({
            deal_id: dealIdFromPath,
            user_id: user?.id ?? null,
            user_display_name: (user as any)?.user_metadata?.display_name || (user as any)?.email || null,
            activity_type: 'ai_exchange',
            description: summary,
            metadata: {
              source: 'ask_naitive',
              prompt: text,
              response: assistantContent.slice(0, 4000),
              context_override: contextOverride ? contextOverride.entityId : null,
            },
          });
        } catch (e) {
          console.warn('[ai-decision-log] insert failed', e);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Copilot stream error:', err);
      setLastFailedMessage(text);
      const reason = (err?.message && String(err.message)) || 'Unknown error';
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `__ERROR__::${reason}`,
        timestamp: new Date(),
      });
    } finally {
      isProcessingRef.current = false;
      setProcessing(false);
      // Process next queued message if any
      drainQueue();
    }
  }, [addMessage, setProcessing, saveConversation]);

  // Drain the queue: process next message if available
  const drainQueue = useCallback(() => {
    if (isProcessingRef.current) return;
    const next = messageQueueRef.current.shift();
    if (next) {
      processMessage(next);
    }
  }, [processMessage]);

  const handleSend = useCallback(async (directMessage?: string) => {
    const text = (directMessage || input).trim();
    if (!text) return;

    // Offline check
    if (!navigator.onLine) {
      toast.error("You're offline — messages will send when you reconnect.");
      return;
    }

    // Rate limit check
    if (!checkClientRateLimit()) {
      toast.error('Rate limit reached — max 20 messages per minute. Please wait.');
      return;
    }

    setLastFailedMessage(null);
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text, timestamp: new Date() };
    addMessage(userMsg);
    setInput('');

    // Daily-agenda intent — instead of generating a text summary of
    // tasks, open the existing My Tasks overlay filtered to today
    // (tasks due today + today's calendar items) and post a one-line
    // Copilot reply. Detected client-side; no backend round-trip.
    if (isDailyAgendaPrompt(text)) {
      window.dispatchEvent(new CustomEvent('open-my-tasks-today'));
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Here's your day — opening My Tasks filtered to today.",
        timestamp: new Date(),
      });
      return;
    }

    // Demo-only deterministic intercept: when demo@5thline.co asks
    // "What deals need attention?" return exactly 3 deals as markdown
    // bullets with one-sentence reasons. No AI call, no drift.
    if (user?.email === 'demo@5thline.co' && isDealsNeedAttentionPrompt(text)) {
      const reply = DEMO_DEALS_NEED_ATTENTION_MARKDOWN;
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      });
      return;
    }

    // Demo-only scripted prompts (gated strictly to demo@5thline.co).
    // Shows the normal "thinking" indicator, then streams the canned
    // response character-by-character so it reads like a live generation.
    // No real LLM call is made on this path.
    {
      const demo = matchDemoScript({ email: user?.email, prompt: text });
      if (demo) {
        const assistantId = crypto.randomUUID();
        setProcessing(true);
        const startStream = () => {
          addMessage({
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
          });
          setProcessing(false);
          const full = demo.reply;
          let i = 0;
          const STEP_MS = 33; // ~30 chars/sec
          const tick = () => {
            i = Math.min(full.length, i + 1);
            const store = useCopilotStore.getState();
            const existing = store.messages.find((m) => m.id === assistantId);
            if (existing) {
              store.addMessage({ ...existing, content: full.slice(0, i) });
            }
            if (i < full.length) window.setTimeout(tick, STEP_MS);
          };
          window.setTimeout(tick, STEP_MS);
        };
        window.setTimeout(startStream, demo.delayMs);
        return;
      }
    }

    // Agent mode: instead of streaming a chat reply, push an assistant
    // message that mounts <AgentRunCard /> and runs the chained pipeline.
    if (agentMode) {
      const ctx = getPageContext();
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        metadata: { kind: 'agent_run', prompt: text, context: ctx },
      });
      return;
    }

    if (isProcessingRef.current) {
      // Queue this message to be processed after current one finishes
      messageQueueRef.current.push(text);
      return;
    }

    processMessage(text);
  }, [input, addMessage, processMessage, agentMode, user?.email]);

  const handleRetry = useCallback(() => {
    if (!lastFailedMessage) return;
    // Remove the error message
    const store = useCopilotStore.getState();
    const filtered = store.messages.filter((m) => !m.content?.startsWith('__ERROR__'));
    // Also remove the last user message that failed
    const withoutLastUser = filtered.slice(0, -1);
    setMessages(withoutLastUser);
    handleSend(lastFailedMessage);
  }, [lastFailedMessage, handleSend, setMessages]);

  // Suggested follow-up chips dispatch a CustomEvent; intercept and re-submit.
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt && prompt.trim()) handleSend(prompt.trim());
    };
    window.addEventListener('copilot-chip-click', handler as EventListener);
    window.addEventListener('naitive:copilot-prompt', handler as EventListener);
    return () => {
      window.removeEventListener('copilot-chip-click', handler as EventListener);
      window.removeEventListener('naitive:copilot-prompt', handler as EventListener);
    };
  }, [handleSend]);

  // When the collapsed composer hands off a typed prompt, auto-send it
  // once the panel is open.
  useEffect(() => {
    if (!pendingPrompt) return;
    const text = pendingPrompt;
    setPendingPrompt(null);
    handleSend(text);
  }, [pendingPrompt, setPendingPrompt, handleSend]);

  const handleNudgeAction = useCallback((prompt: string) => {
    handleSend(prompt);
  }, [handleSend]);

  // Route a workspace card into the email / task / note workflow by
  // re-prompting the copilot to invoke the matching preview-only tool.
  // Nothing leaves the workspace until the user approves the resulting
  // preview card.
  const handleWorkspaceSendTo = useCallback((target: 'email' | 'task' | 'note', item: WorkspaceItem) => {
    const ctx = item.dealName ? ` for ${item.dealName}` : '';
    const body = item.body.length > 2000 ? item.body.slice(0, 2000) + '…' : item.body;
    if (target === 'email') {
      handleSend(`Use the workspace draft below${ctx} as the body of an email and prepare a send_gmail preview. Keep the tone and structure intact; suggest a clear subject line.\n\n---\n${body}`);
    } else if (target === 'task') {
      handleSend(`Create an Asana task${ctx} for the follow-up implied by the workspace draft below using the create_asana_task preview tool. Set a clear name, helpful notes, and a reasonable due date.\n\n---\n${body}`);
    } else {
      handleSend(`Save the workspace draft below${ctx} as a deal note using the deal note preview tool. Keep the original content verbatim.\n\n---\n${body}`);
    }
  }, [handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keep the component mounted while minimized so in-flight requests, the
  // streaming response, and the transcript are preserved. Only unmount on
  // hard close.
  if (!isOpen) return null;

  // The panel is rendered INSIDE the same width-defining wrapper as the
  // Ask bar (see CopilotToggleButton). It uses width:100% so its outer
  // shell aligns 1:1 with the bar — no independent width math, no
  // translateX, no fixed positioning.
  const BAR_SURFACE = 'rgba(14, 16, 24, 0.92)';
  const PANEL_TOP = 'rgba(12, 14, 22, 0.97)';
  const BORDER_TONE = 'rgba(255, 255, 255, 0.18)';
  const panelHeight = Math.min(
    Math.round((typeof window !== 'undefined' ? window.innerHeight : 768) * 0.6),
    560,
  );

  // In expanded mode the panel is portalled into document.body inside the
  // same viewport-centered modal shell pattern used by NaitiveDealOverlay
  // (fixed inset-0 + flex items-center justify-center). That guarantees the
  // popup is centered and fully visible regardless of where the floating
  // Ask-bar wrapper currently sits. In compact mode we keep the existing
  // inline, bar-anchored rendering exactly as before.
  const expandedStyle: React.CSSProperties = isExpanded
    ? {
        width: '100%',
        height: '100%',
        maxWidth: isMobile ? 'none' : 1440,
        // Leave room at the bottom for the persistent Ask naitive AI / Ask
        // about this deal composer bar so the modal frame never sits behind
        // or below the input area.
        maxHeight: 'calc(100vh - 200px)',
        marginInline: 0,
        borderRadius: 18,
      }
    : {};

  const panelNode = (
    <>
      <div
        ref={panelRef}
        role="region"
        aria-label="naitive AI transcript"
        style={{
          width: '90%',
          marginInline: 'auto',
          height: isMinimized ? 0 : panelHeight,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column',
          // Mostly opaque neutral surface — same family as the Ask bar below,
          // just a touch denser so the popup reads as elevated above it.
          // Vertical gradient: starts at the popup surface near the top and
          // gradually fades toward the Ask bar tone at the bottom so the two
          // surfaces feel like one coordinated dock.
          background: `linear-gradient(180deg, ${PANEL_TOP} 0%, ${PANEL_TOP} 55%, ${BAR_SURFACE} 100%)`,
          // Greatly reduced glassmorphism — keep a hint of saturation only.
          backdropFilter: 'saturate(1.2)',
          WebkitBackdropFilter: 'saturate(1.2)',
          // Match the Ask bar's curvature on top; square bottom so the seam
          // visually attaches to the rounded bar below.
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          // Same border tone on all four edges so the popup feels fully
          // framed — bottom edge matches the top in thickness/opacity.
          border: `1px solid ${BORDER_TONE}`,
          boxShadow:
            '0 12px 36px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          transition: 'height 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease-out',
          opacity: isMinimized ? 0 : 1,
          pointerEvents: isMinimized ? 'none' : 'auto',
          ...expandedStyle,
        }}
      >
        <style>{`
          @keyframes copilot-popup-in {
            from { opacity: 0; transform: translate(-50%, 16px) scale(0.97); }
            to { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
          @keyframes copilot-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      {/* Screen reader live region */}
      <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          padding: '8px 16px', background: 'rgba(255,193,7,0.15)', borderBottom: '1px solid rgba(255,193,7,0.3)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'hsl(var(--warning, 45 100% 51%))',
          flexShrink: 0,
        }}>
          <WifiOff size={14} />
          You're offline — messages will send when you reconnect.
        </div>
      )}

      {/* Header */}
      <div style={{ position: 'relative', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={naitiveFavicon} alt="" style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>naitive AI</span>
          <span
            aria-label="Beta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 18,
              padding: '0 6px',
              borderRadius: 999,
              border: '1px solid var(--glass-border)',
              background: 'hsl(var(--muted) / 0.5)',
              color: 'hsl(var(--muted-foreground))',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Beta
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {([
            { key: 'new', label: 'New conversation', onClick: handleNewConversation, icon: <Plus size={18} /> },
            { key: 'history', label: 'Conversation history', onClick: loadHistory, icon: <Clock size={18} /> },
            { key: 'expand', label: isExpanded ? 'Collapse copilot' : 'Expand copilot', onClick: () => setIsExpanded((v) => !v), icon: isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} /> },
            { key: 'minimize', label: 'Minimize (keep running)', onClick: minimizePanel, icon: <ChevronDown size={18} /> },
            { key: 'close', label: 'Close copilot', onClick: closePanel, icon: <X size={18} /> },
          ] as const).map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={b.onClick}
                  aria-label={b.label}
                  title={b.label}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 150ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
                >
                  {b.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{b.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* History Dropdown — full-width panel anchored to header */}
        {showHistory && (
          <div
            ref={historyRef}
            role="listbox"
            aria-label="Conversation history"
            style={{
              position: 'absolute',
              top: '100%',
              left: 8,
              right: 8,
              // Push the dropdown below the panel header (HISTORY toolbar)
              // and the Context badge row underneath, with breathing room
              // so the list never sits on top of the Context chrome.
              marginTop: 58,
              maxHeight: 360,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--glass-surface)',
              border: '1px solid var(--glass-border)',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              zIndex: 60,
              padding: 4,
              overflow: 'hidden',
            }}
          >
            {/* Sticky header with HISTORY · Clear all · Switch Context — kept on top, never overlapped */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderBottom: '1px solid var(--glass-border)',
                flexShrink: 0,
                background: 'var(--glass-surface)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>History</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {historyItems.length > 0 && (
                  <button onClick={clearAllConversations} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'hsl(var(--muted-foreground))', padding: '2px 4px' }}>
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => {
                    const next = readScopePreference() === 'pipeline' ? 'auto' : 'pipeline';
                    writeScopePreference(next);
                    toast.success(next === 'pipeline' ? 'Switched to Pipeline scope' : 'Switched to auto context');
                    setShowHistory(false);
                  }}
                  title="Toggle between auto-detected and pipeline-wide context"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'hsl(var(--muted-foreground))', padding: '2px 4px' }}
                >
                  Switch Context
                </button>
              </div>
            </div>
            {/* Scrollable list — vertical only, no horizontal scroll */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {historyItems.length === 0 ? (
                <div style={{ padding: '12px 10px', fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>No conversations yet</div>
              ) : (
                historyItems.map((item) => (
                  <div key={item.id} role="option" aria-selected={item.id === conversationId} style={{ display: 'flex', alignItems: 'center', gap: 4, background: item.id === conversationId ? 'rgba(126,184,247,0.1)' : 'none', borderRadius: 6, transition: 'background 100ms', minWidth: 0 }} onMouseEnter={(e) => { if (item.id !== conversationId) e.currentTarget.style.background = 'rgba(126,184,247,0.06)'; }} onMouseLeave={(e) => { if (item.id !== conversationId) e.currentTarget.style.background = 'none'; }}>
                    <button onClick={() => loadConversation(item.id)} title={item.preview} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, color: 'inherit' }}>
                      <span style={{ fontSize: 13, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{item.preview}</span>
                      <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatRelativeDate(item.date)}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteConversation(item.id); }} aria-label="Delete conversation" title="Delete conversation" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: '6px 8px', display: 'flex', borderRadius: 6, flexShrink: 0 }} onMouseEnter={(e) => (e.currentTarget.style.color = 'hsl(var(--destructive, 0 84% 60%))')} onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Context Badge — shows what the AI will treat as focus this turn */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
        {effectiveContextLabel ? (
          <div
            title={contextOverride ? 'Overridden via @mention. Click × to clear.' : 'Auto-detected from current page. Type @ to override with a different deal.'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 8px', borderRadius: 999, fontSize: 11,
              background: contextOverride ? 'rgba(126,184,247,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${contextOverride ? 'rgba(126,184,247,0.4)' : 'var(--glass-border)'}`,
              color: 'var(--foreground)',
            }}
          >
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Context:</span>
            {isDealDetail && !contextOverride ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    writeScopePreference('pipeline');
                    // Force re-resolution of the chip without leaving the page.
                    setAutoContextLabel('Pipeline');
                    toast.success('Switched to Pipeline scope for this session');
                    logUsage({
                      feature_type: 'AI_CHAT',
                      feature_subtype: 'scope_switch_to_pipeline',
                      deal_id: dealIdFromPath,
                    });
                  }}
                  title="Switch to Pipeline (portfolio-wide search) for this session"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 0, fontWeight: 500 }}
                >
                  Pipeline
                </button>
                <ChevronRight size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                <strong style={{ fontWeight: 600 }}>{effectiveContextLabel.replace(/^Deal — /, '')}</strong>
              </span>
            ) : (
              <strong style={{ fontWeight: 600 }}>{effectiveContextLabel}</strong>
            )}
            {contextOverride && (
              <button
                onClick={() => setContextOverride(null)}
                aria-label="Clear context override"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 0, display: 'inline-flex' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        ) : null}
        {!contextOverride && (
          <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {readScopePreference() === 'pipeline' && (
              <button
                type="button"
                onClick={() => {
                  writeScopePreference('auto');
                  // Re-resolve immediately if a deal overlay is open.
                  const q = new URLSearchParams(window.location.search);
                  if (q.get('deal')) {
                    setAutoContextLabel('Deal');
                  }
                  toast.success('Auto-context restored');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', textDecoration: 'underline', padding: 0, fontSize: 10 }}
              >
                Use active deal
              </button>
            )}
            <span>
              Type <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>@</kbd> to switch deal
            </span>
          </span>
        )}
      </div>

      {/* Scope is now inferred automatically from page/deal/workspace
          context + the user's natural-language request. The chip-based
          manual scope selector was removed so the experience feels
          invisible. The resolved scope is still serialized and sent to
          the edge function via `serializeScope(chatScope)` below so
          downstream Admin Agent duties keep working unchanged. */}

      {/* Proactive Nudges */}
      {nudges.length > 0 && messages.length === 0 && (
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {nudges.map((nudge) => (
            <CopilotProactiveNudge key={nudge.id} nudge={nudge} onAction={handleNudgeAction} onDismiss={() => dismissNudge(nudge.id)} />
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: isExpanded && !isMobile ? 'row' : 'column',
          overflow: 'hidden',
        }}
      >
      <div style={{ flex: isExpanded && !isMobile ? '1 1 58%' : 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {demoMode ? (
        <div role="log" aria-label="Onboarding demo conversation" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <CopilotDemoConversation />
        </div>
      ) : (
      <div role="log" aria-label="Chat messages" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Deal recap banner — surfaces prior persisted per-deal memory when reopening the AI on a deal */}
        {isDealDetail && dealIdFromPath && messages.length === 0 && dealMemory.recent.length > 0 && (() => {
          const lastUser = [...dealMemory.recent].reverse().find((m) => m.role === 'user');
          if (!lastUser) return null;
          const ageMs = Date.now() - new Date(lastUser.created_at).getTime();
          const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(ageMs / (1000 * 60 * 60));
          const ago = days >= 1 ? `${days} day${days === 1 ? '' : 's'} ago` : hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : 'just now';
          const snippet = lastUser.content.length > 140 ? lastUser.content.slice(0, 140) + '…' : lastUser.content;
          return (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(126,184,247,0.08)',
              border: '1px solid rgba(126,184,247,0.25)',
              fontSize: 12, color: 'var(--foreground)', display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <span style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Last time on this deal — {ago}
              </span>
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>“{snippet}”</span>
            </div>
          );
        })()}
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'hsl(var(--muted-foreground))',
              fontSize: 13,
              textAlign: 'center',
              padding: '0 24px',
              gap: 4,
            }}
          >
            <span>Ask me anything about your deals, tasks, or pipeline.</span>
            {isDealDetail && (
              <DealSuggestionChips
                onSelect={(prompt) => handleSend(prompt)}
                disabled={isProcessing}
              />
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={msg.role === 'assistant' ? 'group/msg' : ''}
                style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4, position: 'relative' }}
              >
                {msg.role === 'assistant' && !msg.content?.startsWith('__ERROR__') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                    <img src={naitiveFavicon} alt="" style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Copilot</span>
                  </div>
                )}
                {/* Error message with retry */}
                {msg.metadata?.kind === 'agent_run' ? (
                  <div style={{ width: '100%', maxWidth: '95%' }}>
                    <AgentRunCard
                      runId={msg.metadata.runId}
                      initialPrompt={!msg.metadata.runId ? msg.metadata.prompt : undefined}
                      initialContext={!msg.metadata.runId ? msg.metadata.context : undefined}
                    />
                  </div>
                ) : msg.metadata?.kind === 'daily_rundown_ready' ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open-daily-rundown'));
                    }}
                    style={{
                      maxWidth: '90%',
                      padding: '10px 14px',
                      borderRadius: '12px 12px 12px 2px',
                      fontSize: 14,
                      lineHeight: 1.5,
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(126,184,247,0.18), rgba(126,184,247,0.08))',
                      border: '1px solid rgba(126,184,247,0.35)',
                      color: 'var(--foreground)',
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    aria-label="Open Daily Rundown"
                  >
                    <span>📰</span>
                    <span>Your Daily Rundown is Ready</span>
                  </button>
                ) : msg.metadata?.kind === 'end_of_day_rundown_ready' ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open-daily-rundown-end-of-day'));
                    }}
                    style={{
                      maxWidth: '90%',
                      padding: '10px 14px',
                      borderRadius: '12px 12px 12px 2px',
                      fontSize: 14,
                      lineHeight: 1.5,
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(251,191,36,0.20), rgba(244,114,182,0.10))',
                      border: '1px solid rgba(251,191,36,0.40)',
                      color: 'var(--foreground)',
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    aria-label="Open End of Day Briefing"
                  >
                    <span>🌇</span>
                    <span>Your End of Day Briefing is Ready</span>
                  </button>
                ) : msg.content?.startsWith('__ERROR__') ? (
                  <div style={{
                    maxWidth: '90%', padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
                    background: 'rgba(220,53,69,0.08)', border: '1px solid rgba(220,53,69,0.25)', color: 'var(--foreground)',
                    fontSize: 14, lineHeight: 1.5,
                  }}>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>Something went wrong.</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: 12, opacity: 0.85, wordBreak: 'break-word' }}>
                      {msg.content.slice('__ERROR__::'.length) || 'Unknown error'}
                    </p>
                    <button
                      onClick={handleRetry}
                      aria-label="Retry message"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)',
                        borderRadius: 6, padding: '4px 12px', fontSize: 13,
                        color: 'hsl(var(--primary))', cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      maxWidth: msg.role === 'user' ? '85%' : '90%',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: 14, lineHeight: 1.5, position: 'relative',
                      ...(msg.role === 'user'
                        ? { background: 'rgba(126,184,247,0.12)', border: '1px solid rgba(126,184,247,0.22)', color: 'var(--foreground)', whiteSpace: 'pre-wrap' as const }
                        : { background: 'var(--glass-surface)', color: 'var(--foreground)', border: '1px solid var(--glass-border)' }),
                    }}
                    className="copilot-message-content"
                  >
                    {msg.role === 'user' ? msg.content : (
                      <CopilotAssistantContent
                        content={msg.content}
                        supersededTaskDraftKeys={supersededTaskDraftKeysByMsg.get(msg.id)}
                      />
                    )}
                    {msg.role === 'assistant' && !isProcessing && (() => {
                      const c = (msg.content || '').trim();
                      // Strip CHIPS tokens and fenced JSON action blocks the
                      // parser already extracted — if nothing meaningful
                      // remains AND no card was emitted, show an honest
                      // fallback instead of letting the bubble look empty.
                      const visible = c
                        .replace(/\[\[CHIPS:\s*\[[\s\S]*?\]\s*\]\]/g, '')
                        .replace(/```json[\s\S]*?```/g, '')
                        .trim();
                      if (visible.length > 0) return null;
                      // If we already rendered a card (the parser found a JSON
                      // action block), the original message will have had
                      // that block — its presence in raw content is enough.
                      const hadCard = /```json|"action"\s*:\s*"(confirm|auto_executed)"/.test(c);
                      if (hadCard) return null;
                      return (
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                          (No response from the Copilot — please try rephrasing.)
                        </div>
                      );
                    })()}
                    {msg.role === 'assistant' && msg.content && (
                      <MessageActions msg={msg} conversationId={conversationId} />
                    )}
                  </div>
                )}
              </div>
            ))}
            {isProcessing && !messages.some((m) => m.role === 'assistant' && m.content === '') && messages[messages.length - 1]?.role === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                  <img src={naitiveFavicon} alt="" style={{ width: 16, height: 16 }} />
                  <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Copilot</span>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--glass-surface)', border: '1px solid var(--glass-border)' }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
      )}
      </div>
      {isExpanded && (
        <aside
          aria-label="naitive AI workspace"
          style={{
            flex: isMobile ? '0 0 45%' : '1 1 42%',
            minWidth: 0,
            minHeight: 0,
            borderLeft: isMobile ? 'none' : '1px solid var(--glass-border)',
            borderTop: isMobile ? '1px solid var(--glass-border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CopilotWorkspacePane
            items={workspaceItems}
            activeId={activeWorkspaceItemId}
            onSelect={setActiveWorkspaceItemId}
            onQuickStart={(p) => handleSend(p)}
            onSendTo={handleWorkspaceSendTo}
          />
        </aside>
      )}
      </div>

      {/* Input intentionally omitted — typing happens in the floating Ask
          bar (CopilotToggleButton) which sits directly below this panel.
          That avoids the "two inputs" anti-pattern and makes the panel feel
          like a vertical extension of the bar. */}
      </div>
    </>
  );

  if (isExpanded) {
    return createPortal(
      <div
        className="fixed inset-0 z-[1300] flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="naitive AI expanded"
        // Reserve bottom padding equal to the floating composer bar height
        // (~44px offset + ~64px bar + ~16px breathing room) so the modal
        // bottom border sits visibly above the input.
        style={{
          paddingTop: isMobile ? 8 : 24,
          paddingLeft: isMobile ? 8 : 24,
          paddingRight: isMobile ? 8 : 24,
          paddingBottom: isMobile ? 140 : 160,
        }}
      >
        <div
          aria-hidden
          onClick={() => setIsExpanded(false)}
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 50% 40%, rgba(10,14,24,0.18) 0%, rgba(7,10,18,0.34) 58%, rgba(4,6,12,0.46) 100%)',
            backdropFilter: 'blur(8px) saturate(80%) brightness(0.72)',
            WebkitBackdropFilter: 'blur(8px) saturate(80%) brightness(0.72)',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            maxWidth: isMobile ? 'none' : 1440,
            maxHeight: 'calc(100vh - 200px)',
            display: 'flex',
          }}
        >
          {panelNode}
        </div>
      </div>,
      document.body,
    );
  }

  return panelNode;
}
