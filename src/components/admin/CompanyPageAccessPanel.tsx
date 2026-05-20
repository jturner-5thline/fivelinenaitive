import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Newspaper,
  BarChart3,
  Lightbulb,
  Users,
  UserCog,
  Cog,
  Plug,
  Workflow,
  Bot,
  DollarSign,
  Activity,
  Briefcase,
  Building2,
  Save,
  RotateCcw,
  Send,
  FileSignature,
  Video,
  FileText,
  Stamp,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';

interface CompanyPageAccessPanelProps {
  companyId: string;
  editable?: boolean;
}

interface FeatureConfig {
  featureKey: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const featureConfigs: FeatureConfig[] = [
  { featureKey: 'page_dashboard', label: 'Dashboard', description: 'Main dashboard with deal overview and widgets', icon: <LayoutDashboard className="h-4 w-4" /> },
  { featureKey: 'page_newsfeed', label: 'News Feed', description: 'Industry news and lender updates', icon: <Newspaper className="h-4 w-4" /> },
  { featureKey: 'page_metrics', label: 'Metrics', description: 'Analytics and performance metrics', icon: <BarChart3 className="h-4 w-4" /> },
  { featureKey: 'page_insights', label: 'Insights', description: 'AI-powered deal insights', icon: <Lightbulb className="h-4 w-4" /> },
  { featureKey: 'page_sales_bd', label: 'Sales & BD', description: 'Sales and business development', icon: <Users className="h-4 w-4" /> },
  { featureKey: 'page_hr', label: 'HR', description: 'Human resources management', icon: <UserCog className="h-4 w-4" /> },
  { featureKey: 'page_operations', label: 'Operations', description: 'Operations management', icon: <Cog className="h-4 w-4" /> },
  { featureKey: 'page_integrations', label: 'Integrations', description: 'Third-party integrations', icon: <Plug className="h-4 w-4" /> },
  { featureKey: 'page_workflows', label: 'Workflows', description: 'Automation workflows', icon: <Workflow className="h-4 w-4" /> },
  { featureKey: 'page_agents', label: 'AI Agents', description: 'AI-powered automation agents', icon: <Bot className="h-4 w-4" /> },
  { featureKey: 'page_finance', label: 'Finance', description: 'Financial management and reporting', icon: <DollarSign className="h-4 w-4" /> },
  { featureKey: 'page_ai_research', label: 'AI Research', description: 'AI-powered research tools', icon: <Sparkles className="h-4 w-4" /> },
  { featureKey: 'page_video_library', label: 'Video Library', description: 'Walkthrough videos and learning resources', icon: <Video className="h-4 w-4" /> },
  { featureKey: 'chat_widget', label: 'AI Chat Widget', description: 'AI search and chat assistant', icon: <Bot className="h-4 w-4" /> },
  { featureKey: 'copilot_widget', label: 'naitive AI', description: 'Floating AI copilot drawer', icon: <Sparkles className="h-4 w-4" /> },
  { featureKey: 'deal_pulse_widgets', label: 'Deal Pulse Widgets', description: 'Health score, days in stage, lender count metrics', icon: <Activity className="h-4 w-4" /> },
  { featureKey: 'page_deal_detail', label: 'Deal Detail Page', description: 'Individual deal detail view', icon: <Briefcase className="h-4 w-4" /> },
  { featureKey: 'page_deal_space', label: 'Deal Space', description: 'AI-powered deal workspace', icon: <Sparkles className="h-4 w-4" /> },
  { featureKey: 'page_deal_management', label: 'Deal Management Tab', description: 'Management tab in deal detail', icon: <Cog className="h-4 w-4" /> },
  { featureKey: 'page_lenders', label: 'Directory', description: 'Master funding source directory', icon: <Building2 className="h-4 w-4" /> },
  { featureKey: 'page_analytics', label: 'Analytics', description: 'Charts, metrics, and performance insights', icon: <BarChart3 className="h-4 w-4" /> },
  { featureKey: 'page_reports', label: 'Reports', description: 'Custom and scheduled reporting', icon: <FileSignature className="h-4 w-4" /> },
  { featureKey: 'lender_matching', label: 'Lender Matching', description: 'AI-powered lender suggestions', icon: <Sparkles className="h-4 w-4" /> },
  { featureKey: 'flex_push', label: 'Push to FLEx', description: 'Publish/unpublish deals to FLEx', icon: <Send className="h-4 w-4" /> },
  { featureKey: 'autofill_deal_space', label: 'Auto-Fill from Deal Space', description: 'AI extraction of write-up fields', icon: <Sparkles className="h-4 w-4" /> },
  { featureKey: 'generate_ai_memo', label: 'Generate AI Memo', description: 'AI-generated lender-ready memo', icon: <FileSignature className="h-4 w-4" /> },
  { featureKey: 'deal_memo', label: 'Deal Memo', description: 'Deal memo button on deal detail pages', icon: <FileText className="h-4 w-4" /> },
  { featureKey: 'agreement_drafter', label: 'Agreement Drafter', description: 'Agreement drafter icon on deal detail pages', icon: <Stamp className="h-4 w-4" /> },
];

export function CompanyPageAccessPanel({ companyId, editable = false }: CompanyPageAccessPanelProps) {
  const queryClient = useQueryClient();
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['company-feature-overrides', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('company_feature_overrides')
        .select('feature_key, is_enabled')
        .eq('company_id', companyId);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      ((data as any[]) ?? []).forEach((row: any) => { map[row.feature_key] = row.is_enabled; });
      return map;
    },
    enabled: !!companyId,
  });

  const currentOverrides = overrides ?? {};
  const hasPending = Object.keys(pendingChanges).length > 0;

  const getEffectiveValue = (featureKey: string): boolean => {
    if (featureKey in pendingChanges) return pendingChanges[featureKey];
    if (featureKey in currentOverrides) return currentOverrides[featureKey];
    return true; // default: enabled (inherits global)
  };

  const isOverridden = (featureKey: string): boolean => {
    return featureKey in pendingChanges || featureKey in currentOverrides;
  };

  const handleToggle = (featureKey: string, checked: boolean) => {
    setPendingChanges(prev => ({ ...prev, [featureKey]: checked }));
  };

  const handleReset = (featureKey: string) => {
    // Mark for removal by setting to a special "reset" state
    setPendingChanges(prev => {
      const next = { ...prev };
      // If currently overridden in DB, we need to delete it
      if (featureKey in currentOverrides) {
        next[featureKey] = undefined as any; // sentinel for deletion
      } else {
        delete next[featureKey];
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const upserts: { company_id: string; feature_key: string; is_enabled: boolean }[] = [];
      const deletions: string[] = [];

      for (const [key, value] of Object.entries(pendingChanges)) {
        if (value === undefined) {
          deletions.push(key);
        } else {
          upserts.push({ company_id: companyId, feature_key: key, is_enabled: value });
        }
      }

      if (deletions.length > 0) {
        const { error } = await (supabase as any)
          .from('company_feature_overrides')
          .delete()
          .eq('company_id', companyId)
          .in('feature_key', deletions);
        if (error) throw error;
      }

      if (upserts.length > 0) {
        const { error } = await (supabase as any)
          .from('company_feature_overrides')
          .upsert(upserts, { onConflict: 'company_id,feature_key' });
        if (error) throw error;
      }

      setPendingChanges({});
      queryClient.invalidateQueries({ queryKey: ['company-feature-overrides', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-feature-overrides-active', companyId] });
      queryClient.invalidateQueries({ queryKey: ['effective-company-id'] });
      toast.success('Company page access updated');
    } catch (error) {
      console.error('Error saving overrides:', error);
      toast.error('Failed to save page access settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAll = () => {
    setPendingChanges({});
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Toggle which pages and features are available for this company. Disabled features will be hidden from their sidebar and UI.
        </p>
        {editable && hasPending && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscardAll} disabled={isSaving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {featureConfigs.map((config) => {
          const enabled = getEffectiveValue(config.featureKey);
          const overridden = isOverridden(config.featureKey);
          const isPending = config.featureKey in pendingChanges;

          return (
            <div
              key={config.featureKey}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                  {config.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{config.label}</span>
                    {overridden && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {isPending ? 'Unsaved' : 'Custom'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {overridden && editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => handleReset(config.featureKey)}
                  >
                    Reset
                  </Button>
                )}
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => handleToggle(config.featureKey, checked)}
                  disabled={!editable}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
