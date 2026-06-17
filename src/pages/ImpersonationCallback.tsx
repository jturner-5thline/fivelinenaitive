import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * `/auth/impersonation/callback`
 *
 * Finalises a magic-link handoff into either:
 *   - the target demo user (start flow), or
 *   - the source admin (stop / return flow, `?return=admin`).
 *
 * Supabase-js (with detectSessionInUrl) auto-consumes the hash tokens on
 * first render, so we just wait for the new session to settle, then land
 * the user on the validated landing path. No tokens or service-role
 * material ever touch this client — only the validated session id.
 */
export default function ImpersonationCallback() {
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const landing = params.get('landing') || '/deals';
    const isReturn = params.get('return') === 'admin';

    async function waitForSession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: setErrorResult } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErrorResult) {
          setError(setErrorResult.message);
          return;
        }
      }
      // Up to ~8s for supabase-js to finish processing the URL hash.
      for (let i = 0; i < 40; i++) {
        if (cancelled) return;
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.id) {
          // Final safety: confirm a row exists (start) or has been ended
          // (return). Failure is non-blocking — RLS still protects data.
          if (!isReturn) {
            try {
              await supabase
                .from('admin_impersonation_sessions')
                .select('id, ended_at')
                .eq('target_demo_user_id', data.session.user.id)
                .is('ended_at', null)
                .maybeSingle();
            } catch { /* non-blocking */ }
          }
          // Strip the hash and any sensitive query params before landing.
          window.location.replace(landing);
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) setError('Could not establish session. Please sign in again.');
    }
    void waitForSession();
    return () => { cancelled = true; };
  }, [location.search]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
      {error ? (
        <>
          <ShieldAlert className="h-6 w-6 text-amber-400" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <a className="text-sm underline" href="/auth">Go to sign in</a>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Establishing session…</p>
        </>
      )}
    </div>
  );
}