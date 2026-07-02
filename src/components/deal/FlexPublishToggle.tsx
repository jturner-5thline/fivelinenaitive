import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isFlexHiddenStage } from '@/lib/flexVisibility';

interface Props {
  dealId: string;
  stage: string | null | undefined;
}

/**
 * Simple on/off toggle in the Write-Up header that unpublishes a deal from
 * the FLEx marketplace. Backed by `deals.flex_visibility_override`:
 *   - ON  → override cleared (null), visibility follows stage rules
 *   - OFF → override='hide', deal is removed from FLEx Deals page
 */
export function FlexPublishToggle({ dealId, stage }: Props) {
  const [override, setOverride] = useState<'show' | 'hide' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('deals')
        .select('flex_visibility_override')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled) return;
      setOverride(((data as any)?.flex_visibility_override ?? null) as any);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  const stageHides = isFlexHiddenStage(stage);
  // Toggle reflects "is this deal published on FLEx?"
  const isPublished =
    override === 'show' ? true : override === 'hide' ? false : !stageHides;

  const applyOverride = async (value: 'show' | 'hide' | null) => {
    setSaving(true);
    const { error } = await supabase
      .from('deals')
      .update({ flex_visibility_override: value } as any)
      .eq('id', dealId);
    setSaving(false);
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update FLEx publish status',
        variant: 'destructive',
      });
      return;
    }
    setOverride(value);
    toast({
      title: value === 'hide' ? 'Unpublished from FLEx' : 'Published to FLEx',
      description:
        value === 'hide'
          ? 'This deal has been removed from the FLEx Deals page.'
          : 'This deal is now visible on the FLEx marketplace.',
    });
  };

  const handleChange = (checked: boolean) => {
    if (checked) {
      // Turning ON → publish. If stage hides it, force show; else clear override.
      applyOverride(stageHides ? 'show' : null);
    } else {
      setConfirmUnpublish(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : isPublished ? (
          <Eye className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Label
          htmlFor={`flex-publish-${dealId}`}
          className="text-xs font-medium cursor-pointer select-none"
        >
          {isPublished ? 'Published on FLEx' : 'Unpublished from FLEx'}
        </Label>
        <Switch
          id={`flex-publish-${dealId}`}
          checked={isPublished}
          onCheckedChange={handleChange}
          disabled={loading || saving}
        />
      </div>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this deal from FLEx?</AlertDialogTitle>
            <AlertDialogDescription>
              This deal will be removed from the FLEx Deals page immediately.
              Lenders will no longer see it or be able to open its detail page.
              You can republish it any time by toggling this back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmUnpublish(false);
                applyOverride('hide');
              }}
            >
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}