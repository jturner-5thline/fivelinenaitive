import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, NotebookPen, X, AtSign, Send, Inbox, MessageSquarePlus } from 'lucide-react';
import { useQirComments } from '@/hooks/useQirComments';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { PromoteToQueueButton } from '@/components/insights/comments/PromoteToQueueButton';
import { useReportAgendaQueue } from '@/hooks/useReportAgendaQueue';
import { MentionText } from '@/components/insights/comments/MentionText';
import { CommentTypePicker, type CommentType } from '@/components/insights/comments/CommentTypePicker';
import { useInsertAgendaFootnote } from '@/components/insights/footnotes/useInsertAgendaFootnote';
import { toast } from 'sonner';

/**
 * Resolves a contextual "source" from the right-click target by walking up
 * the DOM looking for a `data-comment-source` ancestor. Falls back to the
 * closest section anchor matching the configured prefix (default
 * `qir-section-`).
 */
function resolveSource(
  el: HTMLElement | null,
  sectionIdPrefix: string,
  sectionLabels: Record<string, string>,
  fallbackLabel: string,
): { type: string; id: string; label: string } {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (node.dataset && node.dataset.commentSource) {
      const id = node.dataset.commentSourceId || node.dataset.commentSource;
      const label = node.dataset.commentSourceLabel || node.dataset.commentSource;
      return { type: node.dataset.commentSource, id, label };
    }
    if (node.id && node.id.startsWith(sectionIdPrefix)) {
      const sectionKey = node.id.replace(new RegExp(`^${sectionIdPrefix}`), '');
      return { type: 'section', id: sectionKey, label: sectionLabels[sectionKey] || sectionKey };
    }
    node = node.parentElement;
  }
  return { type: 'section', id: 'page', label: fallbackLabel };
}

const DEFAULT_SECTION_LABELS: Record<string, string> = {
  summary: 'Executive Summary',
  financials: 'Revenue & Financial Performance',
  pipeline: 'Goals',
  metrics: 'Initiatives',
  goals: 'Open Risks',
  commentary: 'Commentary & Footer',
};

/** Maps QIR comment target_type strings to the queue's source_type enum. */
function mapTargetTypeToQueue(t: string):
  'kpi' | 'chart' | 'goal' | 'initiative' | 'risk' | 'section' | 'narrative' | 'selected_text' {
  switch (t) {
    case 'kpi': return 'kpi';
    case 'chart': return 'chart';
    case 'goal': return 'goal';
    case 'initiative': return 'initiative';
    case 'risk': return 'risk';
    case 'narrative': return 'narrative';
    case 'narrative-range':
    case 'selected_text': return 'selected_text';
    default: return 'section';
  }
}

/** Best-effort snapshot of the underlying element's text for traceability. */
function snapshotForSource(type: string, id: string, label: string | undefined, sectionIdPrefix: string): string {
  let el: HTMLElement | null = null;
  if (type === 'section') el = document.getElementById(`${sectionIdPrefix}${id}`);
  else el = document.querySelector<HTMLElement>(
    `[data-comment-source="${type}"][data-comment-source-id="${CSS.escape(id)}"]`,
  );
  const text = (el?.innerText || label || id || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 400);
}

