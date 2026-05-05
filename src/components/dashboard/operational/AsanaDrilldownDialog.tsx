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
  owner?: string | null;
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
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Reset filters whenever the dialog closes
  useEffect(() => {
    if (!open) {
      setOwnerFilter('all');
      setStatusFilter('all');
    }
  }, [open]);

  // For tasks, "owner" = assignee. For projects, "owner" = project owner.
  const ownerOf = (i: AsanaDrilldownItem): string =>
    ((kind === 'project' ? i.owner : i.assignee) || '').trim();

  const owners = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const o = ownerOf(i);
      if (o) set.add(o);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kind]);

  const hasUnowned = items.some((i) => !ownerOf(i));

  const STATUS_LABELS: Record<string, string> = {
    on_track: 'On Track',
    at_risk: 'At Risk',
    off_track: 'Off Track',
    on_hold: 'On Hold',
    complete: 'Complete',
  };
  const normalizeStatus = (raw?: string | null): string => {
    if (!raw) return '__none__';
    const s = String(raw).toLowerCase().replace(/\s+/g, '_');
    if (s in STATUS_LABELS) return s;
    if (s === 'green') return 'on_track';
    if (s === 'yellow') return 'at_risk';
    if (s === 'red') return 'off_track';
    return s;
  };
  const statusLabel = (key: string) =>
    key === '__none__' ? 'No Status' : STATUS_LABELS[key] || key.replace(/_/g, ' ');

  const statuses = useMemo(() => {
    if (kind !== 'project') return [];
    const set = new Set<string>();
    items.forEach((i) => set.add(normalizeStatus(i.status_type)));
    return Array.from(set).sort();
  }, [items, kind]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (ownerFilter !== 'all') {
        const o = ownerOf(i);
        if (ownerFilter === '__unassigned__') {
          if (o) return false;
        } else if (o !== ownerFilter) {
          return false;
        }
      }
      if (kind === 'project' && statusFilter !== 'all') {
        if (normalizeStatus(i.status_type) !== statusFilter) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ownerFilter, statusFilter, kind]);

  const showOwnerFilter = owners.length > 1 || hasUnowned;
  const showStatusFilter = kind === 'project' && statuses.length > 1;
  const showFilterBar = showOwnerFilter || showStatusFilter;
  const ownerLabel = kind === 'project' ? 'Owner' : 'Owner';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {showFilterBar && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {showOwnerFilter && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-7 text-[11px] w-[170px]">
                  <SelectValue placeholder={ownerLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All owners</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                  ))}
                  {hasUnowned && (
                    <SelectItem value="__unassigned__" className="text-xs">
                      {kind === 'project' ? 'No owner' : 'Unassigned'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
            {showStatusFilter && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 text-[11px] w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {ownerFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                {ownerLabel}: {ownerFilter === '__unassigned__' ? (kind === 'project' ? 'No owner' : 'Unassigned') : ownerFilter}
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
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                Status: {statusLabel(statusFilter)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-0.5"
                  onClick={() => setStatusFilter('all')}
                  aria-label="Clear status filter"
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
              {items.length === 0 ? 'No items in this slice.' : 'No items match the selected filters.'}
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
