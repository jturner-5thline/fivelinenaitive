import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, RotateCcw, LayoutDashboard, BarChart3, Eye, Layers, Users } from 'lucide-react';
import { type FPADashboardConfig, DEFAULT_FPA_CONFIG } from '@/hooks/useFPADashboardConfig';
import { useFPATabPermissions, type TabPermissions, type ModuleTabPermissions, type PermissionUser } from '@/hooks/useFPATabPermissions';
import { FPAPermissionsTab } from './FPAPermissionsTab';
import { toast } from 'sonner';

interface FPADashboardConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: FPADashboardConfig;
  onSave: (config: FPADashboardConfig) => Promise<boolean>;
  isSaving: boolean;
}

const TAB_LABELS: Record<string, string> = {
  overview: 'Overview', pnl: 'P&L', balance: 'Balance Sheet', cashflow: 'Cash Flow',
  scenarios: 'Scenarios', collaborate: 'Collaborate', export: 'Board Pack',
};
const CHART_LABELS: Record<string, string> = {
  revenueChart: 'Revenue Chart', marginTrends: 'Margin Trends',
  opexComparison: 'OPEX Comparison', topVendors: 'Top Vendors Table',
  waterfallBridge: 'Revenue Bridge / Waterfall',
};
const ELEMENT_LABELS: Record<string, string> = {
  kpiCards: 'KPI Summary Cards', varianceLegend: 'Variance Legend', plTable: 'P&L Table',
  chartConfigButton: 'Chart Config Button', comparisonFilter: 'Comparison Filter (vs Budget/Forecast)',
  dateRangeFilter: 'Date Range Filter', exportButton: 'Export Button',
};
const SCENARIO_LABELS: Record<string, string> = {
  scenarioModeling: 'Scenario Modeling', sensitivityTable: 'Sensitivity Table', stressTesting: 'Stress Testing',
};

function ToggleSection({
  title, icon: Icon, items, values, onChange,
}: {
  title: string; icon: React.ElementType; items: Record<string, string>;
  values: Record<string, boolean>; onChange: (key: string, value: boolean) => void;
}) {
  const enabledCount = Object.values(values).filter(Boolean).length;
  const totalCount = Object.keys(values).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />{title}
        </Label>
        <Badge variant="secondary" className="text-[9px]">{enabledCount}/{totalCount} enabled</Badge>
      </div>
      {Object.entries(items).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Switch checked={values[key] ?? true} onCheckedChange={(v) => onChange(key, v)} className="scale-75" />
        </div>
      ))}
    </div>
  );
}

export function FPADashboardConfigPanel({ open, onOpenChange, config, onSave, isSaving }: FPADashboardConfigPanelProps) {
  const [local, setLocal] = useState<FPADashboardConfig>(config);
  const {
    permissions, modulePermissions, savePermissions, isSaving: permsSaving, isPermissionsAdmin, currentEmail, companyUsers,
  } = useFPATabPermissions();
  const [localPerms, setLocalPerms] = useState<TabPermissions>(permissions);
  const [localModulePerms, setLocalModulePerms] = useState<ModuleTabPermissions>(modulePermissions);
  const [activeTab, setActiveTab] = useState('visibility');

  useEffect(() => {
    if (open) {
      setLocal(config);
      setLocalPerms(permissions);
      setLocalModulePerms(modulePermissions);
      setActiveTab('visibility');
    }
  }, [open, config, permissions, modulePermissions]);

  const updateSection = <K extends keyof FPADashboardConfig>(section: K, key: string, value: boolean) => {
    setLocal(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  };

  const handleSave = async () => {
    if (activeTab === 'permissions') {
      const ok = await savePermissions(localPerms, localModulePerms);
      if (ok) {
        toast.success('Tab permissions saved');
        onOpenChange(false);
      } else {
        toast.error('Failed to save permissions');
      }
    } else {
      const ok = await onSave(local);
      if (ok) onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Team Dashboard Configuration
          </DialogTitle>
          <DialogDescription>
            Control visibility and access for your team's dashboard.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="visibility" className="flex-1 text-xs gap-1">
              <Eye className="h-3 w-3" /> Visibility
            </TabsTrigger>
            {isPermissionsAdmin && (
              <TabsTrigger value="permissions" className="flex-1 text-xs gap-1">
                <Users className="h-3 w-3" /> Permissions
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="visibility">
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-5 pr-2">
                <ToggleSection title="Tabs" icon={LayoutDashboard} items={TAB_LABELS} values={local.tabs} onChange={(k, v) => updateSection('tabs', k, v)} />
                <Separator />
                <ToggleSection title="Charts" icon={BarChart3} items={CHART_LABELS} values={local.charts} onChange={(k, v) => updateSection('charts', k, v)} />
                <Separator />
                <ToggleSection title="Dashboard Elements" icon={Eye} items={ELEMENT_LABELS} values={local.elements} onChange={(k, v) => updateSection('elements', k, v)} />
                <Separator />
                <ToggleSection title="Scenario Components" icon={Layers} items={SCENARIO_LABELS} values={local.scenarios} onChange={(k, v) => updateSection('scenarios', k, v)} />
              </div>
            </ScrollArea>
          </TabsContent>

          {isPermissionsAdmin && (
            <TabsContent value="permissions">
              <ScrollArea className="max-h-[55vh]">
                <div className="pr-2">
                  <FPAPermissionsTab
                    permissions={localPerms}
                    modulePermissions={localModulePerms}
                    onChange={setLocalPerms}
                    onModuleChange={setLocalModulePerms}
                    currentEmail={currentEmail}
                    companyUsers={companyUsers}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>

        <div className="flex items-center justify-between pt-2">
          {activeTab === 'visibility' ? (
            <Button variant="ghost" size="sm" onClick={() => setLocal(DEFAULT_FPA_CONFIG)} className="gap-1 text-xs">
              <RotateCcw className="h-3 w-3" /> Reset All
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || permsSaving}>
              {(isSaving || permsSaving) ? 'Saving…' : 'Save for Team'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
