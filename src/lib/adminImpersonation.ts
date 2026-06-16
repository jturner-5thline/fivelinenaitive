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
  targetUserId: string;
  targetEmail: string;
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
  error?: string;
}

export async function stopImpersonation(opts?: {
  sessionId?: string;
  reason?: string;
  returnTo?: string;
}): Promise<StopImpersonationResult> {
  const { data, error } = await supabase.functions.invoke('stop-demo-impersonation', {
    body: {
      sessionId: opts?.sessionId,
      reason: opts?.reason ?? 'return_to_admin',
      returnTo: opts?.returnTo ?? '/admin?section=users-permissions&page=demo-metrics',
    },
  });
  if (error) return { ok: false, returnLink: null, returnTo: null, error: error.message };
  const p = data as { ok?: boolean; returnLink?: string | null; returnTo?: string | null; error?: string };
  return {
    ok: !!p?.ok,
    returnLink: p?.returnLink ?? null,
    returnTo: p?.returnTo ?? null,
    error: p?.error,
  };
}