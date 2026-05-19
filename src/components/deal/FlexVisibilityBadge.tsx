import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { toast } from '@/hooks/use-toast';
import { isFlexHiddenStage, prettyStageLabel } from '@/lib/flexVisibility';

type Override = 'show' | 'hide' | null;

interface Props {
  dealId: string;
  stage: string | null | undefined;
}

/**
 * Compact badge showing whether a deal is visible on the FLEx marketplace,
 * with an admin popover to force show/hide regardless of stage.
 *
 * Effective visibility:
 *   - override = 'show' → Visible (manual)
 *   - override = 'hide' → Hidden  (manual)
 *   - else if stage is in hidden set → Hidden (by stage)
 *   - else → Visible
 */
export function FlexVisibilityBadge({ dealId, stage }: Props) {
  const [override, setOverride] = useState<Override>(null);
  const [hasFlexHistory, setHasFlexHistory] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<null | 'show' | 'hide' | 'clear'>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: deal }, { data: hist }] = await Promise.all([
        supabase.from('deals').select('flex_visibility_override').eq('id', dealId).maybeSingle(),
        supabase.from('flex_sync_history').select('id').eq('deal_id', dealId).eq('status', 'success').limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setOverride(((deal as any)?.flex_visibility_override ?? null) as Override);
      setHasFlexHistory(!!hist);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Don't render anything if the deal has never been on FLEx — nothing to govern.
  if (!loading && !hasFlexHistory && override == null) return null;

  const stageHides = isFlexHiddenStage(stage);
  const effectiveVisible =
    override === 'show' ? true : override === 'hide' ? false : !stageHides;

  const setOverrideValue = async (value: Override) => {
    setSaving(true);
    const { error } = await supabase
      .from('deals')
      .update({ flex_visibility_override: value } as any)
      .eq('id', dealId);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update FLEx visibility', variant: 'destructive' });
      return;
    }
    setOverride(value);
    toast({
      title: value === 'show' ? 'Forced visible on FLEx' : value === 'hide' ? 'Hidden from FLEx' : 'Override cleared',
      description:
        value === null
          ? `Visibility now follows stage (${prettyStageLabel(stage)}).`
          : value === 'show'
          ? 'This deal will be visible on the FLEx marketplace regardless of stage.'
          : 'This deal has been unpublished from the FLEx marketplace.',
    });
  };

  const label = loading
    ? 'FLEx…'
    : override === 'show'
    ? 'Visible on FLEx (manual)'
    : override === 'hide'
    ? 'Hidden from FLEx (manual)'
    : effectiveVisible
    ? 'Visible on FLEx'
    : `Hidden from FLEx (stage: ${prettyStageLabel(stage)})`;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : effectiveVisible ? (
              <Eye className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Badge
              variant="outline"
              className={
                effectiveVisible
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 px-1.5 h-5 text-[10px]'
                  : 'border-border/60 bg-muted/40 text-muted-foreground px-1.5 h-5 text-[10px]'
              }
            >
              {label}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-2">
          <div className="text-xs font-semibold">FLEx marketplace visibility</div>
          <div className="text-[11px] text-muted-foreground">
            Stage rule: {stageHides ? 'hidden' : 'visible'} ({prettyStageLabel(stage) || 'n/a'}). Manual
            override wins over stage.
          </div>
          <div className="flex flex-col gap-1.5 pt-1">
            <Button
              size="sm"
              variant={override === 'show' ? 'default' : 'outline'}
              className="h-7 justify-start text-xs"
              disabled={saving}
              onClick={() => setConfirmOpen('show')}
            >
              <Eye className="h-3.5 w-3.5 mr-2" /> Force visible on FLEx
            </Button>
            <Button
              size="sm"
              variant={override === 'hide' ? 'default' : 'outline'}
              className="h-7 justify-start text-xs"
              disabled={saving}
              onClick={() => setConfirmOpen('hide')}
            >
              <EyeOff className="h-3.5 w-3.5 mr-2" /> Force hidden from FLEx
            </Button>
            {override != null && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 justify-start text-xs text-muted-foreground"
                disabled={saving}
                onClick={() => setConfirmOpen('clear')}
              >
                Clear override (follow stage)
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmOpen !== null} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmOpen === 'show' && 'Force this deal visible on FLEx?'}
              {confirmOpen === 'hide' && 'Force this deal hidden from FLEx?'}
              {confirmOpen === 'clear' && 'Clear FLEx visibility override?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOpen === 'show' &&
                'The deal will appear on the FLEx marketplace regardless of its stage. Use this only for exceptions.'}
              {confirmOpen === 'hide' &&
                'The deal will be unpublished from the FLEx marketplace immediately. Lenders will no longer see it or be able to open its detail page.'}
              {confirmOpen === 'clear' &&
                'Visibility will go back to following the deal stage. Hidden stages will hide the deal automatically.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const value: Override =
                  confirmOpen === 'show' ? 'show' : confirmOpen === 'hide' ? 'hide' : null;
                setConfirmOpen(null);
                await setOverrideValue(value);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}