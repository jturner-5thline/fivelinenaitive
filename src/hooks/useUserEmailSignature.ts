import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the current user's email signature (rich text or legacy plain text),
 * with a "Best,\n<Name>" fallback so composers always have something to insert.
 *
 * Single source of truth: `profiles.email_signature` — the same field the
 * Settings → Email signature card writes to. Used by every compose surface
 * (new mail, reply, pop-out, AI drafts) so behavior is consistent.
 */
export function useUserEmailSignature(): string | undefined {
  const { user } = useAuth();
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSaved(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('email_signature')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setSaved(((data?.email_signature as string | null) ?? null));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return useMemo(() => {
    if (saved && saved.trim()) return saved;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (user?.email ? user.email.split('@')[0] : '');
    if (!name) return undefined;
    return `Best,\n${name}`;
  }, [saved, user?.email, user?.user_metadata]);
}