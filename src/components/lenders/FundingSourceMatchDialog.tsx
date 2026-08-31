import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Globe2, Loader2, Mail, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { diceCoefficient } from '@/utils/stringSimilarity';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

interface FundingSourceRow {
  id: string;
  name: string | null;
  email: string | null;
  website: string | null;
  contact_name: string | null;
  contact_title: string | null;
  lender_type: string | null;
  tier: string | null;
}

interface RankedFundingSource extends FundingSourceRow {
  score: number;
  reasons: string[];
}

const cleanSearch = (value: string) => value.replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

const normalize = (value: string | null | undefined) =>
  (value || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[^a-z0-9]/g, '');

const extractDomains = (value: string) => {
  const matches = value.toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+/g) || [];
  return matches.map((match) => normalize(match)).filter(Boolean);
};

const scoreField = (query: string, value: string | null | undefined) => {
  const normalizedQuery = normalize(query);
  const normalizedValue = normalize(value);
  if (!normalizedQuery || !normalizedValue) return 0;
  if (normalizedQuery === normalizedValue) return 1;
  if (normalizedValue.includes(normalizedQuery) || normalizedQuery.includes(normalizedValue)) return 0.78;
  return diceCoefficient(normalizedQuery, normalizedValue);
};

function rankFundingSource(row: FundingSourceRow, query: string): RankedFundingSource {
  const queryParts = query.split(/\s+/).filter(Boolean);
  const queryDomains = extractDomains(query);
  const nameScore = Math.max(...queryParts.map((part) => scoreField(part, row.name)), 0);
  const contactScore = Math.max(...queryParts.map((part) => scoreField(part, row.contact_name)), 0);
  const emailScore = Math.max(...queryParts.map((part) => scoreField(part, row.email)), 0);
  const websiteScore = Math.max(...queryDomains.map((domain) => scoreField(domain, row.website)), 0);
  const emailDomainScore = Math.max(
    ...queryDomains.map((domain) => scoreField(domain, row.email?.split('@')[1])),
    0,
  );

  const scores = [
    { score: nameScore, reason: nameScore >= 0.62 ? `Name match (${Math.round(nameScore * 100)}%)` : '' },
    { score: contactScore, reason: contactScore >= 0.7 ? `Contact match (${Math.round(contactScore * 100)}%)` : '' },
    { score: emailScore, reason: emailScore >= 0.72 ? 'Email match' : '' },
    { score: websiteScore, reason: websiteScore >= 0.72 ? 'Website/domain match' : '' },
    { score: emailDomainScore, reason: emailDomainScore >= 0.72 ? 'Email domain match' : '' },
  ];
  const best = Math.max(...scores.map(({ score }) => score), 0);

  return {
    ...row,
    score: best,
    reasons: scores.filter(({ reason }) => reason).map(({ reason }) => reason),
  };
}

export function FundingSourceMatchDialog({ open, onOpenChange, initialQuery = '' }: Props) {
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);

  useEffect(() => {
    if (open) {
      setSearch(initialQuery);
      setDebounced(initialQuery);
    }
  }, [initialQuery, open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = cleanSearch(debounced);

  const { data: sources = [], isLoading, isError } = useQuery({
    queryKey: ['funding-source-match-search', query],
    enabled: open && query.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const terms = Array.from(new Set([query, ...query.split(/\s+/)])).filter((t) => t.length >= 2).slice(0, 6);
      const filters = terms.flatMap((t) => [
        `name.ilike.%${t}%`,
        `email.ilike.%${t}%`,
        `website.ilike.%${t}%`,
        `contact_name.ilike.%${t}%`,
      ]);
      const { data, error } = await supabase
        .from('master_lenders')
        .select('id, name, email, website, contact_name, contact_title, lender_type, tier')
        .or(filters.join(','))
        .limit(400);
      if (error) throw error;
      return (data || []) as FundingSourceRow[];
    },
  });

  const ranked = useMemo(() => {
    if (!query) return [];
    return sources
      .map((source) => rankFundingSource(source, query))
      .filter((source) => source.score >= 0.3)
      .sort((a, b) => b.score - a.score || (a.name || '').localeCompare(b.name || ''))
      .slice(0, 50);
  }, [query, sources]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[1600] flex max-h-[78vh] max-w-2xl flex-col border-white/10 bg-[#171B2C] text-white"
        overlayClassName="z-[1590]"
      >
        <DialogHeader>
          <DialogTitle className="text-white">Update Funding Source</DialogTitle>
          <DialogDescription className="text-white/60">
            Search the funding source directory for likely matches by name, email, URL, or domain.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, URL, or domain…"
            className="h-10 border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/40"
            maxLength={160}
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear funding source search"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-white/50 hover:bg-white/[0.08] hover:text-white"
              onClick={() => setSearch('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching funding sources…
            </div>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-white/60">Funding sources could not be loaded.</p>
          ) : !cleanSearch(search) ? (
            <p className="py-10 text-center text-sm text-white/60">Enter a name, email, URL, or domain to search.</p>
          ) : ranked.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/60">No likely funding source matches found.</p>
          ) : (
            <div className="space-y-2 py-2">
              {ranked.map((source) => (
                <div key={source.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate text-sm font-medium text-white">{source.name || 'Unnamed funding source'}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
                        {source.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{source.email}</span>}
                        {source.website && <span className="inline-flex items-center gap-1"><Globe2 className="h-3 w-3" />{source.website}</span>}
                      </div>
                    </div>
                    <Badge className="shrink-0 bg-primary/20 text-primary-foreground">{Math.round(source.score * 100)}% match</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {source.reasons.map((reason) => <Badge key={reason} variant="outline" className="border-white/15 text-[11px] text-white/65">{reason}</Badge>)}
                    {source.contact_name && <span className="text-[11px] text-white/45">Contact: {source.contact_name}{source.contact_title ? ` · ${source.contact_title}` : ''}</span>}
                    {source.lender_type && <span className="text-[11px] text-white/45">{source.lender_type}</span>}
                    {source.tier && <span className="text-[11px] text-white/45">Tier {source.tier}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
