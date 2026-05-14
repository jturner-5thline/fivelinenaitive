import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  dealId: string | undefined;
}

const SEEN_KEY = (dealId: string) => `deal-data-banner-seen:${dealId}`;
const DISMISSED_KEY = (dealId: string) => `deal-data-banner-dismissed:${dealId}`;

function readStored(key: string): number {
  try {
    const v = sessionStorage.getItem(key);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function writeStored(key: string, value: number) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    /* noop */
  }
}

export function DealDataUpdateBanner({ dealId }: Props) {
  const [latestUpdate, setLatestUpdate] = useState<number>(0);
  const [hidden, setHidden] = useState(false);

  const fetchLatest = useCallback(async () => {
    if (!dealId) return;
    try {
      const [
        { data: dealRow },
        { data: writeup },
        { data: dsDocs },
        { data: vdrDocs },
        { data: financials },
      ] = await Promise.all([
        supabase.from('deals').select('updated_at').eq('id', dealId).maybeSingle(),
        supabase.from('deal_writeups').select('updated_at').eq('deal_id', dealId).maybeSingle(),
        supabase
          .from('deal_space_documents')
          .select('created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('vdr_documents')
          .select('updated_at')
          .eq('deal_id', dealId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('deal_space_financials')
          .select('updated_at')
          .eq('deal_id', dealId)
          .order('updated_at', { ascending: false })
          .limit(1),
      ]);

      const stamps: number[] = [];
      const push = (v?: string | null) => {
        if (!v) return;
        const t = new Date(v).getTime();
        if (!isNaN(t)) stamps.push(t);
      };
      push(dealRow?.updated_at);
      push(writeup?.updated_at);
      push((dsDocs?.[0] as any)?.created_at);
      push(vdrDocs?.[0]?.updated_at);
      push(financials?.[0]?.updated_at);
      setLatestUpdate(stamps.length ? Math.max(...stamps) : 0);
    } catch {
      /* silent */
    }
  }, [dealId]);

  useEffect(() => {
    fetchLatest();
    if (!dealId) return;
    // Light polling so banner appears when changes happen elsewhere on the page.
    const interval = setInterval(fetchLatest, 30_000);
    return () => clearInterval(interval);
  }, [dealId, fetchLatest]);

  // Initialize the "seen" baseline the first time we see a non-zero stamp.
  useEffect(() => {
    if (!dealId || !latestUpdate) return;
    const seen = readStored(SEEN_KEY(dealId));
    if (!seen) {
      writeStored(SEEN_KEY(dealId), latestUpdate);
      writeStored(DISMISSED_KEY(dealId), latestUpdate);
    }
  }, [dealId, latestUpdate]);

  const visible = useMemo(() => {
    if (!dealId || hidden || !latestUpdate) return false;
    const seen = readStored(SEEN_KEY(dealId));
    const dismissed = readStored(DISMISSED_KEY(dealId));
    if (!seen) return false; // initialization pass
    return latestUpdate > seen && latestUpdate > dismissed;
  }, [dealId, hidden, latestUpdate]);

  if (!visible || !dealId) return null;

  const handleRefresh = () => {
    writeStored(SEEN_KEY(dealId), latestUpdate);
    writeStored(DISMISSED_KEY(dealId), latestUpdate);
    setHidden(true);
    window.dispatchEvent(new CustomEvent('ai-lenders-refresh', { detail: { dealId } }));
  };

  const handleDismiss = () => {
    writeStored(DISMISSED_KEY(dealId), latestUpdate);
    setHidden(true);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 backdrop-blur-sm px-3 py-2 mb-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <div className="text-sm flex-1">
        Deal data updated — refresh lender recommendations?
      </div>
      <Button
        type="button"
        variant="liquid-glass"
        size="sm"
        className="gap-1.5 h-7"
        onClick={handleRefresh}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <X className="h-3 w-3" />
        Dismiss
      </button>
    </div>
  );
}
