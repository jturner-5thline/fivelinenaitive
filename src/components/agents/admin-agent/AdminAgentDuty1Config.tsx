import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BookOpen, Brain, CalendarDays, Check, FileText, FlaskConical, Loader2, Paperclip, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { KnowledgeTestDialog } from '@/components/agents/KnowledgeTestDialog';

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
  knowledge_tag_filter: string[] | null;
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

type KnowledgeDoc = {
  id: string;
  title: string;
  source_type: 'file' | 'text';
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: 'pending' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
  tags: string[];
};

const STALE_THRESHOLD_DEFAULT = 3;

export const KB_TAG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'rules', label: 'Rules' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'definitions', label: 'Definitions' },
  { value: 'glossary', label: 'Glossary' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'other', label: 'Other' },
];

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
        .select('id, company_id, enabled, active_pipeline_ids, active_stage_ids, stale_threshold_business_days, friday_sweep_enabled, custom_rules, knowledge_tag_filter')
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
  const [tagFilter, setTagFilter] = useState<string[]>([]);
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
    setTagFilter(Array.isArray(s?.knowledge_tag_filter) ? (s!.knowledge_tag_filter as string[]) : []);
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
        knowledge_tag_filter: tagFilter,
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

  // ── Knowledge base (uploaded reference documents) ──────────────
  const knowledgeQ = useQuery<KnowledgeDoc[]>({
    queryKey: ['admin-agent-knowledge', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_knowledge_docs')
        .select('id, title, source_type, storage_path, mime_type, size_bytes, status, error_message, created_at, tags')
        .eq('company_id', companyId)
        .eq('agent_key', 'admin_agent')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as KnowledgeDoc[];
    },
  });
  const [isUploading, setIsUploading] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  const [isSavingPaste, setIsSavingPaste] = useState(false);
  const [knowledgeTestOpen, setKnowledgeTestOpen] = useState(false);

  // Latest persisted Knowledge Test run for this company — powers the score
  // badge on the "Run Knowledge Test" button. Full history + interaction
  // lives inside <KnowledgeTestDialog />.
  const latestKnowledgeTestQ = useQuery<{ score: number; total: number; created_at: string } | null>({
    queryKey: ['admin-agent-knowledge-test-latest', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_knowledge_test_runs')
        .select('score, total, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { score: number; total: number; created_at: string } | null) ?? null;
    },
  });

  // Realtime: reflect ingestion progress as the edge function updates status.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`admin-agent-knowledge-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_agent_knowledge_docs',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);

  async function uploadKnowledgeFiles(files: FileList | null) {
    if (!companyId || !currentUserId || !files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name}: max size is 25MB`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${companyId}/${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString())}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('admin-agent-knowledge')
          .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upErr) throw upErr;

        const { data: row, error: insErr } = await supabase
          .from('admin_agent_knowledge_docs')
          .insert({
            company_id: companyId,
            agent_key: 'admin_agent',
            title: file.name,
            source_type: 'file',
            storage_path: path,
            mime_type: file.type || null,
            size_bytes: file.size,
            status: 'pending',
            uploaded_by: currentUserId,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        // Fire-and-forget ingest; UI will refresh status on next query.
        supabase.functions
          .invoke('admin-agent-knowledge-ingest', { body: { doc_id: row.id } })
          .then(() => qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] }))
          .catch((e) => console.warn('[knowledge-ingest]', e?.message));
      }
      toast.success('Uploaded — extracting text in the background.');
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  async function savePastedKnowledge() {
    if (!companyId || !currentUserId) return;
    const title = pasteTitle.trim();
    const body = pasteBody.trim();
    if (!title || !body) return;
    setIsSavingPaste(true);
    try {
      const { data: row, error } = await supabase.from('admin_agent_knowledge_docs').insert({
        company_id: companyId,
        agent_key: 'admin_agent',
        title,
        source_type: 'text',
        extracted_text: body.slice(0, 200_000),
        status: 'pending',
        uploaded_by: currentUserId,
      }).select('id').single();
      if (error) throw error;
      // Chunk + embed in the background.
      supabase.functions
        .invoke('admin-agent-knowledge-ingest', { body: { doc_id: row.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] }))
        .catch((e) => console.warn('[knowledge-ingest]', e?.message));
      setPasteTitle('');
      setPasteBody('');
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
      toast.success('Saved to the agent knowledge base.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save.');
    } finally {
      setIsSavingPaste(false);
    }
  }

  async function removeKnowledgeDoc(doc: KnowledgeDoc) {
    try {
      if (doc.storage_path) {
        await supabase.storage.from('admin-agent-knowledge').remove([doc.storage_path]);
      }
      const { error } = await supabase
        .from('admin_agent_knowledge_docs')
        .delete()
        .eq('id', doc.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove.');
    }
  }

  async function reingestDoc(doc: KnowledgeDoc) {
    if (!doc.storage_path) return;
    try {
      await supabase
        .from('admin_agent_knowledge_docs')
        .update({ status: 'pending', error_message: null })
        .eq('id', doc.id);
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
      await supabase.functions.invoke('admin-agent-knowledge-ingest', { body: { doc_id: doc.id } });
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Re-ingest failed.');
    }
  }

  // ── Rename knowledge doc ─────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function startRename(doc: KnowledgeDoc) {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  }

  async function commitRename(doc: KnowledgeDoc) {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next || next === doc.title) return;
    try {
      const { error } = await supabase
        .from('admin_agent_knowledge_docs')
        .update({ title: next })
        .eq('id', doc.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
      toast.success('Renamed.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not rename.');
    }
  }

  function formatDocSize(n: number | null): string {
    if (!n || n <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // ── Tag knowledge doc ────────────────────────────────────────
  async function toggleDocTag(doc: KnowledgeDoc, tag: string) {
    const current = Array.isArray(doc.tags) ? doc.tags : [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    try {
      const { error } = await supabase
        .from('admin_agent_knowledge_docs')
        .update({ tags: next })
        .eq('id', doc.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not update tags.');
    }
  }

  // ── Prompt-injection tag filter (persisted with saveSettings) ─
  async function toggleTagFilter(tag: string) {
    if (!companyId) return;
    const next = tagFilter.includes(tag)
      ? tagFilter.filter((t) => t !== tag)
      : [...tagFilter, tag];
    setTagFilter(next);
    try {
      const { error } = await supabase
        .from('admin_agent_settings')
        .upsert({ company_id: companyId, knowledge_tag_filter: next }, { onConflict: 'company_id' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId, 'full'] });
      await qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not save filter.');
    }
  }

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
      <section className="rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium leading-tight">Admin Agent is not enabled for this company.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A platform admin must turn it on in Admin → Access &amp; Permissions → Agent Access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const holidays = holidaysQ.data ?? [];

  return (
    <div className="space-y-3">
      {/* Compact status bar: activation + capability toggle in one row */}
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight truncate">Activate Admin Agent for me</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {myActivation ? 'Active — audits and Friday sweep will run for you.' : 'Off — chat tools refuse and sweep skips you.'}
          </p>
        </div>
        <Switch
          checked={myActivation}
          onCheckedChange={setMyActivation}
          disabled={!currentUserId || isTogglingActivation}
          aria-label="Activate Admin Agent for me"
        />
      </div>

      {!myActivation ? (
        <p className="text-[11px] text-muted-foreground px-1">
          Turn on activation to configure scope, rules, calendar, and team overrides.
        </p>
      ) : (
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-8">
          <TabsTrigger value="general" className="text-[11px]">General</TabsTrigger>
          <TabsTrigger value="scope" className="text-[11px]">Scope</TabsTrigger>
          <TabsTrigger value="rules" className="text-[11px]">Rules</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-[11px]">Knowledge</TabsTrigger>
          <TabsTrigger value="calendar" className="text-[11px]">Calendar</TabsTrigger>
          <TabsTrigger value="team" className="text-[11px]">Team</TabsTrigger>
        </TabsList>

        {/* ── General ─────────────────────────────────────────── */}
        <TabsContent value="general" className="mt-3 space-y-2">
          <ConfigRow
            title="Verify Deal Information"
            hint="Audit active deals for stale/missing critical updates."
            control={
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={readOnly} />
            }
          />
          <ConfigRow
            title="Friday sweep"
            hint="Treat Fridays as a strict end-of-week pass."
            control={
              <Switch checked={fridaySweep} onCheckedChange={setFridaySweep} disabled={readOnly} />
            }
          />
          <ConfigRow
            title="Stale threshold"
            hint="Business days without an update before a deal is flagged."
            control={
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={staleThreshold}
                  onChange={(e) => setStaleThreshold(Number(e.target.value))}
                  disabled={readOnly}
                  className="h-7 w-16 text-xs text-right tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground">BD</span>
              </div>
            }
          />
        </TabsContent>

        {/* ── Scope ───────────────────────────────────────────── */}
        <TabsContent value="scope" className="mt-3 space-y-3">
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Pipelines</Label>
              <span className="text-[10px] text-muted-foreground">Empty = default pipeline</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(pipelinesQ.data ?? []).map((p) => {
                const active = pipelineIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !readOnly && togglePipeline(p.id)}
                    disabled={readOnly}
                    className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                      active
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-muted/30 border-border/60 text-foreground/80 hover:border-border'
                    }`}
                  >
                    {p.name}
                    {p.is_default ? <span className="ml-1 text-[9px] opacity-70">default</span> : null}
                  </button>
                );
              })}
              {(pipelinesQ.data ?? []).length === 0 && (
                <span className="text-[11px] text-muted-foreground">No pipelines configured.</span>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Stages</Label>
              <span className="text-[10px] text-muted-foreground">Empty = all non-terminal</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {stagesForActivePipelines.map((s) => {
                const active = stageIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => !readOnly && toggleStage(s.id)}
                    disabled={readOnly}
                    title={s.pipelineName}
                    className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                      active
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-muted/30 border-border/60 text-foreground/80 hover:border-border'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
              {stagesForActivePipelines.length === 0 && (
                <span className="text-[11px] text-muted-foreground">Pick a pipeline first.</span>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Rules ───────────────────────────────────────────── */}
        <TabsContent value="rules" className="mt-3 space-y-3">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h5 className="text-xs font-semibold">Custom rules</h5>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {customRules.length} active
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Plain-English rules injected into every run for {company?.name || 'this workspace'}.
            </p>
            <Textarea
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              placeholder='e.g. "Flag deals stale after 3 business days without a status note."'
              disabled={readOnly || isSavingRule}
              rows={2}
              className="text-xs"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!readOnly && newRuleText.trim()) addCustomRule();
                }
              }}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={addCustomRule}
                disabled={readOnly || isSavingRule || !newRuleText.trim()}
                className="h-7 text-[11px]"
              >
                {isSavingRule ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>
            {customRules.length > 0 && (
              <ScrollArea className="h-40 rounded border border-border/40 bg-background/30">
                <ol className="space-y-1 p-1.5">
                  {customRules.map((r, i) => (
                    <li
                      key={r.id}
                      className="group flex items-start gap-1.5 rounded border border-border/60 bg-card/40 p-1.5"
                    >
                      <span className="mt-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-primary/10 px-1 text-[9px] font-semibold text-primary tabular-nums">
                        {i + 1}
                      </span>
                      {editingRuleId === r.id ? (
                        <div className="flex-1 space-y-1">
                          <Textarea
                            value={editingRuleText}
                            onChange={(e) => setEditingRuleText(e.target.value)}
                            rows={2}
                            className="text-[11px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEditRule(r.id); }
                              else if (e.key === 'Escape') setEditingRuleId(null);
                            }}
                          />
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setEditingRuleId(null); setEditingRuleText(''); }}>Cancel</Button>
                            <Button size="sm" className="h-6 text-[10px]" onClick={() => saveEditRule(r.id)} disabled={!editingRuleText.trim()}>Save</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="flex-1 text-[11px] leading-snug text-foreground/90 whitespace-pre-wrap">{r.text}</p>
                      )}
                      {!readOnly && editingRuleId !== r.id && (
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => startEditRule(r)} className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted" aria-label="Edit rule"><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={() => removeCustomRule(r.id)} className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted" aria-label="Remove rule"><X className="h-3 w-3" /></button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <h5 className="text-xs font-semibold">Learned patterns</h5>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] ml-auto"
                onClick={trainNow}
                disabled={isTraining || readOnly}
              >
                {isTraining ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Train now
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Rules the agent proposes from your approval-queue decisions. Runs weekly.
            </p>
            {learnedQ.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (learnedQ.data ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No learned patterns yet.</p>
            ) : (
              <ScrollArea className="h-40 rounded border border-border/40 bg-background/30">
                <ol className="space-y-1 p-1.5">
                  {(learnedQ.data ?? []).map((r) => (
                    <li key={r.id} className="flex items-start gap-1.5 rounded border border-border/60 bg-card/40 p-1.5">
                      <span className={`mt-0.5 inline-flex h-4 items-center justify-center rounded px-1 text-[9px] font-semibold uppercase tracking-wide ${
                        r.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                      }`}>{r.status === 'active' ? 'Active' : 'Proposed'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] leading-snug text-foreground/90 whitespace-pre-wrap">{r.rule_text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {Math.round((Number(r.confidence) || 0) * 100)}% confidence
                          {r.occurrences && r.occurrences > 1 ? ` · ${r.occurrences}×` : ''}
                        </p>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0">
                          {r.status === 'proposed' && (
                            <Button size="sm" className="h-5 text-[10px] px-1.5" onClick={() => decideLearnedRule(r.id, 'active')}>
                              <Check className="h-2.5 w-2.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground" onClick={() => decideLearnedRule(r.id, 'dismissed')}>
                            <X className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        {/* ── Calendar (holidays) ─────────────────────────────── */}
        <TabsContent value="knowledge" className="mt-3 space-y-3">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <h5 className="text-xs font-semibold">Knowledge base</h5>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {(knowledgeQ.data ?? []).length} document{(knowledgeQ.data ?? []).length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Reference documents the agent learns from — rules, requirements, definitions, glossaries, workflows, etc. Text is extracted, split into passages, and embedded into a vector index. For each deal it evaluates, the agent retrieves only the most relevant passages instead of re-reading every file on every run.
            </p>

            <div className="flex items-center gap-2">
              <label className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 bg-card/60 text-[11px] cursor-pointer hover:bg-card ${readOnly || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                <span>Upload files</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={readOnly || isUploading}
                  onChange={(e) => { uploadKnowledgeFiles(e.target.files); e.currentTarget.value = ''; }}
                  accept=".pdf,.txt,.md,.csv,.json,.docx,.doc,.rtf,.html,.htm,.xml,.tsv,.xlsx,.xls"
                />
              </label>
              <span className="text-[10px] text-muted-foreground">PDF, DOCX, XLSX, TXT, MD, CSV, JSON, HTML · 25MB max</span>
              <div className="ml-auto flex items-center gap-1.5">
                {latestKnowledgeTestQ.data && latestKnowledgeTestQ.data.total > 0 && (
                  <span
                    className={`text-[10px] tabular-nums px-1.5 h-5 inline-flex items-center rounded-full border ${
                      latestKnowledgeTestQ.data.score / latestKnowledgeTestQ.data.total >= 0.8
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : latestKnowledgeTestQ.data.score / latestKnowledgeTestQ.data.total >= 0.5
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-red-500/15 text-red-300 border-red-500/30'
                    }`}
                    title={`Last knowledge test: ${latestKnowledgeTestQ.data.score}/${latestKnowledgeTestQ.data.total}`}
                  >
                    {latestKnowledgeTestQ.data.score}/{latestKnowledgeTestQ.data.total}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setKnowledgeTestOpen(true)}
                  disabled={(knowledgeQ.data ?? []).filter((d) => d.status === 'ready').length === 0}
                  title="Verify the agent has truly digested every uploaded document"
                >
                  <FlaskConical className="h-3 w-3 mr-1" />
                  Run Knowledge Test
                </Button>
              </div>
            </div>

            {/* Prompt inclusion filter */}
            <div className="rounded border border-border/40 bg-background/40 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Include in agent prompt
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {tagFilter.length === 0
                    ? 'All tagged & untagged documents'
                    : `Only docs tagged: ${tagFilter.join(', ')}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {KB_TAG_OPTIONS.map((t) => {
                  const on = tagFilter.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleTagFilter(t.value)}
                      className={`px-2 h-6 rounded-full border text-[10px] transition-colors ${
                        on
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-card/40 border-border/50 text-muted-foreground hover:bg-card'
                      } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {tagFilter.length > 0 && (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setTagFilter([]);
                      if (companyId) {
                        supabase
                          .from('admin_agent_settings')
                          .upsert({ company_id: companyId, knowledge_tag_filter: [] }, { onConflict: 'company_id' })
                          .then(() => qc.invalidateQueries({ queryKey: ['admin-agent-settings', companyId, 'full'] }));
                      }
                    }}
                    className="px-2 h-6 rounded-full text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {knowledgeQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (knowledgeQ.data ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No documents yet.</p>
            ) : (
              <ScrollArea className="h-72 rounded border border-border/40 bg-background/30">
                <ul className="divide-y divide-border/40">
                  {(knowledgeQ.data ?? []).map((d) => (
                    <li key={d.id} className="group flex items-start gap-2 px-2 py-1.5">
                      {d.source_type === 'file' ? (
                        <Paperclip className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                      ) : (
                        <FileText className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        {renamingId === d.id ? (
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => commitRename(d)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRename(d); }
                              if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                            }}
                            className="h-6 text-[11px] px-1.5"
                          />
                        ) : (
                          <p
                            className="text-[11px] font-medium truncate cursor-text"
                            title="Double-click to rename"
                            onDoubleClick={() => !readOnly && startRename(d)}
                          >
                            {d.title}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground truncate">
                          {d.source_type === 'file'
                            ? `${(d.mime_type || 'file').split('/').pop()}${d.size_bytes ? ` · ${formatDocSize(d.size_bytes)}` : ''}`
                            : 'Pasted text'}
                          {' · Uploaded '}{format(new Date(d.created_at), 'MMM d, yyyy')}
                          {' · '}
                          {d.status === 'ready' ? (
                            <span className="text-emerald-400">Ready</span>
                          ) : d.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              Extracting…
                            </span>
                          ) : (
                            <span className="text-red-400" title={d.error_message || ''}>Error</span>
                          )}
                        </p>
                        {d.status === 'pending' && (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-amber-500/10">
                            <div className="h-full w-1/3 rounded-full bg-amber-400/70 animate-kb-progress" />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {KB_TAG_OPTIONS.map((t) => {
                            const on = (d.tags || []).includes(t.value);
                            const inFilter = tagFilter.length === 0 || tagFilter.includes(t.value);
                            return (
                              <button
                                key={t.value}
                                type="button"
                                disabled={readOnly}
                                onClick={() => toggleDocTag(d, t.value)}
                                title={on ? `Remove ${t.label} tag` : `Tag as ${t.label}`}
                                className={`px-1.5 h-4 rounded-sm border text-[9px] leading-none transition-colors ${
                                  on
                                    ? `bg-primary/20 border-primary/50 text-primary ${!inFilter ? 'opacity-40' : ''}`
                                    : 'bg-transparent border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
                                } ${readOnly ? 'cursor-not-allowed' : ''}`}
                              >
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => startRename(d)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label="Rename document"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {d.source_type === 'file' && (
                            <button
                              type="button"
                              onClick={() => reingestDoc(d)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                              aria-label={d.status === 'pending' ? 'Retry extraction' : 'Re-extract text'}
                              title={d.status === 'pending' ? 'Retry extraction' : 'Re-extract text'}
                            >
                              <Sparkles className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeKnowledgeDoc(d)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                            aria-label="Remove document"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>

        </TabsContent>

        {/* ── Calendar (holidays) ─────────────────────────────── */}
        <TabsContent value="calendar" className="mt-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Non-business days the agent excludes from stale-day counting and skips for sweeps.
            </p>
          </div>
          <div className="flex items-end gap-1.5">
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                disabled={readOnly}
                className="h-7 text-xs mt-0.5"
              />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label</Label>
              <Input
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                placeholder="Company holiday"
                disabled={readOnly}
                className="h-7 text-xs mt-0.5"
              />
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={addHoliday}
              disabled={readOnly || !newHolidayDate}
            >
              <Plus className="h-3 w-3 mr-1" />Add
            </Button>
          </div>
          {holidaysQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : holidays.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic px-0.5">No custom holidays configured.</p>
          ) : (
            <ScrollArea className="max-h-52 rounded border border-border/40 bg-background/30">
              <ul className="divide-y divide-border/40">
                {holidays.map((h) => (
                  <li key={h.id} className="group flex items-center gap-2 px-2 py-1.5">
                    <span className="text-[11px] font-medium tabular-nums w-24 shrink-0">
                      {(() => { try { return format(new Date(h.holiday_date + 'T00:00:00'), 'MMM d, yyyy'); } catch { return h.holiday_date; } })()}
                    </span>
                    <span className="text-[11px] text-foreground/80 flex-1 truncate">{h.label || 'Company holiday'}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeHoliday(h.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove holiday"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ── Team (per-user overrides) ────────────────────────── */}
        <TabsContent value="team" className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground px-0.5">
            Per-user overrides. Members use the workspace default unless changed.
          </p>
          <ScrollArea className="max-h-64 rounded border border-border/40 bg-background/30">
            <div className="divide-y divide-border/40">
              {(membersQ.data ?? []).map((m) => {
                const o = overridesByUser.get(m.user_id);
                const value: 'default' | 'enabled' | 'disabled' = !o ? 'default' : o.enabled ? 'enabled' : 'disabled';
                const display = m.profiles?.full_name || m.profiles?.email || m.user_id.slice(0, 8);
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs truncate">{display}</p>
                      {m.profiles?.email && m.profiles?.full_name && (
                        <p className="text-[10px] text-muted-foreground truncate">{m.profiles.email}</p>
                      )}
                    </div>
                    <Select value={value} onValueChange={(v) => setUserOverride(m.user_id, v as any)} disabled={readOnly}>
                      <SelectTrigger className="h-6 w-32 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Workspace default</SelectItem>
                        <SelectItem value="enabled">Always on</SelectItem>
                        <SelectItem value="disabled">Off for user</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
              {(membersQ.data ?? []).length === 0 && (
                <p className="text-[11px] text-muted-foreground px-2 py-3">No workspace members found.</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      )}

      {/* Sticky save row */}
      {myActivation && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          {readOnly && (
            <p className="text-[10px] text-muted-foreground mr-auto">Read-only — admin role required.</p>
          )}
          <Button size="sm" onClick={saveSettings} disabled={readOnly || isSaving} className="h-7 text-[11px]">
            {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      )}

      <KnowledgeTestDialog
        open={knowledgeTestOpen}
        onOpenChange={setKnowledgeTestOpen}
        companyId={companyId}
        hasReadyDocs={(knowledgeQ.data ?? []).some((d) => d.status === 'ready')}
      />
    </div>
  );
}

/** Compact settings row: label + hint on the left, control on the right. */
function ConfigRow({ title, hint, control }: { title: string; hint: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug truncate">{hint}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}