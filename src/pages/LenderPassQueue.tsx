import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { passQueueView, type PassRow } from '@/lib/passQueue';

type Row = PassRow & { lender_name: string; sender_name: string | null; confidence: string; reason_summary: string | null; source_quote: string | null; deal_id: string; deals: { company: string | null } | null };

/** Read-only pass queue over lender_pass_detections. Never edits or dismisses rows. */
export default function LenderPassQueue() {
  const [showAll, setShowAll] = useState(false);
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['lender-pass-queue'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lender_pass_detections')
        .select('id, deal_id, deal_lender_id, lender_name, gmail_message_id, sender_email, sender_name, confidence, is_pass, reason_summary, source_quote, status, created_at, deals(company)')
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const view = useMemo(() => passQueueView(rows, showAll), [rows, showAll]);
  const pending = view.filter((r) => r.status === 'pending').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Pass queue <Badge variant="secondary" aria-label="Pending count">{pending} pending</Badge>
        </h1>
        <div className="flex items-center gap-2">
          <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-all">Show all rows ({rows.length})</Label>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {showAll ? 'Every detection, including non-passes, internal and automated mail.' : 'Likely passes from funding-source senders, one row per email.'}
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Couldn't load the queue.</p>}
      {!isLoading && view.length === 0 && <p className="text-sm italic text-muted-foreground">No passes to review.</p>}
      <ul className="divide-y divide-border">
        {view.map((r) => (
          <li key={r.id} className="py-3 space-y-1" data-testid="pass-row">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{r.lender_name}</span>
              <Link to={`/deals/${r.deal_id}`} className="text-primary hover:underline">{r.deals?.company ?? 'Deal'}</Link>
              <span className="text-muted-foreground">{format(new Date(r.created_at), 'MMM d, yyyy')}</span>
              <span className="text-muted-foreground">from {r.sender_name || r.sender_email}</span>
              <Badge variant="outline">{r.confidence}</Badge>
              {!r.is_pass && <Badge variant="outline">not a pass</Badge>}
              <Badge variant={r.status === 'pending' ? 'secondary' : 'default'}>{r.status}</Badge>
              {r.duplicate_count > 1 && <span className="text-xs text-muted-foreground">detected {r.duplicate_count}×</span>}
            </div>
            {r.reason_summary && <p className="text-sm">{r.reason_summary}</p>}
            {r.source_quote && <p className="text-xs text-muted-foreground italic">“{r.source_quote}”</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
