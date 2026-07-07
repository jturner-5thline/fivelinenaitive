import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Brain, CalendarDays, Check, Loader2, Pencil, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
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
  custom_rules: CustomRule[] | null;
};

type CustomRule = {
  id: string;
  text: string;
  created_at: string;
  created_by: string | null;
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
  is_activated: boolean;
  notes: string | null;
};

const STALE_THRESHOLD_DEFAULT = 3;

export function AdminAgentDuty1Config() {
  const { company, isAdmin } = useCompany();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const companyId = company?.id ?? null;
  const qc = useQueryClient();

  // ── Settings ───────────────────────────────────────────────────
  const settingsQ = useQuery<SettingsRow | null>({
    // Distinct key from AgentCatalog's lightweight `select('enabled')` query.
    // Sharing the same key caused this full settings fetch to be skipped and
    // custom_rules / pipelines / stages to silently render as empty.
    queryKey: ['admin-agent-settings', companyId, 'full'],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_settings')
        .select('id, company_id, enabled, active_pipeline_ids, active_stage_ids, stale_threshold_business_days, friday_sweep_enabled, custom_rules')
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
        .select('id, user_id, enabled, is_activated, notes')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as OverrideRow[];
    },
  });

  // Company-level entitlement gate (master). Sits above the per-user
  // activation flag below — if the company isn't entitled, the user
  // can't even activate; the chat tools + sweep reject server-side.
  const companyAccessQ = useQuery<{ is_enabled: boolean } | null>({
    queryKey: ['company-agent-access', companyId, 'admin_agent'],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_agent_access')
        .select('is_enabled')
        .eq('company_id', companyId)
        .eq('agent_key', 'admin_agent')
        .maybeSingle();
      if (error) throw error;
      return (data as { is_enabled: boolean } | null) ?? null;
    },
  });
  const companyEntitled = !!companyAccessQ.data?.is_enabled;

  // Local form state — seeded from server, debounced save on user action.
  const [enabled, setEnabled] = useState(true);
  const [fridaySweep, setFridaySweep] = useState(true);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [staleThreshold, setStaleThreshold] = useState<number>(STALE_THRESHOLD_DEFAULT);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [newRuleText, setNewRuleText] = useState('');
  const [isSavingRule, setIsSavingRule] = useState(false);
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
    setCustomRules(Array.isArray(s?.custom_rules) ? (s!.custom_rules as CustomRule[]) : []);
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
      await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId, 'full'] });
      await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId] });
      toast.success('Admin Agent settings saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save Admin Agent settings.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Custom rules (natural-language teaching) ─────────────────────
  async function persistCustomRules(next: CustomRule[]) {
    if (!companyId) return;
    const { error } = await supabase
      .from('admin_agent_settings')
      .upsert(
        { company_id: companyId, custom_rules: next as any },
        { onConflict: 'company_id' },
      );
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId, 'full'] });
    await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId] });
  }

  async function addCustomRule() {
    const text = newRuleText.trim();
    if (!text) return;
    setIsSavingRule(true);
    try {
      const rule: CustomRule = {
        id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        text,
        created_at: new Date().toISOString(),
        created_by: currentUserId,
      };
      const next = [...customRules, rule];
      await persistCustomRules(next);
      setCustomRules(next);
      setNewRuleText('');
      toast.success('Rule added — the agent will follow it on its next run.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save rule.');
    } finally {
      setIsSavingRule(false);
    }
  }

  async function removeCustomRule(id: string) {
    try {
      const next = customRules.filter((r) => r.id !== id);
      await persistCustomRules(next);
      setCustomRules(next);
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove rule.');
    }
  }

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleText, setEditingRuleText] = useState('');

  // ── Learned rules (agent self-improvement from approval feedback) ────
  type LearnedRule = {
    id: string;
    rule_text: string;
    status: 'proposed' | 'active' | 'dismissed';
    confidence: number | null;
    occurrences: number | null;
    evidence: any;
    created_at: string;
  };
  const learnedQ = useQuery<LearnedRule[]>({
    queryKey: ['agent-learned-rules', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_learned_rules')
        .select('id, rule_text, status, confidence, occurrences, evidence, created_at')
        .eq('company_id', companyId)
        .eq('agent_key', 'admin_agent')
        .in('status', ['proposed', 'active'])
        .order('status', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LearnedRule[];
    },
  });
  const [isTraining, setIsTraining] = useState(false);

  async function trainNow() {
    if (!companyId) return;
    setIsTraining(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-learn-from-feedback', {
        body: { company_id: companyId, agent_key: 'admin_agent', lookback_days: 14 },
      });
      if (error) throw error;
      const proposed = (data as any)?.proposed ?? 0;
      const reason = (data as any)?.reason;
      if (reason) toast.info(reason);
      else toast.success(proposed > 0 ? `Learned ${proposed} new pattern${proposed === 1 ? '' : 's'}.` : 'No new patterns detected.');
      await qc.invalidateQueries({ queryKey: ['agent-learned-rules', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not run learning pass.');
    } finally {
      setIsTraining(false);
    }
  }

  async function decideLearnedRule(id: string, status: 'active' | 'dismissed') {
    try {
      const { error } = await supabase
        .from('agent_learned_rules')
        .update({ status, decided_by: currentUserId, decided_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['agent-learned-rules', companyId] });
      toast.success(status === 'active' ? 'Rule accepted — the agent will follow it.' : 'Rule dismissed.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not update rule.');
    }
  }

  function startEditRule(r: CustomRule) {
    setEditingRuleId(r.id);
    setEditingRuleText(r.text);
  }

  async function saveEditRule(id: string) {
    const text = editingRuleText.trim();
    if (!text) return;
    try {
      const next = customRules.map((r) => (r.id === id ? { ...r, text } : r));
      await persistCustomRules(next);
      setCustomRules(next);
      setEditingRuleId(null);
      setEditingRuleText('');
      toast.success('Rule updated.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not update rule.');
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

  // ── Per-user activation (server-side gated) ─────────────────────
  // The Admin Agent is opt-in per user. This toggle flips
  // admin_agent_user_overrides.is_activated for the current user. The
  // chat tools and the proactive Friday sweep both refuse to run for
  // deactivated users — this UI just mirrors that gate.
  const myActivation = useMemo(() => {
    if (!currentUserId) return false;
    return !!overridesByUser.get(currentUserId)?.is_activated;
  }, [overridesByUser, currentUserId]);
  const [isTogglingActivation, setIsTogglingActivation] = useState(false);

  async function setMyActivation(next: boolean) {
    if (!companyId || !currentUserId) return;
    setIsTogglingActivation(true);
    try {
      const existing = overridesByUser.get(currentUserId);
      const { error } = await supabase
        .from('admin_agent_user_overrides')
        .upsert(
          {
            company_id: companyId,
            user_id: currentUserId,
            // Preserve existing `enabled` flag (workspace override) so this
            // activation toggle doesn't accidentally change the "Off for
            // this user" workspace override below.
            enabled: existing?.enabled ?? true,
            is_activated: next,
          },
          { onConflict: 'company_id,user_id' },
        );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-overrides', companyId] });
      toast.success(
        next
          ? 'Admin Agent activated for you.'
          : 'Admin Agent deactivated for you.',
      );
    } catch (e: any) {
      toast.error(e?.message || 'Could not update activation.');
    } finally {
      setIsTogglingActivation(false);
    }
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

  // Master gate: if the company isn't entitled, render only a
  // disabled-state explainer. The chat tools + sweep enforce the same
  // gate server-side; this UI just mirrors it.
  // Only render the disabled-state once we've actually confirmed the
  // entitlement lookup completed — otherwise the popup briefly (or
  // permanently, on slow networks / cache misses) shows "not enabled"
  // and hides Custom Rules even when the company is entitled.
  if (!companyId || companyAccessQ.isLoading || companyAccessQ.isFetching) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading Admin Agent configuration…
      </div>
    );
  }
  if (!companyEntitled) {
    return (
      <section className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/40">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-semibold leading-tight">
              Admin Agent is not enabled for this company.
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              A platform admin must turn it on in Admin → Access &amp; Permissions →
              Agent Access before activation and configuration become available.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Per-user activation gate */}
      <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-semibold leading-tight">
                Activate Admin Agent for me
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                The Admin Agent is opt-in. While off, Ask nAItive AI's audit /
                capture / queue / create-task actions refuse for you and the
                proactive Friday sweep skips you entirely.
              </p>
            </div>
          </div>
          <Switch
            checked={myActivation}
            onCheckedChange={setMyActivation}
            disabled={!currentUserId || isTogglingActivation}
            aria-label="Activate Admin Agent for me"
          />
        </div>
        {!myActivation && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Status: <span className="font-medium text-foreground/80">Not activated for you.</span> The rest of the configuration is hidden until you turn this on.
          </p>
        )}
      </section>

      {!myActivation ? null : (
      <>
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

      {/* Friday sweep */}
      <section className="rounded-lg border border-border/60 bg-card/40 p-4">
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
      </>
      )}

      {/* Custom rules — natural-language teaching */}
      {/* Always visible when the company is entitled, regardless of per-user activation. */}
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold leading-tight">Custom rules</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Teach the Admin Agent how to operate inside this workspace in plain English. Rules below are injected into every Admin Agent run for {company?.name || 'this company'} and apply to every user. Use rules to set freshness thresholds and excluded dates too. Examples: "Flag deals as stale after 3 US business days without an update", "Treat Dec 24–Jan 2 as non-business days every year", "Skip the Friday sweep on company off-sites", "When proposing tasks, default the owner to the Deal Manager".
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Textarea
            value={newRuleText}
            onChange={(e) => setNewRuleText(e.target.value)}
            placeholder="Write a rule in plain English. The agent will learn and apply it to all of its work in this workspace."
            disabled={readOnly || isSavingRule}
            rows={3}
            className="text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!readOnly && newRuleText.trim()) addCustomRule();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {customRules.length} active rule{customRules.length === 1 ? '' : 's'} · ⌘/Ctrl + Enter to add
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={addCustomRule}
              disabled={readOnly || isSavingRule || !newRuleText.trim()}
              className="h-8 text-xs"
            >
              {isSavingRule ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1" />
              )}
              Add rule
            </Button>
          </div>
        </div>

        {customRules.length > 0 && (
          <ScrollArea className="h-72 rounded-md border border-border/40 bg-background/30">
            <ol className="space-y-1.5 p-2">
              {customRules.map((r, i) => (
                <li
                  key={r.id}
                  className="group flex items-start gap-2 rounded-md border border-border/60 bg-card/40 p-2.5"
                >
                  <span className="mt-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  {editingRuleId === r.id ? (
                    <div className="flex-1 space-y-1.5">
                      <Textarea
                        value={editingRuleText}
                        onChange={(e) => setEditingRuleText(e.target.value)}
                        rows={3}
                        className="text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            saveEditRule(r.id);
                          } else if (e.key === 'Escape') {
                            setEditingRuleId(null);
                          }
                        }}
                      />
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => { setEditingRuleId(null); setEditingRuleText(''); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => saveEditRule(r.id)}
                          disabled={!editingRuleText.trim()}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="flex-1 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{r.text}</p>
                  )}
                  {!readOnly && editingRuleId !== r.id && (
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEditRule(r)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                        aria-label="Edit rule"
                        title="Edit rule"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCustomRule(r.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                        aria-label="Remove rule"
                        title="Remove rule"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </section>

      {/* Learned patterns — the agent self-improves from approval feedback */}
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold leading-tight">Learned patterns</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                The agent reviews recent approval-queue decisions — approvals, edits, and rejections — and proposes new operating rules it noticed you applying. Accepted rules apply to every future Admin Agent action alongside your custom rules. Runs automatically every week.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0"
            onClick={trainNow}
            disabled={isTraining || readOnly}
          >
            {isTraining ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Train now
          </Button>
        </div>

        {learnedQ.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (learnedQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No learned patterns yet. As you approve, edit, and dismiss approval-queue items, the agent will surface rules here for your review.
          </p>
        ) : (
          <ScrollArea className="h-72 rounded-md border border-border/40 bg-background/30">
            <ol className="space-y-1.5 p-2">
              {(learnedQ.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="group flex items-start gap-2 rounded-md border border-border/60 bg-card/40 p-2.5"
                >
                  <span className={`mt-0.5 inline-flex h-5 items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                    r.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {r.status === 'active' ? 'Active' : 'Proposed'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{r.rule_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      confidence {Math.round((Number(r.confidence) || 0) * 100)}%
                      {r.occurrences && r.occurrences > 1 ? ` · seen ${r.occurrences}×` : ''}
                      {r.evidence?.summary ? ` · ${String(r.evidence.summary).slice(0, 140)}` : ''}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'proposed' && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-6 text-[11px] px-2"
                          onClick={() => decideLearnedRule(r.id, 'active')}
                        >
                          <Check className="h-3 w-3 mr-1" /> Accept
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => decideLearnedRule(r.id, 'dismissed')}
                      >
                        <X className="h-3 w-3 mr-1" /> {r.status === 'active' ? 'Retire' : 'Dismiss'}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </section>

      {!myActivation ? null : (
      <>
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
      </>
      )}
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