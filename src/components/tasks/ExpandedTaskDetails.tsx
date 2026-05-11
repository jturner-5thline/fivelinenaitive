import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type Task, useSubtasks, useTaskComments } from '@/hooks/useTasks';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2, User, FileText, ListChecks, MessageSquare, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { splitTextByUrls } from '@/lib/emailNotesCleanup';

/**
 * Auto-linkify URLs in plain-text descriptions so source-email links
 * (and any other URLs the user pastes in) render as clickable anchors.
 * Stops propagation so clicking a link doesn't also enter edit mode on
 * the parent description container.
 */
function renderWithLinks(text: string) {
  return splitTextByUrls(text).map((p, i) =>
    p.type === 'text' ? (
      <span key={i}>{p.value}</span>
    ) : (
      <a
        key={i}
        href={p.value}
        target="_blank"
        rel="noopener noreferrer"
        // Stop both mousedown and click so the parent description
        // container never enters edit mode when the user clicks a link.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none break-all"
      >
        {p.value}
      </a>
    ),
  );
}

interface ExpandedTaskDetailsProps {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onOpenFullDetail: () => void;
}

/**
 * Inline expansion panel rendered inside the task list when a row's
 * disclosure chevron is opened. Shows description, subtasks (used as a
 * lightweight checklist), comments, and deal/contact context — without
 * leaving the list view.
 *
 * Heavier drawers (attachments, dependencies, time entries, activity) stay
 * behind the existing TaskDetailDrawer to keep this panel light.
 */
