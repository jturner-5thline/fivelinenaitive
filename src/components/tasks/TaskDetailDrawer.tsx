import { useState, useRef } from 'react';
import { type Task, useTaskComments, useTaskActivity, useSubtasks } from '@/hooks/useTasks';
import { useTaskLabels, useTaskLabelAssignments } from '@/hooks/useTaskLabels';
import { useTaskDependencies } from '@/hooks/useTaskDependencies';
import { useTaskTimeEntries } from '@/hooks/useTaskTimeEntries';
import { useTaskAttachments } from '@/hooks/useTaskAttachments';
import { useTaskWatchers } from '@/hooks/useTaskWatchers';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { useCreateMentions } from '@/hooks/useTaskMentions';
import { MentionTextarea, MentionText } from '@/components/tasks/MentionTextarea';
import { useQuery } from '@tanstack/react-query';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  X, Calendar, Flag, User, MessageSquare, Activity, Plus,
  CheckSquare, Trash2, Clock, Sun, Sunrise, ArrowRight,
  Tag, Link2, Timer, Paperclip, Download, FileText, Users,
  Star, Repeat, Eye, EyeOff, ExternalLink,
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
  fullPage?: boolean;
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TaskDetailDrawer({ task, onClose, onUpdate, onDelete, fullPage = false }: TaskDetailDrawerProps) {
  const navigate = useNavigate();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [descValue, setDescValue] = useState(task.description || '');
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeDescription, setTimeDescription] = useState('');
  const [showTimeInput, setShowTimeInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { comments, addComment } = useTaskComments(task.id);
  const { activity } = useTaskActivity(task.id);
  const { subtasks, createSubtask } = useSubtasks(task.id);
  const { labels } = useTaskLabels();
  const { assignedLabelIds, toggleLabel } = useTaskLabelAssignments(task.id);
  const { blockedBy, blocking, addDependency, removeDependency } = useTaskDependencies(task.id);
  const { entries: timeEntries, totalMinutes, logTime, deleteEntry } = useTaskTimeEntries(task.id);
  const { attachments, uploadAttachment, deleteAttachment, getDownloadUrl } = useTaskAttachments(task.id);
  const { watchers, isWatching, toggleWatch } = useTaskWatchers(task.id);
  const members = useTeamMembers();
  const { tasks: allTasks } = useMyTasks();
  const createMentions = useCreateMentions();

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== task.title) {
      onUpdate({ title: titleValue.trim() } as any);
    }
    setEditingTitle(false);
  };

  const handleSaveDesc = () => {
    if (descValue !== (task.description || '')) {
      onUpdate({ description: descValue } as any);
      // Create mentions from description
      createMentions.mutate({ taskId: task.id, text: descValue, source: 'description' });
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim());
    // Create mentions from comment
    createMentions.mutate({ taskId: task.id, text: commentText.trim(), source: 'comment' });
    setCommentText('');
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    createSubtask.mutate(newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };

  const handleLogTime = () => {
    const mins = parseInt(timeMinutes);
    if (!mins || mins <= 0) return;
    logTime.mutate({ duration_minutes: mins, description: timeDescription || undefined });
    setTimeMinutes('');
    setTimeDescription('');
    setShowTimeInput(false);
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
    onUpdate({ status: newStatus } as any);
    if (newStatus === 'complete') fireCelebration();
  };

  const isComplete = task.status === 'complete';

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMon = format(nextMonday(new Date()), 'yyyy-MM-dd');

  const assignedLabels = labels.filter(l => assignedLabelIds.includes(l.id));
  const availableDeps = allTasks.filter(t => t.id !== task.id && !blockedBy.some(d => d.depends_on_task_id === t.id));

  return (
    <div className={cn(
      "border-l bg-background flex flex-col h-full shrink-0",
      fullPage ? "w-full border-l-0" : "w-[380px]"
    )}>
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/tasks/${task.id}`)} title="Open full page">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
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
            {/* Assignee - now with team picker */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <User className="h-3 w-3" /> Assignee
              </div>
              <Select
                value={task.assigned_to}
                onValueChange={v => onUpdate({ assigned_to: v } as any)}
              >
                <SelectTrigger className="h-7 text-xs border-none bg-transparent px-1 w-auto min-w-[120px]">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={task.assignee_profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                        {task.assignee_profile?.display_name?.slice(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{task.assignee_profile?.display_name || 'Unassigned'}</span>
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
                    <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted" onClick={() => onUpdate({ due_date: today } as any)}>
                      <Sun className="h-3 w-3 text-orange-500" /> Today
                    </button>
                    <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted" onClick={() => onUpdate({ due_date: tomorrow } as any)}>
                      <Sunrise className="h-3 w-3 text-amber-500" /> Tomorrow
                    </button>
                    <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted" onClick={() => onUpdate({ due_date: nextMon } as any)}>
                      <ArrowRight className="h-3 w-3 text-primary" /> Next Monday
                    </button>
                    {task.due_date && (
                      <>
                        <div className="border-t my-1" />
                        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-destructive" onClick={() => onUpdate({ due_date: null } as any)}>
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
                <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  <SelectItem value="complete" className="text-xs">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Completed on */}
            {isComplete && task.completed_at && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                  <CheckSquare className="h-3 w-3" /> Completed
                </div>
                <span className="text-xs text-muted-foreground">
                  Completed on {format(new Date(task.completed_at), 'MMM d, yyyy')}
                </span>
              </div>
            )}

            {/* Labels */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Tag className="h-3 w-3" /> Labels
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {assignedLabels.map(l => (
                  <Badge
                    key={l.id}
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:line-through"
                    style={{ borderColor: l.color, color: l.color }}
                    onClick={() => toggleLabel.mutate(l.id)}
                  >
                    {l.name}
                  </Badge>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[180px] p-1" align="start">
                    {labels.length === 0 && (
                      <p className="text-[11px] text-muted-foreground p-2">No labels yet</p>
                    )}
                    {labels.map(l => (
                      <button
                        key={l.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                        onClick={() => toggleLabel.mutate(l.id)}
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                        {assignedLabelIds.includes(l.id) && <span className="ml-auto text-primary">✓</span>}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Starred */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Star className="h-3 w-3" /> Starred
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 text-xs gap-1.5', task.is_starred && 'text-amber-500')}
                onClick={() => onUpdate({ is_starred: !task.is_starred } as any)}
              >
                <Star className={cn('h-3.5 w-3.5', task.is_starred && 'fill-amber-500 text-amber-500')} />
                {task.is_starred ? 'Starred' : 'Star this task'}
              </Button>
            </div>

            {/* Recurrence */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Repeat className="h-3 w-3" /> Repeat
              </div>
              <Select
                value={task.recurrence_rule || 'none'}
                onValueChange={v => onUpdate({ recurrence_rule: v === 'none' ? null : v } as any)}
              >
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No repeat</SelectItem>
                  <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                  <SelectItem value="weekdays" className="text-xs">Weekdays</SelectItem>
                  <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                  <SelectItem value="biweekly" className="text-xs">Biweekly</SelectItem>
                  <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Watchers */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Eye className="h-3 w-3" /> Watchers
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-7 text-xs gap-1.5', isWatching && 'text-primary')}
                  onClick={() => toggleWatch.mutate()}
                >
                  {isWatching ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {isWatching ? 'Unwatch' : 'Watch'}
                </Button>
                {watchers.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{watchers.length} watching</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
                <Timer className="h-3 w-3" /> Time
              </div>
              <div className="flex items-center gap-1.5">
                {totalMinutes > 0 ? (
                  <Badge variant="blue" className="text-[10px] h-5 px-1.5 font-normal">{formatMinutes(totalMinutes)} logged</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">No time logged</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] ml-auto" onClick={() => setShowTimeInput(!showTimeInput)}>
                + Log
              </Button>
            </div>

            {/* Deal link */}
            {task.deal_id && <DealLinkField dealId={task.deal_id} />}

            {/* Dependencies */}
            {(blockedBy.length > 0 || blocking.length > 0) && (
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0 mt-0.5">
                  <Link2 className="h-3 w-3" /> Depends
                </div>
                <div className="space-y-1 text-xs">
                  {blockedBy.map(d => {
                    const depTask = allTasks.find(t => t.id === d.depends_on_task_id);
                    return (
                      <div key={d.id} className="flex items-center gap-1 text-destructive/80">
                        <span>Blocked by: {depTask?.title || 'Unknown'}</span>
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => removeDependency.mutate(d.id)}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {blocking.map(d => {
                    const depTask = allTasks.find(t => t.id === d.task_id);
                    return (
                      <div key={d.id} className="flex items-center gap-1 text-amber-600">
                        <span>Blocking: {depTask?.title || 'Unknown'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Time logging form */}
          {showTimeInput && (
            <>
              <Separator />
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Log Time</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={timeMinutes}
                    onChange={e => setTimeMinutes(e.target.value)}
                    placeholder="Minutes"
                    className="h-7 text-xs w-20"
                    min={1}
                  />
                  <Input
                    value={timeDescription}
                    onChange={e => setTimeDescription(e.target.value)}
                    placeholder="What did you work on?"
                    className="h-7 text-xs flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') handleLogTime(); }}
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={handleLogTime}>Log</Button>
                </div>
                {timeEntries.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {timeEntries.slice(0, 5).map(e => (
                      <div key={e.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{formatMinutes(e.duration_minutes)} — {e.description || 'No description'}</span>
                        <button onClick={() => deleteEntry.mutate(e.id)} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <MentionTextarea
              value={descValue}
              onChange={setDescValue}
              placeholder="Add a description... (use @name to mention)"
              className="min-h-[80px]"
              minRows={3}
            />
            <div className="flex justify-end mt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={handleSaveDesc}
                disabled={descValue === (task.description || '')}
              >
                Save
              </Button>
            </div>
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
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setShowSubtaskInput(true)}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
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
                <Checkbox checked={sub.status === 'complete'} className="h-3.5 w-3.5 rounded-full" />
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

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="h-3 w-3" /> Attachments ({attachments.length})
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
                <Plus className="h-3 w-3" /> Upload
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            </div>
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-2 py-1 group text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{a.file_name}</span>
                <span className="text-[10px] text-muted-foreground">{formatFileSize(a.file_size)}</span>
                <button onClick={() => handleDownload(a.file_path, a.file_name)} className="opacity-0 group-hover:opacity-100">
                  <Download className="h-3 w-3 text-muted-foreground hover:text-primary" />
                </button>
                <button onClick={() => deleteAttachment.mutate(a)} className="opacity-0 group-hover:opacity-100">
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
            {attachments.length === 0 && (
              <p className="text-[11px] text-muted-foreground/50">No files attached</p>
            )}
          </div>

          <Separator />

          {/* Dependencies - add new */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3 w-3" /> Dependencies
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-1 max-h-[200px] overflow-auto" align="end">
                  <p className="text-[10px] text-muted-foreground px-2 py-1">Blocked by...</p>
                  {availableDeps.map(t => (
                    <button
                      key={t.id}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted truncate"
                      onClick={() => addDependency.mutate(t.id)}
                    >
                      {t.title}
                    </button>
                  ))}
                  {availableDeps.length === 0 && (
                    <p className="text-[11px] text-muted-foreground p-2">No tasks available</p>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {blockedBy.length === 0 && blocking.length === 0 && (
              <p className="text-[11px] text-muted-foreground/50">No dependencies</p>
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
                    <MentionText text={c.body} className="text-xs mt-0.5" />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <MentionTextarea
                  value={commentText}
                  onChange={setCommentText}
                  onSubmit={handleAddComment}
                  placeholder="Write a comment... (type @ to mention)"
                  className="min-h-[60px]"
                  minRows={2}
                />
              </div>
              {commentText.trim() && (
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddComment}>Post</Button>
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

// Deal link sub-component
function DealLinkField({ dealId }: { dealId: string }) {
  const { data: deal } = useQuery({
    queryKey: ['deal-name', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company')
        .eq('id', dealId)
        .single();
      if (error) return null;
      return data;
    },
  });

  if (!deal) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-[90px] text-xs text-muted-foreground shrink-0">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        Deal
      </div>
      <Link
        to={`/deal/${deal.id}`}
        className="text-xs text-primary hover:underline flex items-center gap-1"
        onClick={e => e.stopPropagation()}
      >
        <Link2 className="h-3 w-3" />
        {deal.company}
      </Link>
    </div>
  );
}
