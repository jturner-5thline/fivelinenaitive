import { useState, useRef, useCallback, useEffect } from 'react';
import { useUndoStack } from '@/hooks/useUndoStack';
import { isTaskCompleted } from '@/lib/taskCache';
import { TaskDuplicatePanel } from '@/components/tasks/TaskDuplicatePanel';
import { type Task, useTaskComments, useTaskActivity, useSubtasks } from '@/hooks/useTasks';
import { useTaskDependencies } from '@/hooks/useTaskDependencies';
import { useTaskAttachments } from '@/hooks/useTaskAttachments';
import { useTaskCollaborators } from '@/hooks/useTaskCollaborators';
import { SubtaskInlineEditor } from '@/components/tasks/SubtaskInlineEditor';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { useCreateMentions } from '@/hooks/useTaskMentions';
import { MentionTextarea, MentionText } from '@/components/tasks/MentionTextarea';
import { useQuery } from '@tanstack/react-query';
import { useDealsContext } from '@/contexts/DealsContext';
import { supabase } from '@/integrations/supabase/client';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  X, Calendar, User, MessageSquare, Activity, Plus,
  CheckSquare, Trash2, Clock, Sun, Sunrise, ArrowRight,
  Link2, Paperclip, Download, FileText, Users,
  Repeat, ExternalLink, AlertTriangle, Pause, Play, Square, RefreshCw, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format, addDays, nextMonday } from 'date-fns';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { getAsanaSyncContext, syncTaskToAsana, updateTaskInAsana } from '@/hooks/useAsanaTaskSync';

interface TaskDetailDrawerProps {
  task: Task;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  fullPage?: boolean;
}

function fireCelebration() {
  confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, colors: ['#10b981', '#059669', '#34d399'], disableForReducedMotion: true });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function describeRecurrence(rule: string | null | undefined): string {
  if (!rule) return '';
  if (rule.startsWith('every:')) {
    const [, n, unit] = rule.split(':');
    const num = parseInt(n, 10);
    if (!num || !unit) return rule;
    const unitLabel = num === 1
      ? unit.replace(/s$/, '')
      : unit;
    return `Every ${num} ${unitLabel}`;
  }
  switch (rule) {
    case 'daily': return 'Daily';
    case 'weekdays': return 'Weekdays';
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Every 2 weeks';
    case 'monthly': return 'Monthly';
    case 'yearly': return 'Yearly';
    default: return rule;
  }
}


const STATUS_COLORS: Record<string, { label: string; bg: string }> = {
  not_started: { label: 'Not Started', bg: '#6b7280' },
  in_progress: { label: 'In Progress', bg: '#3b7eff' },
  blocked: { label: 'Blocked', bg: '#ff4d4d' },
  complete: { label: 'Complete', bg: '#22c55e' },
};

const PRIORITY_PILL: Record<string, { label: string; bg: string }> = {
  urgent: { label: 'Urgent', bg: '#ff4d4d' },
};