export function ExpandedTaskDetails({ task, onUpdate, onOpenFullDetail }: ExpandedTaskDetailsProps) {
  const { user } = useAuth();
  const [descDraft, setDescDraft] = useState(task.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');

  const { subtasks, isLoading: subtasksLoading, createSubtask, updateSubtask } = useSubtasks(task.id);
  const { comments, isLoading: commentsLoading, addComment } = useTaskComments(task.id);

  const completedCount = subtasks.filter(s => s.status === 'complete').length;

  const handleSaveDescription = () => {
    const trimmed = descDraft.trim();
    if (trimmed !== (task.description || '').trim()) {
      onUpdate({ description: trimmed || null } as any);
    }
    setEditingDesc(false);
  };

  const handleAddSubtask = () => {
    const v = newSubtask.trim();
    if (!v) return;
    createSubtask.mutate(v);
    setNewSubtask('');
  };

  const handleAddComment = () => {
    const v = newComment.trim();
    if (!v) return;
    addComment.mutate(v);
    setNewComment('');
  };

  return (
    <div
      className="px-4 py-4 grid gap-5"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) 240px',
        backgroundColor: 'rgba(126,184,247,0.025)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderLeft: '2px solid rgba(126,184,247,0.25)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* LEFT: description + checklist + comments */}
      <div className="space-y-5 min-w-0">
        {/* Description */}
        <Section icon={<FileText className="h-3 w-3" />} label="Description">
          {editingDesc ? (
            <div className="space-y-2">
              <Textarea
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDescription();
                  if (e.key === 'Escape') { setDescDraft(task.description || ''); setEditingDesc(false); }
                }}
                placeholder="Add more detail…"
                className="min-h-[72px] text-[12.5px] bg-[#13181f] border-[rgba(255,255,255,0.08)] text-[#eef1f6]"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-6 text-[11px] px-2.5" onClick={handleSaveDescription}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2.5" onClick={() => { setDescDraft(task.description || ''); setEditingDesc(false); }}>Cancel</Button>
                <span className="text-[10px]" style={{ color: '#5b6173' }}>⌘+Enter to save</span>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setEditingDesc(true)}
              className="w-full text-left text-[12.5px] leading-relaxed rounded px-2 py-1.5 -mx-2 hover:bg-[rgba(255,255,255,0.03)] transition-colors whitespace-pre-wrap cursor-text"
              style={{ color: task.description ? '#cfd5e0' : '#5b6173' }}
            >
              {task.description ? renderWithLinks(task.description) : 'Click to add description…'}
            </div>
          )}
        </Section>

        {/* Checklist (subtasks) */}
        <Section
          icon={<ListChecks className="h-3 w-3" />}
          label="Checklist"
          rightSlot={subtasks.length > 0 ? (
            <span className="text-[10px]" style={{ color: '#7a8194' }}>
              {completedCount}/{subtasks.length}
            </span>
          ) : null}
        >
          {subtasksLoading ? (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: '#5b6173' }}>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-1">
              {subtasks.map(s => {
                const isDone = s.status === 'complete';
                return (
                  <div key={s.id} className="flex items-center gap-2 group/sub">
                    <Checkbox
                      checked={isDone}
                      onCheckedChange={() => updateSubtask.mutate({
                        subtaskId: s.id,
                        updates: { status: isDone ? 'not_started' : 'complete', completed_at: isDone ? null : new Date().toISOString() },
                      })}
                      className="h-3.5 w-3.5 rounded-full"
                    />
                    <span
                      className="text-[12px] flex-1 truncate"
                      style={{ color: isDone ? '#5b6173' : '#cfd5e0', textDecoration: isDone ? 'line-through' : 'none' }}
                    >
                      {s.title}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-1">
                <Plus className="h-3 w-3" style={{ color: '#5b6173' }} />
                <Input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                  placeholder="Add checklist item…"
                  className="h-6 text-[11.5px] bg-transparent border-none px-0 focus-visible:ring-0 placeholder:text-[#5b6173]"
                  style={{ color: '#cfd5e0' }}
                />
              </div>
            </div>
          )}
        </Section>

        {/* Comments */}
        <Section
          icon={<MessageSquare className="h-3 w-3" />}
          label="Comments"
          rightSlot={comments.length > 0 ? (
            <span className="text-[10px]" style={{ color: '#7a8194' }}>{comments.length}</span>
          ) : null}
        >
          {commentsLoading ? (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: '#5b6173' }}>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-2">
              {comments.slice(-3).map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar className="h-5 w-5 mt-0.5">
                    <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                      {c.author_id.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px]" style={{ color: '#5b6173' }}>
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </div>
                    <div className="text-[12.5px] whitespace-pre-wrap" style={{ color: '#cfd5e0' }}>{c.body}</div>
                  </div>
                </div>
              ))}
              {comments.length > 3 && (
                <button
                  onClick={onOpenFullDetail}
                  className="text-[11px] hover:underline"
                  style={{ color: '#7eb8f7' }}
                >
                  View all {comments.length} comments
                </button>
              )}
              <div className="flex items-start gap-2 pt-1">
                <Avatar className="h-5 w-5 mt-0.5">
                  <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                    {(user?.email || '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddComment(); }
                  }}
                  placeholder="Add a comment… (⌘+Enter)"
                  className="min-h-[34px] text-[12px] bg-[#13181f] border-[rgba(255,255,255,0.08)] text-[#eef1f6] py-1.5"
                />
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* RIGHT: deal/contact context */}
      <div className="space-y-3 text-[11.5px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: '#7a8194' }}>Context</span>
          <button
            onClick={onOpenFullDetail}
            className="inline-flex items-center gap-1 text-[10px] hover:text-[#cfe3ff] transition-colors"
            style={{ color: '#7a8194' }}
            title="Open full detail"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </button>
        </div>

        <ContextRow label="Assignee">
          {task.assignee_profile ? (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                {task.assignee_profile.avatar_url && <AvatarImage src={task.assignee_profile.avatar_url} />}
                <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                  {task.assignee_profile.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span style={{ color: '#cfd5e0' }}>{task.assignee_profile.display_name}</span>
            </div>
          ) : <span style={{ color: '#5b6173' }}>Unassigned</span>}
        </ContextRow>

        {task.deal_id && task.deal?.company && (
          <ContextRow label="Deal">
            <Link to={`/deal/${task.deal_id}`} className="inline-flex items-center gap-1.5 hover:text-[#cfe3ff] transition-colors" style={{ color: '#cfd5e0' }}>
              <Building2 className="h-3 w-3" />
              <span className="truncate">{task.deal.company}</span>
            </Link>
          </ContextRow>
        )}

        {task.contact_id && (task as any).contact?.full_name && (
          <ContextRow label="Contact">
            <Link to={`/contacts/${task.contact_id}`} className="inline-flex items-center gap-1.5 hover:text-[#cfe3ff] transition-colors" style={{ color: '#cfd5e0' }}>
              <User className="h-3 w-3" />
              <span className="truncate">{(task as any).contact.full_name}</span>
            </Link>
          </ContextRow>
        )}

        {task.crm_company_id && (task as any).crm_company?.name && (
          <ContextRow label="Company">
            <Link to={`/crm-companies/${task.crm_company_id}`} className="inline-flex items-center gap-1.5 hover:text-[#cfe3ff] transition-colors" style={{ color: '#cfd5e0' }}>
              <Building2 className="h-3 w-3" />
              <span className="truncate">{(task as any).crm_company.name}</span>
            </Link>
          </ContextRow>
        )}

        {task.project?.name && (
          <ContextRow label="Project">
            <span className="inline-flex items-center gap-1.5" style={{ color: '#cfd5e0' }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project.color || '#7eb8f7' }} />
              {task.project.name}
            </span>
          </ContextRow>
        )}

        <ContextRow label="Created">
          <span style={{ color: '#9aa3b6' }}>
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </ContextRow>

        {task.completed_at && (
          <ContextRow label="Completed">
            <span style={{ color: '#7fc89a' }}>
              {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true })}
            </span>
          </ContextRow>
        )}
      </div>
    </div>
  );
}

function Section({ icon, label, rightSlot, children }: { icon: React.ReactNode; label: string; rightSlot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: '#7a8194' }}>
          {icon}
          {label}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] uppercase tracking-wide" style={{ color: '#5b6173' }}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
