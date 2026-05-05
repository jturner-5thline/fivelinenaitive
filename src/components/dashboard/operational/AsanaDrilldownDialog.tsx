import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface AsanaDrilldownItem {
  gid: string;
  name: string;
  permalink_url: string | null;
  project_name?: string | null;
  project_permalink_url?: string | null;
  assignee?: string | null;
  due_on?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  is_milestone?: boolean;
  days_overdue?: number;
  status_type?: string | null;
  // for projects
  start_on?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  items: AsanaDrilldownItem[];
  /** "task" → links to task permalink; "project" → links to project permalink. */
  kind: 'task' | 'project';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso.length > 10 ? iso.slice(0, 10) : iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

export function AsanaDrilldownDialog({ open, onOpenChange, title, subtitle, items, kind }: Props) {
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  // Reset filter whenever the dialog closes
  useEffect(() => {
    if (!open) setOwnerFilter('all');
  }, [open]);

  const owners = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.assignee && i.assignee.trim()) set.add(i.assignee.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    if (ownerFilter === 'all') return items;
    if (ownerFilter === '__unassigned__') return items.filter((i) => !i.assignee);
    return items.filter((i) => (i.assignee || '').trim() === ownerFilter);
  }, [items, ownerFilter]);

  const showOwnerFilter = kind === 'task' && (owners.length > 1 || items.some((i) => !i.assignee));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {showOwnerFilter && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-7 text-[11px] w-[180px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All owners</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                ))}
                {items.some((i) => !i.assignee) && (
                  <SelectItem value="__unassigned__" className="text-xs">Unassigned</SelectItem>
                )}
              </SelectContent>
            </Select>
            {ownerFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                Owner: {ownerFilter === '__unassigned__' ? 'Unassigned' : ownerFilter}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-0.5"
                  onClick={() => setOwnerFilter('all')}
                  aria-label="Clear owner filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {filtered.length} of {items.length}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto -mx-6 px-6 mt-2">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              {items.length === 0 ? 'No items in this slice.' : 'No items match the selected owner.'}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((item) => {
                const url = item.permalink_url || item.project_permalink_url || null;
                const isOverdue = (item.days_overdue ?? 0) > 0;
                return (
                  <li key={item.gid} className="py-2.5">
                    <a
                      href={url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!url) e.preventDefault();
                      }}
                      className="group flex items-start gap-2 text-xs hover:bg-white/[0.03] rounded px-2 py-1 -mx-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.is_milestone && (
                            <span className="text-[9px] uppercase tracking-wide text-primary/70 font-semibold">◆ Milestone</span>
                          )}
                          <span className="font-medium text-foreground truncate">
                            {item.name || '(untitled)'}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {kind === 'task' && item.project_name && (
                            <span>📁 {item.project_name}</span>
                          )}
                          {item.assignee && <span>👤 {item.assignee}</span>}
                          {item.due_on && (
                            <span className={isOverdue ? 'text-destructive' : ''}>
                              📅 Due {fmtDate(item.due_on)}
                              {isOverdue && ` (${item.days_overdue}d late)`}
                            </span>
                          )}
                          {item.completed && item.completed_at && (
                            <span className="text-[hsl(var(--success))]">
                              ✓ Completed {fmtDate(item.completed_at)}
                            </span>
                          )}
                          {kind === 'project' && item.status_type && (
                            <span>Status: {item.status_type.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                      </div>
                      {url && (
                        <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary shrink-0 mt-0.5" />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
