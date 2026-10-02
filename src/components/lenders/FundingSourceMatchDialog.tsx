import { parseMoney, toList } from '@/lib/lenders/parseLenderForm';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Globe2, Loader2, Mail, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { FundingSourceFormDialog, type FundingSourceClaapContext } from '@/components/lenders/FundingSourceFormDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { diceCoefficient } from '@/utils/stringSimilarity';
import { toast } from 'sonner';

interface MeetingAttendee {
  email?: string | null;
  displayName?: string | null;
  self?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  organizerEmail?: string | null;
  attendees?: MeetingAttendee[];
  claapContext?: FundingSourceClaapContext | null;
}

interface FundingSourceRow {
  id: string;
  name: string | null;
  email: string | null;
  website: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_phone: string | null;
  phone: string | null;
  lender_type: string | null;
  tier: string | null;
  min_deal: number | null;
  max_deal: number | null;
  sweet_spot_min: number | null;
  sweet_spot_max: number | null;
  min_gross_margin_pct: number | null;
  max_leverage: number | null;
  sponsor_requirement: string | null;
  appetite_status: string | null;
  geo: string | null;
  industries: string[] | null;
  loan_types: string[] | null;
  company_requirements: string | null;
  deal_structure_notes: string | null;
  min_revenue: number | null;
  ebitda_min: number | null;
  relationship_owners: string | null;
  linkedin_url: string | null;
  address: string | null;
  b2b_b2c: string | null;
  sponsorship: string | null;
  cash_burn: string | null;
  sub_debt: string | null;
  refinancing: string | null;
  industries_to_avoid: string[] | null;
  nda: string | null;
  referral_lender: string | null;
  referral_fee_offered: string | null;
  referral_agreement: string | null;
  about_notes: string | null;
  funding_source_notes: string | null;
  lender_one_pager_url: string | null;
  upfront_checklist: string | null;
  post_term_sheet_checklist: string | null;
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

const splitValues = (value: unknown) => toList(value);
const numberOrNull = (value: unknown) => parseMoney(value);

function toLenderDetail(source: FundingSourceRow) {
  return {
    id: source.id,
    name: source.name || 'Unnamed funding source',
    contact: {
      name: source.contact_name || '',
      title: source.contact_title || '',
      email: source.email || '',
      phone: source.contact_phone || '',
    },
    preferences: [...(source.loan_types || []), ...(source.industries || []), source.geo].filter(Boolean) as string[],
    website: source.website || undefined,
    description: source.company_requirements || undefined,
    lenderType: source.lender_type || undefined,
     minDeal: source.min_deal,
     maxDeal: source.max_deal,
     sweetSpotMin: source.sweet_spot_min,
     sweetSpotMax: source.sweet_spot_max,
     minGrossMarginPct: source.min_gross_margin_pct,
     maxLeverage: source.max_leverage,
     sponsorRequirement: source.sponsor_requirement,
     appetiteStatus: source.appetite_status,
     geo: source.geo,
    industries: source.industries,
    loanTypes: source.loan_types,
    minRevenue: source.min_revenue,
    ebitdaMin: source.ebitda_min,
    companyRequirements: source.company_requirements,
    upfrontChecklist: source.upfront_checklist,
    postTermSheetChecklist: source.post_term_sheet_checklist,
    b2bB2c: source.b2b_b2c,
    lenderNotes: source.deal_structure_notes,
    tier: source.tier,
    relationshipOwners: source.relationship_owners,
    websiteUrl: source.website,
    linkedinUrl: source.linkedin_url,
    address: source.address,
    phoneMain: source.phone,
    sponsorship: source.sponsorship,
    cashBurn: source.cash_burn,
    subDebt: source.sub_debt,
    refinancing: source.refinancing,
    industriesToAvoid: source.industries_to_avoid,
    nda: source.nda,
    referralLender: source.referral_lender,
    referralFeeOffered: source.referral_fee_offered,
    referralAgreement: source.referral_agreement,
    aboutNotes: source.about_notes,
    fundingSourceNotes: source.funding_source_notes,
    lenderOnePagerUrl: source.lender_one_pager_url,
  };
}

const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'msn.com', 'proton.me', 'protonmail.com',
]);

