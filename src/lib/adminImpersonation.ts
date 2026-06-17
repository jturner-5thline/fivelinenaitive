/**
 * Admin → Demo impersonation client helpers.
 *
 * All trust lives server-side: `start-demo-impersonation` and
 * `stop-demo-impersonation` edge functions create/end rows in
 * `admin_impersonation_sessions` and mint single-use magic links. The
 * browser only ever holds:
 *   - the standard Supabase session (now the demo user's real session), and
 *   - the magic-link URL it was redirected to.
 * No service-role material, no privileged tokens, no client-side spoofing.
 */
import { supabase } from '@/integrations/supabase/client';

export interface StartImpersonationArgs {
  targetUserId?: string;
  targetEmail?: string;
  reason?: string;
  sourceSurface?: string;
  landingPath?: string;
}

export interface StartImpersonationOk {
  ok: true;
  sessionId: string;
  expiresAt: string;
  actionLink: string;
  callbackUrl: string;
  target: {
    id: string;
    email: string;
    demoCompanyId: string;
    demoCompanyName: string | null;
    seedHealthy: boolean;
  };
}

export interface StartImpersonationErr {
  ok: false;
  error: string;
  code?: string;
}

export async function startImpersonation(
  args: StartImpersonationArgs,
): Promise<StartImpersonationOk | StartImpersonationErr> {
  const { data, error } = await supabase.functions.invoke('start-demo-impersonation', {
    body: args,
  });
  if (error) return { ok: false, error: error.message };
  const p = data as Partial<StartImpersonationOk> & { error?: string; code?: string };
  if (!p?.actionLink) return { ok: false, error: p?.error || 'Failed to start impersonation', code: p?.code };
  return p as StartImpersonationOk;
}

export interface StopImpersonationResult {
  ok: boolean;
  returnLink: string | null;
  returnTo: string | null;
  session?: {
    access_token: string;
    refresh_token: string;
  };
  error?: string;
  code?: string;
}

export async function stopImpersonation(opts?: {
  sessionId?: string;
  reason?: string;
  returnTo?: string;
}): Promise<StopImpersonationResult> {
  // Use a direct fetch instead of `supabase.functions.invoke` so the Lovable
  // preview fetch proxy can't drop the Authorization header (same fix used
  // by Open Demo Workspace). Without an explicit Bearer token the function
  // returns 401 and Return-to-Admin silently does nothing.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      return { ok: false, returnLink: null, returnTo: null, error: 'No active session' };
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const resp = await fetch(`${supabaseUrl}/functions/v1/stop-demo-impersonation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        sessionId: opts?.sessionId,
        reason: opts?.reason ?? 'return_to_admin',
        returnTo: opts?.returnTo ?? '/admin?section=users-permissions&page=demo-metrics',
        returnOrigin: window.location.origin,
      }),
    });
    const p = (await resp.json().catch(() => null)) as
      | {
          ok?: boolean;
          returnLink?: string | null;
          returnTo?: string | null;
          session?: { access_token?: string; refresh_token?: string };
          error?: string;
          code?: string;
        }
      | null;
    if (!resp.ok || !p?.ok) {
      return {
        ok: false,
        returnLink: null,
        returnTo: null,
        error: p?.error || `Failed to end demo session (${resp.status})`,
        code: p?.code,
      };
    }
    return {
      ok: true,
      returnLink: p.returnLink ?? null,
      returnTo: p.returnTo ?? null,
      session: p.session?.access_token && p.session?.refresh_token
        ? { access_token: p.session.access_token, refresh_token: p.session.refresh_token }
        : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      returnLink: null,
      returnTo: null,
      error: e instanceof Error ? e.message : 'Failed to end demo session',
    };
  }
}