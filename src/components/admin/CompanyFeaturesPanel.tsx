import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';

const FEATURE_FLAGS = [
  { key: 'workflows_enabled', label: 'Workflows', description: 'Enable the Workflows page in the sidebar' },
  { key: 'timeline_view_enabled', label: 'Timeline View', description: 'Enable the timeline view option on the Deals page' },
  { key: 'agreement_icon_visible', label: 'Agreement Drafter', description: 'Show the agreement drafter icon on deal detail pages' },
  { key: 'deal_memo_enabled', label: 'Deal Memo', description: 'Show the deal memo button on deal detail pages' },
  { key: 'sample_deal_on_signup', label: 'Sample Deal on Signup', description: 'Create a sample deal when new users complete onboarding' },
] as const;

type FeatureKey = typeof FEATURE_FLAGS[number]['key'];

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
        </div>
      )}

      {!selectedCompanyId && (
        <p className="text-sm text-muted-foreground">Select a company to configure its feature flags.</p>
      )}
    </div>
  );
}