export function FundingSourceMatchDialog({
  open,
  onOpenChange,
  initialQuery = '',
  organizerEmail,
  attendees = [],
  claapContext = null,
}: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [createOpen, setCreateOpen] = useState(false);

  const inviteContact = useMemo(() => {
    const internalDomains = ['naitive.co', '5thline.co'];
    const candidates = [
      ...attendees,
      ...(organizerEmail ? [{ email: organizerEmail, displayName: null }] : []),
    ];
    const contact = candidates.find((candidate) => {
      const email = candidate.email?.trim().toLowerCase() || '';
      const domain = email.split('@')[1] || '';
      return !!email && !candidate.self && !internalDomains.some((internal) => domain === internal || domain.endsWith(`.${internal}`));
    });
    if (!contact?.email) return null;
    const email = contact.email.trim().toLowerCase();
    return {
      name: contact.displayName?.trim() || '',
      email,
      website: email.split('@')[1] || '',
    };
  }, [attendees, organizerEmail]);
  const [selectedSource, setSelectedSource] = useState<FundingSourceRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch(initialQuery);
      setDebounced(initialQuery);
    } else {
      setSelectedSource(null);
      setDetailOpen(false);
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
        .select('*')
        .or(filters.join(','))
        .limit(400);
      if (error) throw error;
      return (data || []) as FundingSourceRow[];
    },
  });

  // Exact matches from the meeting's external attendees: their email or company
  // domain on a funding-source contact, the source's email, or its website.
  const attendeeKeys = useMemo(() => {
    const internal = ['naitive.co', '5thline.co'];
    const emails = new Set<string>();
    const domains = new Set<string>();
    for (const a of [...attendees, ...(organizerEmail ? [{ email: organizerEmail }] : [])] as MeetingAttendee[]) {
      const email = a.email?.trim().toLowerCase() || '';
      const domain = email.split('@')[1] || '';
      if (!email || a.self || internal.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
      emails.add(email);
      if (!CONSUMER_DOMAINS.has(domain)) domains.add(domain);
    }
    return { emails: [...emails].slice(0, 20), domains: [...domains].slice(0, 10) };
  }, [attendees, organizerEmail]);

  const { data: pinned = [] } = useQuery({
    queryKey: ['funding-source-attendee-match', attendeeKeys],
    enabled: open && (attendeeKeys.emails.length > 0 || attendeeKeys.domains.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      const reasons = new Map<string, string>();
      const contactFilters = [
        ...attendeeKeys.emails.map((e) => `email.ilike.${e}`),
        ...attendeeKeys.domains.map((d) => `email.ilike.%@${d}`),
      ];
      if (contactFilters.length) {
        const { data } = await (supabase.from('lender_contacts') as any)
          .select('lender_id, email')
          .or(contactFilters.join(','))
          .limit(50);
        for (const row of (data || []) as { lender_id: string; email: string | null }[]) {
          const exact = attendeeKeys.emails.includes((row.email || '').toLowerCase());
          if (!reasons.has(row.lender_id) || exact) {
            reasons.set(row.lender_id, exact ? `Contact match · ${row.email}` : `Contact domain match · ${row.email?.split('@')[1]}`);
          }
        }
      }
      const lenderFilters = [
        ...attendeeKeys.emails.map((e) => `email.ilike.${e}`),
        ...attendeeKeys.domains.flatMap((d) => [`email.ilike.%@${d}`, `website.ilike.%${d}%`]),
      ];
      const ids = [...reasons.keys()];
      const orParts = [...lenderFilters, ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])];
      if (!orParts.length) return [];
      const { data, error } = await supabase.from('master_lenders').select('*').or(orParts.join(',')).limit(20);
      if (error) throw error;
      return ((data || []) as FundingSourceRow[]).map((row) => {
        let reason = reasons.get(row.id);
        if (!reason) {
          const email = (row.email || '').toLowerCase();
          if (attendeeKeys.emails.includes(email)) reason = `Email match · ${email}`;
          else reason = `Domain match · ${attendeeKeys.domains.find((d) => email.endsWith(`@${d}`) || (row.website || '').toLowerCase().includes(d)) || ''}`;
        }
        return { ...row, score: 1, reasons: [reason] } as RankedFundingSource;
      });
    },
  });

  const ranked = useMemo(() => {
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const searched = !query ? [] : sources
      .map((source) => rankFundingSource(source, query))
      .filter((source) => source.score >= 0.3 && !pinnedIds.has(source.id))
      .sort((a, b) => b.score - a.score || (a.name || '').localeCompare(b.name || ''))
      .slice(0, 50);
    return searched;
  }, [query, sources, pinned]);

  const openCreate = () => setCreateOpen(true);
  const [editMode, setEditMode] = useState(false);

  const renderRow = (source: RankedFundingSource, isPinned: boolean) => (
    <Button
      key={source.id}
      type="button"
      variant="ghost"
      aria-label={`${isPinned ? 'Edit' : 'Open'} ${source.name || 'unnamed funding source'}`}
      className={`h-auto w-full justify-start whitespace-normal rounded-md border p-3 text-left text-white hover:bg-white/[0.09] ${isPinned ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-white/[0.04]'}`}
      onClick={() => {
        setSelectedSource(source);
        setEditMode(isPinned);
        setDetailOpen(true);
      }}
    >
      <div className="w-full min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{source.name || 'Unnamed funding source'}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
              {source.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{source.email}</span>}
              {source.website && <span className="inline-flex items-center gap-1"><Globe2 className="h-3 w-3" />{source.website}</span>}
            </div>
          </div>
          <Badge className="shrink-0 bg-primary/20 text-primary-foreground">
            {isPinned ? 'Edit' : `${Math.round(source.score * 100)}% match`}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {source.reasons.map((reason) => <Badge key={reason} variant="outline" className="border-white/15 text-[11px] text-white/65">{reason}</Badge>)}
          {source.contact_name && <span className="text-[11px] text-white/45">Contact: {source.contact_name}{source.contact_title ? ` · ${source.contact_title}` : ''}</span>}
          {source.lender_type && <span className="text-[11px] text-white/45">{source.lender_type}</span>}
          {source.tier && <span className="text-[11px] text-white/45">Tier {source.tier}</span>}
        </div>
      </div>
    </Button>
  );

  const handleSave = async (sourceId: string, data: LenderEditData) => {
    setSaving(true);
    const updates = {
      name: String(data.name ?? "").trim(),
      contact_name: String(data.contactName ?? "").trim() || null,
      contact_phone: String(data.contactPhone ?? "").trim() || null,
      contact_title: String(data.contactTitle ?? "").trim() || null,
      email: String(data.email ?? "").trim() || null,
      lender_type: String(data.lenderType ?? "").trim() || null,
       min_deal: numberOrNull(data.minDeal),
       max_deal: numberOrNull(data.maxDeal),
       sweet_spot_min: numberOrNull(data.sweetSpotMin),
       sweet_spot_max: numberOrNull(data.sweetSpotMax),
       min_gross_margin_pct: numberOrNull(data.minGrossMarginPct),
       max_leverage: numberOrNull(data.maxLeverage),
       sponsor_requirement: String(data.sponsorRequirement ?? "").trim() || null,
       appetite_status: data.appetiteStatus || 'active',
       geo: String(data.geo ?? "").trim() || null,
      industries: splitValues(data.industries),
      loan_types: splitValues(data.loanTypes),
      company_requirements: String(data.companyRequirements ?? "").trim() || null,
      deal_structure_notes: String(data.lenderNotes ?? "").trim() || null,
      min_revenue: numberOrNull(data.minRevenue),
      ebitda_min: numberOrNull(data.ebitdaMin),
      tier: String(data.tier ?? "").trim() ? `T${String(data.tier ?? "").trim().replace(/^T/i, '')}` : null,
      relationship_owners: String(data.relationshipOwners ?? "").trim() || null,
      website: String(data.websiteUrl ?? "").trim() || null,
      linkedin_url: String(data.linkedinUrl ?? "").trim() || null,
      address: String(data.address ?? "").trim() || null,
      phone: String(data.phoneMain ?? "").trim() || null,
      b2b_b2c: String(data.b2bB2c ?? "").trim() || null,
      sponsorship: String(data.sponsorship ?? "").trim() || null,
      cash_burn: String(data.cashBurn ?? "").trim() || null,
      sub_debt: String(data.subDebt ?? "").trim() || null,
      refinancing: String(data.refinancing ?? "").trim() || null,
      industries_to_avoid: splitValues(data.industriesToAvoid || ''),
      nda: String(data.nda ?? "").trim() || null,
      referral_lender: String(data.referralLender ?? "").trim() || null,
      referral_fee_offered: String(data.referralFeeOffered ?? "").trim() || null,
      referral_agreement: String(data.referralAgreement ?? "").trim() || null,
      about_notes: String(data.aboutNotes ?? "").trim() || null,
      funding_source_notes: String(data.fundingSourceNotes ?? "").trim() || null,
      lender_one_pager_url: String(data.lenderOnePagerUrl ?? "").trim() || null,
      upfront_checklist: String(data.upfrontChecklist ?? "").trim() || null,
      post_term_sheet_checklist: String(data.postTermSheetChecklist ?? "").trim() || null,
    };

    try {
      const { error } = await supabase.from('master_lenders').update(updates).eq('id', sourceId);
      if (error) throw error;
      setSelectedSource((current) => current ? { ...current, ...updates } : current);
      await queryClient.invalidateQueries({ queryKey: ['funding-source-match-search'] });
      toast.success(`${updates.name} updated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update funding source';
      toast.error(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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

          <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <p className="text-xs text-white/50">Can’t find the right source?</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 border-primary/40 bg-primary/10 text-white hover:bg-primary/20"
              onClick={openCreate}
              disabled={!user}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create new funding source
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {pinned.length > 0 && (
              <div className="space-y-2 pb-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Matches a meeting attendee</p>
                {pinned.map((source) => renderRow(source, true))}
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching funding sources…
              </div>
            ) : isError ? (
              <p className="py-10 text-center text-sm text-white/60">Funding sources could not be loaded.</p>
            ) : !cleanSearch(search) ? (
              pinned.length ? null : <p className="py-10 text-center text-sm text-white/60">Enter a name, email, URL, or domain to search.</p>
            ) : ranked.length === 0 ? (
              pinned.length ? null : <p className="py-10 text-center text-sm text-white/60">No likely funding source matches found.</p>
            ) : (
              <div className="space-y-2 py-2">
                {pinned.length > 0 && <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Other search results</p>}
                {ranked.map((source) => renderRow(source, false))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FundingSourceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={search.trim() || initialQuery.trim()}
        initialContact={inviteContact}
        claapContext={claapContext}
        onCreated={(created) => {
          setSearch(created.name || search);
          setSelectedSource(created as unknown as FundingSourceRow);
          setEditMode(false);
          setDetailOpen(true);
        }}
      />

      <LenderDetailDialog
        lender={selectedSource ? toLenderDetail(selectedSource) : null}
        open={detailOpen}
        onOpenChange={(nextOpen) => {
          setDetailOpen(nextOpen);
          if (!nextOpen) setSelectedSource(null);
        }}
        onSave={handleSave}
        initialEditMode={editMode}
        nested
      />
      {saving && <span className="sr-only" role="status">Saving funding source</span>}
    </>
  );
}
