import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Building2, Sparkles } from 'lucide-react';

const FEATURE_FLAGS = [
  { key: 'workflows_enabled', label: 'Workflows', description: 'Enable the Workflows page in the sidebar' },
  { key: 'timeline_view_enabled', label: 'Timeline View', description: 'Enable the timeline view option on the Deals page' },
  { key: 'agreement_icon_visible', label: 'Agreement Drafter', description: 'Show the agreement drafter icon on deal detail pages' },
  { key: 'deal_memo_enabled', label: 'Deal Memo', description: 'Show the deal memo button on deal detail pages' },
  { key: 'sample_deal_on_signup', label: 'Sample Deal on Signup', description: 'Create a sample deal when new users complete onboarding' },
] as const;

type FeatureKey = typeof FEATURE_FLAGS[number]['key'];

/**
 * Assist is a tri-state flag (true / false / null) — null inherits the
 * tenant default (5thline.co => on, all other tenants => off). It is
 * surfaced separately from the simple boolean toggles so admins can see
 * and choose inheritance explicitly.
 */
type AssistOverride = 'inherit' | 'on' | 'off';

function assistValueToChoice(v: boolean | null | undefined): AssistOverride {
  if (v === true) return 'on';
  if (v === false) return 'off';
  return 'inherit';
}
function assistChoiceToValue(c: AssistOverride): boolean | null {
  if (c === 'on') return true;
  if (c === 'off') return false;
  return null;
}

export function CompanyFeaturesPanel() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['admin-all-companies-list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_all_companies');
      if (error) throw error;
      return data as Array<{ id: string; name: string; member_count: number }>;
    },
  });

  const { features, isLoading: featuresLoading, updateFeatures } = useAdminCompanyFeatures(selectedCompanyId);

  const handleToggle = async (key: FeatureKey, value: boolean) => {
    try {
      await updateFeatures.mutateAsync({ [key]: value });
      toast.success(`Feature ${value ? 'enabled' : 'disabled'}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update feature');
    }
  };

  const handleAssistChange = async (choice: AssistOverride) => {
    try {
      await updateFeatures.mutateAsync({ assist_enabled: assistChoiceToValue(choice) });
      toast.success(
        choice === 'inherit'
          ? 'Assist reverted to account default'
          : `Assist ${choice === 'on' ? 'enabled' : 'disabled'} for this company`,
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to update Assist setting');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Select Company</Label>
        <Select value={selectedCompanyId ?? ''} onValueChange={(v) => setSelectedCompanyId(v || null)}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Choose a company..." />
          </SelectTrigger>
          <SelectContent>
            {companiesLoading ? (
              <div className="p-2"><Skeleton className="h-5 w-40" /></div>
            ) : (
              companies?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {c.name}
                    <span className="text-muted-foreground text-xs">({c.member_count} members)</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedCompanyId && (
        <div className="space-y-4">
          {featuresLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            FEATURE_FLAGS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={features?.[key] ?? false}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                  disabled={updateFeatures.isPending}
                />
              </div>
            ))
          )}

          {!featuresLoading && (
            <div className="flex items-start justify-between rounded-lg border border-border p-4 gap-4">
              <div className="space-y-1 min-w-0">
                <Label className="text-sm font-medium inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--outlook-blue))]" />
                  Assist
                </Label>
                <p className="text-xs text-muted-foreground">
                  AI Assist sidebar, thread summaries, and AI draft replies in email.
                  Inherit follows the account default — on for 5th Line accounts, off for all others.
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Current effective state:{' '}
                  <span className="font-medium text-foreground">
                    {assistValueToChoice(features?.assist_enabled) === 'inherit'
                      ? 'Inherited from account default'
                      : assistValueToChoice(features?.assist_enabled) === 'on'
                      ? 'Explicitly enabled for this company'
                      : 'Explicitly disabled for this company'}
                  </span>
                </p>
              </div>
              <Select
                value={assistValueToChoice(features?.assist_enabled)}
                onValueChange={(v) => handleAssistChange(v as AssistOverride)}
                disabled={updateFeatures.isPending}
              >
                <SelectTrigger className="w-[180px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit (default)</SelectItem>
                  <SelectItem value="on">Enabled</SelectItem>
                  <SelectItem value="off">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {!selectedCompanyId && (
        <p className="text-sm text-muted-foreground">Select a company to configure its feature flags.</p>
      )}
    </div>
  );
}
