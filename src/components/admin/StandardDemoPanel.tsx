import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_PRIMARY_EMAIL, DEMO_COMPANY_ID } from '@/lib/demoAccount';

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
/**
 * Single canonical entry point into the TEMPLATE demo workspace —
 * the same workspace ({DEMO_COMPANY_ID}) used as the source/framework
 * when "Create Demo" provisions a new demo account. Never tied to any
 * row selection, target user id, email, or seeded account.
 *
 * Uses a direct fetch (not supabase.functions.invoke) so the Lovable
 * preview fetch proxy cannot drop the Authorization header.
 */
export function StandardDemoPanel() {
  const [busy, setBusy] = useState(false);

  // Pick an origin DIFFERENT from the current admin tab so the demo
  // window opens on an isolated browser origin. Same-origin would share
  // localStorage and the magic-link session would overwrite the admin's
  // auth token in this tab.
  function pickDemoOrigin(): string {
    const candidates = [
      'https://fivelinenaitive.lovable.app',
      'https://www.naitive.co',
      'https://naitive.co',
    ];
    const current = window.location.origin.replace(/\/$/, '');
    for (const c of candidates) {
      if (c.replace(/\/$/, '') !== current) return c;
    }
    return candidates[0];
  }

  async function openDemo() {
    // Open a placeholder tab synchronously inside the click handler so
    // popup blockers don't intercept it after the await below.
    const demoWindow = window.open('about:blank', '_blank', 'noopener');
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.access_token || !session?.refresh_token) {
        toast.error('No active session. Please sign in again.');
        demoWindow?.close();
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const demoOrigin = pickDemoOrigin();
      const resp = await fetch(`${supabaseUrl}/functions/v1/open-standard-demo-workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          landingPath: '/deals',
          sourceAdminRefreshToken: session.refresh_token,
          openInNewTab: true,
          demoOrigin,
        }),
      });
      const payload = (await resp.json().catch(() => null)) as
        | { ok?: boolean; actionLink?: string; error?: string }
        | null;
      if (!resp.ok || !payload?.ok || !payload.actionLink) {
        toast.error(payload?.error || `Failed to open demo workspace (${resp.status})`);
        demoWindow?.close();
        return;
      }
      // Navigate the pre-opened tab to the magic link. Different origin
      // from the admin tab → isolated localStorage, admin session in this
      // tab stays untouched.
      if (demoWindow) {
        demoWindow.location.href = payload.actionLink;
        toast.success('Demo workspace opened in a new tab.');
      } else {
        // Popup blocked — fall back to a new tab without replacing this one.
        window.open(payload.actionLink, '_blank', 'noopener');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open demo workspace');
      demoWindow?.close();
    } finally {
      setBusy(false);
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
              <h3 className="text-base font-semibold">Demo Workspace</h3>
              <Badge variant="outline" className="text-[10px] gap-1">
                <ShieldCheck className="h-3 w-3" /> Canonical TEMPLATE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Opens the single canonical TEMPLATE demo workspace ({DEMO_PRIMARY_EMAIL}).
              This is the same workspace used as the source/framework when Create Demo
              provisions new demo accounts. Resolved server-side — never tied to a row,
              tenant, or seeded account.
            </p>
          </div>
          <div>
            <Button size="sm" onClick={openDemo} disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Open Demo Workspace
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}