import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Brain, BarChart3, Loader2, Save, MessageSquare, TrendingUp, Bot, Workflow, Sparkles, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_COPILOT_INSTRUCTIONS,
  TONE_LABELS,
  compileCopilotInstructions,
  normalizeCopilotInstructions,
  type CopilotInstructions,
  type CopilotTone,
} from '@/lib/copilotInstructions';

const AI_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Latest)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast)' },
];

const FEATURE_TOGGLES = [
  { key: 'chat', label: 'naitive AI Chat', icon: MessageSquare, description: 'AI-powered chat assistant' },
  { key: 'financial_analysis', label: 'Financial Analysis', icon: TrendingUp, description: 'AI analysis of deal financials' },
  { key: 'agents', label: 'AI Agents', icon: Bot, description: 'Claude-powered agent reasoning' },
  { key: 'workflows', label: 'Workflow AI Steps', icon: Workflow, description: 'AI processing in workflows' },
];

interface AIConfig {
  id: string;
  company_id: string;
  default_model: string;
  default_temperature: number;
  max_tokens: number;
  features_enabled: Record<string, boolean>;
  copilot_instructions?: CopilotInstructions;
}

export function AIConfigurationSettings({ isAdmin }: { isAdmin: boolean }) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<Partial<AIConfig>>({
    default_model: 'claude-sonnet-4-20250514',
    default_temperature: 0.7,
    max_tokens: 4096,
    features_enabled: { chat: true, financial_analysis: true, agents: true, workflows: true },
  });
  const [localCopilot, setLocalCopilot] = useState<CopilotInstructions>(DEFAULT_COPILOT_INSTRUCTIONS);
  const [copilotLoaded, setCopilotLoaded] = useState(false);
  const [showCompiledPreview, setShowCompiledPreview] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['ai-configuration', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from('ai_configuration')
        .select('*')
        .eq('company_id', company.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as unknown) as AIConfig | null;
    },
    enabled: !!company?.id,
  });

  const { data: usageStats } = useQuery({
    queryKey: ['ai-usage-stats', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('feature, input_tokens, output_tokens')
        .eq('company_id', company.id);
      if (error) throw error;

      const stats: Record<string, { calls: number; input_tokens: number; output_tokens: number }> = {};
      (data || []).forEach((row: any) => {
        if (!stats[row.feature]) stats[row.feature] = { calls: 0, input_tokens: 0, output_tokens: 0 };
        stats[row.feature].calls++;
        stats[row.feature].input_tokens += row.input_tokens || 0;
        stats[row.feature].output_tokens += row.output_tokens || 0;
      });
      return stats;
    },
    enabled: !!company?.id,
  });

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
      if (!copilotLoaded) {
        setLocalCopilot(normalizeCopilotInstructions((config as any).copilot_instructions));
        setCopilotLoaded(true);
      }
    }
  }, [config, copilotLoaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('No company');
      const payload = {
        company_id: company.id,
        default_model: localConfig.default_model || 'claude-sonnet-4-20250514',
        default_temperature: localConfig.default_temperature ?? 0.7,
        max_tokens: localConfig.max_tokens ?? 4096,
        features_enabled: localConfig.features_enabled || { chat: true, financial_analysis: true, agents: true, workflows: true },
        copilot_instructions: localCopilot as any,
      };

      if (config?.id) {
        const { error } = await supabase
          .from('ai_configuration')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_configuration')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-configuration'] });
      toast.success('AI configuration saved');
    },
    onError: (e: Error) => {
      toast.error('Failed to save: ' + e.message);
    },
  });

  const toggleFeature = (key: string) => {
    setLocalConfig(prev => ({
      ...prev,
      features_enabled: {
        ...prev.features_enabled,
        [key]: !(prev.features_enabled?.[key] ?? true),
      },
    }));
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI Configuration
          </CardTitle>
          <CardDescription>Configure Claude AI settings for your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Model Selection */}
          <div className="space-y-2">
            <Label>Default Model</Label>
            <Select
              value={localConfig.default_model || 'claude-sonnet-4-20250514'}
              onValueChange={(v) => setLocalConfig(prev => ({ ...prev, default_model: v }))}
              disabled={!isAdmin}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Temperature</Label>
              <span className="text-xs text-muted-foreground">{localConfig.default_temperature?.toFixed(1)}</span>
            </div>
            <Slider
              value={[localConfig.default_temperature ?? 0.7]}
              onValueChange={([v]) => setLocalConfig(prev => ({ ...prev, default_temperature: v }))}
              min={0}
              max={1}
              step={0.1}
              disabled={!isAdmin}
            />
            <p className="text-[11px] text-muted-foreground">Lower = more focused, Higher = more creative</p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label>Max Response Tokens</Label>
            <Input
              type="number"
              value={localConfig.max_tokens ?? 4096}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 4096 }))}
              min={256}
              max={8192}
              disabled={!isAdmin}
            />
          </div>

          {/* Feature Toggles */}
          <div className="space-y-3 pt-2">
            <Label>Feature Toggles</Label>
            {FEATURE_TOGGLES.map(ft => {
              const Icon = ft.icon;
              return (
                <div key={ft.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{ft.label}</p>
                      <p className="text-[11px] text-muted-foreground">{ft.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={localConfig.features_enabled?.[ft.key] ?? true}
                    onCheckedChange={() => toggleFeature(ft.key)}
                    disabled={!isAdmin}
                  />
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Configuration
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            AI Usage
          </CardTitle>
          <CardDescription>Token usage by feature</CardDescription>
        </CardHeader>
        <CardContent>
          {!usageStats || Object.keys(usageStats).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No AI usage recorded yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(usageStats).map(([feature, stats]) => (
                <div key={feature} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div>
                    <p className="text-sm font-medium capitalize">{feature.replace(/_/g, ' ').replace(/-/g, ' ')}</p>
                    <p className="text-[11px] text-muted-foreground">{stats.calls} calls</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      In: {formatTokens(stats.input_tokens)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      Out: {formatTokens(stats.output_tokens)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Copilot Instructions (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Copilot Instructions
            </CardTitle>
            <CardDescription>
              Firm-level context injected at the start of every AI conversation (chat, dashboard, deal copilot).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Company description */}
            <div className="space-y-2">
              <Label>Company Description</Label>
              <Textarea
                rows={3}
                value={localCopilot.company_description}
                onChange={(e) => setLocalCopilot((p) => ({ ...p, company_description: e.target.value }))}
                placeholder={DEFAULT_COPILOT_INSTRUCTIONS.company_description}
              />
            </div>

            {/* Lifecycle stages */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Deal Lifecycle Stages</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    setLocalCopilot((p) => ({
                      ...p,
                      lifecycle_stages: [...p.lifecycle_stages, { name: '', description: '' }],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add stage
                </Button>
              </div>
              <div className="space-y-2">
                {localCopilot.lifecycle_stages.map((stage, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-2 w-5 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1.5fr] gap-2">
                      <Input
                        value={stage.name}
                        placeholder="Stage name"
                        onChange={(e) =>
                          setLocalCopilot((p) => ({
                            ...p,
                            lifecycle_stages: p.lifecycle_stages.map((s, i) =>
                              i === idx ? { ...s, name: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                      <Input
                        value={stage.description ?? ''}
                        placeholder="Optional description"
                        onChange={(e) =>
                          setLocalCopilot((p) => ({
                            ...p,
                            lifecycle_stages: p.lifecycle_stages.map((s, i) =>
                              i === idx ? { ...s, description: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setLocalCopilot((p) => ({
                          ...p,
                          lifecycle_stages: p.lifecycle_stages.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <Label>Communication Tone</Label>
              <Select
                value={localCopilot.tone}
                onValueChange={(v) => setLocalCopilot((p) => ({ ...p, tone: v as CopilotTone }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TONE_LABELS) as CopilotTone[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TONE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team structure */}
            <div className="space-y-2">
              <Label>Team Structure</Label>
              <Textarea
                rows={3}
                value={localCopilot.team_structure}
                onChange={(e) => setLocalCopilot((p) => ({ ...p, team_structure: e.target.value }))}
                placeholder="e.g. James Turner manages enterprise deals; Song Chae covers growth-stage; analysts assist with diligence."
              />
            </div>

            {/* Custom instructions */}
            <div className="space-y-2">
              <Label>Custom Instructions</Label>
              <Textarea
                rows={4}
                value={localCopilot.custom_instructions}
                onChange={(e) => setLocalCopilot((p) => ({ ...p, custom_instructions: e.target.value }))}
                placeholder="Any firm-specific rules, lender preferences, formatting templates, etc."
              />
            </div>

            {/* Compiled preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Compiled System Prompt Preview</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowCompiledPreview((v) => !v)}
                >
                  {showCompiledPreview ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Show
                    </>
                  )}
                </Button>
              </div>
              {showCompiledPreview && (
                <pre className="text-[11px] leading-relaxed bg-muted/60 border rounded-md p-3 max-h-80 overflow-auto whitespace-pre-wrap">
{compileCopilotInstructions(localCopilot)}
                </pre>
              )}
              <p className="text-[11px] text-muted-foreground">
                This block is prepended to every AI conversation across naitive (Deal Copilot, Dashboard AI, AI Chat).
              </p>
            </div>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Copilot Instructions
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
