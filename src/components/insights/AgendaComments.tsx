import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  useFloating, autoUpdate, offset, flip, shift, arrow,
} from '@floating-ui/react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';
import {
  Check, Trash2, Pencil, X, MessageSquare, Send, CornerDownRight,
  ArrowUp,
} from 'lucide-react';
import { findCommentRanges } from './CommentMark';

// ---------- Types ----------
export interface AgendaThread {
  id: string;
  agenda_id: string;
  company_id: string;
  created_by: string;
  anchor_text: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaComment {
  id: string;
  thread_id: string;
  parent_comment_id: string | null;
  company_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ---------- Mention parsing ----------
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

/** Extracts user ids referenced via `@[Name](uuid)` tokens. */
export function parseMentionIds(body: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  while ((m = re.exec(body)) !== null) ids.add(m[2]);
  return Array.from(ids);
}

/** Render a comment body, turning @[Name](uuid) tokens into <span> pills. */
export function renderCommentBody(body: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  const re = new RegExp(MENTION_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) nodes.push(body.slice(lastIdx, m.index));
    nodes.push(
      <span
        key={`${m.index}-${m[2]}`}
        data-user-id={m[2]}
        style={{
          color: '#7ed0ff',
          background: 'rgba(80,140,255,0.18)',
          borderRadius: 6,
          padding: '0 6px',
          margin: '0 1px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        @{m[1]}
      </span>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < body.length) nodes.push(body.slice(lastIdx));
  return <>{nodes}</>;
}

// ---------- Hook ----------
export function useAgendaComments(agendaId: string | null, companyId: string | null) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<AgendaThread[]>([]);
  const [comments, setComments] = useState<AgendaComment[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!agendaId) {
      setThreads([]);
      setComments([]);
      return;
    }
    setLoading(true);
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase
        .from('agenda_comment_threads')
        .select('*')
        .eq('agenda_id', agendaId)
        .order('created_at', { ascending: true }),
      supabase
        .from('agenda_comments')
        .select('*')
        .in(
          'thread_id',
          // subquery via join: filter via thread.agenda_id
          (
            await supabase
              .from('agenda_comment_threads')
              .select('id')
              .eq('agenda_id', agendaId)
          ).data?.map((r: any) => r.id) ?? ['00000000-0000-0000-0000-000000000000'],
        )
        .order('created_at', { ascending: true }),
    ]);
    setThreads((t as any) || []);
    setComments((c as any) || []);
    setLoading(false);
  }, [agendaId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: broadcast changes on agenda:{agenda_id}
  const [flashThreadId, setFlashThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (!agendaId) return;
    const channel = supabase
      .channel(`agenda:${agendaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agenda_comment_threads', filter: `agenda_id=eq.${agendaId}` },
        () => { void refetch(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agenda_comments' },
        (payload) => {
          const row: any = payload.new || payload.old;
          if (row?.thread_id) {
            setFlashThreadId(row.thread_id);
            window.setTimeout(() => setFlashThreadId(null), 1200);
          }
          void refetch();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [agendaId, refetch]);

  // ---------- Mutations ----------
  const createThread = useCallback(
    async (anchorText: string): Promise<AgendaThread | null> => {
      if (!user?.id || !companyId || !agendaId) return null;
      const { data, error } = await supabase
        .from('agenda_comment_threads')
        .insert({
          agenda_id: agendaId,
          company_id: companyId,
          created_by: user.id,
          anchor_text: anchorText.slice(0, 240),
        })
        .select()
        .single();
      if (error) { toast.error('Could not start thread', { description: error.message }); return null; }
      await refetch();
      return data as any;
    },
    [user?.id, companyId, agendaId, refetch],
  );

  const addComment = useCallback(
    async (
      threadId: string,
      body: string,
      parentCommentId: string | null = null,
    ): Promise<AgendaComment | null> => {
      if (!user?.id || !companyId) return null;
      const trimmed = body.trim();
      if (!trimmed) return null;
      const mentions = parseMentionIds(trimmed);
      const { data, error } = await supabase
        .from('agenda_comments')
        .insert({
          thread_id: threadId,
          parent_comment_id: parentCommentId,
          company_id: companyId,
          author_id: user.id,
          body: trimmed,
          mentions,
        })
        .select()
        .single();
      if (error) { toast.error('Could not post comment', { description: error.message }); return null; }
      // Fan out @mentions to notification_instances (best-effort; RLS may block if the user isn't admin)
      if (mentions.length > 0) {
        await Promise.all(
          mentions.map((rid) =>
            supabase.from('notification_instances').insert({
              trigger_key: 'agenda_comment_mention',
              recipient_user_id: rid,
              channel_type: 'in_app' as any,
              actor_user_id: user.id,
              title: 'You were mentioned in an agenda comment',
              body: trimmed.replace(MENTION_RE, '@$1').slice(0, 280),
              context: { thread_id: threadId, comment_id: data?.id, agenda_id: agendaId },
            } as any).then(() => {}, () => {}),
          ),
        );
      }
      await refetch();
      return data as any;
    },
    [user?.id, companyId, agendaId, refetch],
  );

  const editComment = useCallback(async (id: string, body: string) => {
    const mentions = parseMentionIds(body);
    const { error } = await supabase
      .from('agenda_comments')
      .update({ body: body.trim(), mentions })
      .eq('id', id);
    if (error) toast.error('Edit failed', { description: error.message });
    await refetch();
  }, [refetch]);

  const softDeleteComment = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('agenda_comments')
      .update({ deleted_at: new Date().toISOString(), body: '' })
      .eq('id', id);
    if (error) toast.error('Delete failed', { description: error.message });
    await refetch();
  }, [refetch]);

  const setResolved = useCallback(async (threadId: string, resolved: boolean) => {
    const { error } = await supabase
      .from('agenda_comment_threads')
      .update({
        resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? user?.id : null,
      })
      .eq('id', threadId);
    if (error) toast.error('Resolve failed', { description: error.message });
    await refetch();
  }, [user?.id, refetch]);

  const deleteThread = useCallback(async (threadId: string) => {
    const { error } = await supabase.from('agenda_comment_threads').delete().eq('id', threadId);
    if (error) toast.error('Delete failed', { description: error.message });
    await refetch();
  }, [refetch]);

  return {
    threads, comments, loading, flashThreadId, refetch,
    createThread, addComment, editComment, softDeleteComment, setResolved, deleteThread,
  };
}

// ---------- Mention popover (uncontrolled input) ----------
function MentionableTextarea({
  value, onChange, onSubmit, members, placeholder, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  members: TeamMember[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    if (query == null) return [] as TeamMember[];
    const q = query.toLowerCase();
    return members
      .filter((m) =>
        m.display_name.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [members, query]);

  const insertMention = (m: TeamMember) => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    // Find the @query we started.
    const atIdx = before.lastIndexOf('@');
    if (atIdx < 0) return;
    const next = before.slice(0, atIdx) + `@[${m.display_name}](${m.id}) ` + after;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = atIdx + `@[${m.display_name}](${m.id}) `.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query != null && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertMention(filtered[activeIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const onChangeInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const ta = e.target;
    const caret = ta.selectionStart;
    const before = v.slice(0, caret);
    const m = /@(\w*)$/.exec(before);
    setQuery(m ? m[1] : null);
    setActiveIdx(0);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={onChangeInput}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'Add a comment…'}
        autoFocus={autoFocus}
        rows={2}
        style={{
          width: '100%', resize: 'vertical', minHeight: 52,
          background: 'rgba(10,20,40,0.7)', color: 'rgba(230,240,255,0.95)',
          border: '0.5px solid rgba(80,140,255,0.25)', borderRadius: 8,
          padding: '8px 10px', fontSize: 12, lineHeight: 1.5, outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      {query != null && filtered.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 1500,
          background: 'rgba(16,28,52,0.98)', border: '0.5px solid rgba(80,140,255,0.35)',
          borderRadius: 8, padding: 4, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}>
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: i === activeIdx ? 'rgba(80,140,255,0.18)' : 'transparent',
                color: 'rgba(230,240,255,0.95)', fontSize: 12, border: 'none',
              }}
            >
              <div style={{ fontWeight: 600 }}>{m.display_name}</div>
              {m.email && <div style={{ fontSize: 10, color: 'rgba(180,210,245,0.6)' }}>{m.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Selection bubble ----------
export function SelectionBubble({
  editor, onComment,
}: { editor: Editor | null; onComment: (text: string, from: number, to: number) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number; from: number; to: number; text: string } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) { setPos(null); return; }
      const text = editor.state.doc.textBetween(from, to, ' ').trim();
      if (!text) { setPos(null); return; }
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const left = (start.left + end.right) / 2;
      const top = start.top - 8 + window.scrollY;
      setPos({ left: left + window.scrollX, top, from, to, text });
    };
    editor.on('selectionUpdate', update);
    editor.on('blur', () => setTimeout(() => {
      // keep bubble visible briefly to allow click
      if (!document.activeElement?.closest('[data-agenda-bubble]')) setPos(null);
    }, 150));
    return () => { editor.off('selectionUpdate', update); };
  }, [editor]);

  if (!pos) return null;
  return (
    <div
      data-agenda-bubble
      style={{
        position: 'absolute', left: pos.left, top: pos.top,
        transform: 'translate(-50%, -100%)', zIndex: 1600,
      }}
    >
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onComment(pos.text, pos.from, pos.to); setPos(null); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          background: 'linear-gradient(180deg, #9bdcff, #4db8ff)', color: '#0a2540',
          border: '0.5px solid rgba(255,255,255,0.4)', cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        }}
      >
        <MessageSquare size={12} /> Comment
      </button>
    </div>
  );
}

// ---------- Context menu ----------
export function CommentContextMenu({
  editor, onAddComment,
}: { editor: Editor | null; onAddComment: (text: string, from: number, to: number) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number; from: number; to: number; text: string } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const handler = (e: MouseEvent) => {
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) return; // let browser handle
      const text = editor.state.doc.textBetween(from, to, ' ').trim();
      if (!text) return;
      e.preventDefault();
      setMenu({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, from, to, text });
    };
    const onAnyClick = () => setMenu(null);
    dom.addEventListener('contextmenu', handler);
    window.addEventListener('click', onAnyClick);
    window.addEventListener('scroll', onAnyClick, true);
    return () => {
      dom.removeEventListener('contextmenu', handler);
      window.removeEventListener('click', onAnyClick);
      window.removeEventListener('scroll', onAnyClick, true);
    };
  }, [editor]);

  if (!menu) return null;
  return (
    <div style={{
      position: 'absolute', left: menu.x, top: menu.y, zIndex: 1700,
      background: 'rgba(16,28,52,0.98)', border: '0.5px solid rgba(80,140,255,0.35)',
      borderRadius: 8, padding: 4, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onAddComment(menu.text, menu.from, menu.to); setMenu(null); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '6px 10px', borderRadius: 6, background: 'transparent',
          color: 'rgba(230,240,255,0.95)', fontSize: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(80,140,255,0.18)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <MessageSquare size={12} /> Add comment
      </button>
    </div>
  );
}

// ---------- Comment composer (used for new threads + new replies) ----------
export function CommentComposer({
  onSubmit, autoFocus, placeholder, onCancel,
}: {
  onSubmit: (body: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const members = useTeamMembers();
  const submit = () => {
    const v = body.trim();
    if (!v) return;
    onSubmit(v);
    setBody('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <MentionableTextarea
        value={body}
        onChange={setBody}
        onSubmit={submit}
        members={members}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        {onCancel && (
          <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
        )}
        <button type="button" onClick={submit} disabled={!body.trim()} style={btnPrimary}>
          <Send size={11} /> Post
        </button>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  background: 'linear-gradient(180deg, #9bdcff, #4db8ff)', color: '#0a2540',
  border: '0.5px solid rgba(255,255,255,0.4)', cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11,
  background: 'transparent', color: 'rgba(200,225,255,0.85)',
  border: '0.5px solid rgba(80,140,255,0.25)', cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: 4, background: 'transparent',
  color: 'rgba(200,225,255,0.7)', border: 'none', cursor: 'pointer',
};

// ---------- Single comment row ----------
function CommentRow({
  c, members, currentUserId, onEdit, onDelete, isReply,
}: {
  c: AgendaComment;
  members: TeamMember[];
  currentUserId: string | null;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  isReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const author = members.find((m) => m.id === c.author_id);
  const isOwn = currentUserId === c.author_id;
  const isEdited = c.updated_at && c.created_at && c.updated_at !== c.created_at;
  if (c.deleted_at) {
    return (
      <div style={{ paddingLeft: isReply ? 18 : 0, color: 'rgba(180,210,245,0.5)', fontSize: 11, fontStyle: 'italic' }}>
        This comment was deleted · {new Date(c.deleted_at).toLocaleString()}
      </div>
    );
  }
  return (
    <div style={{ paddingLeft: isReply ? 18 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        {isReply && <CornerDownRight size={11} style={{ color: 'rgba(180,210,245,0.5)' }} />}
        <span style={{ fontWeight: 600, color: 'rgba(230,240,255,0.95)' }}>
          {author?.display_name ?? 'Someone'}
        </span>
        <span style={{ color: 'rgba(180,210,245,0.55)' }}>
          {new Date(c.created_at).toLocaleString()}{isEdited ? ' · (edited)' : ''}
        </span>
        {isOwn && !editing && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
            <button type="button" title="Edit" style={iconBtn} onClick={() => setEditing(true)}>
              <Pencil size={11} />
            </button>
            <button type="button" title="Delete" style={iconBtn} onClick={() => onDelete(c.id)}>
              <Trash2 size={11} />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            style={{
              width: '100%', resize: 'vertical', minHeight: 40,
              background: 'rgba(10,20,40,0.7)', color: 'rgba(230,240,255,0.95)',
              border: '0.5px solid rgba(80,140,255,0.25)', borderRadius: 6,
              padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button type="button" style={btnGhost} onClick={() => { setDraft(c.body); setEditing(false); }}>Cancel</button>
            <button type="button" style={btnPrimary} onClick={() => { onEdit(c.id, draft); setEditing(false); }}>Save</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'rgba(230,240,255,0.92)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {renderCommentBody(c.body)}
        </div>
      )}
    </div>
  );
}

// ---------- Thread card ----------
function ThreadCard({
  thread, comments, currentUserId, members, flash, onJump,
  api,
}: {
  thread: AgendaThread;
  comments: AgendaComment[];
  currentUserId: string | null;
  members: TeamMember[];
  flash: boolean;
  onJump: () => void;
  api: ReturnType<typeof useAgendaComments>;
}) {
  const [replying, setReplying] = useState(false);
  const top = comments.filter((c) => c.thread_id === thread.id && !c.parent_comment_id);
  const repliesOf = (parentId: string) =>
    comments.filter((c) => c.parent_comment_id === parentId);
  const canDeleteThread = currentUserId === thread.created_by;
  const opener = members.find((m) => m.id === thread.created_by);
  return (
    <div
      data-thread-card={thread.id}
      onClick={onJump}
      style={{
        background: thread.resolved ? 'rgba(16,28,52,0.45)' : 'rgba(16,28,52,0.75)',
        border: `0.5px solid ${flash ? 'rgba(255,213,0,0.7)' : 'rgba(80,140,255,0.22)'}`,
        borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        opacity: thread.resolved ? 0.6 : 1, cursor: 'pointer',
        transition: 'border-color 0.4s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(80,140,255,0.25)', color: 'rgba(230,240,255,0.95)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>
          {(opener?.display_name ?? '?').slice(0, 1).toUpperCase()}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(200,225,255,0.85)' }}>
          {opener?.display_name ?? 'Someone'}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 999,
          background: thread.resolved ? 'rgba(60,180,120,0.18)' : 'rgba(255,213,0,0.18)',
          color: thread.resolved ? '#8be7b5' : '#ffe28c', fontWeight: 600,
        }}>
          {thread.resolved ? 'Resolved' : 'Open'}
        </span>
        {canDeleteThread && (
          <button
            type="button"
            title="Delete thread"
            style={iconBtn}
            onClick={(e) => { e.stopPropagation(); void api.deleteThread(thread.id); }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {thread.anchor_text && (
        <div style={{
          fontSize: 11, color: 'rgba(180,210,245,0.75)', borderLeft: '2px solid rgba(255,213,0,0.5)',
          paddingLeft: 8, fontStyle: 'italic',
        }}>
          “{thread.anchor_text.length > 60 ? thread.anchor_text.slice(0, 60) + '…' : thread.anchor_text}”
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {top.map((c) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CommentRow
              c={c}
              members={members}
              currentUserId={currentUserId}
              onEdit={api.editComment}
              onDelete={api.softDeleteComment}
            />
            {repliesOf(c.id).map((r) => (
              <CommentRow
                key={r.id}
                c={r}
                members={members}
                currentUserId={currentUserId}
                onEdit={api.editComment}
                onDelete={api.softDeleteComment}
                isReply
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          style={btnGhost}
          onClick={() => void api.setResolved(thread.id, !thread.resolved)}
        >
          {thread.resolved ? 'Reopen' : <><Check size={11} /> Resolve</>}
        </button>
        <button
          type="button"
          style={{ ...btnGhost, marginLeft: 'auto' }}
          onClick={() => setReplying((v) => !v)}
        >
          Reply
        </button>
      </div>
      {replying && (
        <div onClick={(e) => e.stopPropagation()}>
          <CommentComposer
            autoFocus
            placeholder="Write a reply…"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const parent = top[top.length - 1];
              await api.addComment(thread.id, body, parent?.id ?? null);
              setReplying(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Right-side rail ----------
export function AgendaCommentsRail({
  open, onClose, editor, api, currentUserId, scrollListRef,
}: {
  open: boolean;
  onClose: () => void;
  editor: Editor | null;
  api: ReturnType<typeof useAgendaComments>;
  currentUserId: string | null;
  /** Ref to the scrollable list inside the rail (so the editor can scroll a thread card into view). */
  scrollListRef?: React.Ref<HTMLDivElement>;
}) {
  const members = useTeamMembers();
  const listRef = useRef<HTMLDivElement>(null);
  // Bridge external ref → internal ref (so parent can scrollIntoView on a card).
  useEffect(() => {
    if (!scrollListRef) return;
    if (typeof scrollListRef === 'function') scrollListRef(listRef.current);
    else (scrollListRef as React.MutableRefObject<HTMLDivElement | null>).current = listRef.current;
  });

  // Sort threads by document position so the rail mirrors the editor.
  const orderedThreads = useMemo(() => {
    if (!editor) return api.threads;
    const ranges = findCommentRanges(editor.state.doc);
    const order = new Map<string, number>();
    ranges.forEach((r, i) => { if (!order.has(r.threadId)) order.set(r.threadId, i); });
    return [...api.threads].sort((a, b) => {
      const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [api.threads, editor]);

  const jumpToThread = (threadId: string) => {
    if (!editor) return;
    const ranges = findCommentRanges(editor.state.doc);
    const r = ranges.find((x) => x.threadId === threadId);
    if (!r) return;
    editor.chain().focus().setTextSelection({ from: r.from, to: r.to }).run();
    const target = editor.view.dom.querySelector(`[data-thread-id="${threadId}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (!open) return null;
  return (
    <div
      className="agenda-comments-rail"
      style={{
        // On desktop the rail lives in-flow as a sticky sibling column
        // (see AgendaEditor's flex row). On mobile (<768px) it expands to
        // a full-width drawer via the CSS rule below.
        position: 'sticky',
        top: 'var(--agenda-toolbar-offset, 96px)',
        alignSelf: 'flex-start',
        width: 360,
        maxHeight: 'calc(100vh - var(--agenda-toolbar-offset, 96px) - 24px)',
        background: 'rgba(10,18,36,0.96)',
        border: '0.5px solid rgba(80,140,255,0.22)',
        borderRadius: 14,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-6px 6px 24px rgba(0,0,0,0.35)',
        zIndex: 5,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '0.5px solid rgba(80,140,255,0.18)',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(230,240,255,0.95)', fontSize: 13, fontWeight: 600 }}>
          <MessageSquare size={14} /> Comments
          <span style={{ fontSize: 11, color: 'rgba(180,210,245,0.65)', fontWeight: 400 }}>
            {api.threads.filter((t) => !t.resolved).length} open · {api.threads.length} total
          </span>
        </div>
        <div style={{ display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            style={iconBtn}
            title="Jump to top"
            onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ArrowUp size={14} />
          </button>
          <button type="button" onClick={onClose} style={iconBtn} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}
      >
        {orderedThreads.length === 0 && (
          <div style={{ color: 'rgba(180,210,245,0.55)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            No comments yet. Highlight any text and click 💬 Comment to start a thread.
          </div>
        )}
        {orderedThreads.map((t) => (
          <ThreadCard
            key={t.id}
            thread={t}
            comments={api.comments}
            currentUserId={currentUserId}
            members={members}
            flash={api.flashThreadId === t.id}
            onJump={() => jumpToThread(t.id)}
            api={api}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Inline new-thread popover (anchored to selection) ----------
export function NewThreadPopover({
  anchor, onCancel, onSubmit,
}: {
  anchor: { left: number; top: number } | null;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  if (!anchor) return null;
  return (
    <div
      data-agenda-bubble
      style={{
        position: 'absolute', left: anchor.left, top: anchor.top + 8,
        transform: 'translate(-50%, 0)', zIndex: 1700,
        background: 'rgba(16,28,52,0.98)', border: '0.5px solid rgba(80,140,255,0.35)',
        borderRadius: 10, padding: 8, width: 280,
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      }}
    >
      <CommentComposer
        autoFocus
        placeholder="Add a comment…"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </div>
  );
}