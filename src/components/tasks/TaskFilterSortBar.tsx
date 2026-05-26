import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, ArrowUpDown } from 'lucide-react';

export type TaskStatusFilter = 'all' | 'not_started' | 'in_progress' | 'blocked' | 'complete';
export type TaskSortKey = 'due_asc' | 'due_desc' | 'priority' | 'created_desc' | 'created_asc';

export interface TaskFilters {
  status: TaskStatusFilter;
  dealId: string; // 'all' | dealId | 'none'
  sort: TaskSortKey;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: 'all',
  dealId: 'all',
  sort: 'due_asc',
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0 };

export function applyTaskFilters<T extends any>(tasks: T[], filters: TaskFilters): T[] {
  let out = [...tasks];
  if (filters.status !== 'all') {
    out = out.filter((t: any) => t.status === filters.status);
  }
  if (filters.dealId !== 'all') {
    if (filters.dealId === 'none') out = out.filter((t: any) => !t.deal_id);
    else out = out.filter((t: any) => t.deal_id === filters.dealId);
  }
  out.sort((a: any, b: any) => {
    switch (filters.sort) {
      case 'due_asc':
      case 'due_desc': {
        const av = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return filters.sort === 'due_asc' ? av - bv : bv - av;
      }
      case 'priority':
        return (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
      case 'created_desc':
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      case 'created_asc':
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }
    return 0;
  });
  return out;
}

interface Props {
  tasks: any[];
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
}

export function TaskFilterSortBar({ tasks, filters, onChange }: Props) {
  const dealOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach(t => {
      if (t.deal_id) {
        const name = t.deal?.company || t.deal?.name || 'Unnamed deal';
        map.set(t.deal_id, name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-2">
      <Filter className="h-3 w-3 text-muted-foreground" />
      <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v as TaskStatusFilter })}>
        <SelectTrigger aria-label="Status: All" className="h-6 text-[10px] w-auto gap-1 px-2"><SelectValue placeholder="All" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="not_started">Not Started</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="blocked">Blocked</SelectItem>
          <SelectItem value="complete">Complete</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.dealId} onValueChange={(v) => onChange({ ...filters, dealId: v })}>
        <SelectTrigger className="h-6 text-[10px] w-auto gap-1 px-2 max-w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All deals</SelectItem>
          <SelectItem value="none">No deal</SelectItem>
          {dealOptions.map(([id, name]) => (
            <SelectItem key={id} value={id}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ArrowUpDown className="h-3 w-3 text-muted-foreground ml-1" />
      <Select value={filters.sort} onValueChange={(v) => onChange({ ...filters, sort: v as TaskSortKey })}>
        <SelectTrigger className="h-6 text-[10px] w-auto gap-1 px-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="due_asc">Due date ↑</SelectItem>
          <SelectItem value="due_desc">Due date ↓</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="created_desc">Newest</SelectItem>
          <SelectItem value="created_asc">Oldest</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}