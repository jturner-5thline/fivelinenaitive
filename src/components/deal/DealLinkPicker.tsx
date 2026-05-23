import { useEffect, useMemo, useState } from 'react';
import { Pencil, Loader2, Link as LinkIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  /** Currently linked deal id (the deal the composer believes this email belongs to). */
  dealId: string | null;
  /** Recipient list — used to derive the from_address for an override row. */
  recipients: string[];
  /** Called once a different deal has been chosen (after the override is written). */
  onLinkedDealChange: (newDealId: string, label: string) => void;
}

interface DealRow {
  id: string;
  company: string;
}

/**
 * Small "Linked to: <Deal>" pill used in the email composer / AI draft view.
 * Editing the link writes a public.recognition_overrides row so future
 * inbound mail from the same recipient is recognized against the chosen deal.
 */
export function DealLinkPicker({ dealId, recipients, onLinkedDealChange }: Props) {
  const { user } = useAuth();
  const [label, setLabel] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DealRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the current deal label for display.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dealId) { setLabel(''); return; }
      const { data } = await supabase.from('deals').select('id, company').eq('id', dealId).maybeSingle();
      if (!cancelled && data) setLabel(data.company || 'Untitled deal');
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const term = q.trim();
        let query = supabase
          .from('deals')
          .select('id, company')
          .order('updated_at', { ascending: false })
          .limit(15);
        if (term.length > 0) {
          query = query.ilike('company', `%${term}%`);
        }
        const { data } = await query;
        if (!cancelled) setResults((data ?? []) as DealRow[]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, q]);

  const fromAddress = useMemo(() => {
    const first = recipients.find(Boolean);
    if (!first) return null;
    const m = first.match(/<([^>]+)>/);
    return (m ? m[1] : first).trim().toLowerCase();
  }, [recipients]);

  const choose = async (row: DealRow) => {
    if (!user) return;
    setSaving(true);
    try {
      // Resolve user's company_id to scope the override (multi-tenant).
      const { data: cm } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const orgCompanyId = cm?.company_id ?? null;

      if (orgCompanyId && fromAddress) {
        const domain = fromAddress.includes('@') ? fromAddress.split('@')[1] : null;
        await supabase.from('recognition_overrides').insert({
          org_company_id: orgCompanyId,
          from_address: fromAddress,
          domain,
          deal_id: row.id,
          created_by: user.id,
        });
      }
      onLinkedDealChange(row.id, row.company || 'Untitled deal');
      toast.success('Recognition override saved');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="gap-1.5 h-6 px-2 text-[11px] font-medium">
        <LinkIcon className="h-3 w-3" />
        Linked to:
        <span className="max-w-[220px] truncate">{label || (dealId ? '…' : 'No deal')}</span>
      </Badge>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="start">
          <div className="p-2 border-b border-border/40">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search deals…"
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">No deals found</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={saving}
                  onClick={() => choose(r)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex flex-col gap-0.5"
                >
                  <span className="text-sm truncate">{r.company || 'Untitled deal'}</span>
                </button>
              ))
            )}
          </div>
          {fromAddress && (
            <div className="px-3 py-2 border-t border-border/40 text-[10px] text-muted-foreground">
              Choosing a deal teaches the recognizer that mail from <span className="font-mono">{fromAddress}</span> belongs to that deal.
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DealLinkPicker;