interface MentionPickerProps {
  members: Array<{ user_id: string; display_name?: string; email?: string }>;
  query: string;
  onPick: (name: string) => void;
}
function MentionPicker({ members, query, onPick }: MentionPickerProps) {
  const q = query.toLowerCase();
  const matches = members
    .filter(m => {
      const n = (m.display_name || m.email || '').toLowerCase();
      return q === '' || n.includes(q);
    })
    .slice(0, 6);
  if (matches.length === 0) return null;
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
      background: 'rgba(12,20,36,0.98)', border: '1px solid rgba(120,170,255,0.25)',
      borderRadius: 6, padding: 4, maxHeight: 180, overflowY: 'auto', zIndex: 10,
    }}>
      {matches.map(m => (
        <button
          key={m.user_id}
          type="button"
          onClick={() => onPick(m.display_name || m.email || '')}
          style={{
            display: 'flex', width: '100%', alignItems: 'center', gap: 6, padding: '5px 8px',
            background: 'transparent', border: 'none', color: '#dde8f8', cursor: 'pointer',
            fontSize: 12, textAlign: 'left', borderRadius: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,140,255,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <AtSign size={11} style={{ opacity: 0.6 }} />
          <span>{m.display_name || m.email}</span>
          {m.email && m.display_name ? (
            <span style={{ marginLeft: 'auto', color: 'rgba(180,200,230,0.5)', fontSize: 10 }}>{m.email}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Parses @mentions from a body. Matches @"Full Name" or @Token. */
function parseMentions(body: string): string[] {
  const matches = body.match(/@"([^"]+)"|@([A-Za-z][A-Za-z0-9_.\-]*)/g) || [];
  return matches.map(s => s.replace(/^@"?|"?$/g, ''));
}

interface ComposerState {
  x: number;
  y: number;
  source: { type: string; id: string; label: string };
  snippet?: string;
  hasSelection?: boolean;
}

interface QuickMenuState {
  x: number;
  y: number;
  source: { type: string; id: string; label: string };
  snippet: string;
  hasSelection: boolean;
}

export function QirContextualComments({
  reportKey,
  reportLabel,
  rootRef,
  sectionIdPrefix = 'qir-section-',
  sectionLabels = DEFAULT_SECTION_LABELS,
  fallbackSourceLabel = 'Dashboard',
}: {
  reportKey: string;
  reportLabel: string;
  rootRef: React.RefObject<HTMLElement>;
  /** DOM id prefix used to discover section anchors (e.g. `agenda-section-`). */
  sectionIdPrefix?: string;
  /** Maps section-key → human label for the right-click composer header. */
  sectionLabels?: Record<string, string>;
  /** Label used when no source can be resolved (defaults to "Dashboard"). */
  fallbackSourceLabel?: string;
}) {
  // Safe defaults: hooks may briefly return undefined on first render before
  // auth/company context resolves. Default every collection to an empty array
  // and every async action to a no-op so render paths never touch null/undefined.
  const qirCommentsApi = useQirComments(reportKey) || ({} as any);
  const comments = qirCommentsApi.comments ?? [];
  const addComment = qirCommentsApi.addComment ?? (async () => null);
  const companyApi = (useCompany() || {}) as any;
  const companyMembers = companyApi.members ?? [];
  // Canonical team list (same source as Task @mentions). Falls back to
  // company members if the RPC hasn't returned yet.
  const teamMembers = useTeamMembers() || [];
  const members = useMemo(() => {
    const map = new Map<string, { user_id: string; display_name?: string; email?: string }>();
    for (const m of companyMembers) {
      if (m?.user_id) map.set(m.user_id, { user_id: m.user_id, display_name: m.display_name, email: m.email });
    }
    for (const m of teamMembers) {
      if (m?.id) {
        const existing = map.get(m.id) || { user_id: m.id };
        map.set(m.id, {
          user_id: m.id,
          display_name: existing.display_name || m.display_name,
          email: existing.email || m.email || undefined,
        });
      }
    }
    return Array.from(map.values());
  }, [companyMembers, teamMembers]);
  const queueApi = (useReportAgendaQueue() || {}) as any;
  const promote = queueApi.promote ?? (async () => null);
  const insertFootnote = useInsertAgendaFootnote();
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [quickMenu, setQuickMenu] = useState<QuickMenuState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [commentType, setCommentType] = useState<CommentType>('note');
  const [submitting, setSubmitting] = useState(false);
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Find header slot (created in Insights.tsx). Re-check on mount/updates.
  useEffect(() => {
    const tryFind = () => {
      const el = document.getElementById('qir-header-actions-slot');
      setSlotEl(el);
    };
    tryFind();
    const t = window.setInterval(tryFind, 500);
    return () => window.clearInterval(t);
  }, []);

  // Right-click handler scoped to the dashboard root.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't hijack right-click on form inputs / editable surfaces — preserve
      // native UX there. Anchors (Goals/Initiatives link out to Asana) are
      // intentionally NOT excluded: users still need the Queue/Comment menu
      // on those rows.
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Avoid intercepting clicks inside the comments drawer/composer themselves.
      if (target.closest('[data-qir-comments-ui]')) return;
      e.preventDefault();
      const source = resolveSource(target, sectionIdPrefix, sectionLabels, fallbackSourceLabel);
      // Capture snippet: prefer a live text selection (if it sits inside the
      // right-clicked content); otherwise fall back to the nearest block text.
      let snippet = '';
      let hasSelection = false;
      try {
        const sel = window.getSelection();
        const selText = sel?.toString().trim() || '';
        if (selText && sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (target.contains(range.commonAncestorContainer) || range.commonAncestorContainer.contains(target)) {
            snippet = selText;
            hasSelection = true;
          }
        }
      } catch { /* ignore selection access errors */ }
      if (!snippet) {
        const block = (target.closest('p, li, h1, h2, h3, h4, td, th, [data-comment-source], [id^="qir-section-"]') as HTMLElement) || target;
        snippet = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim();
      }
      snippet = snippet.slice(0, 400);
      // Position quick menu near the cursor, clamped to viewport.
      const w = 320, h = 200;
      const x = Math.min(e.clientX, window.innerWidth - w - 12);
      const y = Math.min(e.clientY, window.innerHeight - h - 12);
      setQuickMenu(null);
      setBody('');
      setComposer({ x, y, source, snippet, hasSelection });
      setCommentType('note');
      setTimeout(() => taRef.current?.focus(), 30);
    };
    root.addEventListener('contextmenu', onCtx);
    return () => root.removeEventListener('contextmenu', onCtx);
  }, [rootRef, sectionIdPrefix, sectionLabels, fallbackSourceLabel]);

  // ESC to close composer.
  useEffect(() => {
    if (!composer && !quickMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setComposer(null); setQuickMenu(null); }
    };
    const onDown = (e: MouseEvent) => {
      if (!quickMenu) return;
      const t = e.target as HTMLElement;
      if (t.closest('[data-qir-quick-menu]')) return;
      setQuickMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [composer, quickMenu]);

  const submit = useCallback(async () => {
    if (!composer || !body.trim() || submitting) return;
    setSubmitting(true);
    try {
      // Contextual highlight composer routes DIRECTLY to the Queue tab.
      // It no longer creates an Agenda comment or an Agenda footnote — the
      // captured selection + user text/type is staged as a queue item with
      // full source context (tab + section + snippet) for traceability.
      const { source, snippet } = composer;
      const queued = await promote({
        reportTab: reportLabel,
        sourceType: mapTargetTypeToQueue(source.type),
        sourceId: source.id,
        sourceAnchor: `${source.type}:${source.id}`,
        sourceSnapshotText: snippet || snapshotForSource(source.type, source.id, source.label, sectionIdPrefix),
        sourceLabel: source.label,
        commentSource: 'qir',
        commentId: null,
        commentTextSnapshot: body,
        commentType,
      } as any);
      if (queued) {
        toast.success('Added to Queue', { description: source.label });
      } else {
        toast.error("Couldn't add to queue");
      }
      setComposer(null);
      setBody('');
      setCommentType('note');
    } catch (err) {
      console.error('Add to queue failed', err);
    } finally {
      setSubmitting(false);
    }
  }, [composer, body, commentType, submitting, promote, reportLabel, sectionIdPrefix]);

  // Mention autocomplete: detect trailing `@` or `@token` in body.
  // Allow zero-length token so the picker opens immediately on `@`.
  const mentionMatch = useMemo(() => {
    const m = /(?:^|\s)@([A-Za-z0-9_.\- ]{0,40})$/.exec(body);
    return m ? { token: m[1] || '', start: m.index + (m[0].startsWith('@') ? 0 : 1) } : null;
  }, [body]);
  const onPickMention = (name: string) => {
    if (!mentionMatch) return;
    const before = body.slice(0, mentionMatch.start);
    const formatted = name.includes(' ') ? `@"${name}"` : `@${name}`;
    setBody(before + formatted + ' ');
    setTimeout(() => taRef.current?.focus(), 0);
  };

  // Group comments by thread (source) for the drawer.
  const grouped = useMemo(() => {
    const map = new Map<string, { type: string; id: string; label: string; items: typeof comments }>();
    for (const c of comments) {
      const key = `${c.target_type}::${c.target_id}`;
      let g = map.get(key);
      if (!g) {
        const label = sectionLabels[c.target_id] || c.target_id;
        g = { type: c.target_type, id: c.target_id, label, items: [] as any };
        map.set(key, g);
      }
      g.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      const la = a.items[a.items.length - 1].created_at;
      const lb = b.items[b.items.length - 1].created_at;
      return lb.localeCompare(la);
    });
  }, [comments]);

  const memberById = useMemo(() => {
    const m = new Map<string, { display_name?: string; email?: string }>();
    for (const x of members || []) m.set(x.user_id, x);
    return m;
  }, [members]);

  const jumpToSource = (type: string, id: string) => {
    setDrawerOpen(false);
    let el: HTMLElement | null = null;
    if (type === 'section') {
      el = document.getElementById(`${sectionIdPrefix}${id}`);
    } else {
      el = document.querySelector<HTMLElement>(`[data-comment-source="${type}"][data-comment-source-id="${CSS.escape(id)}"]`);
    }
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow .35s';
    el.style.boxShadow = '0 0 0 2px rgba(124,200,240,0.7), 0 0 24px rgba(124,200,240,0.45)';
    setTimeout(() => { el!.style.boxShadow = prev; }, 1600);
  };

  // Header-level comment/queue UI is consolidated into the single
  // "Queue" dropdown rendered by ManagementReviewCarousel. We intentionally
  // no longer render a "View all comments" button or an Agenda Queue badge
  // in the QIR header slot — that surface is now Queue-only.
  const headerButton = null;

  return (
    <>
      {headerButton}

      {composer && (
        <div
          data-qir-comments-ui
          className="qir-no-print"
          style={{
            position: 'fixed', left: composer.x, top: composer.y, width: 320, zIndex: 60,
            background: 'rgba(12,20,36,0.98)', border: '1px solid rgba(120,170,255,0.3)',
            borderRadius: 8, boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(160,200,255,0.6)' }}>
                Add to Queue
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dde8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {composer.source.label}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setComposer(null)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(200,225,245,0.7)', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
          {composer.snippet && (
            <div style={{
              padding: '6px 8px', borderLeft: '2px solid rgba(124,200,240,0.6)',
              background: 'rgba(124,200,240,0.06)', borderRadius: 4,
              fontSize: 11, color: 'rgba(200,225,245,0.7)', lineHeight: 1.4,
              maxHeight: 48, overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {composer.hasSelection ? '“' : ''}{composer.snippet.slice(0, 180)}{composer.snippet.length > 180 ? '…' : ''}{composer.hasSelection ? '”' : ''}
            </div>
          )}
          <CommentTypePicker value={commentType} onChange={setCommentType} />
          <div style={{ position: 'relative' }}>
            <textarea
              ref={taRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
              }}
              placeholder="Write a comment… use @ to mention"
              style={{
                width: '100%', minHeight: 90, resize: 'vertical',
                background: 'rgba(255,255,255,0.04)', color: '#dde8f8',
                border: '1px solid rgba(120,170,255,0.18)', borderRadius: 6,
                padding: 8, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none',
              }}
            />
            {mentionMatch && (
              <MentionPicker
                members={members || []}
                query={mentionMatch.token.trim()}
                onPick={onPickMention}
              />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'rgba(180,200,230,0.55)' }}>⌘/Ctrl + Enter to add</span>
            <button
              type="button"
              onClick={submit}
              disabled={!body.trim() || submitting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: body.trim() ? 'rgba(80,140,255,0.85)' : 'rgba(80,140,255,0.3)',
                color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6,
                cursor: body.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600,
              }}
            >
              <Send size={12} /> Add to Queue
            </button>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div
          data-qir-comments-ui
          className="qir-no-print"
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 400, maxWidth: '100vw',
              background: 'rgba(10,18,36,0.97)', borderLeft: '1px solid rgba(120,170,255,0.2)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(120,170,255,0.15)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(160,200,255,0.55)' }}>All comments</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#dde8f8' }}>{reportLabel}</div>
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'rgba(200,225,245,0.7)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped.length === 0 && (
                <div style={{ color: 'rgba(180,200,230,0.6)', fontSize: 13, textAlign: 'center', padding: '40px 16px', lineHeight: 1.5 }}>
                  <MessageSquare size={20} style={{ opacity: 0.5, marginBottom: 8 }} />
                  <div>No comments yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(180,200,230,0.45)' }}>
                    Right-click anywhere on the dashboard to add a comment.
                  </div>
                </div>
              )}
              {grouped.map(g => (
                <div key={`${g.type}-${g.id}`} style={{
                  background: 'rgba(16,28,52,0.6)', border: '1px solid rgba(120,170,255,0.15)',
                  borderRadius: 8, padding: 10,
                }}>
                  <button
                    type="button"
                    onClick={() => jumpToSource(g.type, g.id)}
                    title="Jump to source"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
                      border: 'none', color: '#7cc8f0', cursor: 'pointer', padding: 0, marginBottom: 6,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700,
                    }}
                  >
                    {g.label}
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.items.map(c => {
                      let when = '';
                      try { when = new Date(c.created_at).toLocaleString(); } catch {}
                      const tagged = (c.mentioned_user_ids || []).map(uid => {
                        const m = memberById.get(uid);
                        return m?.display_name || m?.email || null;
                      }).filter(Boolean) as string[];
                      return (
                        <div key={c.id} style={{ borderLeft: '2px solid rgba(120,170,255,0.25)', paddingLeft: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(180,200,230,0.7)', marginBottom: 2 }}>
                            <strong style={{ color: '#dde8f8' }}>{c.author_name || 'Unknown'}</strong>
                            <span>{when}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#dde8f8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            <MentionText text={c.body} />
                          </div>
                          {tagged.length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {tagged.map(name => (
                                <span key={name} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10,
                                  padding: '1px 6px', borderRadius: 4,
                                  background: 'rgba(80,140,255,0.18)', color: 'rgba(200,225,255,0.95)',
                                  border: '1px solid rgba(120,170,255,0.3)',
                                }}>
                                  <AtSign size={9} />{name}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: 6 }}>
                            <PromoteToQueueButton
                              size="xs"
                              input={() => ({
                                reportTab: reportLabel,
                                sourceType: mapTargetTypeToQueue(g.type),
                                sourceId: g.id,
                                sourceAnchor: `${g.type}:${g.id}`,
                                sourceSnapshotText: snapshotForSource(g.type, g.id, g.label, sectionIdPrefix),
                                sourceLabel: g.label,
                                commentSource: 'qir',
                                commentId: c.id,
                                commentTextSnapshot: c.body,
                              })}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}