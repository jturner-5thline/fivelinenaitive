import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupportSession } from '@/hooks/useSupportSession';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings, Users, Newspaper, BarChart3, Plug, ChevronDown, ChevronRight,
  Save, RotateCcw, Pencil, Trash2, Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { AdminCompanyOverrideProvider } from '@/contexts/AdminCompanyOverrideContext';
import type { Company } from '@/hooks/useCompany';
import { DisclaimerSettings } from '@/components/settings/DisclaimerSettings';
import { DealStagesSettings } from '@/components/settings/DealStagesSettings';
import { LenderScoreSettings } from '@/components/settings/LenderScoreSettings';
import { GammaTemplatesSettings } from '@/components/settings/GammaTemplatesSettings';
import { DefaultChecklistSettings } from '@/components/settings/DefaultChecklistSettings';

interface CompanyConfigOverviewProps {
  companyId: string;
  editable?: boolean;
}

// Helper to render JSON config as readable key-value pairs
function ConfigBlock({ label, data, onEdit }: {
  label: string;
  data: unknown;
  onEdit?: (newData: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const isEmpty = data === null || data === undefined || (typeof data === 'object' && Object.keys(data as object).length === 0);

  const handleStartEdit = () => {
    const initial = (data === null || data === undefined)
      ? '{}'
      : (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    setEditValue(initial);
    setEditing(true);
  };

  const handleSave = () => {
    // For string fields (like disclaimer), allow plain text
    if (onEdit) {
      try {
        JSON.parse(editValue); // validate as JSON
        onEdit(editValue);
        setEditing(false);
      } catch {
        // If it's not valid JSON, pass as quoted string
        try {
          const asString = JSON.stringify(editValue);
          JSON.parse(asString);
          onEdit(asString);
          setEditing(false);
        } catch {
          toast.error('Invalid JSON');
        }
      }
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {onEdit && !editing && (
          <Button variant="ghost" size="sm" className="h-6 px-2 gap-1" onClick={handleStartEdit}>
            <Pencil className="h-3 w-3" />
            {isEmpty && <span className="text-xs">Add</span>}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="font-mono text-xs min-h-[120px]"
            placeholder="Enter JSON value..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <RotateCcw className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      ) : isEmpty ? (
        <p className="text-xs text-muted-foreground italic">Not configured</p>
      ) : typeof data === 'object' ? (
        <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm">{String(data)}</p>
      )}
    </div>
  );
}

function SectionCollapsible({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-3 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CompanyConfigOverview({ companyId, editable = false }: CompanyConfigOverviewProps) {
  const { logAction } = useSupportSession();
  const queryClient = useQueryClient();

  // Fetch company data for admin override context
  const { data: companyData } = useQuery({
    queryKey: ['company-config-company-data', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return data as Company;
    },
    enabled: !!companyId,
  });

  // 1. Company settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['company-config-settings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      // Log the view
      logAction?.('view_config', 'settings', companyId);
      return data;
    },
    enabled: !!companyId,
  });

  // 2. Members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['company-config-members', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_company_members', { _company_id: companyId });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // 3. News preferences (for all company members)
  const memberUserIds = (members ?? []).map((m: any) => m.user_id);
  const { data: newsPrefs, isLoading: newsLoading } = useQuery({
    queryKey: ['company-config-news-prefs', companyId, memberUserIds.join(',')],
    queryFn: async () => {
      if (memberUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from('news_preferences')
        .select('*')
        .in('user_id', memberUserIds);
      if (error) throw error;
      return data;
    },
    enabled: memberUserIds.length > 0,
  });

  // 4. Custom metrics
  const { data: customMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['company-config-metrics', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_metrics')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // 5. Claap integration config
  const { data: claapConfig } = useQuery({
    queryKey: ['company-config-claap', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('claap_integration_config')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // 6. QuickBooks tokens (connection status)
  const { data: qbTokens } = useQuery({
    queryKey: ['company-config-qb', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quickbooks_tokens')
        .select('id, company_id, token_type, expires_at')
        .eq('company_id', companyId);
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const handleUpdateSettings = async (field: string, rawValue: string) => {
    try {
      if (!settings) {
        // Create settings first
        const parsed = JSON.parse(rawValue);
        const { error } = await supabase
          .from('company_settings')
          .insert({ company_id: companyId, [field]: parsed as Json });
        if (error) throw error;
      } else {
        const parsed = JSON.parse(rawValue);
        const { error } = await supabase
          .from('company_settings')
          .update({ [field]: parsed as Json })
          .eq('company_id', companyId);
        if (error) throw error;
      }

      logAction?.('update_config', 'settings', companyId, { field });
      queryClient.invalidateQueries({ queryKey: ['company-config-settings', companyId] });
      toast.success(`Updated ${field.replace(/_/g, ' ')}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const handleUpdateDisclaimerText = async (value: string) => {
    try {
      if (!settings) {
        const { error } = await supabase
          .from('company_settings')
          .insert({ company_id: companyId, disclaimer: value });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .update({ disclaimer: value })
          .eq('company_id', companyId);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['company-config-settings', companyId] });
      toast.success('Disclaimer updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update disclaimer');
    }
  };

  const handleInitializeSettings = async () => {
    try {
      const { error } = await supabase
        .from('company_settings')
        .insert({ company_id: companyId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['company-config-settings', companyId] });
      toast.success('Company settings initialized');
    } catch (err: any) {
      toast.error(err.message || 'Failed to initialize');
    }
  };

  const handleDeleteMetric = async (metricId: string) => {
    try {
      const { error } = await (supabase.from('custom_metrics') as any).delete().eq('id', metricId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['company-config-metrics', companyId] });
      toast.success('Metric deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete metric');
    }
  };

  const handleUpdateClaapConfig = async (field: string, rawValue: string) => {
    if (!claapConfig) return;
    try {
      const parsed = JSON.parse(rawValue);
      const { error } = await supabase
        .from('claap_integration_config')
        .update({ [field]: parsed })
        .eq('company_id', companyId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['company-config-claap', companyId] });
      toast.success(`Updated Claap ${field.replace(/_/g, ' ')}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const handleToggleClaap = async () => {
    if (!claapConfig) {
      // Create config
      try {
        const { error } = await supabase
          .from('claap_integration_config')
          .insert({ company_id: companyId, is_active: true });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['company-config-claap', companyId] });
        toast.success('Claap integration enabled');
      } catch (err: any) {
        toast.error(err.message || 'Failed to enable');
      }
    } else {
      try {
        const { error } = await supabase
          .from('claap_integration_config')
          .update({ is_active: !claapConfig.is_active })
          .eq('company_id', companyId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['company-config-claap', companyId] });
        toast.success(claapConfig.is_active ? 'Claap disabled' : 'Claap enabled');
      } catch (err: any) {
        toast.error(err.message || 'Failed to toggle');
      }
    }
  };

  const isLoading = settingsLoading || membersLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // Wrap settings components in admin override if company data is available
  const renderWithOverride = (children: React.ReactNode) => {
    if (!companyData) return <Skeleton className="h-12 w-full" />;
    return (
      <AdminCompanyOverrideProvider company={companyData}>
        {children}
      </AdminCompanyOverrideProvider>
    );
  };

  return (
    <ScrollArea className="max-h-[600px]">
      <div className="space-y-1 pr-4">
        {/* Company Settings - Using actual settings UI components */}
        <SectionCollapsible title="Company Settings" icon={Settings} defaultOpen>
          <Tabs defaultValue="settings-ui" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="settings-ui" className="text-xs">Settings</TabsTrigger>
              <TabsTrigger value="advanced-json" className="text-xs">Advanced (JSON)</TabsTrigger>
            </TabsList>

            <TabsContent value="settings-ui" className="space-y-4 m-0">
              {renderWithOverride(
                <div className="space-y-4">
                  <DisclaimerSettings isAdmin={editable} />
                  <DealStagesSettings isAdmin={editable} />
                  <LenderScoreSettings isAdmin={editable} />
                  <GammaTemplatesSettings isAdmin={editable} />
                  <DefaultChecklistSettings isAdmin={editable} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced-json" className="space-y-4 m-0">
              {!settings && (
                <p className="text-xs text-muted-foreground italic mb-3">No settings row yet — editing any field will auto-create it.</p>
              )}
              <ConfigBlock
                label="Deal Info Layout"
                data={settings?.deal_info_layout ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('deal_info_layout', v) : undefined}
              />
              <ConfigBlock
                label="Deal Panel Layout"
                data={settings?.deal_panel_layout ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('deal_panel_layout', v) : undefined}
              />
              <ConfigBlock
                label="Deals Widgets Config"
                data={settings?.deals_widgets_config ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('deals_widgets_config', v) : undefined}
              />
              <ConfigBlock
                label="Deals Special Widgets"
                data={settings?.deals_special_widgets ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('deals_special_widgets', v) : undefined}
              />
              <ConfigBlock
                label="Funding Source Matching Config"
                data={settings?.lender_matching_config ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('lender_matching_config', v) : undefined}
              />
              <ConfigBlock
                label="FP&A Dashboard Config"
                data={settings?.fpa_dashboard_config ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('fpa_dashboard_config', v) : undefined}
              />
              <ConfigBlock
                label="Data Room Default Checklists"
                data={settings?.data_room_default_checklists ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('data_room_default_checklists', v) : undefined}
              />
              <ConfigBlock
                label="Permission Settings"
                data={settings?.permission_settings ?? null}
                onEdit={editable ? (v) => handleUpdateSettings('permission_settings', v) : undefined}
              />
              <ConfigBlock
                label="Default Deal Stage ID"
                data={settings?.default_deal_stage_id ?? null}
              />
            </TabsContent>
          </Tabs>
        </SectionCollapsible>

        {/* Members */}
        <SectionCollapsible title={`Members (${members?.length ?? 0})`} icon={Users}>
          {(members ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No members</p>
          ) : (
            <div className="space-y-1.5">
              {(members as any[]).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1">
                  <div>
                    <span className="font-medium">{m.display_name || 'Unnamed'}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{m.email}</span>
                  </div>
                  <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="text-xs">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCollapsible>

        {/* Integrations */}
        <SectionCollapsible title="Integrations" icon={Plug}>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Claap</span>
              <div className="flex items-center gap-2">
                <Badge variant={claapConfig?.is_active ? 'default' : 'secondary'} className="text-xs">
                  {claapConfig ? (claapConfig.is_active ? 'Active' : 'Inactive') : 'Not configured'}
                </Badge>
                {editable && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleToggleClaap}>
                    {claapConfig?.is_active ? 'Disable' : 'Enable'}
                  </Button>
                )}
              </div>
            </div>
            {claapConfig && (
              <div className="space-y-2">
                <ConfigBlock
                  label="Internal Domains"
                  data={claapConfig.internal_domains}
                  onEdit={editable ? (v) => handleUpdateClaapConfig('internal_domains', v) : undefined}
                />
                <ConfigBlock
                  label="Min Duration (seconds)"
                  data={claapConfig.min_duration_seconds}
                  onEdit={editable ? (v) => handleUpdateClaapConfig('min_duration_seconds', v) : undefined}
                />
                <ConfigBlock
                  label="Task Expiry (days)"
                  data={claapConfig.task_expiry_days}
                  onEdit={editable ? (v) => handleUpdateClaapConfig('task_expiry_days', v) : undefined}
                />
                <ConfigBlock
                  label="Excluded Title Patterns"
                  data={claapConfig.excluded_title_patterns}
                  onEdit={editable ? (v) => handleUpdateClaapConfig('excluded_title_patterns', v) : undefined}
                />
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span>QuickBooks</span>
              <Badge variant={(qbTokens?.length ?? 0) > 0 ? 'default' : 'secondary'} className="text-xs">
                {(qbTokens?.length ?? 0) > 0 ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
          </div>
        </SectionCollapsible>

        {/* News Preferences */}
        <SectionCollapsible title={`News Preferences (${newsPrefs?.length ?? 0} users)`} icon={Newspaper}>
          {newsLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (newsPrefs ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No news preferences configured</p>
          ) : (
            <div className="space-y-3">
              {(newsPrefs as any[]).map((pref) => {
                const member = (members as any[])?.find((m: any) => m.user_id === pref.user_id);
                return (
                  <div key={pref.id} className="space-y-1">
                    <span className="text-xs font-medium">{member?.display_name ?? pref.user_id.slice(0, 8)}</span>
                    <ConfigBlock label="Preferences" data={{
                      industries: pref.industries,
                      keywords: pref.keywords,
                      sources: pref.sources,
                      layout: pref.default_layout,
                      digest: pref.email_digest_frequency,
                    }} />
                  </div>
                );
              })}
            </div>
          )}
        </SectionCollapsible>

        {/* Custom Metrics */}
        <SectionCollapsible title={`Custom Metrics (${customMetrics?.length ?? 0})`} icon={BarChart3}>
          {metricsLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (customMetrics ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No custom metrics</p>
          ) : (
            <div className="space-y-2">
              {(customMetrics as any[]).map((m) => (
                <div key={m.id} className="text-sm border rounded-md p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.name}</div>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteMetric(m.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  <ConfigBlock
                    label="Formula"
                    data={m.formula}
                    onEdit={editable ? async (v) => {
                      try {
                        const parsed = JSON.parse(v);
                        const { error } = await (supabase.from('custom_metrics') as any)
                          .update({ formula: parsed })
                          .eq('id', m.id);
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ['company-config-metrics', companyId] });
                        toast.success('Formula updated');
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to update formula');
                      }
                    } : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCollapsible>
      </div>
    </ScrollArea>
  );
}
