import React, { useMemo, useState, useRef } from 'react';
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
    // Detect mention typing (last @ followed by letters with no space yet)
    const cursor = e.target.selectionStart;
    const upto = v.slice(0, cursor);
    const m = upto.match(/@([A-Za-z][\w.-]*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const candidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery;
    return (members || [])
      .filter(m => (m.display_name || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, mentionQuery]);

  const insertMention = (name: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const replaced = before.replace(/@([A-Za-z][\w.-]*)$/, `@"${name}" `);
    const next = replaced + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => ta.focus());
  };

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
            {candidates.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                background: 'rgba(16,28,52,0.96)', border: '1px solid rgba(120,170,255,0.25)',
                borderRadius: 6, padding: 4, zIndex: 10, maxHeight: 180, overflow: 'auto',
              }}>
                {candidates.map(m => (
                  <button key={m.id} onClick={() => insertMention(m.display_name || m.email || '')}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                      border: 'none', color: '#dde8f8', padding: '4px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(80,140,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {m.display_name || m.email}
                  </button>
                ))}
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