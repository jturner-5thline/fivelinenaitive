import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, ShieldAlert, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { canUse5thLineProprietaryActions } from '@/lib/proprietaryAccess';
import { toast } from 'sonner';

// Keep in sync with tool names registered in supabase/functions/copilot-chat/index.ts.
const TOGGLEABLE_TOOLS: Array<{ group: string; name: string; label: string }> = [
  { group: 'Drafts & previews', name: 'draft_email', label: 'Draft email' },
  { group: 'Drafts & previews', name: 'draft_status_report', label: 'Draft status report' },
  { group: 'Drafts & previews', name: 'follow_up_summary', label: 'Follow-up summary' },
  { group: 'External integrations (stubbed)', name: 'send_gmail', label: 'Send Gmail (preview)' },
  { group: 'External integrations (stubbed)', name: 'create_asana_task', label: 'Create Asana task (preview)' },
  { group: 'External integrations (stubbed)', name: 'schedule_meeting', label: 'Schedule meeting (preview)' },
  { group: 'Deal writes', name: 'update_deal_status', label: 'Update deal status' },
  { group: 'Deal writes', name: 'update_deal_stage', label: 'Update deal stage' },
  { group: 'Deal writes', name: 'update_deal_fields', label: 'Update deal fields' },
  { group: 'Deal writes', name: 'add_deal_note', label: 'Add deal note' },
  { group: 'Deal writes', name: 'move_deal_pipeline', label: 'Move deal between pipelines' },
  { group: 'Lender writes', name: 'update_lender_status', label: 'Update lender status' },
  { group: 'Task writes', name: 'create_task', label: 'Create task' },
  { group: 'Task writes', name: 'create_outstanding_item', label: 'Create outstanding item' },
  { group: 'Task writes', name: 'complete_outstanding_item', label: 'Complete outstanding item' },
  { group: 'Task writes', name: 'delete_outstanding_item', label: 'Delete outstanding item' },
  { group: 'Task writes', name: 'toggle_milestone', label: 'Toggle milestone' },
  { group: 'Task writes', name: 'add_milestone', label: 'Add milestone' },
  { group: 'Task writes', name: 'link_contact_to_deal', label: 'Link contact to deal' },
];

type ToneOption = '' | 'professional_concise' | 'formal' | 'casual';

interface CopilotConfigRow {
  id?: string;
  company_id: string;
  system_prompt_override: string;
  tone_override: ToneOption | null;
  default_report_template: string;
  tools_enabled: Record<string, boolean>;
}

const DEFAULT_REPORT_TEMPLATE = `# Status Report — {{deal_name}}
_As of {{date}}_

## Headline
- One-sentence summary of where the deal stands.

## Active lenders
- Lender — Stage — Last touch — Next step.

## Outstanding items
- Item — Owner — Due — Status.

## Risks / blockers
- ...

## Next 7 days
- ...`;

export function AICopilotSettings() {
  const { company } = useCompany();
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const canEdit = canUse5thLineProprietaryActions(user) && isAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<CopilotConfigRow | null>(null);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_copilot_config')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[ai-copilot-config] load failed', error);
      }
      setRow(
        (data as any) || {
          company_id: company.id,
          system_prompt_override: '',
          tone_override: '',
          default_report_template: '',
          tools_enabled: {},
        },
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof TOGGLEABLE_TOOLS>();
    for (const t of TOGGLEABLE_TOOLS) {
      if (!m.has(t.group)) m.set(t.group, []);
      m.get(t.group)!.push(t);
    }
    return Array.from(m.entries());
  }, []);

  const handleSave = async () => {
    if (!row || !company?.id || !canEdit) return;
    setSaving(true);
    const payload = {
      company_id: company.id,
      system_prompt_override: row.system_prompt_override,
      tone_override: row.tone_override || null,
      default_report_template: row.default_report_template,
      tools_enabled: row.tools_enabled || {},
      updated_by: user?.id,
    };
    const { error } = await supabase
      .from('ai_copilot_config')
      .upsert(payload, { onConflict: 'company_id' });
    setSaving(false);
    if (error) {
      toast.error('Could not save AI Copilot config');
      console.error(error);
    } else {
      toast.success('AI Copilot config saved');
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Copilot configuration</CardTitle>
          <CardDescription>Configure the workspace-wide AI Copilot system prompt, tone, default report template, and tool toggles.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>This page is restricted to 5th Line internal admins.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (loading || !row) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AI Copilot configuration…
        </CardContent>
      </Card>
    );
  }

  const setField = <K extends keyof CopilotConfigRow>(k: K, v: CopilotConfigRow[K]) =>
    setRow((prev) => (prev ? { ...prev, [k]: v } : prev));

  const setToolEnabled = (name: string, enabled: boolean) =>
    setRow((prev) => (prev ? { ...prev, tools_enabled: { ...(prev.tools_enabled || {}), [name]: enabled } } : prev));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Copilot configuration</CardTitle>
          <CardDescription>
            Workspace-level overrides applied to every AI Copilot conversation. Empty fields fall back to the platform defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="tone">Tone</Label>
            <Select value={row.tone_override || ''} onValueChange={(v) => setField('tone_override', (v || '') as ToneOption)}>
              <SelectTrigger id="tone"><SelectValue placeholder="Use platform default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Use platform default</SelectItem>
                <SelectItem value="professional_concise">Professional / Concise</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sys">Custom system prompt</Label>
            <Textarea
              id="sys"
              rows={8}
              placeholder="Appended to the base Copilot system prompt. Use to enforce workspace-wide rules, voice, or non-defaults."
              value={row.system_prompt_override}
              onChange={(e) => setField('system_prompt_override', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl">Default status report template</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setField('default_report_template', DEFAULT_REPORT_TEMPLATE)}
              >
                Insert starter template
              </Button>
            </div>
            <Textarea
              id="tpl"
              rows={10}
              placeholder="Markdown template the Copilot uses when drafting a status report."
              value={row.default_report_template}
              onChange={(e) => setField('default_report_template', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool access</CardTitle>
          <CardDescription>Disable individual Copilot tools for this workspace. Disabled tools are hidden from the model on every request.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {grouped.map(([group, items]) => (
            <div key={group} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((t) => {
                  const enabled = row.tools_enabled?.[t.name] !== false;
                  return (
                    <label
                      key={t.name}
                      className="flex items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{t.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{t.name}</div>
                      </div>
                      <Switch checked={enabled} onCheckedChange={(v) => setToolEnabled(t.name, v)} />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
