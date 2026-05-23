import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const INTERNAL_EMAILS = new Set([
  'jturner@5thline.co',
  'ffustinoni@5thline.co',
  'ppina@5thline.co',
]);

interface Row {
  id: string;
  created_at: string;
  outcome: 'auto' | 'suggested' | 'unlinked';
  confidence: number | null;
  chosen_deal_id: string | null;
  message_id: string | null;
  thread_id: string | null;
  signals: any[];
  candidates: any[];
}

const FILTERS: Array<{ id: 'all' | 'auto' | 'suggested' | 'unlinked'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'auto', label: 'Auto-linked' },
  { id: 'suggested', label: 'Suggested' },
  { id: 'unlinked', label: 'Unlinked' },
];

export default function DebugRecognition() {
  const { user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'auto' | 'suggested' | 'unlinked'>('all');
  const [dealLabels, setDealLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        let q = supabase
          .from('recognition_log')
          .select('id, created_at, outcome, confidence, chosen_deal_id, message_id, thread_id, signals, candidates')
          .order('created_at', { ascending: false })
          .limit(200);
        if (filter !== 'all') q = q.eq('outcome', filter);
        const { data } = await q;
        const list = (data ?? []) as Row[];
        if (!cancelled) setRows(list);

        const dealIds = Array.from(new Set(list.map((r) => r.chosen_deal_id).filter(Boolean))) as string[];
        if (dealIds.length > 0) {
          const { data: deals } = await supabase.from('deals').select('id, company').in('id', dealIds);
          if (!cancelled && deals) {
            const map: Record<string, string> = {};
            for (const d of deals as any[]) map[d.id] = d.company || 'Untitled';
            setDealLabels(map);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  if (authLoading) return null;
  if (!user?.email || !INTERNAL_EMAILS.has(user.email)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Email Recognition · Debug</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent classifier outcomes from <code className="text-xs">classify-email-thread</code>.
          Internal use only.
        </p>
      </header>

      <div className="flex items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            type="button"
            size="sm"
            variant={filter === f.id ? 'default' : 'outline'}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border/40 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
          No recognition events yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/40 bg-card/40 px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <OutcomeBadge outcome={r.outcome} />
                {r.confidence != null && (
                  <span className="text-xs font-mono text-muted-foreground">
                    conf {Number(r.confidence).toFixed(2)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
                {r.chosen_deal_id && (
                  <Badge variant="outline" className="text-[11px]">
                    → {dealLabels[r.chosen_deal_id] ?? r.chosen_deal_id.slice(0, 8)}
                  </Badge>
                )}
                {r.thread_id && (
                  <span className="text-[10px] font-mono text-muted-foreground/70">thread {r.thread_id.slice(0, 12)}…</span>
                )}
              </div>
              {Array.isArray(r.signals) && r.signals.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {r.signals.map((s: any, i: number) => (
                    <span
                      key={i}
                      className={cn(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded border',
                        (s.weight ?? 0) >= 0.5
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : (s.weight ?? 0) >= 0.25
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                          : 'border-border/40 bg-muted/40 text-muted-foreground',
                      )}
                      title={s.detail ? JSON.stringify(s.detail) : undefined}
                    >
                      {s.kind}
                      {typeof s.weight === 'number' ? ` +${s.weight}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {Array.isArray(r.candidates) && r.candidates.length > 1 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {r.candidates.length} candidates considered
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: Row['outcome'] }) {
  if (outcome === 'auto') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> auto
      </Badge>
    );
  }
  if (outcome === 'suggested') {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-300">
        <AlertCircle className="h-3 w-3" /> suggested
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-rose-500/40 text-rose-300">
      <XCircle className="h-3 w-3" /> unlinked
    </Badge>
  );
}