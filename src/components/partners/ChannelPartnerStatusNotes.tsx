import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function ChannelPartnerStatusNotes({ partnerId }: { partnerId: string | null }) {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const key = ['channel_partner_status_notes', company?.id, partnerId];

  const { data: notes = [], isLoading, isError, refetch } = useQuery({
    queryKey: key,
    enabled: !!partnerId && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('channel_partner_status_notes')
        .select('id, note, created_at')
        .eq('channel_partner_id', partnerId!)
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (note: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('channel_partner_status_notes').insert({
        channel_partner_id: partnerId!, company_id: company!.id, note, created_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: key }); },
    onError: () => toast.error('Could not save status note'),
  });

  const [current, ...history] = notes;
  const trimmed = draft.trim();

  return (
    <section className="space-y-2" aria-label="Status note">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status note</h4>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {isError && <div className="flex items-center justify-between gap-2">
        <p role="alert" className="text-xs text-destructive">Could not load status notes.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>}
      {!isLoading && !isError && (current ? (
        <div className="border-l-2 border-primary pl-3">
          <p className="text-sm text-foreground whitespace-pre-wrap">{current.note}</p>
          <time className="text-[11px] text-muted-foreground">{format(new Date(current.created_at), 'MMM d, yyyy · h:mm a')}</time>
        </div>
      ) : <p className="text-xs text-muted-foreground">No status note yet.</p>)}

      <Textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={5000} rows={2}
        placeholder="Add a new status note (replaces the current one)…" aria-label="New status note" />
      <div className="flex items-center justify-between gap-2">
        {history.length > 0 ? (
          <button type="button" onClick={() => setShowHistory(s => !s)} aria-expanded={showHistory}
            className="flex items-center gap-1 text-xs text-primary">
            <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
            Previous notes ({history.length})
          </button>
        ) : <span />}
        <Button size="sm" disabled={!trimmed || save.isPending || !partnerId} onClick={() => save.mutate(trimmed)}>
          {save.isPending ? 'Saving…' : 'Save note'}
        </Button>
      </div>
      {showHistory && (
        <ol className="divide-y divide-border">
          {history.map(n => (
            <li key={n.id} className="py-2">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{n.note}</p>
              <time className="text-[11px] text-muted-foreground/80">{format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
