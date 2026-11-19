import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { parsePerformanceDimensions, dimensionLabel } from '@/lib/lenderPerformance';

const LABEL_VARIANT: Record<string, string> = {
  strong: 'border-primary/40 text-primary',
  mixed: 'border-warning/40 text-warning',
  weak: 'border-destructive/40 text-destructive',
};

/** Read-only performance score card written by the lender performance skill. */
export function LenderPerformanceSection({ lenderId }: { lenderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lender-performance', lenderId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lender_performance_scores').select('*').eq('lender_id', lenderId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const dims = parsePerformanceDimensions(data?.dimensions);
  return (
    <section className="space-y-3" aria-label="Performance">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Performance</h3>
        {data?.overall_label && (
          <Badge variant="outline" className={`capitalize ${LABEL_VARIANT[data.overall_label] ?? ''}`}>{data.overall_label}</Badge>
        )}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            Computed {format(new Date(data.computed_at), 'MMM d, yyyy')}
            {data.window_days ? ` · ${data.window_days}-day window` : ''}
          </span>
        )}
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : !data ? <p className="text-xs text-muted-foreground">No performance score yet.</p>
        : dims.length === 0 ? <p className="text-xs text-muted-foreground">No dimensions recorded.</p>
        : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {dims.map((d) => (
              <li key={d.key} className="flex items-start gap-3 px-3 py-2">
                <span className="w-40 shrink-0 text-sm">{dimensionLabel(d.key)}</span>
                <span className="w-12 shrink-0 font-mono text-sm">{d.score ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{d.driver ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
