import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

/**
 * Admin Agent — Duty 1 ("Verify Deal Information") configuration.
 *
 * Surfaces enable/disable, active pipelines + stages scoping, holiday
 * exclusions, the freshness threshold (read-only at 3 BD), Friday
 * sweep toggle, and optional per-user opt-in/out overrides.
 *
 * Persists to:
 *   - admin_agent_settings        (company scope)
 *   - admin_agent_holidays        (company scope)
 *   - admin_agent_user_overrides  (per-user opt-in/out, optional)
 */

type PipelineRow = {
  id: string;
  name: string;
  is_default: boolean | null;
  stages: Array<{ id: string; label: string }> | null;
};

type SettingsRow = {
  id: string;
  company_id: string;
  enabled: boolean;
  active_pipeline_ids: string[] | null;
  active_stage_ids: string[] | null;
  stale_threshold_business_days: number | null;
  friday_sweep_enabled: boolean | null;
};

type HolidayRow = {
  id: string;
  holiday_date: string;
  label: string | null;
};

type MemberRow = {
  user_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type OverrideRow = {
  id: string;
  user_id: string;
  enabled: boolean;
  notes: string | null;
};

const STALE_THRESHOLD_DEFAULT = 3;

export function AdminAgentDuty1Config() {
  const { company, isAdmin } = useCompany();
  const companyId = company?.id ?? null;
  const qc = useQueryClient();

  // ── Settings ───────────────────────────────────────────────────
  const settingsQ = useQuery<SettingsRow | null>({
    queryKey: ['admin-agent-settings', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_settings')
        .select('id, company_id, enabled, active_pipeline_ids, active_stage_ids, stale_threshold_business_days, friday_sweep_enabled')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as SettingsRow) ?? null;
    },
  });

  const pipelinesQ = useQuery<PipelineRow[]>({
    queryKey: ['admin-agent-pipelines', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, is_default, stages')
        .eq('company_id', companyId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PipelineRow[];
    },
  });

  const holidaysQ = useQuery<HolidayRow[]>({
    queryKey: ['admin-agent-holidays', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_holidays')
        .select('id, holiday_date, label')
        .eq('company_id', companyId)
        .order('holiday_date', { ascending: true });
      if (error) throw error;
      return (data || []) as HolidayRow[];
    },
  });

  const membersQ = useQuery<MemberRow[]>({
    queryKey: ['admin-agent-members', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_members')
        .select('user_id, profiles:profiles!company_members_user_id_fkey(full_name, email)')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as unknown as MemberRow[];
    },
  });

  const overridesQ = useQuery<OverrideRow[]>({
    queryKey: ['admin-agent-overrides', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_user_overrides')
        .select('id, user_id, enabled, notes')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as OverrideRow[];
    },
  });

  // Local form state — seeded from server, debounced save on user action.
  const [enabled, setEnabled] = useState(true);
  const [fridaySweep, setFridaySweep] = useState(true);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [staleThreshold, setStaleThreshold] = useState<number>(STALE_THRESHOLD_DEFAULT);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settingsQ.isLoading || settingsQ.isError) return;
    const s = settingsQ.data;
    setEnabled(s?.enabled ?? true);
    setFridaySweep(s?.friday_sweep_enabled ?? true);
    setPipelineIds(s?.active_pipeline_ids ?? []);
    setStageIds(s?.active_stage_ids ?? []);
    setStaleThreshold(
      typeof s?.stale_threshold_business_days === 'number' && s.stale_threshold_business_days > 0
        ? s.stale_threshold_business_days
        : STALE_THRESHOLD_DEFAULT,
    );
    setIsLoaded(true);
  }, [settingsQ.data, settingsQ.isLoading, settingsQ.isError]);

  const stagesForActivePipelines = useMemo(() => {
    const all = pipelinesQ.data ?? [];
    const scope = pipelineIds.length > 0
      ? all.filter((p) => pipelineIds.includes(p.id))
      : all.filter((p) => p.is_default);
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; pipelineName: string }> = [];
    for (const p of scope) {
      for (const st of p.stages ?? []) {
        if (!st?.id || seen.has(st.id)) continue;
        seen.add(st.id);
        out.push({ id: st.id, label: st.label || st.id, pipelineName: p.name });
      }
    }
    return out;
  }, [pipelinesQ.data, pipelineIds]);

  const togglePipeline = (id: string) =>
    setPipelineIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleStage = (id: string) =>
    setStageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function saveSettings() {
    if (!companyId || !isLoaded) return;
    setIsSaving(true);
    try {
      const payload = {
        company_id: companyId,
        enabled,
        friday_sweep_enabled: fridaySweep,
        active_pipeline_ids: pipelineIds,
        active_stage_ids: stageIds,
        stale_threshold_business_days: Math.max(1, Math.min(30, Math.round(staleThreshold || STALE_THRESHOLD_DEFAULT))),
      };
      const { error } = await supabase
        .from('admin_agent_settings')
        .upsert(payload, { onConflict: 'company_id' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId] });
      toast.success('Admin Agent settings saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save Admin Agent settings.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Holidays ─────────────────────────────────────────────────────
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('');

  async function addHoliday() {
    if (!companyId || !newHolidayDate) return;
    const { error } = await supabase
      .from('admin_agent_holidays')
      .insert({
        company_id: companyId,
        holiday_date: newHolidayDate,
        label: newHolidayLabel || 'Company holiday',
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewHolidayDate('');
    setNewHolidayLabel('');
    qc.invalidateQueries({ queryKey: ['admin-agent-holidays', companyId] });
  }

  async function removeHoliday(id: string) {
    const { error } = await supabase.from('admin_agent_holidays').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['admin-agent-holidays', companyId] });
  }

  // ── Per-user overrides ───────────────────────────────────────────
  const overridesByUser = useMemo(() => {
    const m = new Map<string, OverrideRow>();
    for (const o of overridesQ.data ?? []) m.set(o.user_id, o);
    return m;
  }, [overridesQ.data]);

  async function setUserOverride(userId: string, value: 'default' | 'enabled' | 'disabled') {
    if (!companyId) return;
    if (value === 'default') {
      const existing = overridesByUser.get(userId);
      if (!existing) return;
      const { error } = await supabase
        .from('admin_agent_user_overrides')
        .delete()
        .eq('id', existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase
        .from('admin_agent_user_overrides')
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            enabled: value === 'enabled',
          },
          { onConflict: 'company_id,user_id' },
        );
      if (error) toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ['admin-agent-overrides', companyId] });
  }

  if (!companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        A workspace must be selected to configure the Admin Agent.
      </p>
    );
  }

  if (!isLoaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const readOnly = !isAdmin;

  return (
    <div className="space-y-6">
      {/* Capability toggle */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/40">
              <ShieldCheck className="h-4 w-4 text-foreground/80" />
            </div>
            <div>
              <h4 className="text-sm font-semibold leading-tight">Verify Deal Information</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audits active deals for stale or missing critical updates. Surfaces in Ask nAItive AI.
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={readOnly}
            aria-label="Enable Verify Deal Information"
          />
        </div>
      </section>

      {/* Active pipelines + stages */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold">Active scope</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Restrict audits to specific pipelines and stages. Leave empty to use the workspace's default pipeline and skip terminal stages.
          </p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pipelines</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(pipelinesQ.data ?? []).map((p) => {
              const active = pipelineIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !readOnly && togglePipeline(p.id)}
                  disabled={readOnly}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    active
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/30 border-border/60 text-foreground/80 hover:border-border'
                  }`}
                >
                  {p.name}
                  {p.is_default ? <span className="ml-1 text-[10px] opacity-70">(default)</span> : null}
                </button>
              );
            })}
            {(pipelinesQ.data ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No pipelines configured.</span>
            )}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stages</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Optional. Leave empty to audit all non-terminal stages in scope.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stagesForActivePipelines.map((s) => {
              const active = stageIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => !readOnly && toggleStage(s.id)}
                  disabled={readOnly}
                  title={s.pipelineName}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    active
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/30 border-border/60 text-foreground/80 hover:border-border'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {stagesForActivePipelines.length === 0 && (
              <span className="text-xs text-muted-foreground">Pick a pipeline to choose stages.</span>
            )}
          </div>
        </div>
      </section>

      {/* Freshness + Friday sweep */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold">Freshness rule</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Items are flagged "may need review" after this many US business days without an update.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={30}
            step={1}
            value={staleThreshold}
            onChange={(e) => setStaleThreshold(Number(e.target.value))}
            disabled={readOnly}
            className="h-9 w-20 text-center tabular-nums text-base font-semibold"
            aria-label="Stale threshold in business days"
          />
          <span className="text-xs text-muted-foreground">business days (1–30)</span>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h5 className="text-sm font-medium leading-tight">Friday sweep</h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              Treat Fridays as a strict end-of-week pass. The agent reminds you it's the weekly sweep.
            </p>
          </div>
          <Switch
            checked={fridaySweep}
            onCheckedChange={setFridaySweep}
            disabled={readOnly}
            aria-label="Enable Friday sweep"
          />
        </div>
      </section>

      {/* Holidays */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Excluded dates
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            US federal holidays are always excluded. Add your workspace's non-business days below.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="holiday-date" className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</Label>
            <Input
              id="holiday-date"
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="h-8 w-40 text-xs"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <Label htmlFor="holiday-label" className="text-[11px] uppercase tracking-wide text-muted-foreground">Label</Label>
            <Input
              id="holiday-label"
              value={newHolidayLabel}
              onChange={(e) => setNewHolidayLabel(e.target.value)}
              placeholder="e.g. Company off-site"
              className="h-8 text-xs"
              disabled={readOnly}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={addHoliday}
            disabled={readOnly || !newHolidayDate}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(holidaysQ.data ?? []).map((h) => (
            <Badge
              key={h.id}
              variant="secondary"
              className="h-6 pl-2 pr-1 text-[11px] gap-1 bg-muted/40 border border-border/60 text-foreground/80"
            >
              <span className="tabular-nums">{format(new Date(h.holiday_date), 'MMM d, yyyy')}</span>
              {h.label ? <span className="opacity-70">· {h.label}</span> : null}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeHoliday(h.id)}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
                  aria-label="Remove holiday"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {(holidaysQ.data ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">No workspace-specific dates added.</span>
          )}
        </div>
      </section>

      {/* Per-user overrides */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Per-user scope</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Optional. By default every workspace member uses the workspace setting above.
          </p>
        </div>
        <ScrollArea className="max-h-56">
          <div className="space-y-1">
            {(membersQ.data ?? []).map((m) => {
              const o = overridesByUser.get(m.user_id);
              const value: 'default' | 'enabled' | 'disabled' = !o
                ? 'default'
                : o.enabled ? 'enabled' : 'disabled';
              const display = m.profiles?.full_name || m.profiles?.email || m.user_id.slice(0, 8);
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{display}</p>
                    {m.profiles?.email && m.profiles?.full_name && (
                      <p className="text-[11px] text-muted-foreground truncate">{m.profiles.email}</p>
                    )}
                  </div>
                  <Select
                    value={value}
                    onValueChange={(v) => setUserOverride(m.user_id, v as any)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Workspace default</SelectItem>
                      <SelectItem value="enabled">Always on</SelectItem>
                      <SelectItem value="disabled">Off for this user</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {(membersQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-3">No workspace members found.</p>
            )}
          </div>
        </ScrollArea>
      </section>

      <div className="flex items-center justify-end gap-2 pt-1">
        {readOnly && (
          <p className="text-[11px] text-muted-foreground mr-auto">Read-only — admin role required to change Admin Agent settings.</p>
        )}
        <Button size="sm" onClick={saveSettings} disabled={readOnly || isSaving}>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </div>
  );
}

// Tiny helper kept for completeness if a future surface wants a row checkbox UI.
export function _AdminAgentRowToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}