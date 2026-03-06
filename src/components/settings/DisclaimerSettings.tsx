import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileWarning, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export function DisclaimerSettings({ isAdmin }: { isAdmin: boolean }) {
  const { company } = useCompany();
  const [disclaimer, setDisclaimer] = useState('');
  const [originalDisclaimer, setOriginalDisclaimer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('company_settings')
        .select('disclaimer')
        .eq('company_id', company.id)
        .maybeSingle();
      const val = (data as any)?.disclaimer || '';
      setDisclaimer(val);
      setOriginalDisclaimer(val);
      setIsLoading(false);
    })();
  }, [company?.id]);

  const hasChanges = disclaimer !== originalDisclaimer;

  const handleSave = async () => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('company_settings')
          .update({ disclaimer } as any)
          .eq('company_id', company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({ company_id: company.id, disclaimer } as any);
        if (error) throw error;
      }

      setOriginalDisclaimer(disclaimer);
      toast.success('Disclaimer saved');
    } catch (error) {
      console.error('Error saving disclaimer:', error);
      toast.error('Failed to save disclaimer');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Deal Write-Up Disclaimer</CardTitle>
        </div>
        <CardDescription>
          Set a company-wide disclaimer that will be included with all deal write-ups when published to FLEx.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Textarea
              value={disclaimer}
              onChange={(e) => setDisclaimer(e.target.value)}
              placeholder="Enter disclaimer text that will appear on all deal write-ups..."
              className="min-h-[120px]"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                This disclaimer applies to all deals across your company.
              </p>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Button variant="ghost" size="sm" onClick={() => setDisclaimer(originalDisclaimer)}>
                    Discard
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
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
