import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, UserCog, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { snapshotAdminSession, startImpersonation } from '@/lib/adminImpersonation';

export interface ImpersonateTarget {
  userId: string;
  email: string;
  fullName: string | null;
  companyId: string;
  companyName: string;
  seededOk: boolean;
  seededAt: string | null;
}

export function ImpersonateDemoDialog({
  open, onOpenChange, target, onAfterRepair,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: ImpersonateTarget | null;
  onAfterRepair?: () => void;
}) {
  const [newTab, setNewTab] = useState(true);
  const [repairFirst, setRepairFirst] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const handleOpen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (repairFirst || !target.seededOk) {
        const { error } = await supabase.functions.invoke('repair-demo-tenant', {
          body: { companyId: target.companyId },
        });
        if (error) {
          toast.error(`Repair failed: ${error.message}`);
          setBusy(false);
          return;
        }
        onAfterRepair?.();
      }

      // Same-tab handoff needs to snapshot the admin session first so we
      // can restore it via "Return to Admin". New-tab path leaves the
      // admin tab fully intact, no snapshot required.
      if (!newTab) {
        await snapshotAdminSession(window.location.pathname + window.location.search);
      }

      const res = await startImpersonation({
        targetUserId: target.userId,
        targetEmail: target.email,
        reason: 'admin/demo-metrics:open-demo-workspace',
      });
      if ('error' in res) {
        toast.error(res.error);
        setBusy(false);
        return;
      }
      if (newTab) {
        window.open(res.actionLink, '_blank', 'noopener');
        toast.success(`Opened ${target.email} in new tab`);
        setBusy(false);
        onOpenChange(false);
      } else {
        window.location.href = res.actionLink;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open demo workspace');
      setBusy(false);
    }
  };

  const handleCopyLink = async () => {
    setBusy(true);
    try {
      const res = await startImpersonation({
        targetUserId: target.userId,
        targetEmail: target.email,
        reason: 'admin/demo-metrics:copy-magic-link',
      });
      if ('error' in res) { toast.error(res.error); return; }
      await navigator.clipboard.writeText(res.actionLink);
      toast.success('Magic sign-in link copied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Open demo workspace?
          </DialogTitle>
          <DialogDescription>
            You are about to switch into this demo user and see exactly what they see.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div><span className="text-muted-foreground">User: </span>{target.fullName || target.email}</div>
          <div><span className="text-muted-foreground">Email: </span>{target.email}</div>
          <div><span className="text-muted-foreground">Demo account: </span>{target.companyName}</div>
          <div>
            <span className="text-muted-foreground">Seed: </span>
            {target.seededOk ? (
              <span className="text-emerald-400">healthy</span>
            ) : (
              <span className="text-amber-300">incomplete — repair recommended</span>
            )}
            {target.seededAt && (
              <span className="text-muted-foreground"> · provisioned {new Date(target.seededAt).toLocaleString()}</span>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={newTab} onCheckedChange={(v) => setNewTab(v === true)} />
            Open in a new tab (recommended — keeps your admin session intact)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={repairFirst} onCheckedChange={(v) => setRepairFirst(v === true)} />
            <Wrench className="h-3.5 w-3.5" /> Repair demo data before opening
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={handleCopyLink} disabled={busy}>Copy magic link</Button>
          <Button onClick={handleOpen} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {repairFirst || !target.seededOk ? 'Repair + Open' : 'Open demo workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}