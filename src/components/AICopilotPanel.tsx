import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ArrowUp, Plus, Clock, Copy, Check, ThumbsUp, ThumbsDown, HelpCircle, RefreshCw, WifiOff } from 'lucide-react';
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
import { DealAiSettingsPopover } from '@/components/copilot/DealAiSettingsPopover';
import { useDealCopilotMemory } from '@/hooks/useDealCopilotMemory';
import { CopilotAutoExecuted } from '@/components/copilot/CopilotAutoExecuted';
import { CopilotEmailDraft } from '@/components/copilot/CopilotEmailDraft';
import { CopilotDealCard } from '@/components/copilot/CopilotDealCard';
import { CopilotLenderCard } from '@/components/copilot/CopilotLenderCard';
import { CopilotTaskCard } from '@/components/copilot/CopilotTaskCard';
import { CopilotPipelineSummary } from '@/components/copilot/CopilotPipelineSummary';
import { CopilotProactiveNudge } from '@/components/copilot/CopilotProactiveNudge';
import { CopilotCorrectionPopover } from '@/components/copilot/CopilotCorrectionPopover';
import { useProactiveNudges } from '@/hooks/useProactiveNudges';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatAIResponse, getStageDisplayName } from '@/lib/copilot-utils';
import type { ConversationMutation } from '@/lib/copilot-utils';

