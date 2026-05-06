import React, { useMemo, useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Trash2, ChevronDown, ChevronUp, Pencil, X, Check } from 'lucide-react';
import { useQirComments, type QirComment } from '@/hooks/useQirComments';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  reportKey: string;
  reportLabel: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  /** When true, the icon is dimmed until hovered (used for inline KPI icons). */
  hoverOnly?: boolean;
}

/** Parse @mention names from a comment body. Matches @"Full Name" or @FirstName. */
function parseMentions(text: string): string[] {
  const names: string[] = [];
  const re = /@"([^"]+)"|@([A-Za-z][A-Za-z0-9_.-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    names.push((m[1] || m[2] || '').trim());
  }
  return names;
}

function renderBodyWithMentions(text: string): React.ReactNode {
  const parts: Array<string | { mention: string }> = [];
  const re = /@"([^"]+)"|@([A-Za-z][A-Za-z0-9_.-]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ mention: m[1] || m[2] || '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === 'string'
      ? <React.Fragment key={i}>{p}</React.Fragment>
      : <span key={i} style={{ color: 'rgb(120,170,255)', background: 'rgba(80,140,255,0.12)', borderRadius: 4, padding: '0 4px' }}>@{p.mention}</span>
  );
}

export function QirCommentThread({ reportKey, reportLabel, targetType, targetId, targetLabel, hoverOnly }: Props) {
  const { comments: all, addComment, deleteComment, updateComment } = useQirComments(reportKey);
  const { user } = useAuth();
  const { members } = useCompany();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const comments = useMemo(
    () => all.filter(c => c.target_type === targetType && c.target_id === targetId),
    [all, targetType, targetId],
  );

  const submit = async () => {
    if (!draft.trim()) return;
    try {
      setSubmitting(true);
      const mentions = parseMentions(draft);
      await addComment(targetType, targetId, draft, mentions, reportLabel, targetLabel);
      setDraft('');
      setMentionQuery(null);
    } catch (e: any) {
      // best-effort surface
      console.error('addComment failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDraft(v);
    // Detect mention typing (last @ followed by any non-space chars; allow empty for `@`)
    const cursor = e.target.selectionStart;
    const upto = v.slice(0, cursor);
    const m = upto.match(/@([^\s@"]*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
    setActiveIdx(0);
  };

  /**
   * Fuzzy-score a member against the query. Higher is better.
   * Combines:
   *  - prefix bonus (starts-with on display name or any token)
   *  - substring bonus (contains)
   *  - subsequence match (chars appear in order, with proximity bonus)
   */
  const scoreMember = (m: { display_name?: string; email?: string }, q: string): number => {
    if (!q) return 1; // any member ranks equally for empty query
    const name = (m.display_name || '').toLowerCase();
    const email = (m.email || '').toLowerCase();
    const local = email.split('@')[0] || '';
    const tokens = name.split(/\s+/).filter(Boolean);
    let score = 0;
    if (name.startsWith(q)) score += 100;
    if (tokens.some(t => t.startsWith(q))) score += 60;
    if (local.startsWith(q)) score += 40;
    if (name.includes(q)) score += 20;
    if (email.includes(q)) score += 10;
    // Subsequence match against name
    let i = 0, j = 0, lastIdx = -1, gaps = 0;
    while (i < q.length && j < name.length) {
      if (q[i] === name[j]) {
        if (lastIdx >= 0) gaps += (j - lastIdx - 1);
        lastIdx = j;
        i++;
      }
      j++;
    }
    if (i === q.length) score += Math.max(0, 30 - gaps); // full subsequence match
    return score;
  };

  const candidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery;
    return (members || [])
      .map(m => ({ m, score: scoreMember(m, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.m.display_name || '').localeCompare(b.m.display_name || ''))
      .slice(0, 8)
      .map(x => x.m);
  }, [members, mentionQuery]);

  useEffect(() => {
    if (activeIdx >= candidates.length) setActiveIdx(0);
  }, [candidates, activeIdx]);

  const insertMention = (name: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const replaced = before.replace(/@([^\s@"]*)$/, `@"${name}" `);
    const next = replaced + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => ta.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery != null && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); setActiveIdx(i => (i + 1) % candidates.length); return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); setActiveIdx(i => (i - 1 + candidates.length) % candidates.length); return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const m = candidates[activeIdx];
        if (m) insertMention(m.display_name || m.email || '');
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  };

  const activeMember = candidates[activeIdx];

  const count = comments.length;
  const iconColor = open || count > 0 ? 'rgba(120,170,255,0.85)' : 'rgba(160,200,255,0.45)';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="qir-no-print"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: iconColor,
          fontSize: 11, padding: 2,
          opacity: hoverOnly && count === 0 && !open ? 0 : 1,
          transition: 'opacity .15s, color .15s',
        }}
        onMouseEnter={e => { if (hoverOnly) e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { if (hoverOnly && count === 0 && !open) e.currentTarget.style.opacity = '0'; }}
        title={count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Add a comment'}
        aria-label="Comments"
      >
        <MessageSquare size={13} />
        {count > 0 ? <span>{count}</span> : null}
        {open ? <ChevronUp size={11} /> : count > 0 ? <ChevronDown size={11} /> : null}
      </button>
      {open && (
        <div className="qir-no-print" style={{
          background: 'rgba(10,18,36,0.6)',
          border: '1px solid rgba(120,170,255,0.18)',
          borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {comments.map(c => (
            <CommentRow
              key={c.id}
              c={c}
              canModify={user?.id === c.author_user_id}
              onDelete={() => deleteComment(c.id)}
              onSave={(body) => updateComment(c.id, body)}
            />
          ))}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={taRef}
              value={draft}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Add a comment… use @ to mention"
              rows={2}
              maxLength={4000}
              style={{
                width: '100%', resize: 'vertical', minHeight: 48,
                background: 'rgba(6,12,28,0.7)', color: '#dde8f8',
                border: '1px solid rgba(120,170,255,0.18)', borderRadius: 6,
                padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {mentionQuery != null && candidates.length > 0 && (
              <div
                role="listbox"
                aria-label="Mention suggestions"
                style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                  background: 'rgba(16,28,52,0.96)', border: '1px solid rgba(120,170,255,0.25)',
                  borderRadius: 6, zIndex: 10, maxHeight: 240, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ overflow: 'auto', padding: 4 }}>
                  {candidates.map((m, idx) => {
                    const active = idx === activeIdx;
                    const initials = (m.display_name || m.email || '?')
                      .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
                    return (
                      <button
                        key={m.id}
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(m.display_name || m.email || ''); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                          background: active ? 'rgba(80,140,255,0.18)' : 'transparent',
                          border: 'none', color: '#dde8f8', padding: '5px 8px', fontSize: 12,
                          cursor: 'pointer', borderRadius: 4,
                        }}
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" width={20} height={20}
                            style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <span style={{
                            width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                            background: 'rgba(80,140,255,0.25)', color: '#dde8f8',
                            fontSize: 10, fontWeight: 600, display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}>{initials}</span>
                        )}
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.display_name || m.email}
                        </span>
                        {m.display_name && m.email && (
                          <span style={{ color: 'rgba(160,200,255,0.5)', fontSize: 10, flexShrink: 0 }}>{m.email}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {activeMember && (
                  <div style={{
                    borderTop: '1px solid rgba(120,170,255,0.18)',
                    background: 'rgba(10,18,36,0.7)',
                    padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 11, color: 'rgba(200,225,245,0.85)',
                  }}>
                    {activeMember.avatar_url ? (
                      <img src={activeMember.avatar_url} alt="" width={24} height={24}
                        style={{ borderRadius: 12, objectFit: 'cover' }} />
                    ) : (
                      <span style={{
                        width: 24, height: 24, borderRadius: 12,
                        background: 'rgba(80,140,255,0.25)', color: '#dde8f8',
                        fontSize: 11, fontWeight: 600, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {(activeMember.display_name || activeMember.email || '?')
                          .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#dde8f8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeMember.display_name || activeMember.email}
                      </div>
                      {activeMember.email && activeMember.display_name && (
                        <div style={{ color: 'rgba(160,200,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeMember.email}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'rgba(160,200,255,0.5)', fontSize: 10 }}>↵ to insert · esc</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={submit}
              disabled={!draft.trim() || submitting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: draft.trim() ? 'rgba(80,140,255,0.25)' : 'rgba(80,140,255,0.08)',
                color: '#dde8f8', border: '1px solid rgba(120,170,255,0.3)',
                borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: draft.trim() ? 'pointer' : 'default',
              }}
            >
              <Send size={12} /> Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({ c, canModify, onDelete, onSave }: { c: QirComment; canModify: boolean; onDelete: () => void; onSave: (body: string) => Promise<void> | void }) {
  let when = '';
  try { when = formatDistanceToNow(new Date(c.created_at), { addSuffix: true }); } catch {}
  const edited = c.updated_at && c.updated_at !== c.created_at;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setDraft(c.body); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(c.body); };
  const save = async () => {
    const v = draft.trim();
    if (!v || v === c.body) { setEditing(false); return; }
    try {
      setSaving(true);
      await onSave(v);
      setEditing(false);
    } catch (e) {
      console.error('updateComment failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0', borderBottom: '1px dashed rgba(120,170,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(180,200,230,0.85)' }}>
          <strong style={{ color: '#dde8f8' }}>{c.author_name || 'Unknown'}</strong>
          <span style={{ color: 'rgba(160,200,255,0.55)', marginLeft: 6 }}>{when}{edited ? ' · edited' : ''}</span>
        </div>
        {canModify && !editing && (
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button onClick={startEdit} title="Edit comment" aria-label="Edit comment"
              style={{ background: 'transparent', border: 'none', color: 'rgba(180,200,230,0.5)', cursor: 'pointer', padding: 2 }}>
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} title="Delete comment" aria-label="Delete comment"
              style={{ background: 'transparent', border: 'none', color: 'rgba(180,200,230,0.5)', cursor: 'pointer', padding: 2 }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
        {canModify && editing && (
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button onClick={save} disabled={saving || !draft.trim()} title="Save" aria-label="Save"
              style={{ background: 'transparent', border: 'none', color: 'rgba(120,200,150,0.85)', cursor: 'pointer', padding: 2 }}>
              <Check size={13} />
            </button>
            <button onClick={cancel} title="Cancel" aria-label="Cancel"
              style={{ background: 'transparent', border: 'none', color: 'rgba(180,200,230,0.5)', cursor: 'pointer', padding: 2 }}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          maxLength={4000}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          }}
          style={{
            width: '100%', resize: 'vertical', minHeight: 48,
            background: 'rgba(6,12,28,0.7)', color: '#dde8f8',
            border: '1px solid rgba(120,170,255,0.25)', borderRadius: 6,
            padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
      ) : (
        <div style={{ fontSize: 12, color: '#dde8f8', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          {renderBodyWithMentions(c.body)}
        </div>
      )}
    </div>
  );
}