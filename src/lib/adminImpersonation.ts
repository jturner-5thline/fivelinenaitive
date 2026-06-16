/**
 * Admin → Demo impersonation client helpers.
 *
 * Flow:
 *  1. Admin clicks "Open Demo Workspace" on a demo user.
 *  2. We call edge function `admin-impersonate-demo-user` (action=start) —
 *     it validates everything server-side and mints a single-use magic link
 *     redirecting to `/pipeline#impersonating=1&...`.
 *  3. If the admin chose "Open in new tab", we open the link in a new tab
 *     and the admin's current tab is untouched. If they chose same-tab, we
 *     snapshot the admin's session in localStorage so the banner can
 *     restore it via `Return to Admin`.
 */
import { supabase } from '@/integrations/supabase/client';

export const IMPERSONATION_ADMIN_SNAPSHOT_KEY = 'naitive_admin_impersonation_snapshot';
export const IMPERSONATION_ACTIVE_KEY = 'naitive_impersonation_active';

export interface AdminSessionSnapshot {
  access_token: string;
  refresh_token: string;
  admin_id: string;
  admin_email: string | null;
  return_to: string;
  saved_at: number;
}

export interface ImpersonationActiveState {
  admin_id: string;
  admin_email: string | null;
  target_id: string;
  target_email: string;
  audit_id: string | null;
  started_at: number;
  has_snapshot: boolean; // true when same-tab return is possible
}

export function readActiveImpersonation(): ImpersonationActiveState | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationActiveState;
  } catch {
    return null;
  }
}

export function clearImpersonationState() {
  try {
    localStorage.removeItem(IMPERSONATION_ACTIVE_KEY);
    localStorage.removeItem(IMPERSONATION_ADMIN_SNAPSHOT_KEY);
  } catch { /* ignore */ }
}

/** Called inside the impersonated tab when the magic link lands. */
export function captureImpersonationFromHash(): ImpersonationActiveState | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.includes('impersonating=1')) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: ImpersonationActiveState = {
    admin_id: params.get('admin_id') || '',
    admin_email: params.get('admin_email'),
    target_id: params.get('target_id') || '',
    target_email: params.get('target_email') || '',
    audit_id: params.get('audit_id'),
    started_at: Date.now(),
    has_snapshot: !!localStorage.getItem(IMPERSONATION_ADMIN_SNAPSHOT_KEY),
  };
  try {
    localStorage.setItem(IMPERSONATION_ACTIVE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
  // Strip the marker from the URL so it doesn't leak into shared links.
  try {
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState({}, '', clean);
  } catch { /* ignore */ }
  return state;
}

/** Saves the current admin session so we can restore it after a same-tab handoff. */
export async function snapshotAdminSession(returnTo: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const s = data?.session;
  if (!s?.access_token || !s.refresh_token || !s.user?.id) return;
  const snap: AdminSessionSnapshot = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    admin_id: s.user.id,
    admin_email: s.user.email ?? null,
    return_to: returnTo,
    saved_at: Date.now(),
  };
  localStorage.setItem(IMPERSONATION_ADMIN_SNAPSHOT_KEY, JSON.stringify(snap));
}

export function readAdminSnapshot(): AdminSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_ADMIN_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSessionSnapshot;
  } catch {
    return null;
  }
}

/** Starts impersonation by minting a magic link via the edge function. */
export async function startImpersonation(args: {
  targetUserId: string;
  targetEmail: string;
  reason?: string;
  redirectTo?: string;
}): Promise<{ actionLink: string; auditId: string | null } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('admin-impersonate-demo-user', {
    body: {
      action: 'start',
      targetUserId: args.targetUserId,
      targetEmail: args.targetEmail,
      reason: args.reason,
      redirectTo: args.redirectTo,
    },
  });
  if (error) return { error: error.message };
  const payload = data as { actionLink?: string; auditId?: string | null; error?: string };
  if (payload?.error || !payload?.actionLink) return { error: payload?.error || 'Failed to start impersonation' };
  return { actionLink: payload.actionLink, auditId: payload.auditId ?? null };
}

/** Stops impersonation: restores admin session if snapshot present, audits stop. */
export async function stopImpersonation(opts?: { reason?: string }): Promise<{ returnTo: string | null }> {
  const active = readActiveImpersonation();
  const snapshot = readAdminSnapshot();

  // Best-effort audit. Use current (impersonated) session for auth — that's
  // fine; the edge function only needs to identify the admin from audit_id.
  try {
    await supabase.functions.invoke('admin-impersonate-demo-user', {
      body: {
        action: 'stop',
        targetUserId: active?.target_id,
        targetEmail: active?.target_email,
        auditId: active?.audit_id,
        reason: opts?.reason ?? 'return_to_admin',
      },
    });
  } catch { /* non-blocking */ }

  let returnTo: string | null = null;
  if (snapshot) {
    try {
      // Sign out of the impersonated session, then re-attach admin tokens.
      await supabase.auth.signOut({ scope: 'local' });
      const { error } = await supabase.auth.setSession({
        access_token: snapshot.access_token,
        refresh_token: snapshot.refresh_token,
      });
      if (!error) returnTo = snapshot.return_to;
    } catch { /* fallthrough — clear state */ }
  } else {
    // No snapshot (admin opened in a new tab) — just sign out of demo.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
  }
  clearImpersonationState();
  return { returnTo };
}