import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, UserCog, Wrench, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { startImpersonation } from '@/lib/adminImpersonation';

export interface ImpersonateTarget {
  userId: string;
  email: string;
  fullName: string | null;
  companyId: string;
  companyName: string;
  seededOk: boolean;
  seededAt: string | null;
}

type RepairPayload = {
  status?: 'ok' | 'warning' | 'fatal';
  message?: string;
  canOpenWorkspace?: boolean;
  warnings?: string[];
  missingCounts?: Record<string, number>;
  createdCounts?: Record<string, number>;
  repairPerformed?: boolean;
  error?: string;
};

async function payloadFromFunctionError(error: unknown): Promise<RepairPayload | null> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      return (await error.context.clone().json()) as RepairPayload;
    } catch {
      return null;
    }
  }
  const maybe = error as { name?: string; context?: Response } | null;
  if (maybe?.name === 'FunctionsHttpError' && maybe.context instanceof Response) {
    try {
      return (await maybe.context.clone().json()) as RepairPayload;
    } catch {
      return null;
    }
  }
  return null;
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
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (!target) return null;

  const handleOpen = async (opts?: { skipRepair?: boolean; forceRepair?: boolean }) => {
    if (busy) return;
    setInlineError(null);
    setBusy(true);
    try {
      if (!opts?.skipRepair && (opts?.forceRepair || repairFirst || !target.seededOk)) {
        const { data, error } = await supabase.functions.invoke('repair-demo-tenant', {
          body: { companyId: target.companyId },
        });
        const payload = data ? ((data as RepairPayload)) : (await payloadFromFunctionError(error));
        if (error && !payload?.status) {
          setInlineError(`Repair failed: ${error.message}`);
          setBusy(false);
          return;
        }
        if (payload?.status === 'fatal' || payload?.canOpenWorkspace === false) {
          const missing = payload.missingCounts && Object.keys(payload.missingCounts).length > 0
            ? ` Missing: ${JSON.stringify(payload.missingCounts)}`
            : '';
          setInlineError(
            `${payload.message ?? 'Repair could not complete. Cannot open workspace.'}${missing}`,
          );
          setBusy(false);
          return;
        }
        if (payload.status === 'warning') {
          const created = payload.createdCounts
            ? Object.entries(payload.createdCounts).filter(([, v]) => (v ?? 0) > 0)
            : [];
          toast.warning('Demo workspace opened with warnings', {
            description: created.length
              ? `Reseeded: ${created.map(([k, v]) => `${k}=${v}`).join(', ')}`
              : payload.message,
          });
        }
        onAfterRepair?.();
      }

      const res = await startImpersonation({
        targetUserId: target.userId,
        targetEmail: target.email,
        reason: 'admin/demo-metrics:open-demo-workspace',
        sourceSurface: 'admin/demo-metrics',
      });
      if (res.ok !== true) {
        setInlineError((res as { error: string }).error);
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
      const payload = await payloadFromFunctionError(e);
      setInlineError(payload?.message ?? (e instanceof Error ? e.message : 'Failed to open demo workspace'));
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
        sourceSurface: 'admin/demo-metrics',
      });
      if (res.ok !== true) { toast.error((res as { error: string }).error); return; }
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

        {inlineError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div className="space-y-1 flex-1">
              <div className="font-medium text-destructive">Could not complete</div>
              <div className="text-destructive/90 break-words">{inlineError}</div>
              <div className="text-xs text-muted-foreground pt-1">
                Try Repair again, open without repair, or copy a magic link.
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={handleCopyLink} disabled={busy}>Copy magic link</Button>
          {inlineError ? (
            <>
              <Button variant="outline" onClick={() => handleOpen({ skipRepair: true })} disabled={busy}>
                Open without Repair
              </Button>
              <Button onClick={() => handleOpen({ forceRepair: true })} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Retry Repair
              </Button>
            </>
          ) : (
            <Button onClick={() => handleOpen()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {repairFirst || !target.seededOk ? 'Repair + Open' : 'Open demo workspace'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}