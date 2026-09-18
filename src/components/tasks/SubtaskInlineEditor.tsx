import { useState } from 'react';
import { type Task } from '@/hooks/useTasks';
import { useSubtaskChecklist } from '@/hooks/useSubtaskChecklist';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  ChevronDown, ChevronRight, User, Calendar, Plus, X, Trash2, CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

interface SubtaskInlineEditorProps {
  subtask: Task;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (subtaskId: string, updates: Record<string, any>) => void;
  onDelete: (subtaskId: string) => void;
  onToggleComplete: (subtaskId: string, currentStatus: string) => void;
}

export function SubtaskInlineEditor({
  subtask,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onToggleComplete,
}: SubtaskInlineEditorProps) {
  const members = useTeamMembers();
  const { items, completedCount, totalCount, addItem, updateItem, deleteItem, toggleItem } = useSubtaskChecklist(subtask.id);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(subtask.title);
  const [newChecklistLabel, setNewChecklistLabel] = useState('');
  const [showChecklistInput, setShowChecklistInput] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState('');

  const isComplete = subtask.status === 'complete';
  const today = format(new Date(), 'yyyy-MM-dd');
  const assignee = members.find(m => m.id === subtask.assigned_to);

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== subtask.title) {
      onUpdate(subtask.id, { title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistLabel.trim()) return;
    addItem.mutate(newChecklistLabel.trim());
    setNewChecklistLabel('');
  };

  const handleSaveItemLabel = (id: string) => {
    if (editingItemLabel.trim()) {
      updateItem.mutate({ id, updates: { label: editingItemLabel.trim() } });
    }
    setEditingItemId(null);
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: isExpanded ? '1px solid #2a2f3e' : 'none' }}>
      {/* Collapsed row */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-1 group cursor-pointer hover:bg-[#1a1f2e] rounded transition-colors',
          isExpanded && 'bg-[#1a1f2e] rounded-b-none'
        )}
        onClick={onToggleExpand}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(subtask.id, subtask.status); }}
          className="shrink-0"
        >
          <Checkbox checked={isComplete} className={cn('h-3.5 w-3.5 rounded-full', isComplete && 'bg-[#22c55e] border-[#22c55e]')} />
        </button>
        {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: '#8b92a5' }} /> : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: '#8b92a5' }} />}
        <span className={cn('text-xs flex-1 truncate', isComplete && 'line-through')} style={{ color: isComplete ? '#8b92a5' : 'white' }}>
          {subtask.title}
        </span>
        {/* Checklist progress badge */}
        {totalCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{
            backgroundColor: completedCount === totalCount ? '#22c55e25' : '#3b7eff25',
            color: completedCount === totalCount ? '#22c55e' : '#3b7eff',
          }}>
            {completedCount}/{totalCount}
          </span>
        )}
        {assignee && (
          <Avatar className="h-4 w-4 shrink-0">
            <AvatarImage src={assignee.avatar_url || undefined} />
            <AvatarFallback className="text-[7px]" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
              {assignee.display_name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        {subtask.due_date && (
          <span className="text-[10px] shrink-0" style={{ color: '#8b92a5' }}>
            {format(new Date(subtask.due_date + 'T00:00:00'), 'MMM d')}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 space-y-3" style={{ backgroundColor: '#0d1117', borderTop: '1px solid #2a2f3e' }}>
          {/* Editable title */}
          <div>
            {editingTitle ? (
              <Input
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') { setTitleValue(subtask.title); setEditingTitle(false); }
                }}
                className="h-7 text-xs bg-[#13181f] text-white border-[#2a2f3e]"
                autoFocus
              />
            ) : (
              <p
                className="text-xs cursor-text hover:bg-[#1a1f2e] rounded px-1.5 py-1 -mx-1.5 transition-colors"
                style={{ color: 'white' }}
                onClick={(e) => { e.stopPropagation(); setTitleValue(subtask.title); setEditingTitle(true); }}
              >
                {subtask.title}
              </p>
            )}
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 w-[70px] text-[10px] shrink-0" style={{ color: '#8b92a5' }}>
              <User className="h-2.5 w-2.5" /> Assignee
            </div>
            <Select value={subtask.assigned_to || ''} onValueChange={v => onUpdate(subtask.id, { assigned_to: v })}>
              <SelectTrigger className="h-6 text-[11px] border-none bg-transparent px-1 w-auto min-w-[100px]">
                <div className="flex items-center gap-1">
                  {assignee ? (
                    <>
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={assignee.avatar_url || undefined} />
                        <AvatarFallback className="text-[7px]" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
                          {assignee.display_name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span style={{ color: 'white' }}>{assignee.display_name}</span>
                    </>
                  ) : (
                    <span style={{ color: '#8b92a5' }}>Unassigned</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={m.avatar_url || undefined} />
                        <AvatarFallback className="text-[7px]">{m.display_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {m.display_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 w-[70px] text-[10px] shrink-0" style={{ color: '#8b92a5' }}>
              <Calendar className="h-2.5 w-2.5" /> Due date
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-6 text-[11px] w-[130px] justify-start gap-1 px-2 bg-[#13181f] border-[#2a2f3e]',
                      subtask.due_date ? 'text-white' : 'text-[#8b92a5]',
                    )}
                  >
                    <Calendar className="h-3 w-3 shrink-0" />
                    {subtask.due_date
                      ? format(new Date(subtask.due_date + 'T00:00:00'), 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={subtask.due_date ? new Date(subtask.due_date + 'T00:00:00') : undefined}
                    onSelect={(d) =>
                      onUpdate(subtask.id, { due_date: d ? format(d, 'yyyy-MM-dd') : null })
                    }
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 rounded-full border-[#2a2f3e]" style={{ color: '#8b92a5' }}
                onClick={() => onUpdate(subtask.id, { due_date: today })}>Today</Button>
              <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 rounded-full border-[#2a2f3e]" style={{ color: '#8b92a5' }}
                onClick={() => onUpdate(subtask.id, { due_date: format(addDays(new Date(), 1), 'yyyy-MM-dd') })}>Tomorrow</Button>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: '#8b92a5' }}>
                <CheckSquare className="h-2.5 w-2.5" />
                Checklist
                {totalCount > 0 && <span className="text-[9px]">({completedCount}/{totalCount})</span>}
              </span>
              <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5" style={{ color: '#8b92a5' }}
                onClick={() => setShowChecklistInput(true)}>
                <Plus className="h-2.5 w-2.5" /> Add
              </Button>
            </div>

            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ backgroundColor: '#2a2f3e' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${(completedCount / totalCount) * 100}%`,
                  backgroundColor: completedCount === totalCount ? '#22c55e' : '#3b7eff',
                }} />
              </div>
            )}

            {/* Checklist items */}
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-1.5 py-0.5 group">
                <button onClick={() => toggleItem.mutate(item.id)} className="shrink-0">
                  <Checkbox checked={item.is_completed} className="h-3 w-3 rounded" />
                </button>
                {editingItemId === item.id ? (
                  <Input
                    value={editingItemLabel}
                    onChange={e => setEditingItemLabel(e.target.value)}
                    onBlur={() => handleSaveItemLabel(item.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveItemLabel(item.id);
                      if (e.key === 'Escape') setEditingItemId(null);
                    }}
                    className="h-5 text-[11px] flex-1 bg-[#13181f] text-white border-[#2a2f3e] px-1"
                    autoFocus
                  />
                ) : (
                  <span
                    className={cn('text-[11px] flex-1 cursor-text hover:bg-[#1a1f2e] rounded px-1 transition-colors', item.is_completed && 'line-through')}
                    style={{ color: item.is_completed ? '#8b92a5' : 'white' }}
                    onClick={() => { setEditingItemId(item.id); setEditingItemLabel(item.label); }}
                  >
                    {item.label}
                  </span>
                )}
                <button
                  onClick={() => deleteItem.mutate(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <X className="h-2.5 w-2.5" style={{ color: '#ff4d4d' }} />
                </button>
              </div>
            ))}

            {/* Add checklist item input */}
            {showChecklistInput && (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={newChecklistLabel}
                  onChange={e => setNewChecklistLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddChecklistItem();
                    if (e.key === 'Escape') { setShowChecklistInput(false); setNewChecklistLabel(''); }
                  }}
                  placeholder="Checklist item..."
                  className="h-5 text-[11px] flex-1 bg-[#13181f] text-white border-[#2a2f3e] px-1.5"
                  autoFocus
                />
              </div>
            )}
            {totalCount === 0 && !showChecklistInput && (
              <p className="text-[10px]" style={{ color: '#8b92a5' }}>No checklist items</p>
            )}
          </div>

          {/* Delete subtask */}
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 hover:text-[#ff4d4d]" style={{ color: '#8b92a5' }}
              onClick={() => onDelete(subtask.id)}>
              <Trash2 className="h-2.5 w-2.5" /> Remove subtask
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
