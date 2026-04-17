import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useThreadDealResolver
 * ---------------------
 * When viewing an email thread without an explicit dealId (e.g. from the
 * global Inbox popup), try to resolve the affiliated active deal by:
 *   1. matching the sender's email exactly to a master_lender.email, OR
 *   2. matching the sender's email domain to any master_lender.email domain,
 * then finding an active deal whose deal_lenders.name matches that lender.
 *
 * Returns the resolved dealId + dealName, or undefined if no confident match.
 */
export function useThreadDealResolver(args: {
  enabled: boolean;
  senderEmail?: string;
  fallbackDealId?: string;
  fallbackDealName?: string;
}) {
  const { enabled, senderEmail, fallbackDealId, fallbackDealName } = args;
  const [resolvedDealId, setResolvedDealId] = useState<string | undefined>(
    fallbackDealId || undefined
  );
  const [resolvedDealName, setResolvedDealName] = useState<string | undefined>(
    fallbackDealName
  );
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    // If we already have a real dealId from props, prefer it.
    if (fallbackDealId) {
      setResolvedDealId(fallbackDealId);
      setResolvedDealName(fallbackDealName);
      return;
    }
    if (!enabled || !senderEmail) {
      setResolvedDealId(undefined);
      return;
    }

    let cancelled = false;
    (async () => {
      setResolving(true);
      try {
        const email = senderEmail.toLowerCase().trim();
        const domain = email.split('@')[1] || '';
        if (!domain) return;

        // 1) Find matching master lenders by email (exact) or domain (fallback)
        let { data: lendersByEmail } = await supabase
          .from('master_lenders')
          .select('id, name, email')
          .ilike('email', email)
          .limit(5);

        let candidates = lendersByEmail || [];
        if (candidates.length === 0) {
          const { data: lendersByDomain } = await supabase
            .from('master_lenders')
            .select('id, name, email')
            .ilike('email', `%@${domain}`)
            .limit(20);
          candidates = lendersByDomain || [];
        }

        if (candidates.length === 0) return;

        const lenderNames = Array.from(
          new Set(candidates.map((l: any) => l.name).filter(Boolean))
        );
        if (lenderNames.length === 0) return;

        // 2) Find an active deal that lists any of those lenders
        const { data: dealLenderRows } = await supabase
          .from('deal_lenders')
          .select('deal_id, name, deals!inner(id, company, status)')
          .in('name', lenderNames)
          .eq('deals.status', 'active')
          .limit(10);

        if (!dealLenderRows || dealLenderRows.length === 0) return;

        // Take the most recent deal match (deals are usually sorted by created_at via RLS order, fallback to first)
        const match: any = dealLenderRows[0];
        const dealId: string | undefined = match?.deal_id;
        const dealName: string | undefined =
          match?.deals?.company || match?.deals?.[0]?.company;

        if (!cancelled && dealId) {
          setResolvedDealId(dealId);
          setResolvedDealName(dealName);
        }
      } catch (err) {
        console.warn('[useThreadDealResolver] error:', err);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, senderEmail, fallbackDealId, fallbackDealName]);

  return { resolvedDealId, resolvedDealName, resolving };
}
