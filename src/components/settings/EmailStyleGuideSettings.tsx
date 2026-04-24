import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, Loader2, Check, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface StageRule {
  stage: string;
  rule: string;
}

interface StyleGuide {
  signature: string;
  greeting: string;
  closing: string;
  tone_guidelines: string;
  stage_rules: StageRule[];
  custom_instructions: string;
}

const EMPTY: StyleGuide = {
  signature: '',
  greeting: '',
  closing: '',
  tone_guidelines: '',
  stage_rules: [],
  custom_instructions: '',
};

function normalizeStageRules(raw: unknown): StageRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      stage: typeof r.stage === 'string' ? r.stage : '',
      rule: typeof r.rule === 'string' ? r.rule : '',
    }));
}

export function EmailStyleGuideSettings({ isAdmin }: { isAdmin: boolean }) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [guide, setGuide] = useState<StyleGuide>(EMPTY);
  const [original, setOriginal] = useState<StyleGuide>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('company_email_style_guide')
        .select('signature, greeting, closing, tone_guidelines, stage_rules, custom_instructions')
        .eq('company_id', company.id)
        .maybeSingle();
      if (cancelled) return;
      const loaded: StyleGuide = data
        ? {
            signature: data.signature ?? '',
            greeting: data.greeting ?? '',
            closing: data.closing ?? '',
            tone_guidelines: data.tone_guidelines ?? '',
            stage_rules: normalizeStageRules(data.stage_rules),
            custom_instructions: data.custom_instructions ?? '',
          }
        : EMPTY;
      setGuide(loaded);
      setOriginal(loaded);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

  const hasChanges = JSON.stringify(guide) !== JSON.stringify(original);

  const updateField = <K extends keyof StyleGuide>(key: K, value: StyleGuide[K]) => {
    setGuide((g) => ({ ...g, [key]: value }));
  };

  const updateRule = (idx: number, key: keyof StageRule, value: string) => {
    setGuide((g) => ({
      ...g,
      stage_rules: g.stage_rules.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    }));
  };

  const addRule = () => {
    setGuide((g) => ({ ...g, stage_rules: [...g.stage_rules, { stage: '', rule: '' }] }));
  };

  const removeRule = (idx: number) => {
    setGuide((g) => ({ ...g, stage_rules: g.stage_rules.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      // Drop empty stage rules to keep storage tidy
      const cleanedRules = guide.stage_rules.filter((r) => r.stage.trim() || r.rule.trim());

      const payload = {
        company_id: company.id,
        signature: guide.signature,
        greeting: guide.greeting,
        closing: guide.closing,
        tone_guidelines: guide.tone_guidelines,
        stage_rules: cleanedRules,
        custom_instructions: guide.custom_instructions,
        updated_by: user?.id ?? null,
      };

      const { error } = await supabase
        .from('company_email_style_guide')
        .upsert(payload, { onConflict: 'company_id' });
      if (error) throw error;

      const next = { ...guide, stage_rules: cleanedRules };
      setGuide(next);
      setOriginal(next);
      toast.success('Email style guide saved');
    } catch (err) {
      console.error('Error saving email style guide:', err);
      toast.error('Failed to save email style guide');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Email Style Guide</CardTitle>
        </div>
        <CardDescription>
          The voice and formatting rules applied to every AI-drafted email reply. Used by the
          Email pop-up so all outbound messages stay consistent with your firm's tone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Signature */}
            <div className="space-y-2">
              <Label htmlFor="esg-signature">Standard email signature</Label>
              <Textarea
                id="esg-signature"
                value={guide.signature}
                onChange={(e) => updateField('signature', e.target.value)}
                placeholder={'Best,\nJames Turner\n5th Line Capital'}
                className="min-h-[100px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Appended to every AI-drafted reply.
              </p>
            </div>

            <Separator />

            {/* Greeting & Closing */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="esg-greeting">Preferred greeting</Label>
                <Input
                  id="esg-greeting"
                  value={guide.greeting}
                  onChange={(e) => updateField('greeting', e.target.value)}
                  placeholder="Hi [First Name],"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="esg-closing">Preferred closing</Label>
                <Input
                  id="esg-closing"
                  value={guide.closing}
                  onChange={(e) => updateField('closing', e.target.value)}
                  placeholder="Best, James"
                />
              </div>
            </div>

            <Separator />

            {/* Tone */}
            <div className="space-y-2">
              <Label htmlFor="esg-tone">Communication tone guidelines</Label>
              <Textarea
                id="esg-tone"
                value={guide.tone_guidelines}
                onChange={(e) => updateField('tone_guidelines', e.target.value)}
                placeholder="Professional, direct, institutional finance tone. Avoid filler phrases. Get to the point quickly."
                className="min-h-[100px]"
              />
            </div>

            <Separator />

            {/* Stage rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Deal-stage-specific messaging rules</Label>
                  <p className="text-xs text-muted-foreground">
                    Apply different language depending on what stage the deal is in.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addRule}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add rule
                </Button>
              </div>
              {guide.stage_rules.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1">
                  No stage rules yet. Add one to tailor messaging by deal stage.
                </p>
              ) : (
                <div className="space-y-2">
                  {guide.stage_rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="grid gap-2 sm:grid-cols-[200px_1fr_auto] items-start rounded-md border p-3 bg-muted/30"
                    >
                      <Input
                        value={rule.stage}
                        onChange={(e) => updateRule(idx, 'stage', e.target.value)}
                        placeholder="e.g. Due Diligence"
                      />
                      <Textarea
                        value={rule.rule}
                        onChange={(e) => updateRule(idx, 'rule', e.target.value)}
                        placeholder="e.g. When a lender requests information at this stage, always reference the signed term sheet and confirm next steps."
                        className="min-h-[60px]"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(idx)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Custom instructions */}
            <div className="space-y-2">
              <Label htmlFor="esg-custom">Additional custom instructions</Label>
              <Textarea
                id="esg-custom"
                value={guide.custom_instructions}
                onChange={(e) => updateField('custom_instructions', e.target.value)}
                placeholder="Any other rules the AI should follow when drafting emails."
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                These rules are injected into every AI-drafted reply across your company.
              </p>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Button variant="ghost" size="sm" onClick={() => setGuide(original)}>
                    Discard
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
