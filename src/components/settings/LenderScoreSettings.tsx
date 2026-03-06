import { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, ChevronDown, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

interface LenderScoreSettingsProps {
  isAdmin?: boolean;
}

export function LenderScoreSettings({ isAdmin = true }: LenderScoreSettingsProps) {
  const { company } = useCompany();
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
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
      if (config && typeof config.lender_score === 'object' && config.lender_score !== null) {
        const sc = config.lender_score as { enabled?: boolean };
        const val = sc.enabled !== false;
        setEnabled(val);
        setSavedEnabled(val);
      }
    })();
  }, [company?.id]);

  const hasChanges = enabled !== savedEnabled;

  const handleSave = async () => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('company_settings')
        .select('deals_special_widgets')
        .eq('company_id', company.id)
        .single();

      const current = (existing?.deals_special_widgets as Record<string, unknown>) || {};
      const merged = { ...current, lender_score: { enabled } };

      const { error } = await supabase
        .from('company_settings')
        .update({ deals_special_widgets: merged as any })
        .eq('company_id', company.id);

      if (error) throw error;
      setSavedEnabled(enabled);
      toast({ title: 'Lender score settings updated', description: enabled ? 'Score tags are now visible.' : 'Score tags are now hidden.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save', description: 'Could not update lender score settings.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Hash className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Lender Score Tags</CardTitle>
                  <CardDescription>Toggle the 1/2/3 interest score tags on lender cards and the lender pop-up</CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only admins can modify these settings.</p>
            )}

            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
              <div>
                <Label className="text-sm font-medium cursor-pointer" htmlFor="lender-score-toggle">
                  Enable Lender Score
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show the 1 (Most Interested) / 2 (Moderate) / 3 (Least Interested) score selector in the lender detail pop-up and score badges on lender cards.
                </p>
              </div>
              <Switch
                id="lender-score-toggle"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!isAdmin}
              />
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
                  onClick={() => setEnabled(savedEnabled)}
                  disabled={!hasChanges}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
