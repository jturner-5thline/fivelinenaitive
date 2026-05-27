import { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, ChevronDown, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { GAMMA_TEMPLATES } from '@/components/deal/gamma/GammaTemplateLibrary';

interface GammaTemplatesSettingsProps {
  isAdmin?: boolean;
}

export function GammaTemplatesSettings({ isAdmin = true }: GammaTemplatesSettingsProps) {
  const { company } = useCompany();
  const [enabledIds, setEnabledIds] = useState<string[]>(GAMMA_TEMPLATES.map(t => t.id));
  const [savedIds, setSavedIds] = useState<string[]>(GAMMA_TEMPLATES.map(t => t.id));
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('deals_special_widgets')
        .eq('company_id', company.id)
        .single();
      
      const config = data?.deals_special_widgets as Record<string, unknown> | null;
      if (config && Array.isArray(config.gamma_enabled_templates)) {
        setEnabledIds(config.gamma_enabled_templates as string[]);
        setSavedIds(config.gamma_enabled_templates as string[]);
      }
    })();
  }, [company?.id]);

  const hasChanges = JSON.stringify([...enabledIds].sort()) !== JSON.stringify([...savedIds].sort());

  const handleToggle = (id: string) => {
    setEnabledIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      // Fetch current value first to merge
      const { data: existing } = await supabase
        .from('company_settings')
        .select('deals_special_widgets')
        .eq('company_id', company.id)
        .single();

      const current = (existing?.deals_special_widgets as Record<string, unknown>) || {};
      const merged = { ...current, gamma_enabled_templates: enabledIds };

      const { error } = await supabase
        .from('company_settings')
        .update({ deals_special_widgets: merged as any })
        .eq('company_id', company.id);

      if (error) throw error;
      setSavedIds(enabledIds);
      toast({ title: 'Gamma templates updated', description: `${enabledIds.length} template(s) enabled.` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save', description: 'Could not update Gamma template settings.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEnabledIds(savedIds);
  };

  return (
    
      <Card>
        
          <CardHeader className=" rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Presentation className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Gamma Templates</CardTitle>
                  <CardDescription>Choose which presentation templates are available in the Gamma tab</CardDescription>
                </div>
              </div>
              
            </div>
          </CardHeader>
        

        
          <CardContent className="space-y-4 pt-0">
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only admins can modify these settings.</p>
            )}

            <div className="space-y-1">
              {GAMMA_TEMPLATES.map((tpl) => {
                const enabled = enabledIds.includes(tpl.id);
                return (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        <tpl.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium cursor-pointer" htmlFor={`gamma-tpl-${tpl.id}`}>
                          {tpl.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{tpl.description}</p>
                      </div>
                    </div>
                    <Switch
                      id={`gamma-tpl-${tpl.id}`}
                      checked={enabled}
                      onCheckedChange={() => handleToggle(tpl.id)}
                      disabled={!isAdmin}
                    />
                  </div>
                );
              })}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className="gap-1.5"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={!hasChanges}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  {enabledIds.length} of {GAMMA_TEMPLATES.length} enabled
                </span>
              </div>
            )}
          </CardContent>
        
      </Card>
    
  );
}
