import { useMemo, useState, useEffect, useRef } from 'react';
import { Loader2, RotateCcw, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMeetingTitleTemplates } from '@/hooks/useMeetingTitleTemplates';
import {
  MEETING_TITLE_TOKENS,
  renderMeetingTitle,
  SEED_TEMPLATES,
  DEFAULT_TEMPLATE_FALLBACK,
} from '@/lib/renderMeetingTitle';

interface Props {
  isAdmin: boolean;
}

const SAMPLE_DEAL = {
  company_name: 'Acme Robotics',
  name: 'Acme Robotics',
  lender_name: 'Apollo',
  partner_name: 'Apex Capital',
  referrer_name: 'Jonny Boyarsky',
};

const SAMPLE_USER = { first_name: 'James', full_name: 'James Turner' };

function seedFor(label: string): string | null {
  for (const s of SEED_TEMPLATES) if (s.matchLabel.test(label.trim())) return s.template;
  return null;
}

export function MeetingTitleSettings({ isAdmin }: Props) {
  const { stages } = useDealStages();
  const { user } = useAuth();
  const { templates, orgCompanyId, isLoading, refetch } = useMeetingTitleTemplates();

  // Local edit state, keyed by stage_id ('' for Default).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Hydrate drafts when templates load — only initialise empty rows from the
  // seed catalogue; never overwrite an existing template the user has saved.
  useEffect(() => {
    if (isLoading) return;
    const next: Record<string, string> = {};
    for (const s of stages) {
      next[s.id] = templates[s.id] ?? seedFor(s.label) ?? '';
    }
    next[''] = templates[''] ?? DEFAULT_TEMPLATE_FALLBACK;
    setDrafts(next);
  }, [isLoading, templates, stages]);

  const handleInsertToken = (stageKey: string, token: string) => {
    if (!isAdmin) return;
    const input = inputRefs.current[stageKey];
    if (!input) {
      setDrafts((p) => ({ ...p, [stageKey]: (p[stageKey] ?? '') + token }));
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const current = drafts[stageKey] ?? '';
    const next = current.slice(0, start) + token + current.slice(end);
    setDrafts((p) => ({ ...p, [stageKey]: next }));
    // Restore cursor after the inserted token.
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + token.length;
      input.setSelectionRange(caret, caret);
    });
  };

  const handleSave = async (stageKey: string) => {
    if (!isAdmin || !orgCompanyId) return;
    const template = (drafts[stageKey] ?? '').trim();
    setSavingKey(stageKey);
    try {
      if (!template) {
        // Empty → delete the row so the stage falls back to Default.
        const q = supabase
          .from('meeting_title_templates')
          .delete()
          .eq('org_company_id', orgCompanyId);
        const { error } = stageKey === ''
          ? await q.is('stage_id', null)
          : await q.eq('stage_id', stageKey);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meeting_title_templates')
          .upsert({
            org_company_id: orgCompanyId,
            stage_id: stageKey === '' ? null : stageKey,
            template,
            updated_by: user?.id ?? null,
          }, { onConflict: stageKey === '' ? undefined : 'org_company_id,stage_id' });
        if (error) throw error;
      }
      toast.success('Template saved');
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save template');
    } finally {
      setSavingKey(null);
    }
  };

  const handleReset = (stageKey: string, label: string) => {
    const seed = stageKey === '' ? DEFAULT_TEMPLATE_FALLBACK : (seedFor(label) ?? '');
    setDrafts((p) => ({ ...p, [stageKey]: seed }));
  };

  const rows = useMemo(() => {
    const stageRows = stages.map((s) => ({ key: s.id, label: s.label }));
    return [...stageRows, { key: '', label: 'Default (fallback)' }];
  }, [stages]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Meeting Titles
          {!isAdmin && <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-3 w-3" /> Admin only</Badge>}
        </CardTitle>
        <CardDescription>
          Title templates used for AI-generated calendar invites and meeting-suggestion email subjects.
          One per pipeline stage; the Default row is used when a stage has no template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Token palette */}
        <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground mb-1.5">Insert token at cursor:</div>
          <div className="flex flex-wrap gap-1.5">
            {MEETING_TITLE_TOKENS.map((tok) => (
              <button
                key={tok}
                type="button"
                disabled={!isAdmin}
                onClick={() => {
                  // Insert into whatever input was last focused; fall back to Default.
                  const focused = (document.activeElement as HTMLInputElement | null);
                  const key = focused?.dataset?.stageKey;
                  if (typeof key === 'string') handleInsertToken(key, tok);
                  else handleInsertToken('', tok);
                }}
                className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-border/40 bg-background hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tok}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-[180px]">Stage</th>
                  <th className="text-left px-3 py-2">Template</th>
                  <th className="text-left px-3 py-2 w-[280px]">Preview</th>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isDefault = row.key === '';
                  const value = drafts[row.key] ?? '';
                  const dirty = (templates[row.key] ?? '') !== value;
                  const sampleStage = isDefault
                    ? { ...SAMPLE_DEAL, stage_id: 'sample', stage_label: 'Discovery' }
                    : { ...SAMPLE_DEAL, stage_id: row.key, stage_label: row.label };
                  const preview = renderMeetingTitle({
                    deal: sampleStage,
                    user: SAMPLE_USER,
                    templates: { [sampleStage.stage_id]: value, '': drafts[''] ?? '' },
                  });
                  return (
                    <tr key={row.key || '__default'} className={idx % 2 ? 'bg-muted/10' : ''}>
                      <td className={`px-3 py-2 align-top ${isDefault ? 'font-semibold' : ''}`}>
                        {row.label}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          ref={(el) => { inputRefs.current[row.key] = el; }}
                          data-stage-key={row.key}
                          value={value}
                          onChange={(e) => setDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                          placeholder={isDefault ? DEFAULT_TEMPLATE_FALLBACK : '(uses Default)'}
                          disabled={!isAdmin}
                          className="h-8 text-sm font-mono"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                        <span className="block truncate" title={preview}>{preview || <span className="italic">empty</span>}</span>
                        <span className="text-[10px] text-muted-foreground/70">{preview.length}/100 chars</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            disabled={!isAdmin}
                            onClick={() => handleReset(row.key, row.label)}
                            title="Reset to seed"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={!isAdmin || !dirty || savingKey === row.key}
                            onClick={() => handleSave(row.key)}
                          >
                            {savingKey === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MeetingTitleSettings;