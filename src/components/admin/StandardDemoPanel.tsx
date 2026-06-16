import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, Wrench, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_PRIMARY_EMAIL } from '@/lib/demoAccount';

/**
 * TEMPLATE Demo Workspace — the single canonical admin preview/testing tenant
 * that also serves as the framework/source for all future demo accounts.
 *
 * Resolution:
 *   - Workspace : `companies.id = DEMO_COMPANY_ID` — the canonical TEMPLATE
 *     workspace. Resolved server-side in `open-standard-demo-workspace` and
 *     never derived from a selected table row, tenant, or seeded account.
 *   - Identity  : `DEMO_PRIMARY_EMAIL` (demo@5thline.co) — the single
 *     internal-only demo auth user that enters the TEMPLATE workspace.
 *
 * Per-user impersonation in the table below is a secondary diagnostic tool
 * only; this panel is the sole primary admin entry point.
 */
export function StandardDemoPanel() {
  const [busy, setBusy] = useState<null | 'open' | 'open_new' | 'repair' | 'reset'>(null);

  async function launch(newTab: boolean) {
    setBusy(newTab ? 'open_new' : 'open');
    try {
      const { data, error } = await supabase.functions.invoke('open-standard-demo-workspace', {
        body: { openInNewTab: newTab, landingPath: '/deals' },
      });
      const payload = data as { ok?: boolean; actionLink?: string; error?: string } | null;
      if (error || !payload?.ok || !payload.actionLink) {
        toast.error(payload?.error || error?.message || 'Failed to open standard demo');
        return;
      }
      if (newTab) {
        window.open(payload.actionLink, '_blank', 'noopener,noreferrer');
        toast.success('Opened standard demo in a new tab');
      } else {
        window.location.href = payload.actionLink;
      }
    } finally {
      setBusy(null);
    }
  }

  async function repair(reset: boolean) {
    setBusy(reset ? 'reset' : 'repair');
    try {
      const { data, error } = await supabase.functions.invoke('open-standard-demo-workspace', {
        body: reset
          ? { resetWorkspace: true, repairIfNeeded: true }
          : { repairIfNeeded: true },
      });
      const payload = data as { ok?: boolean; repairResult?: { status?: string; message?: string }; error?: string } | null;
      let errPayload: { error?: string } | null = null;
      if (!payload && error instanceof FunctionsHttpError && error.context instanceof Response) {
        try { errPayload = await error.context.clone().json(); } catch { /* ignore */ }
      }
      if (error && !payload?.ok) {
        toast.error(`${reset ? 'Reset' : 'Repair'} failed: ${error.message}`);
        return;
      }
      const status = payload?.repairResult?.status ?? 'ok';
      if (status === 'fatal') {
        toast.error(payload?.repairResult?.message || errPayload?.error || `${reset ? 'Reset' : 'Repair'} could not complete.`);
      } else if (status === 'warning') {
        toast.warning(payload?.repairResult?.message || `${reset ? 'Reset' : 'Repair'} completed with warnings.`);
      } else {
        toast.success(`${reset ? 'Reset' : 'Repair'} completed.`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5">
      <CardContent className="py-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold">Open the TEMPLATE demo workspace</h3>
              <Badge variant="outline" className="text-[10px] gap-1">
                <ShieldCheck className="h-3 w-3" /> Canonical TEMPLATE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the single canonical TEMPLATE demo environment for admin preview and
              testing. This workspace is the framework/source for all future demo accounts.
              Resolved server-side ({DEMO_PRIMARY_EMAIL}) — never derived from a selected
              tenant row or seeded user.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => launch(false)}
              disabled={!!busy}
            >
              {busy === 'open' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Open TEMPLATE Demo Workspace
            </Button>
            <Button size="sm" variant="outline" onClick={() => launch(true)} disabled={!!busy}>
              {busy === 'open_new' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
              New Tab
            </Button>
            <Button size="sm" variant="ghost" onClick={() => repair(false)} disabled={!!busy}>
              {busy === 'repair' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wrench className="h-3.5 w-3.5 mr-1" />}
              Repair
            </Button>
            <Button size="sm" variant="ghost" onClick={() => repair(true)} disabled={!!busy}>
              {busy === 'reset' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}