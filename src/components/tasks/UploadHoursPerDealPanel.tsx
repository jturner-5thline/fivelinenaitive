import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { toast } from 'sonner';

type Phase = 'pre_signing' | 'post_signing';

/** Monday (YYYY-MM-DD) of the week containing the given date. */
function mondayOf(dateStr: string | null): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return format(d, 'yyyy-MM-dd');
}

/**
 * Weekly "Upload Hours per Deal" editor. Lists every open deal (not Closed
 * Won / Closed Lost) in the company's Active Pipeline and lets the user log
 * this week's pre-/post-signing hours. Entries live in weekly_time_entries;
 * a DB trigger rolls them up into the deal's hour totals.
 */
export function UploadHoursPerDealPanel({ task }: { task: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const week = mondayOf(task.due_date);
  const companyId = task.company_id as string | null;

  const { data, isLoading } = useQuery({
    queryKey: ['upload-hours-panel', companyId, week, user?.id],
    enabled: !!companyId && !!user,
    queryFn: async () => {
      const { data: pipe } = await supabase
        .from('deal_pipelines').select('id').eq('company_id', companyId!).eq('is_default', true).maybeSingle();
      let q = supabase.from('deals')
        .select('id, company, stage, pre_signing_hours, post_signing_hours')
        .eq('company_id', companyId!)
        .not('stage', 'in', '("closed-won","closed-lost")')
        .order('company');
      if (pipe?.id) q = q.eq('pipeline_id', pipe.id);
      const { data: deals, error } = await q;
      if (error) throw error;
      const list = (deals || []).filter((d: any) => !isExcludedDealName(d.company));
      const ids = list.map((d: any) => d.id);
      const { data: entries } = ids.length
        ? await supabase.from('weekly_time_entries')
            .select('id, deal_id, phase, hours')
            .eq('user_id', user!.id).eq('week_start_date', week).in('deal_id', ids)
        : { data: [] as any[] };
      return { deals: list as any[], entries: (entries || []) as any[] };
    },
  });

  const entryMap = useMemo(() => {
    const m = new Map<string, { id: string; hours: number }>();
    (data?.entries || []).forEach((e) => m.set(`${e.deal_id}:${e.phase}`, { id: e.id, hours: Number(e.hours) }));
    return m;
  }, [data]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDrafts({}); }, [data]);

  const pending = useMemo(() => Object.entries(drafts).filter(([k, v]) => {
    const n = v.trim() ? Number(v) : 0;
    return Number.isFinite(n) && n >= 0 && n <= 168 && n !== (entryMap.get(k)?.hours ?? 0);
  }), [drafts, entryMap]);

  const saveAll = async () => {
    setSaving(true);
    let failed = 0;
    for (const [key, v] of pending) {
      const [dealId, phase] = key.split(':') as [string, Phase];
      const hours = v.trim() ? Number(v) : 0;
      const existing = entryMap.get(key);
      const res = existing
        ? hours === 0
          ? await supabase.from('weekly_time_entries').delete().eq('id', existing.id)
          : await supabase.from('weekly_time_entries').update({ hours }).eq('id', existing.id)
        : await supabase.from('weekly_time_entries').insert({ deal_id: dealId, user_id: user!.id, week_start_date: week, phase, hours, source: 'upload_hours_task' } as any);
      if (res.error) failed++;
    }
    setSaving(false);
    if (failed) toast.error(`Failed to save ${failed} entr${failed === 1 ? 'y' : 'ies'}`);
    else toast.success('Deal hours updated');
    await qc.invalidateQueries({ queryKey: ['upload-hours-panel'] });
    qc.invalidateQueries({ queryKey: ['deals'] });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-xs font-medium text-muted-foreground">Hours per Deal</label>
        <span className="text-[11px] text-muted-foreground">Week of {format(new Date(week + 'T00:00:00'), 'MMM d')}</span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading deals…</div>
      ) : !data?.deals.length ? (
        <p className="text-xs text-muted-foreground py-3">No open deals in the Active Pipeline.</p>
      ) : (
        <div className="rounded-md border border-border/40 divide-y divide-border/40">
          <div className="grid grid-cols-[1fr_88px_88px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Deal</span><span className="text-right">Pre-Signing</span><span className="text-right">Post-Signing</span>
          </div>
          {data.deals.map((d) => (
            <div key={d.id} className="grid grid-cols-[1fr_88px_88px] gap-2 px-3 py-1.5 items-center">
              <div className="min-w-0">
                <p className="text-sm truncate">{d.company}</p>
                <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  Total {Number(d.pre_signing_hours ?? 0).toLocaleString()} / {Number(d.post_signing_hours ?? 0).toLocaleString()}h
                </p>
              </div>
              {(['pre_signing', 'post_signing'] as Phase[]).map((p) => (
                <HoursCell key={p} value={drafts[`${d.id}:${p}`] ?? String(entryMap.get(`${d.id}:${p}`)?.hours || '')} onChange={(v) => setDrafts((m) => ({ ...m, [`${d.id}:${p}`]: v }))} />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-2">
        <p className="text-[10px] text-muted-foreground">Hours entered here count toward this week and update each deal's totals.</p>
        <Button size="sm" onClick={saveAll} disabled={saving || !pending.length}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          Save{pending.length ? ` (${pending.length})` : ''}
        </Button>
      </div>
    </div>
  );
}

function HoursCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text" inputMode="decimal" value={value} placeholder="0"
      className="h-7 text-right text-sm font-mono tabular-nums"
      onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) onChange(e.target.value); }}
    />
  );
}
