import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CopyCheck, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { invalidateAllTaskCaches } from '@/lib/taskCache';

interface DuplicateRow {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  asana_duplicate_of_gid: string;
  asana_duplicate_of_title: string | null;
}

const QUERY_KEY = ['asana-duplicate-review'];

/**
 * Tasks the Asana linker believes duplicate an already-synced Asana task.
 * Nothing is archived automatically — the user merges (archive the local copy)
 * or keeps it.
 */
export function AsanaDuplicateReviewButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<DuplicateRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, asana_duplicate_of_gid, asana_duplicate_of_title')
        .eq('asana_duplicate_status', 'pending')
        .is('archived_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as DuplicateRow[];
    },
    staleTime: 60_000,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'merged' | 'dismissed' }) => {
      const update: Record<string, unknown> = { asana_duplicate_status: action };
      if (action === 'merged') update.archived_at = new Date().toISOString();
      const { error } = await supabase.from('tasks').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      invalidateAllTaskCaches(queryClient);
      toast.success(vars.action === 'merged' ? 'Duplicate archived' : 'Kept as a separate task');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not update task'),
  });

  const count = rows.length;
  if (!isLoading && count === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <CopyCheck className="h-3.5 w-3.5" />
        Duplicates
        {count > 0 && (
          <Badge className="h-4 min-w-4 justify-center px-1 text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30">
            {count}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Possible Asana duplicates</DialogTitle>
            <DialogDescription className="text-xs">
              These tasks look like copies of a task that is already synced with Asana. Archive the
              local copy, or keep it if it is genuinely separate work.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-[13px] font-medium truncate">{row.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.status}
                        {row.due_date && ` · due ${format(new Date(row.due_date), 'MMM d, yyyy')}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: row.id, action: 'dismissed' })}
                      >
                        Keep
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: row.id, action: 'merged' })}
                      >
                        {resolve.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Archive duplicate
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Already synced in Asana
                    </div>
                    <a
                      href={`https://app.asana.com/0/0/${row.asana_duplicate_of_gid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                    >
                      {row.asana_duplicate_of_title || row.asana_duplicate_of_gid}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
