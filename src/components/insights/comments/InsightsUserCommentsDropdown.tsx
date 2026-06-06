import { useState } from 'react';
import { MessageSquareText, FileText, BarChart3, AlignLeft, Highlighter, Target, Compass, ShieldAlert, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useInsightsUserComments, type InsightsUserComment } from '@/hooks/useInsightsUserComments';
import { toast } from 'sonner';
import { MentionText } from './MentionText';
import { CommentEditInput } from './CommentEditInput';

const SOURCE_ICON: Record<string, any> = {
  selected_text: Highlighter, narrative: AlignLeft, kpi: BarChart3, chart: BarChart3,
  goal: Target, initiative: Compass, risk: ShieldAlert, section: FileText,
};

function statusBadge(status: InsightsUserComment['queue_status']) {
  if (!status) return null;
  const map: Record<string, { label: string; color: string }> = {
    queued: { label: 'Queued', color: 'rgba(126,184,247,0.85)' },
    added_to_agenda: { label: 'Added', color: 'rgba(110,231,183,0.85)' },
    dismissed: { label: 'Dismissed', color: 'rgba(180,180,200,0.7)' },
    archived: { label: 'Archived', color: 'rgba(180,180,200,0.6)' },
  };
  const m = map[status]; if (!m) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: m.color, border: `1px solid ${m.color}`, padding: '1px 5px', borderRadius: 4,
    }}>{m.label}</span>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

function jumpToComment(item: InsightsUserComment) {
  // Try a precise jump after the tab change has had time to mount.
  const attempt = (tries: number) => {
    let el: HTMLElement | null = null;
    if (item.source === 'qir') {
      if (item.target_type === 'section' && item.target_id) {
        el = document.getElementById(`qir-section-${item.target_id}`);
      } else if (item.target_id) {
        try {
          el = document.querySelector<HTMLElement>(
            `[data-comment-source="${item.target_type}"][data-comment-source-id="${CSS.escape(item.target_id)}"]`,
          );
        } catch { /* selector escape failures */ }
        if (!el && item.target_id) {
          el = document.getElementById(`qir-section-${item.target_id}`);
        }
      }
    } else if (item.source === 'agenda') {
      // Best-effort: anchor_text is searchable in the agenda editor DOM.
      if (item.anchor_text) {
        const editor = document.querySelector<HTMLElement>('.ProseMirror, [data-agenda-editor]');
        if (editor) el = editor;
      }
      if (!el) el = document.querySelector<HTMLElement>('[data-agenda-editor], .ProseMirror');
    }
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prev = el.style.boxShadow;
      el.style.transition = 'box-shadow .35s';
      el.style.boxShadow = '0 0 0 2px rgba(124,200,240,0.7), 0 0 24px rgba(124,200,240,0.45)';
      setTimeout(() => { el!.style.boxShadow = prev; }, 1800);
      return;
    }
    if (tries > 0) {
      window.setTimeout(() => attempt(tries - 1), 180);
    } else {
      toast.info('Comment source not visible', {
        description: item.body.slice(0, 200),
      });
    }
  };
  attempt(8);
}

/**
 * Shared "Queue" dropdown for the Insights header. Lists every comment
 * authored by the current user across all Insights surfaces (QIR + Agenda)
 * and provides one-click navigation back to the source.
 */
