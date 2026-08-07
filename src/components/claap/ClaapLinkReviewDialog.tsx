import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Check, X, ExternalLink, Loader2, Video, Search, RotateCcw } from 'lucide-react';

type ReviewStatus = 'pending' | 'confirmed' | 'rejected';

interface ReviewRow {
  id: string;
  entity_id: string;
  confidence: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  recording_id: string;
  recording_title: string | null;
  recording_url: string | null;
  started_at: string | null;
  fundingSourceName: string;
}

interface ClaapLinkReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function useClaapPendingLinkCount() {
  return useQuery({
    queryKey: ['claap-link-review-count'],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await (supabase.from('claap_recording_links') as any)
        .select('id', { count: 'exact', head: true })
        .eq('link_role', 'funding_source')
        .eq('review_status', 'pending');
      return count ?? 0;
    },
  });
}

export function ClaapLinkReviewDialog({ open, onOpenChange }: ClaapLinkReviewDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReviewStatus>('pending');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['claap-link-review', tab],
    enabled: open,
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data: links } = await (supabase.from('claap_recording_links') as any)
        .select('id, entity_id, confidence, review_status, reviewed_at, recording_id')
        .eq('link_role', 'funding_source')
        .eq('review_status', tab)
        .order('confidence', { ascending: false })
        .limit(400);
      const list = (links || []) as any[];
      if (!list.length) return [];

      const recordingIds = Array.from(new Set(list.map(l => l.recording_id)));
      const lenderIds = Array.from(new Set(list.map(l => l.entity_id)));

      const [{ data: recordings }, { data: lenders }] = await Promise.all([
        supabase.from('claap_recordings')
          .select('id, title, recording_url, started_at')
          .in('id', recordingIds),
        supabase.from('master_lenders').select('id, name').in('id', lenderIds),
      ]);

      const recMap = new Map((recordings || []).map((r: any) => [r.id, r]));
      const lenMap = new Map((lenders || []).map((l: any) => [l.id, l.name as string]));

      return list.map(l => {
        const rec: any = recMap.get(l.recording_id);
        return {
          id: l.id,
          entity_id: l.entity_id,
          confidence: l.confidence,
          review_status: l.review_status,
          reviewed_at: l.reviewed_at,
          recording_id: l.recording_id,
          recording_title: rec?.title ?? null,
          recording_url: rec?.recording_url ?? null,
          started_at: rec?.started_at ?? null,
          fundingSourceName: lenMap.get(l.entity_id) || 'Unknown funding source',
        };
      }).sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.recording_title || '').toLowerCase().includes(q) ||
      r.fundingSourceName.toLowerCase().includes(q));
  }, [rows, search]);

  const setStatus = async (ids: string[], status: ReviewStatus) => {
    if (!ids.length) return;
    setBusyId(ids.length === 1 ? ids[0] : 'bulk');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase.from('claap_recording_links') as any)
        .update({
          review_status: status,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['claap-link-review'] }),
        qc.invalidateQueries({ queryKey: ['claap-link-review-count'] }),
        qc.invalidateQueries({ queryKey: ['claap-calls'] }),
      ]);
      toast({
        title: status === 'confirmed' ? 'Match confirmed' : status === 'rejected' ? 'Match rejected' : 'Moved back to pending',
        description: ids.length > 1 ? `${ids.length} matches updated.` : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Could not update match', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4" /> Review call matches
          </DialogTitle>
          <DialogDescription>
            Auto-matched recordings linked to funding sources by attendee email domain or call title.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 shrink-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewStatus)}>
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search call or funding source..."
              className="pl-8 h-9"
            />
          </div>
          {tab === 'pending' && filtered.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === 'bulk'}
              onClick={() => setStatus(filtered.map(r => r.id), 'confirmed')}
            >
              Confirm all
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 w-full overflow-y-auto pr-2 [&>[data-radix-scroll-area-viewport]]:max-h-full [&>[data-radix-scroll-area-viewport]>div]:!block">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              {tab === 'pending' ? 'No matches waiting for review.' : `No ${tab} matches.`}
            </p>
          ) : (
            <div className="space-y-2 py-1">
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {row.recording_title || 'Untitled recording'}
                      </span>
                      <Badge variant={(row.confidence ?? 0) >= 0.9 ? 'green' : 'amber'} className="text-[10px]">
                        {(row.confidence ?? 0) >= 0.9 ? 'Domain match' : 'Title match'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      → {row.fundingSourceName}
                      {row.started_at ? ` · ${format(new Date(row.started_at), 'MMM d, yyyy')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.recording_url && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                        <a href={row.recording_url} target="_blank" rel="noreferrer" aria-label="Open recording">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {tab === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busyId === row.id}
                          onClick={() => setStatus([row.id], 'rejected')}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={busyId === row.id}
                          onClick={() => setStatus([row.id], 'confirmed')}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={busyId === row.id}
                        onClick={() => setStatus([row.id], 'pending')}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}