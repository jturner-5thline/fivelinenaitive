import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hard-coded default signature blocks for known internal users.
 *
 * REGRESSION GUARD: every compose surface (New / Reply / Reply All / Forward)
 * relies on this hook for its default signature. If a user has NOT saved a
 * signature in Settings → Email, we must still emit the FULL block so the
 * outgoing message and the in-composer "Signature:" footer indicator render
 * correctly. Do NOT replace these with a "Best, <Name>" stub — see
 * src/hooks/__tests__/useUserEmailSignature.signature.test.ts which fails on
 * regression.
 */
const DEFAULT_SIGNATURES_BY_EMAIL: Record<string, string> = {
  'jturner@5thline.co': [
    '<p><strong>James H. Turner V</strong> | Founder &amp; CEO</p>',
    '<p><strong>5th</strong> | Line</p>',
    '<p>o | (510) 871-4351</p>',
    '<p>w | <a href="https://www.5thline.co">www.5thline.co</a></p>',
    '<p>&nbsp;</p>',
    '<p style="font-size:11px;color:#6b7280;">This message and any files transmitted with it are proprietary and confidential. They are intended solely for the use of the individual or entity to whom they are addressed. If the reader of this message is not the intended recipient, please notify the sender immediately and delete this message. Distribution or copying of this message is prohibited.</p>',
  ].join(''),
};

/** Plain-text rendering of the same default block, used when the editor or
 *  preview path can't render HTML. Kept in lock-step with the HTML version. */
export const DEFAULT_SIGNATURE_PLAINTEXT_BY_EMAIL: Record<string, string> = {
  'jturner@5thline.co': [
    'James H. Turner V | Founder & CEO',
    '5th | Line',
    'o | (510) 871-4351',
    'w | www.5thline.co',
    '',
    'This message and any files transmitted with it are proprietary and confidential. They are intended solely for the use of the individual or entity to whom they are addressed. If the reader of this message is not the intended recipient, please notify the sender immediately and delete this message. Distribution or copying of this message is prohibited.',
  ].join('\n'),
};

/**
 * Returns the current user's email signature (rich text or legacy plain text),
 * with the user's full default 5th Line signature block as a fallback for
 * known internal users, falling back further to "Best,\n<Name>" only when no
 * specific default is known.
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
    // Prefer the known full default block for internal users so the composer
    // never opens with just "Best, <Name>" when the profile signature is empty.
    const email = (user?.email ?? '').toLowerCase();
    if (email && DEFAULT_SIGNATURES_BY_EMAIL[email]) {
      return DEFAULT_SIGNATURES_BY_EMAIL[email];
    }
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (user?.email ? user.email.split('@')[0] : '');
    if (!name) return undefined;
    return `Best,\n${name}`;
  }, [saved, user?.email, user?.user_metadata]);
}