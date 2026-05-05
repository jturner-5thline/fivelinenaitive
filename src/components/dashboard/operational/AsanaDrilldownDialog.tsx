import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-6 px-6 mt-2">
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No items in this slice.
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {items.map((item) => {
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
