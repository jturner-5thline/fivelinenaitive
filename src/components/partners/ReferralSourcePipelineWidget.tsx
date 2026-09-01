import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { ensureReferralSourceForContact, hasReferralSourceTag, REFERRAL_SOURCE_TAG } from '@/lib/ensureReferralSource';
import { splitContactTypes } from '@/components/contacts/ContactTypeMultiSelect';

interface ContactHit {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  contact_type: string | null;
  org_company_id: string | null;
  phone_mobile?: string | null;
  phone_work?: string | null;
  job_title?: string | null;
}

const contactLabel = (c: ContactHit) =>
  (c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed contact').trim();

import { Plus, Info, Trash2, Building2, Search, X } from 'lucide-react';
import { liquidGlassCard, LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { useReferralSources } from '@/hooks/useReferralSources';
import { usePartnerRules, DEFAULT_PARTNER_RULES } from '@/hooks/usePartnerRules';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const UNASSIGNED_OWNER = '__unassigned__';

function OwnerMultiSelect({ options, selected, onChange }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-[11px] gap-1.5 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] ${selected.length > 0 ? 'border-primary/30 text-foreground' : 'text-muted-foreground'}`}
        >
          Owners
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] rounded-full bg-primary/20 text-primary">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="end">
        <ScrollArea className="max-h-48">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-xs"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-muted-foreground text-center">No owners</p>
          )}
        </ScrollArea>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-[10px]" onClick={() => onChange([])}>
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}


type StageKey = 'nurturing' | 3 | 2 | 1;

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'nurturing', label: 'Nurturing' },
  { key: 3, label: 'Tier 3' },
  { key: 2, label: 'Tier 2' },
  { key: 1, label: 'Tier 1' },
];

interface PipelineCard {
  id: string;
  name: string;
  company: string | null;
  dealCount: number;
  volume: number;
  manual: boolean;
}

function formatCurrencyCompact(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function ReferralSourcePipelineWidget() {
  const { referralSources } = useDealReferralSources();
  const { referralSources: manualSources, addReferralSource, deleteReferralSource, refreshReferralSources } = useReferralSources();
  const { data: rules } = usePartnerRules();
  const tiers = rules?.tiers || DEFAULT_PARTNER_RULES.tiers;
  const { user } = useAuth();
  const { company } = useCompany();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [contactResults, setContactResults] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactHit | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Live contact lookup so sources added here map to real CRM contacts.
  useEffect(() => {
    const q = newName.trim();
    if (!addOpen || selectedContact || q.length < 2) {
      setContactResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const like = `%${q.replace(/[%_,()]/g, ' ')}%`;
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, contact_type, org_company_id, phone_mobile, phone_work, job_title')
        .or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
        .limit(8);
      if (company?.id) query = query.eq('org_company_id', company.id);
      const { data } = await query;
      if (cancelled) return;
      setContactResults((data as any[]) || []);
      setSearching(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [newName, addOpen, selectedContact, company?.id]);


  const teamMembers = useTeamMembers();
  const ownerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teamMembers) m.set(t.id, t.display_name);
    return m;
  }, [teamMembers]);

  const ownerOptions = useMemo(() => {
    // Full workspace roster — filtering by a teammate shouldn't depend on who
    // happens to own a source inside the current timeframe.
    const ids = new Set<string>(teamMembers.map(t => t.id));
    for (const r of referralSources) if (r.ownerUserId) ids.add(r.ownerUserId);
    const opts = Array.from(ids)
      .map(id => ({ value: id, label: ownerNameById.get(id) || 'Unknown user' }))
      .sort((a, b) => a.label.localeCompare(b.label));
    opts.push({ value: UNASSIGNED_OWNER, label: 'Unassigned' });
    return opts;

  }, [referralSources, ownerNameById, teamMembers]);

  const columns = useMemo(() => {
    const byStage = new Map<StageKey, PipelineCard[]>(STAGES.map(s => [s.key, [] as PipelineCard[]]));
    const seen = new Set<string>();
    const ownerAllows = (ownerId: string | null) =>
      ownerFilter.length === 0 || ownerFilter.includes(ownerId || UNASSIGNED_OWNER);

    for (const r of referralSources) {
      const key: StageKey = r.tier === null ? 'nurturing' : r.tier;
      seen.add(normalize(r.referredBy));
      if (!ownerAllows(r.ownerUserId ?? null)) continue;

      byStage.get(key)!.push({
        id: `deal:${r.contactId || r.crmCompanyId || r.referredBy}`,
        name: r.referredBy,
        company: r.companyName,
        dealCount: r.dealCount,
        volume: r.totalVolume,
        manual: false,
      });
    }

    // Manually added sources with no qualifying deals yet start in Nurturing.
    for (const m of manualSources) {
      if (seen.has(normalize(m.name))) continue;
      if (!ownerAllows(null)) continue;

      byStage.get('nurturing')!.push({
        id: `manual:${m.id}`,
        name: m.name,
        company: m.company || null,
        dealCount: 0,
        volume: 0,
        manual: true,
      });
    }

    return STAGES.map((s, i) => {
      const cards = (byStage.get(s.key) || []).sort((a, b) => b.volume - a.volume);
      return {
        ...s,
        cards,
        count: cards.length,
        deals: cards.reduce((sum, c) => sum + c.dealCount, 0),
        volume: cards.reduce((sum, c) => sum + c.volume, 0),
        color: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
      };
    });
  }, [referralSources, manualSources, ownerFilter]);

  const total = columns.reduce((sum, c) => sum + c.count, 0);

  const resetAdd = () => {
    setNewName('');
    setSelectedContact(null);
    setContactResults([]);
  };

  const handleAdd = async () => {
    if (!newName.trim() && !selectedContact) return;
    setSaving(true);
    try {
      if (selectedContact) {
        // Tag the CRM contact and seed the linked referral source.
        let contact: any = selectedContact;
        if (!hasReferralSourceTag(selectedContact.contact_type)) {
          const types = splitContactTypes(selectedContact.contact_type);
          const { data } = await supabase
            .from('contacts')
            .update({ contact_type: [...types, REFERRAL_SOURCE_TAG].join(' ; ') } as any)
            .eq('id', selectedContact.id)
            .select()
            .single();
          contact = data ?? { ...selectedContact, contact_type: REFERRAL_SOURCE_TAG };
        }
        await ensureReferralSourceForContact(contact, user?.id, company?.id ?? contact?.org_company_id);
        await refreshReferralSources();
      } else {
        await addReferralSource(newName.trim());
      }
    } finally {
      setSaving(false);
      resetAdd();
      setAddOpen(false);
    }
  };


  return (
    <div className={`${liquidGlassCard} p-4 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">Referral Source Pipeline</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Sources advance automatically as their referred deals meet the Tier 3 → Tier 1 rules
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <OwnerMultiSelect options={ownerOptions} selected={ownerFilter} onChange={setOwnerFilter} />
          <Popover>

            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Rules
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-[11px] space-y-2">
              <p className="font-medium text-foreground text-xs">Tier advancement rules</p>
              <p><span className="text-foreground">Tier 1</span> — {tiers.tier1.qualifiedDeals}+ qualified deals in the trailing {tiers.tier1.trailingMonths} months, or {tiers.tier1.signedClients}+ signed client(s).</p>
              <p><span className="text-foreground">Tier 2</span> — {tiers.tier2.qualifiedDealsMin}–{tiers.tier2.qualifiedDealsMax} qualified deals in the trailing {tiers.tier2.trailingMonths} months, or {tiers.tier2.dealsOnBoard}+ deals on board.</p>
              <p><span className="text-foreground">Tier 3</span> — at least {tiers.tier3.dealsPerQuarter} referred deal per quarter.</p>
              <p><span className="text-foreground">Nurturing</span> — added as a source but no referred deals yet.</p>
            </PopoverContent>
          </Popover>
          <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add source
          </Button>
        </div>
      </div>

      <div className="grid gap-2 items-start" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` }}>
        {columns.map(stage => (
          <div
            key={String(stage.key)}
            className="rounded-lg border border-[rgba(126,184,247,0.22)] bg-[#0b1226] shadow-[inset_0_1px_0_rgba(200,225,255,0.09),0_1px_2px_rgba(0,0,0,0.32),0_12px_32px_-16px_rgba(0,0,0,0.62)] overflow-hidden"
          >
            <div className="px-2.5 py-2 border-b border-[rgba(126,184,247,0.22)]" style={{ borderTop: `2px solid ${stage.color}` }}>

              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[11px] font-medium text-foreground truncate">{stage.label}</p>
                <p className="text-sm font-bold font-mono tabular-nums text-foreground">{stage.count}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {stage.deals} deal{stage.deals === 1 ? '' : 's'} · {formatCurrencyCompact(stage.volume)}
              </p>
            </div>

            <ScrollArea className="h-56">
              <div className="p-1.5 space-y-1.5">
                {stage.cards.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70 px-1.5 py-3 text-center">No sources</p>
                )}
                {stage.cards.map(card => (
                  <div
                    key={card.id}
                    className="group rounded-md border border-[rgba(126,184,247,0.22)] bg-[#0b1226] px-2 py-1.5 hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[11px] font-medium text-foreground leading-tight truncate">{card.name}</p>
                      {card.manual && (
                        <button
                          type="button"
                          aria-label={`Remove ${card.name}`}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          onClick={() => deleteReferralSource(card.id.replace('manual:', ''))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {card.company && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                        <Building2 className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{card.company}</span>
                      </p>
                    )}
                    <p className="text-[10px] font-mono tabular-nums text-muted-foreground/80 mt-0.5">
                      {card.dealCount} deal{card.dealCount === 1 ? '' : 's'} · {formatCurrencyCompact(card.volume)}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        {total} referral source{total === 1 ? '' : 's'} in selected period
      </p>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAdd(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add referral source</DialogTitle>
            <DialogDescription>
              Search your contacts and pick a real person — they'll be tagged as a Referral Source and start in Nurturing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="referral-source-name" className="text-xs">Contact</Label>
            <Input
              id="referral-source-name"
              value={newName}
              onChange={e => { setNewName(e.target.value); setSelectedContact(null); }}
              placeholder="Search contacts by name or email…"
              autoComplete="off"
            />
            {selectedContact ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate text-foreground">{contactLabel(selectedContact)}</p>
                  {selectedContact.email && (
                    <p className="truncate text-[10px] text-muted-foreground">{selectedContact.email}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedContact(null); setNewName(''); }}>
                  Change
                </Button>
              </div>
            ) : newName.trim().length >= 2 ? (
              <div className="max-h-52 overflow-y-auto rounded-md border border-white/[0.08] divide-y divide-white/[0.05]">
                {searching && contactResults.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">Searching contacts…</p>
                )}
                {!searching && contactResults.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    No matching contacts. You can still add "{newName.trim()}" as a manual source.
                  </p>
                )}
                {contactResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 hover:bg-accent/40"
                    onClick={() => { setSelectedContact(c); setNewName(contactLabel(c)); }}
                  >
                    <p className="text-xs text-foreground truncate">{contactLabel(c)}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {[c.job_title, c.email].filter(Boolean).join(' · ') || 'No email on file'}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={(!newName.trim() && !selectedContact) || saving}>
              {selectedContact ? 'Add contact as source' : 'Add manual source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