export function TaskDetailDrawer({ task, onClose, onUpdate, onDelete, fullPage = false }: TaskDetailDrawerProps) {
  const [stopRecurrenceOpen, setStopRecurrenceOpen] = useState(false);
  const navigate = useNavigate();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [descValue, setDescValue] = useState(task.description || '');
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [blockerNote, setBlockerNote] = useState((task as any).blocker_note || '');
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [asanaSyncing, setAsanaSyncing] = useState(false);
  const isComplete = isTaskCompleted(task);

  // Local undo stack for this drawer. Each entry captures the inverse of a
  // single onUpdate call so the user can roll back recent field changes
  // (title, status, due date, assignee, etc.) without leaving the panel.
  const { push: pushUndo, pop: popUndo, canUndo } = useUndoStack(20);

  // Wraps the parent-provided onUpdate so every drawer mutation records
  // its inverse on the undo stack. We snapshot the prior values from the
  // current `task` BEFORE applying the change.
  const onUpdateWithUndo = useCallback(
    (updates: Partial<Task>) => {
      try {
        const prev: Record<string, any> = {};
        for (const k of Object.keys(updates)) {
          prev[k] = (task as any)[k] ?? null;
        }
        // Completion state is doubly-encoded (status + completed_at). When
        // the caller toggles `status`, also restore/clear `completed_at` so
        // undoing "mark complete" actually reopens the task — otherwise a
        // non-null completed_at would keep `isTaskCompleted` true.
        if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
          prev.completed_at = (task as any).completed_at ?? null;
          prev.completed_by = (task as any).completed_by ?? null;
        }
        pushUndo({
          label: 'Task change',
          undo: () => onUpdate(prev as Partial<Task>),
        });
      } catch {
        // Never let undo bookkeeping block the underlying update.
      }
      onUpdate(updates);
    },
    [task, onUpdate, pushUndo],
  );

  const runUndo = useCallback(() => {
    const a = popUndo();
    if (a) {
      Promise.resolve(a.undo()).then(() => toast.success('Undone')).catch(() => {});
      return;
    }

    // Fallback: if the task was completed from another surface before this
    // drawer recorded an undo entry, the header Undo button should still
    // reopen it instead of being a dead control.
    if (isComplete) {
      Promise.resolve(onUpdate({ status: 'not_started', completed_at: null, completed_by: null } as any))
        .then(() => toast.success('Undone'))
        .catch(() => {});
    }
  }, [isComplete, onUpdate, popUndo]);

  const handleUndoClick = useCallback(() => runUndo(), [runUndo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!canUndo && !isComplete) return;
      e.preventDefault();
      runUndo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUndo, isComplete, runUndo]);

  const handleManualAsanaSync = useCallback(async () => {
    if (asanaSyncing) return;
    setAsanaSyncing(true);
    try {
      const companyId = (task as any).company_id || null;
      const ctx = await getAsanaSyncContext(companyId);
      if (!ctx) {
        toast.error('Asana is not connected for this workspace, or sync is disabled.');
        return;
      }
      const existingGid = (task as any).asana_task_gid as string | undefined;
      if (existingGid) {
        await updateTaskInAsana(ctx, existingGid, {
          title: task.title,
          due_date: (task as any).due_date,
          assignee_email: (task as any).assignee_email,
          completed: task.status === 'complete',
        });
        toast.success('Synced to Asana');
      } else {
        const gid = await syncTaskToAsana(ctx, {
          id: task.id,
          title: task.title,
          description: (task as any).description,
          due_date: (task as any).due_date,
          assignee_email: (task as any).assignee_email,
        });
        if (gid) {
          onUpdate({ asana_task_gid: gid } as any);
          toast.success('Created task in Asana');
        } else {
          toast.error('Asana sync did not return a task ID. Check the admin sync log.');
        }
      }
    } catch (err: any) {
      console.error('[AsanaSync] Manual sync failed:', err);
      toast.error(`Asana sync failed: ${err?.message || 'unknown error'}`);
    } finally {
      setAsanaSyncing(false);
    }
  }, [task, asanaSyncing, onUpdate]);

  const toggleSubtaskExpanded = useCallback((id: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const { comments, addComment } = useTaskComments(task.id);
  const { activity } = useTaskActivity(task.id);
  const { subtasks, createSubtask, updateSubtask, deleteSubtask } = useSubtasks(task.id);
  const { blockedBy, blocking, addDependency, removeDependency } = useTaskDependencies(task.id);
  const { attachments, uploadAttachment, deleteAttachment, getDownloadUrl } = useTaskAttachments(task.id);
  const { collaborators, addCollaborator, removeCollaborator } = useTaskCollaborators(task.id);
  const members = useTeamMembers();
  const { tasks: allTasks } = useMyTasks();
  const createMentions = useCreateMentions();

  // Creator profile for the "Created by" activity entry. Falls back to a
  // fetch when the task came from a surface (e.g. SharedTaskDrawer) that
  // didn't preload creator_profile.
  const { data: fetchedCreator } = useQuery({
    queryKey: ['task-creator-profile', task.assigned_by],
    enabled: !!task.assigned_by && !task.creator_profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, email')
        .eq('user_id', task.assigned_by)
        .maybeSingle();
      return data
        ? { display_name: data.display_name || '', avatar_url: data.avatar_url, email: data.email || '' }
        : null;
    },
  });
  const creatorProfile = task.creator_profile || fetchedCreator || null;

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== task.title) onUpdateWithUndo({ title: titleValue.trim() } as any);
    setEditingTitle(false);
  };

  const handleSaveDesc = () => {
    if (descValue !== (task.description || '')) {
      onUpdateWithUndo({ description: descValue } as any);
      createMentions.mutate({ taskId: task.id, text: descValue, source: 'description' });
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim());
    createMentions.mutate({ taskId: task.id, text: commentText.trim(), source: 'comment' });
    setCommentText('');
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    createSubtask.mutate(newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAttachment.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const url = await getDownloadUrl(filePath);
    if (url) window.open(url, '_blank');
  };

  const handleToggleComplete = () => {
    const newStatus = isComplete ? 'not_started' : 'complete';
    onUpdateWithUndo({ status: newStatus } as any);
    if (newStatus === 'complete') fireCelebration();
  };

  const handleStatusChange = (v: string) => {
    if (v === 'blocked' && !blockerNote.trim()) {
      toast.error('Please add a blocker note before setting status to Blocked');
      return;
    }
    onUpdateWithUndo({ status: v } as any);
    if (v === 'complete') fireCelebration();
  };

  const handleSaveBlockerNote = () => {
    onUpdateWithUndo({ blocker_note: blockerNote.trim() || null } as any);
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  
  const availableDeps = allTasks.filter(t => t.id !== task.id && !blockedBy.some(d => d.depends_on_task_id === t.id));

  const statusConf = STATUS_COLORS[task.status] || STATUS_COLORS.not_started;

  return (
    <div className={cn('flex flex-col h-full shrink-0 bg-transparent', fullPage ? 'w-full' : 'w-full')}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <Checkbox checked={isComplete} onCheckedChange={handleToggleComplete}
            className={cn('h-4 w-4 rounded-full', isComplete && 'bg-[#22c55e] border-[#22c55e]')} />
          <span className="text-xs capitalize" style={{ color: '#8b92a5' }}>{task.task_type}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleUndoClick}
            disabled={!canUndo && !isComplete}
            title={canUndo ? 'Undo last change (⌘Z)' : isComplete ? 'Mark incomplete (⌘Z)' : 'Nothing to undo'}
          >
            <Undo2 className="h-3.5 w-3.5" style={{ color: (canUndo || isComplete) ? '#eef1f6' : '#8b92a5' }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 relative"
            onClick={handleManualAsanaSync}
            disabled={asanaSyncing}
            title={
              (task as any).asana_sync_status === 'failed'
                ? `Asana sync failed — click to retry. ${(task as any).asana_sync_error || ''}`
                : (task as any).asana_task_gid
                  ? 'Sync to Asana'
                  : 'Create in Asana'
            }
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', asanaSyncing && 'animate-spin')}
              style={{
                color:
                  (task as any).asana_sync_status === 'failed'
                    ? '#f87171'
                    : (task as any).asana_task_gid
                      ? '#22c55e'
                      : '#8b92a5',
              }}
            />
            {(task as any).asana_sync_status === 'failed' && (
              <span
                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
                style={{ background: '#f87171' }}
              />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/tasks/${task.id}`)} title="Open full page">
            <ExternalLink className="h-3.5 w-3.5" style={{ color: '#8b92a5' }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-[#ff4d4d]" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" style={{ color: '#8b92a5' }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" style={{ color: '#8b92a5' }} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {/* Title */}
          {editingTitle ? (
            <Input value={titleValue} onChange={e => setTitleValue(e.target.value)} onBlur={handleSaveTitle}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false); } }}
              className="text-lg font-semibold bg-[rgba(255,255,255,0.025)] text-white border-[rgba(255,255,255,0.06)]" autoFocus />
          ) : (
            <h2
              className={cn('text-lg font-semibold cursor-text hover:bg-[rgba(255,255,255,0.05)] rounded px-1 -mx-1 py-0.5 transition-colors', isComplete && 'line-through')}
              style={{ color: isComplete ? '#8b92a5' : 'white' }}
              onClick={() => { setTitleValue(task.title); setEditingTitle(true); }}
            >
              {task.title}
            </h2>
          )}

          {/* Meta fields */}
          <div className="space-y-3">
            {/* Status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0" style={{ color: '#8b92a5' }}>
                <CheckSquare className="h-3 w-3" /> Status
              </div>
              <Select value={task.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-7 w-[140px] text-xs border-none bg-transparent px-0">
                  <span className="px-3 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${statusConf.bg}25`, color: statusConf.bg }}>
                    {statusConf.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  <SelectItem value="complete" className="text-xs">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Blocker Note - shown when blocked or editing */}
            {(task.status === 'blocked' || blockerNote) && (
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0 mt-1" style={{ color: '#ff4d4d' }}>
                  <AlertTriangle className="h-3 w-3" /> Blocker
                </div>
                <div className="flex-1 space-y-1">
                  <Input
                    value={blockerNote}
                    onChange={e => setBlockerNote(e.target.value)}
                    onBlur={handleSaveBlockerNote}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveBlockerNote(); }}
                    placeholder="What's blocking this task?..."
                    className="h-7 text-xs bg-[rgba(255,255,255,0.025)] text-white"
                    style={{ borderColor: '#ff4d4d' }}
                  />
                  {task.status === 'blocked' && !blockerNote.trim() && (
                    <p className="text-[10px]" style={{ color: '#ff4d4d' }}>Required: Add a note explaining what's blocking this task</p>
                  )}
                </div>
              </div>
            )}

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0" style={{ color: '#8b92a5' }}>
                <User className="h-3 w-3" /> Assignee
              </div>
              <Select value={task.assigned_to} onValueChange={v => onUpdateWithUndo({ assigned_to: v } as any)}>
                <SelectTrigger className="h-7 text-xs border-none bg-transparent px-1 w-auto min-w-[120px]">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={task.assignee_profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px]" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
                        {task.assignee_profile?.display_name?.slice(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs" style={{ color: 'white' }}>{task.assignee_profile?.display_name || 'Unassigned'}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={m.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px]">{m.display_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {m.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Collaborators */}
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0 mt-1" style={{ color: '#8b92a5' }}>
                <Users className="h-3 w-3" /> Collaborators
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 flex-wrap">
                  {collaborators.map(c => (
                    <div key={c.user_id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full group/collab" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={c.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[7px]" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
                          {c.profile?.display_name?.slice(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px]" style={{ color: 'white' }}>{c.profile?.display_name?.split(' ')[0] || 'User'}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${c.profile?.display_name || 'collaborator'}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCollaborator.mutate(c.user_id); }}
                        className="opacity-60 hover:opacity-100 group-hover/collab:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" style={{ color: '#8b92a5' }} />
                      </button>
                    </div>
                  ))}
                  <Popover modal>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" style={{ border: '1px dashed rgba(255,255,255,0.06)' }} aria-label="Add collaborator">
                        <Plus className="h-3 w-3" style={{ color: '#8b92a5' }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[240px] p-0"
                      align="start"
                      onOpenAutoFocus={(e) => {
                        // Let the CommandInput take focus naturally instead of
                        // the popover container, so arrow keys/Enter work.
                      }}
                    >
                      {(() => {
                        const available = members.filter(
                          m => m.id !== task.assigned_to && !collaborators.some(c => c.user_id === m.id),
                        );
                        return (
                          <Command>
                            <CommandInput placeholder="Add collaborator…" className="h-8 text-xs" />
                            <CommandList className="max-h-[220px]">
                              <CommandEmpty className="py-3 text-center text-[11px] text-muted-foreground">
                                {members.length === 0 ? 'No team members found' : 'All team members added'}
                              </CommandEmpty>
                              {available.length > 0 && (
                                <CommandGroup>
                                  {available.map(m => (
                                    <CommandItem
                                      key={m.id}
                                      value={`${m.display_name} ${m.email || ''}`}
                                      onSelect={() => {
                                        addCollaborator.mutate(m.id);
                                      }}
                                      className="flex items-center gap-2 text-xs cursor-pointer"
                                    >
                                      <Avatar className="h-5 w-5">
                                        <AvatarImage src={m.avatar_url || undefined} />
                                        <AvatarFallback className="text-[8px]">
                                          {m.display_name?.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="truncate">{m.display_name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        );
                      })()}
                    </PopoverContent>
                  </Popover>
                </div>
                {collaborators.length === 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: '#8b92a5' }}>No collaborators</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0" style={{ color: '#8b92a5' }}>
                <Calendar className="h-3 w-3" /> Due date
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Input type="date" value={task.due_date || ''} onChange={e => onUpdateWithUndo({ due_date: e.target.value || null } as any)}
                  className="h-7 text-xs w-[130px] bg-[rgba(255,255,255,0.025)] text-white border-[rgba(255,255,255,0.06)]" />
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)]" style={{ color: '#8b92a5' }} onClick={() => onUpdateWithUndo({ due_date: today } as any)}>Today</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)]" style={{ color: '#8b92a5' }} onClick={() => onUpdateWithUndo({ due_date: tomorrow } as any)}>Tomorrow</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)]" style={{ color: '#8b92a5' }} onClick={() => onUpdateWithUndo({ due_date: format(addDays(new Date(), 7), 'yyyy-MM-dd') } as any)}>+1 Week</Button>
                </div>
              </div>
            </div>


            {/* Deal link */}
            <DealLinkField
              dealId={task.deal_id || null}
              onChange={(id) => onUpdateWithUndo({ deal_id: id } as any)}
            />

            {/* Recurrence controls */}
            {(task.recurrence_rule || (task as any).is_recurring) && (() => {
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              const seriesEnd = (task as any).recurrence_end_date as string | null | undefined;
              const isPaused = !!seriesEnd && seriesEnd <= todayStr;
              return (
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0 mt-1" style={{ color: '#8b92a5' }}>
                    <Repeat className="h-3 w-3" /> Recurrence
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: isPaused ? '#f59e0b25' : '#3b7eff25',
                          color: isPaused ? '#f59e0b' : '#3b7eff',
                        }}
                      >
                        {describeRecurrence(task.recurrence_rule)}{isPaused ? ' · Paused' : ''}
                      </span>
                      {seriesEnd && !isPaused && (
                        <span className="text-[10px]" style={{ color: '#8b92a5' }}>
                          Ends {format(new Date(seriesEnd + 'T00:00:00'), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {!isPaused ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)] gap-1"
                          style={{ color: '#f59e0b' }}
                          onClick={() => {
                            const prevEnd = (task as any).recurrence_end_date ?? null;
                            onUpdate({ recurrence_end_date: todayStr } as any);
                            toast.success('Recurrence paused — no further occurrences will be generated', {
                              duration: 8000,
                              action: {
                                label: 'Undo',
                                onClick: () => {
                                  onUpdate({ recurrence_end_date: prevEnd } as any);
                                  toast.success('Pause undone');
                                },
                              },
                            });
                          }}
                          title="Stop generating new occurrences but keep the rule so you can resume later"
                        >
                          <Pause className="h-3 w-3" /> Pause
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)] gap-1"
                          style={{ color: '#22c55e' }}
                          onClick={() => {
                            onUpdate({ recurrence_end_date: null } as any);
                            toast.success('Recurrence resumed');
                          }}
                          title="Resume generating occurrences from this rule"
                        >
                          <Play className="h-3 w-3" /> Resume
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 rounded-full border-[rgba(255,255,255,0.06)] gap-1"
                        style={{ color: '#ff4d4d' }}
                        onClick={() => setStopRecurrenceOpen(true)}
                        title="Permanently stop the recurring series"
                      >
                        <Square className="h-3 w-3" /> Stop
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dependencies */}
            {(blockedBy.length > 0 || blocking.length > 0) && (
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0 mt-0.5" style={{ color: '#8b92a5' }}>
                  <Link2 className="h-3 w-3" /> Depends
                </div>
                <div className="space-y-1 text-xs">
                  {blockedBy.map(d => {
                    const depTask = allTasks.find(t => t.id === d.depends_on_task_id);
                    return (
                      <div key={d.id} className="flex items-center gap-1" style={{ color: '#ff4d4d' }}>
                        <span>Blocked by: {depTask?.title || 'Unknown'}</span>
                        <button onClick={() => removeDependency.mutate(d.id)}><X className="h-3 w-3" style={{ color: '#8b92a5' }} /></button>
                      </div>
                    );
                  })}
                  {blocking.map(d => {
                    const depTask = allTasks.find(t => t.id === d.task_id);
                    return (
                      <div key={d.id} className="flex items-center gap-1" style={{ color: '#f59e0b' }}>
                        <span>Blocking: {depTask?.title || 'Unknown'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>


          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Description */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#8b92a5' }}>Description</label>
            <MentionTextarea value={descValue} onChange={setDescValue} placeholder="Add a description..." className="min-h-[80px]" minRows={3} />
            <div className="flex justify-end mt-1">
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={handleSaveDesc} disabled={descValue === (task.description || '')} style={{ color: '#8b92a5' }}>Save</Button>
            </div>
          </div>

          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Duplicate-detection panel — human-in-the-loop review */}
          <TaskDuplicatePanel taskId={task.id} />

          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: '#8b92a5' }}>Subtasks</span>
                {subtasks.length > 0 && <span className="text-[10px]" style={{ color: '#8b92a5' }}>{subtasks.filter(s => s.status === 'complete').length}/{subtasks.length}</span>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" style={{ color: '#8b92a5' }} onClick={() => setShowSubtaskInput(true)}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {subtasks.length > 0 && (
              <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(subtasks.filter(s => s.status === 'complete').length / subtasks.length) * 100}%`, backgroundColor: '#22c55e' }} />
              </div>
            )}
            <div className="space-y-0.5">
              {subtasks.map(sub => (
                <SubtaskInlineEditor
                  key={sub.id}
                  subtask={sub}
                  isExpanded={expandedSubtasks.has(sub.id)}
                  onToggleExpand={() => toggleSubtaskExpanded(sub.id)}
                  onUpdate={(subtaskId, updates) => updateSubtask.mutate({ subtaskId, updates })}
                  onDelete={(subtaskId) => deleteSubtask.mutate(subtaskId)}
                  onToggleComplete={(subtaskId, currentStatus) => {
                    const newStatus = currentStatus === 'complete' ? 'not_started' : 'complete';
                    updateSubtask.mutate({ subtaskId, updates: { status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : null } });
                    if (newStatus === 'complete') fireCelebration();
                  }}
                />
              ))}
            </div>
            {showSubtaskInput && (
              <div className="flex items-center gap-1.5 mt-1">
                <Input value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtaskTitle(''); } }}
                  placeholder="Subtask name..." className="h-7 text-xs flex-1 bg-[rgba(255,255,255,0.025)] text-white border-[rgba(255,255,255,0.06)]" autoFocus />
              </div>
            )}
            {subtasks.length === 0 && !showSubtaskInput && <p className="text-[11px]" style={{ color: '#8b92a5' }}>No subtasks</p>}
          </div>

          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Attachments */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <Paperclip className="h-3.5 w-3.5" style={{ color: '#8b92a5' }} />
              {attachments.length > 0 && (
                <span
                  className="text-[11px] font-medium tabular-nums leading-none"
                  style={{ color: '#8b92a5' }}
                  aria-label={`${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`}
                >
                  {attachments.length}
                </span>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {attachments.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md group text-xs max-w-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <FileText className="h-3 w-3 shrink-0" style={{ color: '#8b92a5' }} />
                  <span className="truncate max-w-[140px]" style={{ color: 'white' }}>{a.file_name}</span>
                  <span className="text-[10px] shrink-0" style={{ color: '#8b92a5' }}>{formatFileSize(a.file_size)}</span>
                  <button onClick={() => handleDownload(a.file_path, a.file_name)} className="opacity-0 group-hover:opacity-100 shrink-0">
                    <Download className="h-3 w-3" style={{ color: '#3b7eff' }} />
                  </button>
                  <button onClick={() => deleteAttachment.mutate(a)} className="opacity-0 group-hover:opacity-100 shrink-0">
                    <X className="h-3 w-3" style={{ color: '#ff4d4d' }} />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                style={{ color: '#8b92a5' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-3 w-3" /> {attachments.length === 0 ? 'Upload' : 'Add'}
              </Button>
            </div>
          </div>

          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Dependencies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#8b92a5' }}>
                <Link2 className="h-3 w-3" /> Dependencies
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" style={{ color: '#8b92a5' }}><Plus className="h-3 w-3" /> Add</Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-1 max-h-[200px] overflow-auto" align="end">
                  <p className="text-[10px] px-2 py-1" style={{ color: '#8b92a5' }}>Blocked by...</p>
                  {availableDeps.map(t => (
                    <button key={t.id} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted truncate" onClick={() => addDependency.mutate(t.id)}>
                      {t.title}
                    </button>
                  ))}
                  {availableDeps.length === 0 && <p className="text-[11px] p-2" style={{ color: '#8b92a5' }}>No tasks available</p>}
                </PopoverContent>
              </Popover>
            </div>
            {blockedBy.length === 0 && blocking.length === 0 && <p className="text-[11px]" style={{ color: '#8b92a5' }}>No dependencies</p>}
          </div>

          <Separator style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

          {/* Comments & Activity */}
          <Tabs defaultValue="comments">
            <TabsList className="h-8 w-full" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <TabsTrigger value="comments" className="text-xs gap-1 flex-1">
                <MessageSquare className="h-3 w-3" /> Comments ({comments.length})
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs gap-1 flex-1">
                <Activity className="h-3 w-3" /> Activity ({activity.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="mt-3 space-y-3">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[9px]" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
                      {c.author_id.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium" style={{ color: 'white' }}>Comment</span>
                      <span className="text-[10px]" style={{ color: '#8b92a5' }}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      {c.is_edited && <span className="text-[9px]" style={{ color: '#8b92a5' }}>(edited)</span>}
                    </div>
                    <MentionText text={c.body} className="text-xs mt-0.5" />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <MentionTextarea value={commentText} onChange={setCommentText} onSubmit={handleAddComment} placeholder="Write a comment..." className="min-h-[60px]" minRows={2} />
              </div>
              {commentText.trim() && (
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: '#3b7eff' }} onClick={handleAddComment}>Post</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="activity" className="mt-3 space-y-2">
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 py-1">
                  <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                    <Clock className="h-2.5 w-2.5" style={{ color: '#8b92a5' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-medium" style={{ color: 'white' }}>{a.event_type.replace(/_/g, ' ')}</span></p>
                    <span className="text-[10px]" style={{ color: '#8b92a5' }}>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              ))}
              {/* Always-present creation entry, oldest at the bottom. */}
              <div className="flex items-start gap-2 py-1">
                <Avatar className="h-5 w-5 shrink-0 mt-0.5">
                  {creatorProfile?.avatar_url && <AvatarImage src={creatorProfile.avatar_url} />}
                  <AvatarFallback className="text-[9px]" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                    {(creatorProfile?.display_name || creatorProfile?.email || '?').trim().charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: 'white' }}>
                    <span className="font-medium">Created</span>
                    {creatorProfile && (
                      <> by <span className="font-medium">{creatorProfile.display_name || creatorProfile.email}</span></>
                    )}
                  </p>
                  <span className="text-[10px]" style={{ color: '#8b92a5' }}>
                    {format(new Date(task.created_at), "MMM d, yyyy 'at' h:mm a")}
                    {' · '}
                    {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
      <AlertDialog open={stopRecurrenceOpen} onOpenChange={setStopRecurrenceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this recurring series?</AlertDialogTitle>
            <AlertDialogDescription>
              No more tasks will be generated from this rule. Existing tasks already created will not be affected. This action removes the recurrence rule entirely — to temporarily halt generation instead, use Pause.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const prevRule = task.recurrence_rule ?? null;
                const prevEnd = (task as any).recurrence_end_date ?? null;
                const prevIsRecurring = (task as any).is_recurring ?? false;
                onUpdate({ recurrence_rule: null, recurrence_end_date: null, is_recurring: false } as any);
                toast.success('Recurrence stopped', {
                  duration: 10000,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      onUpdate({
                        recurrence_rule: prevRule,
                        recurrence_end_date: prevEnd,
                        is_recurring: prevIsRecurring,
                      } as any);
                      toast.success('Recurrence restored');
                    },
                  },
                });
                setStopRecurrenceOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop recurrence
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Deal link sub-component — view + link/unlink from the details panel.
function DealLinkField({
  dealId,
  onChange,
}: {
  dealId: string | null;
  onChange: (dealId: string | null) => void;
}) {
  const { deals } = useDealsContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const linkedDeal = dealId ? deals.find(d => d.id === dealId) : undefined;

  // Fallback fetch if the linked deal isn't in the current user's deals list.
  const { data: fallbackDeal } = useQuery({
    queryKey: ['task-linked-deal', dealId],
    enabled: !!dealId && !linkedDeal,
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, company, stage')
        .eq('id', dealId as string)
        .maybeSingle();
      return data;
    },
  });

  const displayDeal = linkedDeal
    ? { id: linkedDeal.id, company: linkedDeal.name, stage: (linkedDeal as any).stage }
    : fallbackDeal
      ? { id: fallbackDeal.id, company: fallbackDeal.company, stage: fallbackDeal.stage }
      : null;

  const q = search.trim().toLowerCase();
  const filtered = (q
    ? deals.filter(d => d.name?.toLowerCase().includes(q))
    : deals
  ).slice(0, 50);

  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-1.5 w-[90px] text-xs shrink-0 mt-1" style={{ color: '#8b92a5' }}>
        <Link2 className="h-3 w-3" /> Deal
      </div>
      <div className="flex-1">
        {displayDeal ? (
          <div
            className="rounded-lg p-2.5 flex items-start justify-between gap-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="min-w-0">
              <Link
                to={`/deal/${displayDeal.id}`}
                className="text-xs font-medium hover:underline block truncate"
                style={{ color: '#3b7eff' }}
              >
                {displayDeal.company || 'Deal'}
              </Link>
              {displayDeal.stage && (
                <span className="text-[10px]" style={{ color: '#8b92a5' }}>Stage: {displayDeal.stage}</span>
              )}
            </div>
            <button
              type="button"
              aria-label="Unlink deal"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(null); }}
              className="opacity-60 hover:opacity-100 transition-opacity mt-0.5"
            >
              <X className="h-3 w-3" style={{ color: '#8b92a5' }} />
            </button>
          </div>
        ) : (
          <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5 border-dashed"
                style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#8b92a5', backgroundColor: 'transparent' }}
              >
                <Plus className="h-3 w-3" /> Link a deal
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search deals…"
                  className="h-8 text-xs"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList className="max-h-[260px]">
                  <CommandEmpty className="py-3 text-center text-[11px] text-muted-foreground">
                    No deals found
                  </CommandEmpty>
                  {filtered.length > 0 && (
                    <CommandGroup>
                      {filtered.map(d => (
                        <CommandItem
                          key={d.id}
                          value={d.id}
                          onSelect={() => {
                            onChange(d.id);
                            setOpen(false);
                            setSearch('');
                          }}
                          className="flex items-center gap-2 text-xs cursor-pointer"
                        >
                          <Link2 className="h-3 w-3" style={{ color: '#8b92a5' }} />
                          <span className="truncate">{d.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
