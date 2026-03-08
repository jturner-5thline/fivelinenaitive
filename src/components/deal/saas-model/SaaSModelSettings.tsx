import { useState } from 'react';
import type { SaaSModelData, SaaSModelSettings as SaaSModelSettingsType } from './types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Check, Trash2 } from 'lucide-react';

interface Props {
  model: SaaSModelData;
  updateModel: (updater: (prev: SaaSModelData) => SaaSModelData) => void;
  dealId: string;
}

export function SaaSModelSettings({ model, updateModel, dealId }: Props) {
  const [localSettings, setLocalSettings] = useState<SaaSModelSettingsType>({ ...model.settings });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateModel(prev => ({
      ...prev,
      settings: { ...localSettings },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Settings saved');
  };

  const handleDeleteModel = async () => {
    try {
      await supabase.from('deal_saas_model' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_sensitivity' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_lenders' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_mappings' as any).delete().eq('deal_id', dealId);
      toast.success('Financial model data deleted');
      window.location.reload();
    } catch {
      toast.error('Failed to delete model data');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-border/30">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-semibold">Model Settings</h3>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input className="h-8 text-sm" value={localSettings.companyName}
                onChange={e => setLocalSettings(s => ({ ...s, companyName: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Business Model</Label>
                <Select value={localSettings.businessModel} onValueChange={v => setLocalSettings(s => ({ ...s, businessModel: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SaaS', 'Subscription', 'Marketplace', 'Usage-Based', 'Hybrid'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Customer Base</Label>
                <Select value={localSettings.customerBase} onValueChange={v => setLocalSettings(s => ({ ...s, customerBase: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['B2B', 'B2C', 'B2B2C'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Actuals Thru Date</Label>
                <Input type="date" className="h-8 text-xs" value={localSettings.actualThruDate}
                  onChange={e => setLocalSettings(s => ({ ...s, actualThruDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Financial Quality</Label>
                <Select value={localSettings.financialQuality} onValueChange={v => setLocalSettings(s => ({ ...s, financialQuality: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['CPA Reviewed', 'Audited', 'Company Prepared'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button size="sm" onClick={handleSave} className="gap-1.5">
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mb-4">
            This will permanently delete all financial model data, mappings, sensitivity scenarios, and lender configurations for this deal. This cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Delete Model Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Financial Model?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all financial model data for "{model.settings.companyName}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
