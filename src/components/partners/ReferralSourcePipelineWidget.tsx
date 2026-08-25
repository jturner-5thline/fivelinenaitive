import { useMemo, useState } from 'react';
import { Plus, Info, Trash2, Building2 } from 'lucide-react';
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
  const { referralSources: manualSources, addReferralSource, deleteReferralSource } = useReferralSources();
  const { data: rules } = usePartnerRules();
  const tiers = rules?.tiers || DEFAULT_PARTNER_RULES.tiers;

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const columns = useMemo(() => {
    const byStage = new Map<StageKey, PipelineCard[]>(STAGES.map(s => [s.key, [] as PipelineCard[]]));
    const seen = new Set<string>();

    for (const r of referralSources) {
      const key: StageKey = r.tier === null ? 'nurturing' : r.tier;
      seen.add(normalize(r.referredBy));
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
  }, [referralSources, manualSources]);

  const total = columns.reduce((sum, c) => sum + c.count, 0);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await addReferralSource(newName.trim());
    setSaving(false);
    setNewName('');
    setAddOpen(false);
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add referral source</DialogTitle>
            <DialogDescription>
              New sources start in Nurturing and move to Tier 3, 2 or 1 automatically as their referred deals meet the rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="referral-source-name" className="text-xs">Name</Label>
            <Input
              id="referral-source-name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Jane Doe @ Comerica Bank"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName.trim() || saving}>Add source</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
