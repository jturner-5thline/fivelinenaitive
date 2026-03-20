import { useState, useCallback, useMemo } from 'react';
import { useVdrTasks, VdrTaskStatus, VdrTaskType } from '@/hooks/useVdrTasks';
import { useVdrIrlRequests } from '@/hooks/useVdrIrlRequests';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, ChevronDown, ChevronRight, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { VdrTask } from '@/components/vdr/types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';

interface VdrTasksViewProps {
  dealId: string;
}

const TASK_TYPES: { value: VdrTaskType; label: string }[] = [
  { value: 'tie_out', label: 'Tie-out' },
  { value: 'compliance_review', label: 'Compliance Review' },
  { value: 'financial_analysis', label: 'Financial Analysis' },
  { value: 'legal_review', label: 'Legal Review' },
  { value: 'tax_analysis', label: 'Tax Analysis' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_CFG: Record<VdrTaskStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'bg-muted text-muted-foreground border-border' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  complete: { label: 'Complete', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

const TEAM_MEMBERS = [
  { id: 'member-1', name: 'Jordan Kim' },
  { id: 'member-2', name: 'Alex Rivera' },
  { id: 'member-3', name: 'Sam Patel' },
  { id: 'member-4', name: 'Morgan Chen' },
];

const CHART_COLORS = ['hsl(var(--primary))', '#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#64748b'];

export function VdrTasksView({ dealId }: VdrTasksViewProps) {
  const { tasks, loading, createTask, updateTask, deleteTask } = useVdrTasks(dealId);
  const { requests } = useVdrIrlRequests(dealId);
  const [tab, setTab] = useState('tasks');
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    task_name: '', task_type: 'tie_out' as VdrTaskType, description: '', instructions: '', assignee: '', hours_allocated: 0,
  });

  const handleCreate = useCallback(async () => {
    if (!form.task_name.trim()) return;
    await createTask(form);
    setForm({ task_name: '', task_type: 'tie_out', description: '', instructions: '', assignee: '', hours_allocated: 0 });
    setShowNew(false);
  }, [form, createTask]);

  // Dashboard data
  const byType = useMemo(() => {
    const groups: Record<string, { total: number; complete: number }> = {};
    tasks.forEach(t => {
      if (!groups[t.task_type]) groups[t.task_type] = { total: 0, complete: 0 };
      groups[t.task_type].total++;
      if (t.status === 'complete') groups[t.task_type].complete++;
    });
    return TASK_TYPES.map((tt, i) => ({
      name: tt.label,
      value: groups[tt.value]?.total || 0,
      complete: groups[tt.value]?.complete || 0,
      pct: groups[tt.value] ? Math.round((groups[tt.value].complete / groups[tt.value].total) * 100) : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })).filter(d => d.value > 0);
  }, [tasks]);

  const hoursByType = useMemo(() => {
    const groups: Record<string, number> = {};
    tasks.forEach(t => { groups[t.task_type] = (groups[t.task_type] || 0) + t.hours_allocated; });
    return TASK_TYPES.map(tt => ({ name: tt.label, hours: groups[tt.value] || 0 })).filter(d => d.hours > 0);
  }, [tasks]);

  const hoursByMember = useMemo(() => {
    const groups: Record<string, number> = {};
    tasks.forEach(t => {
      const name = TEAM_MEMBERS.find(m => m.id === t.assignee)?.name || t.assignee || 'Unassigned';
      groups[name] = (groups[name] || 0) + t.hours_allocated;
    });
    return Object.entries(groups).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-8">
            <TabsTrigger value="tasks" className="text-xs px-3 h-7">Tasks</TabsTrigger>
            <TabsTrigger value="dashboard" className="text-xs px-3 h-7">Dashboard</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New Task
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'tasks' && (
          loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <p className="text-sm">No tasks yet</p>
              <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create First Task
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isExpanded={expandedId === task.id}
                  onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                  onUpdate={updateTask}
                />
              ))}
            </div>
          )
        )}

        {tab === 'dashboard' && (
          <div className="p-6 space-y-8">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Create tasks to see dashboard analytics.</p>
            ) : (
              <>
                {/* Progress Rings */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Completion by Type</h3>
                  <div className="flex gap-6 flex-wrap">
                    {byType.map(d => (
                      <div key={d.name} className="flex flex-col items-center gap-2">
                        <div className="relative w-16 h-16">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={[{ v: d.pct }, { v: 100 - d.pct }]} dataKey="v" cx="50%" cy="50%" innerRadius={20} outerRadius={30} startAngle={90} endAngle={-270} strokeWidth={0}>
                                <Cell fill={d.color} />
                                <Cell fill="hsl(var(--muted))" />
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{d.pct}%</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground text-center">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hours by Workstream */}
                {hoursByType.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Hours by Workstream</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hoursByType} layout="vertical" margin={{ left: 100, right: 20, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={90} />
                          <ReTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} />
                          <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Hours by Member */}
                {hoursByMember.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Hours by Team Member</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hoursByMember} layout="vertical" margin={{ left: 100, right: 20, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={90} />
                          <ReTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} />
                          <Bar dataKey="hours" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* New Task Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Task name *" value={form.task_name} onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))} />
            <Select value={form.task_type} onValueChange={(v: VdrTaskType) => setForm(f => ({ ...f, task_type: v }))}>
              <SelectTrigger><SelectValue placeholder="Task type" /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <Select value={form.assignee || '_none'} onValueChange={v => setForm(f => ({ ...f, assignee: v === '_none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {TEAM_MEMBERS.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Hours allocated" value={form.hours_allocated || ''} onChange={e => setForm(f => ({ ...f, hours_allocated: Number(e.target.value) || 0 }))} />
            <div className="relative">
              <Textarea placeholder="Instructions (manual entry)" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={3} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-7 text-[10px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>
                      <Sparkles className="h-3 w-3 mr-1" /> Generate with AI
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">AI-generated instructions coming in Phase 2</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.task_name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Task Row ────────────────────────────────────── */

function TaskRow({ task, isExpanded, onToggle, onUpdate }: {
  task: VdrTask;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: Partial<VdrTask>) => Promise<void>;
}) {
  const statusCfg = STATUS_CFG[task.status];
  const typeLbl = TASK_TYPES.find(t => t.value === task.task_type)?.label || task.task_type;
  const assigneeName = TEAM_MEMBERS.find(m => m.id === task.assignee)?.name || task.assignee || 'Unassigned';

  const cycleStatus = useCallback(() => {
    const cycle: VdrTaskStatus[] = ['not_started', 'in_progress', 'complete'];
    const idx = cycle.indexOf(task.status);
    onUpdate(task.id, { status: cycle[(idx + 1) % cycle.length] });
  }, [task, onUpdate]);

  return (
    <div>
      <div className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/20 cursor-pointer transition-colors" onClick={onToggle}>
        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium flex-1 truncate">{task.task_name}</span>
        <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-border/50">{typeLbl}</Badge>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-28">
          <User className="h-3 w-3" />
          <span className="truncate">{assigneeName}</span>
        </div>
        <span className="text-xs text-muted-foreground w-12 text-right">{task.hours_allocated}h</span>
        <Badge
          variant="outline"
          className={cn('text-[10px] px-2 py-0.5 cursor-pointer border', statusCfg.className)}
          onClick={e => { e.stopPropagation(); cycleStatus(); }}
        >
          {statusCfg.label}
        </Badge>
      </div>

      {isExpanded && (
        <div className="px-12 pb-4 space-y-3">
          {task.description && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Description</p>
              <p className="text-sm text-foreground/80">{task.description}</p>
            </div>
          )}
          {task.instructions && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Instructions</p>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{task.instructions}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Linked IRL Requests</p>
            <p className="text-xs text-muted-foreground italic">Manual linking coming in next iteration</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Relevant Documents</p>
            <p className="text-xs text-muted-foreground italic">Manual linking coming in next iteration</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Created {format(new Date(task.created_at), 'MMM d, yyyy')}</p>
        </div>
      )}
    </div>
  );
}
