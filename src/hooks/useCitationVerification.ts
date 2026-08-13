import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildCitationIndex, type Citation } from '@/lib/deal/askAiCitations';

export type CitationStatus = 'ok' | 'missing' | 'external' | 'unknown';

export interface VerifiedCitation extends Citation {
  status: CitationStatus;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Verifies that every cited document in an Ask AI transcript actually resolves
 * to a document stored on the deal. External http(s) links can't be fetched
 * cross-origin, so they're reported as "external" rather than missing.
 */
export function useCitationVerification(
  messages: Array<{ sources?: string[] }>,
  dealId?: string,
) {
  const { citations, indexByRaw } = useMemo(
    () => buildCitationIndex(messages, dealId),
    [messages, dealId],
  );

  const [docIds, setDocIds] = useState<Set<string> | null>(null);
  const [docNames, setDocNames] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const citationKey = citations.map((c) => c.raw).join('|');

  useEffect(() => {
    if (!dealId || citations.length === 0) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      const [vdr, space] = await Promise.all([
        supabase.from('vdr_documents').select('id, filename').eq('deal_id', dealId).is('deleted_at', null),
        supabase.from('deal_space_documents').select('id, name').eq('deal_id', dealId),
      ]);
      if (cancelled) return;
      const ids = new Set<string>();
      const names: string[] = [];
      for (const r of vdr.data ?? []) {
        ids.add(r.id);
        if (r.filename) names.push(r.filename.toLowerCase());
      }
      for (const r of space.data ?? []) {
        ids.add(r.id);
        if (r.name) names.push(r.name.toLowerCase());
      }
      setDocIds(ids);
      setDocNames(names);
      setChecking(false);
    })().catch(() => {
      if (!cancelled) {
        setDocIds(null);
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dealId, citationKey, citations.length]);

  const verified: VerifiedCitation[] = useMemo(() => {
    return citations.map((c) => {
      if (/^https?:\/\//i.test(c.raw.trim())) return { ...c, status: 'external' as const };
      if (!dealId || docIds === null) return { ...c, status: 'unknown' as const };
      const id = c.raw.match(UUID_RE)?.[0]?.toLowerCase();
      if (id) return { ...c, status: docIds.has(id) ? 'ok' : 'missing' };
      const label = c.label.trim().toLowerCase();
      const hit = label.length > 2 && docNames.some((n) => n === label || n.includes(label) || label.includes(n));
      return { ...c, status: hit ? 'ok' : 'missing' };
    });
  }, [citations, docIds, docNames, dealId]);

  const statusByRaw = useMemo(() => {
    const map = new Map<string, CitationStatus>();
    for (const c of verified) map.set(c.raw.trim(), c.status);
    return map;
  }, [verified]);

  return {
    citations: verified,
    statusByRaw,
    indexByRaw,
    missing: verified.filter((c) => c.status === 'missing'),
    checking,
  };
}