export function InsightsUserCommentsDropdown({
  onNavigateTab,
}: {
  /** Navigate the Insights carousel to a given tab index. */
  onNavigateTab: (tabIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { items, count, loading, deleteComment, editComment } = useInsightsUserComments();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleClick = (item: InsightsUserComment) => {
    setOpen(false);
    onNavigateTab(item.tab_index);
    // Let React paint the new tab, then start polling for the source el.
    window.setTimeout(() => jumpToComment(item), 60);
  };

  const handleDelete = async (item: InsightsUserComment) => {
    const key = `${item.source}:${item.id}`;
    if (confirmId !== key) { setConfirmId(key); return; }
    setDeletingId(key);
    try {
      await deleteComment(item);
      toast.success('Comment deleted');
    } catch (e) {
      console.error('[delete-comment]', e);
      toast.error('Failed to delete comment');
    } finally {
      setConfirmId(null);
      setDeletingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="My comments"
          title="My comments across Insights"
          style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, letterSpacing: '0.03em',
            color: 'rgba(200,225,255,0.92)',
            background: 'rgba(16,28,52,0.55)',
            border: '0.5px solid rgba(80,140,255,0.22)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            cursor: 'pointer',
          }}
        >
          <MessageSquareText size={13} />
          Queue
          {count > 0 && (
            <span style={{
              minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
              background: 'linear-gradient(180deg, #9bdcff, #4db8ff)',
              color: '#0a2540', fontSize: 10, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}>{count}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[360px] p-0 border-[rgba(80,140,255,0.22)]"
        style={{ background: 'rgba(12,22,42,0.96)', backdropFilter: 'blur(20px)' }}
      >
        <div style={{
          padding: '10px 12px', borderBottom: '1px solid rgba(80,140,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquareText size={13} style={{ color: 'rgba(155,220,255,0.9)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e8f6ff', letterSpacing: '0.02em' }}>
              Your comments
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(200,225,255,0.55)' }}>
            {loading ? 'Loading…' : `${count} total`}
          </span>
        </div>
        <ScrollArea className="max-h-[420px]">
          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!loading && items.length === 0 && (
              <div style={{
                padding: '28px 16px', textAlign: 'center',
                color: 'rgba(200,225,255,0.55)', fontSize: 12,
              }}>
                <MessageSquareText size={18} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                No comments in your queue yet.
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                  Add a comment on any Insights surface to see it here.
                </div>
              </div>
            )}
            {items.map((item) => {
              const Icon = (item.source === 'qir' && item.target_type
                ? SOURCE_ICON[item.target_type]
                : item.source === 'agenda' ? AlignLeft : FileText) || FileText;
              const key = `${item.source}:${item.id}`;
              const isConfirm = confirmId === key;
              const isDeleting = deletingId === key;
              const isEditing = editingId === key;
              return (
                <div
                  key={`${item.source}:${item.id}`}
                  style={{
                    position: 'relative', padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(80,140,255,0.10)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(80,140,255,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(200,225,255,0.6)' }}>
                    <Icon size={11} />
                    <span style={{ fontWeight: 700, color: 'rgba(200,225,255,0.85)' }}>{item.tab_label}</span>
                    {item.source === 'qir' && (item.section_label || item.target_type) && (
                      <>
                        <span>·</span>
                        <span
                          style={{
                            textTransform: 'none', letterSpacing: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 200,
                          }}
                          title={item.section_label || item.target_type}
                        >
                          {item.section_label || item.target_type}
                        </span>
                      </>
                    )}
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {statusBadge(item.queue_status)}
                      <span style={{ fontSize: 10, color: 'rgba(200,225,255,0.5)' }}>{relTime(item.created_at)}</span>
                    </span>
                  </div>
                  {item.source === 'qir' && item.snippet_text && (
                    <div
                      style={{
                        fontSize: 10, fontStyle: 'italic',
                        color: 'rgba(200,225,255,0.55)',
                        borderLeft: '2px solid rgba(124,200,240,0.35)',
                        paddingLeft: 6, lineHeight: 1.35,
                        display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                      title={item.snippet_text}
                    >
                      “{item.snippet_text}”
                    </div>
                  )}
                  {isEditing ? (
                    <CommentEditInput
                      initialValue={item.body}
                      onCancel={() => setEditingId(null)}
                      onSave={async (next) => {
                        try {
                          await editComment(item, next);
                          toast.success('Comment updated');
                          setEditingId(null);
                        } catch (e) {
                          console.error('[edit-comment]', e);
                          toast.error('Failed to update comment');
                        }
                      }}
                      compact
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      style={{
                        textAlign: 'left', background: 'transparent', border: 'none', padding: 0,
                        color: '#e8f6ff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                      }}
                    >
                      <div style={{
                        fontSize: 12, lineHeight: 1.4, color: '#e8f6ff',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        <MentionText text={item.body} />
                      </div>
                    </button>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    fontSize: 10, color: 'rgba(155,220,255,0.8)',
                  }}>
                    <button
                      type="button"
                      onClick={() => handleClick(item)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'transparent', border: 'none', padding: 0,
                        color: 'rgba(155,220,255,0.8)', cursor: 'pointer', fontSize: 10,
                      }}
                    >
                      <ExternalLink size={9} /> Jump to source
                    </button>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingId(isEditing ? null : key); }}
                      title={isEditing ? 'Stop editing' : 'Edit comment'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: isEditing ? 'rgba(80,140,255,0.18)' : 'transparent',
                        border: isEditing ? '1px solid rgba(120,170,255,0.5)' : '1px solid transparent',
                        color: isEditing ? 'rgb(180,215,255)' : 'rgba(200,225,255,0.55)',
                        cursor: 'pointer',
                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      }}
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      onBlur={() => { if (confirmId === key) setConfirmId(null); }}
                      disabled={isDeleting}
                      title={isConfirm ? 'Click again to confirm' : 'Delete'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: isConfirm ? 'rgba(239,68,68,0.18)' : 'transparent',
                        border: isConfirm ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent',
                        color: isConfirm ? 'rgb(252,165,165)' : 'rgba(200,225,255,0.55)',
                        cursor: isDeleting ? 'wait' : 'pointer',
                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      }}
                    >
                      <Trash2 size={10} />
                      {isConfirm ? 'Confirm' : ''}
                    </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}