const COPILOT_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`;

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
  if (parts.length < 2) return false;
  if (parts[0] !== 'deal' && parts[0] !== 'deals') return false;
  // For /deals, the index page has no second segment; only treat as detail when there is one.
  return Boolean(parts[1]);
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

/** Renders assistant content with entity links, JSON formatting, and stage display names */
function CopilotAssistantContent({ content }: { content: string }) {
  const navigate = useNavigate();
  
  // Fix 1: Detect and format raw JSON responses
  const formattedJson = formatAIResponse(content);
  const processedContent = formattedJson || content;
  
  // Fix 5: Replace stage slugs with display names in the content
  const displayContent = processedContent.replace(
    /(?:from|to|stage|→|->)\s*"([a-z][a-z0-9-]+)"/gi,
    (match, slug) => {
      const display = getStageDisplayName(slug);
      return display !== slug ? match.replace(`"${slug}"`, `"${display}"`) : match;
    }
  );
  
  const segments: Array<{ type: 'text' | 'confirm' | 'auto_executed' | 'email' | 'deal' | 'lender' | 'task' | 'pipeline'; value: any }> = [];
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Track seen confirm/auto_executed actions to prevent duplicates
  const seenActions = new Set<string>();

  while ((match = jsonBlockRegex.exec(displayContent)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: displayContent.slice(lastIndex, match.index) });
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.responseType === 'deal_card') segments.push({ type: 'deal', value: parsed.data });
      else if (parsed.responseType === 'lender_card') segments.push({ type: 'lender', value: parsed.data });
      else if (parsed.responseType === 'task_card') segments.push({ type: 'task', value: parsed.data });
      else if (parsed.responseType === 'pipeline_summary') segments.push({ type: 'pipeline', value: parsed.data });
      else if (parsed.action === 'confirm' && parsed.action_type) {
        const key = `confirm:${parsed.action_type}:${parsed.params?.deal_id || ''}:${parsed.params?.new_pipeline_id || parsed.params?.new_stage || ''}`;
        if (!seenActions.has(key)) {
          seenActions.add(key);
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
      else segments.push({ type: 'text', value: match[0] });
    } catch {
      segments.push({ type: 'text', value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < displayContent.length) segments.push({ type: 'text', value: displayContent.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', value: displayContent });

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'confirm') return <CopilotActionConfirm key={i} action={seg.value} />;
        if (seg.type === 'auto_executed') return <CopilotAutoExecuted key={i} action={seg.value} />;
        if (seg.type === 'email') return <CopilotEmailDraft key={i} draft={seg.value} />;
        if (seg.type === 'deal') return <CopilotDealCard key={i} deal={seg.value.deal} milestones={seg.value.milestones} />;
        if (seg.type === 'lender') return <CopilotLenderCard key={i} lender={seg.value} />;
        if (seg.type === 'task') return <CopilotTaskCard key={i} task={seg.value} />;
        if (seg.type === 'pipeline') return <CopilotPipelineSummary key={i} data={seg.value} />;
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
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
  const { isOpen, closePanel, messages, addMessage, setMessages, isProcessing, setProcessing, conversationId, setConversationId, conversationMutations, pendingPrompt, setPendingPrompt } = useCopilotStore();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; preview: string; date: string }>>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
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

  // Per-deal AI memory (loads last ~10 exchanges; persists new ones).
  const dealIdFromPath = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'deal' || parts[0] === 'deals') && parts[1]) return parts[1];
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
  }, [location.pathname]);

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
    ? `${contextOverride.entityName} (override)`
    : autoContextLabel;

  // Focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>('button, textarea, input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Screen reader announcement for new messages
  useEffect(() => {
    if (!liveRegionRef.current || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.content && !isProcessing) {
      liveRegionRef.current.textContent = 'Copilot responded: ' + last.content.slice(0, 120);
    }
  }, [messages, isProcessing]);

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
    setLastFailedMessage(null);
  }, [setConversationId, setMessages]);

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

  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  useEffect(() => {
    // Auto-load most recent conversation as soon as user is available,
    // so the assistant restores history on page refresh instead of starting a new chat.
    if (!user || messages.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from('copilot_conversations')
        .select('id, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setConversationId(data.id);
        setMessages(
          (data.messages as any[]).map((m: any) => ({
            id: m.id || crypto.randomUUID(), role: m.role, content: m.content,
            timestamp: new Date(m.timestamp || Date.now()),
          }))
        );
      }
    })();
  }, [user]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closePanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closePanel]);

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 200);
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

    isProcessingRef.current = true;
    setProcessing(true);

    const currentMessages = useCopilotStore.getState().messages;
    const history = currentMessages.filter(m => m.content !== '__ERROR__').map((m) => ({ role: m.role, content: m.content }));
    const ctx = getPageContext();
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
              // @-mention override takes precedence on the server.
              contextOverride: contextOverride
                ? { entityType: contextOverride.entityType, entityId: contextOverride.entityId, entityName: contextOverride.entityName }
                : null,
            },
            history,
            conversationMutations: useCopilotStore.getState().conversationMutations,
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
            content: "I'm sorry, I wasn't able to process that request. Could you try rephrasing it?",
            timestamp: new Date(),
          }],
        });
      }

      const allMsgs = useCopilotStore.getState().messages;
      await saveConversation(allMsgs);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Copilot stream error:', err);
      setLastFailedMessage(text);
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '__ERROR__',
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

    if (isProcessingRef.current) {
      // Queue this message to be processed after current one finishes
      messageQueueRef.current.push(text);
      return;
    }

    processMessage(text);
  }, [input, addMessage, processMessage]);

  const handleRetry = useCallback(() => {
    if (!lastFailedMessage) return;
    // Remove the error message
    const store = useCopilotStore.getState();
    const filtered = store.messages.filter((m) => m.content !== '__ERROR__');
    // Also remove the last user message that failed
    const withoutLastUser = filtered.slice(0, -1);
    setMessages(withoutLastUser);
    handleSend(lastFailedMessage);
  }, [lastFailedMessage, handleSend, setMessages]);

  // When the collapsed composer hands off a typed prompt, auto-send it
  // once the panel is open.
  useEffect(() => {
    if (!isOpen || !pendingPrompt) return;
    const text = pendingPrompt;
    setPendingPrompt(null);
    handleSend(text);
  }, [isOpen, pendingPrompt, setPendingPrompt, handleSend]);

  const handleNudgeAction = useCallback((prompt: string) => {
    handleSend(prompt);
  }, [handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  const panelWidth = isMobile ? '100vw' : 440;
  const panelHeight = isMobile ? '100vh' : '70vh';

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={closePanel}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'copilot-fade-in 200ms ease-out',
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="naitive AI"
        aria-modal="true"
        style={{
          position: 'fixed',
          bottom: isMobile ? 0 : 24,
          right: isMobile ? 0 : 24,
          width: panelWidth,
          height: panelHeight,
          maxHeight: isMobile ? '100vh' : 'calc(100vh - 48px)',
          zIndex: 51,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(8, 10, 18, 0.92)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          borderRadius: isMobile ? 0 : 16,
          border: isMobile ? 'none' : '1px solid var(--glass-border)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
          animation: 'copilot-popup-in 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes copilot-popup-in {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
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
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={naitiveFavicon} alt="" style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>naitive AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
          <button onClick={handleNewConversation} aria-label="New conversation" title="New conversation" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 150ms' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}>
            <Plus size={18} />
          </button>
          <button onClick={loadHistory} aria-label="Conversation history" title="Conversation history" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 150ms' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}>
            <Clock size={18} />
          </button>
          <button onClick={closePanel} aria-label="Close copilot" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 150ms' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}>
            <X size={18} />
          </button>

          {/* History Dropdown */}
          {showHistory && (
            <div ref={historyRef} role="listbox" aria-label="Conversation history" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 300, maxHeight: 320, overflowY: 'auto', background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: 60, padding: 4 }}>
              {historyItems.length === 0 ? (
                <div style={{ padding: '12px 10px', fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>No conversations yet</div>
              ) : (
                historyItems.map((item) => (
                  <button key={item.id} role="option" aria-selected={item.id === conversationId} onClick={() => loadConversation(item.id)} style={{ width: '100%', textAlign: 'left', background: item.id === conversationId ? 'rgba(126,184,247,0.1)' : 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, transition: 'background 100ms' }} onMouseEnter={(e) => { if (item.id !== conversationId) e.currentTarget.style.background = 'rgba(126,184,247,0.06)'; }} onMouseLeave={(e) => { if (item.id !== conversationId) e.currentTarget.style.background = 'none'; }}>
                    <span style={{ fontSize: 13, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.preview}</span>
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatRelativeDate(item.date)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
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
            <strong style={{ fontWeight: 600 }}>{effectiveContextLabel}</strong>
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
          <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginLeft: 'auto' }}>
            Type <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>@</kbd> to switch deal
          </span>
        )}
      </div>

      {/* Proactive Nudges */}
      {nudges.length > 0 && messages.length === 0 && (
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {nudges.map((nudge) => (
            <CopilotProactiveNudge key={nudge.id} nudge={nudge} onAction={handleNudgeAction} onDismiss={() => dismissNudge(nudge.id)} />
          ))}
        </div>
      )}

      {/* Messages */}
      <div role="log" aria-label="Chat messages" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                {msg.role === 'assistant' && msg.content !== '__ERROR__' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                    <img src={naitiveFavicon} alt="" style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Copilot</span>
                  </div>
                )}
                {/* Error message with retry */}
                {msg.content === '__ERROR__' ? (
                  <div style={{
                    maxWidth: '90%', padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
                    background: 'rgba(220,53,69,0.08)', border: '1px solid rgba(220,53,69,0.25)', color: 'var(--foreground)',
                    fontSize: 14, lineHeight: 1.5,
                  }}>
                    <p style={{ margin: '0 0 8px 0' }}>Something went wrong. Please try again.</p>
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
                    {msg.role === 'user' ? msg.content : <CopilotAssistantContent content={msg.content} />}
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

      {/* Input */}
      <div style={{ padding: '12px 16px', flexShrink: 0, borderTop: '1px solid var(--glass-border)' }}>
        <div style={{ position: 'relative' }}>
          {/* @-mention deal autocomplete */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div
              role="listbox"
              style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6,
                background: 'rgba(8,10,18,0.98)', border: '1px solid var(--glass-border)',
                borderRadius: 10, padding: 4, zIndex: 70, maxHeight: 220, overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              {mentionMatches.map((d) => (
                <button
                  key={d.id}
                  role="option"
                  onClick={() => {
                    setContextOverride({ entityType: 'deal', entityId: d.id, entityName: d.company });
                    // Strip the trailing "@query" from the input.
                    setInput((curr) => curr.replace(/(?:^|\s)@[^\s@]*$/, (m) => (m.startsWith(' ') ? ' ' : '')));
                    setMentionQuery(null);
                    setMentionMatches([]);
                    textareaRef.current?.focus();
                  }}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
                    color: 'var(--foreground)', fontSize: 13,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(126,184,247,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  {d.company}
                </button>
              ))}
            </div>
          )}
          {/* Shortcuts help button */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <ShortcutsTooltip visible={showShortcuts} />
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              // Auto-dismiss any visible proactive nudges / suggestion bar as
              // soon as the user starts typing so the input is never blocked
              // or visually crowded by the suggestion stack.
              if (v && !input && nudges.length > 0) {
                dismissAllNudges();
              }
              setInput(v);
              // Detect a trailing "@token" at cursor → drive deal autocomplete.
              const cursor = e.target.selectionStart ?? v.length;
              const upToCursor = v.slice(0, cursor);
              const m = upToCursor.match(/(?:^|\s)@([^\s@]{0,40})$/);
              setMentionQuery(m ? m[1] : null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            aria-label="Message input"
            style={{
              width: '100%', background: 'var(--glass-surface)',
              border: '1px solid var(--glass-border)', borderRadius: 12,
              padding: '10px 44px 10px 40px', fontSize: 14,
              color: 'var(--foreground)', resize: 'none', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.5, transition: 'border-color 150ms',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          />
          {/* ? icon button */}
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            onMouseEnter={() => setShowShortcuts(true)}
            onMouseLeave={() => setShowShortcuts(false)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            style={{
              position: 'absolute', left: 10, bottom: 10,
              width: 24, height: 24, borderRadius: '50%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'hsl(var(--muted-foreground))', display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 0,
              transition: 'color 150ms',
            }}
          >
            <HelpCircle size={15} />
            <ShortcutsTooltip visible={showShortcuts} />
          </button>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            aria-label="Send message"
            style={{
              position: 'absolute', right: 8, bottom: 8,
              width: 32, height: 32, borderRadius: '50%',
              background: 'hsl(var(--primary))', color: 'white',
              border: 'none', cursor: input.trim() && !isProcessing ? 'pointer' : 'default',
              opacity: input.trim() && !isProcessing ? 1 : 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, transition: 'opacity 150ms',
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
