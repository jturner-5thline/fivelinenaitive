import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, ExternalLink, Briefcase, User, Building2, CalendarDays } from 'lucide-react';
import type { Task } from '@/hooks/useTasks';
import { findSimilarTaskGroups } from '@/lib/taskSimilarity';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  onSelectTask: (id: string) => void;
}

/**
 * Surfaces clusters of "My Tasks" that look like potential duplicates —
 * fuzzy title match, boosted when the tasks share the same Deal / Contact /
 * CRM Company. Purely client-side over the tasks already loaded; opens the
 * task detail drawer when a card is clicked.
 */
export function SimilarTasksDialog({ open, onOpenChange, tasks, onSelectTask }: Props) {
  const groups = useMemo(() => findSimilarTaskGroups(tasks), [tasks]);
  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Sparkles className="h-4 w-4" style={{ color: '#c8a86b' }} />
            Potentially similar tasks
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Grouped by fuzzy title match, weighted higher when tasks share the same deal, contact, or company. Reviewed against the tasks you can currently see.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="p-5 space-y-4">
            {groups.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  <Sparkles className="h-5 w-5" style={{ color: '#8a93a6' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: '#eef1f6' }}>No look-alike tasks found</p>
                <p className="text-xs mt-1" style={{ color: '#8a93a6' }}>
                  Nothing in the current view has a similar title. Widen your filters (e.g. All tasks) to scan more.
                </p>
              </div>
            ) : (
              groups.map((g, idx) => {
                const items = g.taskIds.map(id => taskById.get(id)!).filter(Boolean);
                if (items.length < 2) return null;
                const pct = Math.round(g.topScore * 100);
                return (
                  <div
                    key={idx}
                    className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.015)' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium" style={{ color: '#b3bccc' }}>
                          Group {idx + 1} · {items.length} tasks
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5">{pct}% match</Badge>
                        {g.allShareDeal && <Badge variant="outline" className="text-[10px] h-5 gap-1"><Briefcase className="h-2.5 w-2.5" /> same deal</Badge>}
                        {g.allShareContact && <Badge variant="outline" className="text-[10px] h-5 gap-1"><User className="h-2.5 w-2.5" /> same contact</Badge>}
                        {g.allShareCompany && <Badge variant="outline" className="text-[10px] h-5 gap-1"><Building2 className="h-2.5 w-2.5" /> same company</Badge>}
                      </div>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {items.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { onSelectTask(t.id); onOpenChange(false); }}
                          className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-medium truncate" style={{ color: '#eef1f6' }}>{t.title}</p>
                              {t.status === 'complete' && <Badge variant="outline" className="text-[10px] h-4">done</Badge>}
                            </div>
                            <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: '#8a93a6' }}>
                              {t.deal?.company && (
                                <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{t.deal.company}</span>
                              )}
                              {t.contact?.full_name && (
                                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{t.contact.full_name}</span>
                              )}
                              {t.crm_company?.name && (
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{t.crm_company.name}</span>
                              )}
                              {t.due_date && (
                                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(new Date(t.due_date), 'MMM d')}</span>
                              )}
                              {t.assignee_profile?.display_name && (
                                <span>· {t.assignee_profile.display_name}</span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 mt-1 opacity-60" style={{ color: '#8a93a6' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}