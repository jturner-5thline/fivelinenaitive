import { useState } from 'react';
import { type Task, useTaskComments, useTaskActivity, useSubtasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  X, Calendar, Flag, User, MessageSquare, Activity, Plus,
  CheckSquare, Trash2, Clock, Sun, Sunrise, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format, addDays, nextMonday } from 'date-fns';
import confetti from 'canvas-confetti';

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-destructive/10 text-destructive' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  medium: { label: 'Medium', className: 'bg-primary/10 text-primary' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
};

interface TaskDetailDrawerProps {
  task: Task;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
}

function fireCelebration() {
  confetti({
    particleCount: 60,
    spread: 55,
    origin: { y: 0.7 },
    colors: ['#10b981', '#059669', '#34d399'],
    disableForReducedMotion: true,
  });
}

export function TaskDetailDrawer({ task, onClose, onUpdate, onDelete }: TaskDetailDrawerProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [descValue, setDescValue] = useState(task.description || '');
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);

  const { comments, addComment } = useTaskComments(task.id);
  const { activity } = useTaskActivity(task.id);
  const { subtasks, createSubtask } = useSubtasks(task.id);

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== task.title) {
      onUpdate({ title: titleValue.trim() } as any);
    }
    setEditingTitle(false);
  };

  const handleSaveDesc = () => {
    if (descValue !== (task.description || '')) {
      onUpdate({ description: descValue } as any);
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim());
    setCommentText('');
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    createSubtask.mutate(newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };

  const handleToggleComplete = () => {
    const newStatus = isComplete ? 'not_started' : 'complete';
    onUpdate({ status: newStatus } as any);
    if (newStatus === 'complete') fireCelebration();
  };

  const isComplete = task.status === 'complete';

  // Quick date helpers
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMon = format(nextMonday(new Date()), 'yyyy-MM-dd');

  return (
    <div className="w-[420px] border-l bg-background flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isComplete}
            onCheckedChange={handleToggleComplete}
            className={cn('h-4 w-4 rounded-full', isComplete && 'bg-emerald-500 border-emerald-500')}
          />
          <span className="text-xs text-muted-foreground capitalize">{task.task_type}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Title */}
          {editingTitle ? (
            <Input
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false); } }}
              className="text-lg font-semibold"
              autoFocus
            />
          ) : (
            <h2
              className={cn(
                'text-lg font-semibold cursor-text hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors',
                isComplete && 'line-through text-muted-foreground'
              )}
              onClick={() => { setTitleValue(task.title); setEditingTitle(true); }}
            >
              {task.title}
            </h2>
          )}

          {/* Meta fields */}
          <div className="space-y-2.5">
            {/* Assignee */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <User className="h-3 w-3" /> Assignee
              </div>
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                    {task.assignee_profile?.display_name?.slice(0, 2).toUpperCase() || '??'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs">{task.assignee_profile?.display_name || 'Unassigned'}</span>
              </div>
            </div>

            {/* Due date with quick shortcuts */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Calendar className="h-3 w-3" /> Due date
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={task.due_date || ''}
                  onChange={e => onUpdate({ due_date: e.target.value || null } as any)}
                  className="h-7 text-xs w-[130px]"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Clock className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[160px] p-1" align="start">
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                      onClick={() => onUpdate({ due_date: today } as any)}
                    >
                      <Sun className="h-3 w-3 text-orange-500" /> Today
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                      onClick={() => onUpdate({ due_date: tomorrow } as any)}
                    >
                      <Sunrise className="h-3 w-3 text-amber-500" /> Tomorrow
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                      onClick={() => onUpdate({ due_date: nextMon } as any)}
                    >
                      <ArrowRight className="h-3 w-3 text-primary" /> Next Monday
                    </button>
                    {task.due_date && (
                      <>
                        <div className="border-t my-1" />
                        <button
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-destructive"
                          onClick={() => onUpdate({ due_date: null } as any)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Flag className="h-3 w-3" /> Priority
              </div>
              <Select value={task.priority} onValueChange={v => onUpdate({ priority: v } as any)}>
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low" className="text-xs">Low</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                  <SelectItem value="high" className="text-xs">High</SelectItem>
                  <SelectItem value="urgent" className="text-xs">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <CheckSquare className="h-3 w-3" /> Status
              </div>
              <Select value={task.status} onValueChange={v => {
                onUpdate({ status: v } as any);
                if (v === 'complete') fireCelebration();
              }}>
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  <SelectItem value="complete" className="text-xs">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <Textarea
              value={descValue}
              onChange={e => setDescValue(e.target.value)}
              onBlur={handleSaveDesc}
              placeholder="Add a description..."
              className="min-h-[80px] text-sm"
            />
          </div>

          <Separator />

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Subtasks</span>
                {subtasks.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {subtasks.filter(s => s.status === 'complete').length}/{subtasks.length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setShowSubtaskInput(true)}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {/* Progress bar for subtasks */}
            {subtasks.length > 0 && (
              <div className="h-1 bg-muted rounded-full mb-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(subtasks.filter(s => s.status === 'complete').length / subtasks.length) * 100}%` }}
                />
              </div>
            )}

            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 py-1 group">
                <Checkbox
                  checked={sub.status === 'complete'}
                  className="h-3.5 w-3.5 rounded-full"
                />
                <span className={cn('text-xs flex-1', sub.status === 'complete' && 'line-through text-muted-foreground')}>
                  {sub.title}
                </span>
                {sub.due_date && (
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(sub.due_date + 'T00:00:00'), 'MMM d')}
                  </span>
                )}
              </div>
            ))}
            {showSubtaskInput && (
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSubtask();
                    if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtaskTitle(''); }
                  }}
                  placeholder="Subtask name..."
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
              </div>
            )}
            {subtasks.length === 0 && !showSubtaskInput && (
              <p className="text-[11px] text-muted-foreground/50">No subtasks</p>
            )}
          </div>

          <Separator />

          {/* Comments & Activity tabs */}
          <Tabs defaultValue="comments">
            <TabsList className="h-8 w-full">
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
                    <AvatarFallback className="text-[9px] bg-muted">
                      {c.author_id.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">Comment</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                      {c.is_edited && <span className="text-[9px] text-muted-foreground">(edited)</span>}
                    </div>
                    <p className="text-xs mt-0.5">{c.body}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="min-h-[60px] text-xs flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
                  }}
                />
              </div>
              {commentText.trim() && (
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddComment}>
                    Post
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-3 space-y-2">
              {activity.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
              )}
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 py-1">
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium">{a.event_type.replace(/_/g, ' ')}</span>
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
