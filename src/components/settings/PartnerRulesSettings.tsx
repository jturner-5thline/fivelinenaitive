import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ShieldAlert, History } from 'lucide-react';
import { format } from 'date-fns';
import {
  DEFAULT_PARTNER_RULES, PartnerRules,
  useCanEditPartnerRules, usePartnerRules, useSavePartnerRules,
  usePartnerRulesAudit, useChannelTypes, useMutateChannelType, type ChannelType,
} from '@/hooks/usePartnerRules';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useCompany } from '@/hooks/useCompany';

function NumberField({ label, value, onChange, disabled, suffix, min = 0 }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; suffix?: string; min?: number }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 mt-1">
        <Input type="number" min={min} value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled} className="h-8" />
        {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

export function PartnerRulesSettings() {
  const { isAdmin } = useCompany();
  const canEdit = useCanEditPartnerRules();
  // Non-admins don't see panel at all; other admins see read-only
  if (!isAdmin && !canEdit) return null;

  const { data: rules } = usePartnerRules();
  const save = useSavePartnerRules();
  const { data: audit = [] } = usePartnerRulesAudit();
  const { data: channels = [] } = useChannelTypes();
  const { upsert: upsertChannel, remove: removeChannel } = useMutateChannelType();
  const { stages: globalStages } = useDealStages();

  const [draft, setDraft] = useState<PartnerRules>(DEFAULT_PARTNER_RULES);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (rules && !loaded) { setDraft(rules); setLoaded(true); }
  }, [rules, loaded]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(rules), [draft, rules]);

  const persist = (next: PartnerRules, summary: string) => {
    if (!canEdit) return;
    setDraft(next);
    save.mutate({ next, summary });
  };

  const ro = !canEdit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Partner Rules & Definitions
          {ro && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
              <ShieldAlert className="h-3 w-3" /> Read-only
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Tier thresholds, stage promotion criteria, and channel types for the Sales & BD Partners Pipeline.
          {ro && ' Only jturner@5thline.co and jmoffitt@5thline.co can edit.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* TIER DEFINITIONS */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tier Definitions (Referral Source Tiers)</h3>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Tier 1</div>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Qualified deals" disabled={ro}
                value={draft.tiers.tier1.qualifiedDeals}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier1: { ...draft.tiers.tier1, qualifiedDeals: v } } })} />
              <NumberField label="Trailing months" disabled={ro} suffix="mo"
                value={draft.tiers.tier1.trailingMonths}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier1: { ...draft.tiers.tier1, trailingMonths: v } } })} />
              <NumberField label="Signed clients" disabled={ro}
                value={draft.tiers.tier1.signedClients}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier1: { ...draft.tiers.tier1, signedClients: v } } })} />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Tier 2</div>
            <div className="grid grid-cols-4 gap-3">
              <NumberField label="Qualified deals min" disabled={ro}
                value={draft.tiers.tier2.qualifiedDealsMin}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier2: { ...draft.tiers.tier2, qualifiedDealsMin: v } } })} />
              <NumberField label="Qualified deals max" disabled={ro}
                value={draft.tiers.tier2.qualifiedDealsMax}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier2: { ...draft.tiers.tier2, qualifiedDealsMax: v } } })} />
              <NumberField label="Trailing months" disabled={ro} suffix="mo"
                value={draft.tiers.tier2.trailingMonths}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier2: { ...draft.tiers.tier2, trailingMonths: v } } })} />
              <NumberField label="Deals on board" disabled={ro}
                value={draft.tiers.tier2.dealsOnBoard}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier2: { ...draft.tiers.tier2, dealsOnBoard: v } } })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Tier 3</div>
              <NumberField label="Deals per quarter" disabled={ro}
                value={draft.tiers.tier3.dealsPerQuarter}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier3: { ...draft.tiers.tier3, dealsPerQuarter: v } } })} />
            </div>
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Tier 4 (Temp)</div>
              <NumberField label="Months before removal" disabled={ro} suffix="mo"
                value={draft.tiers.tier4.monthsBeforeRemoval}
                onChange={v => setDraft({ ...draft, tiers: { ...draft.tiers, tier4: { ...draft.tiers.tier4, monthsBeforeRemoval: v } } })} />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Qualified Deal — stages that count toward tier qualification (Active + FinServ pipelines)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {globalStages.map(s => {
                const checked = draft.tiers.qualifiedDealStages.includes(s.id);
                return (
                  <button key={s.id} type="button" disabled={ro}
                    onClick={() => {
                      const set = new Set(draft.tiers.qualifiedDealStages);
                      if (checked) set.delete(s.id); else set.add(s.id);
                      setDraft({ ...draft, tiers: { ...draft.tiers, qualifiedDealStages: Array.from(set) } });
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      checked ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
                    } ${ro ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* STAGE CRITERIA */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Partner Stage Criteria</h3>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Trial — checklist labels</div>
            <div className="grid grid-cols-2 gap-3">
              {(['fit','responsiveness','engagement','contribution'] as const).map(k => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground capitalize">{k}</Label>
                  <Input className="h-8 mt-1" disabled={ro}
                    value={draft.stages.trial.labels[k]}
                    onChange={e => setDraft({ ...draft, stages: { ...draft.stages, trial: { labels: { ...draft.stages.trial.labels, [k]: e.target.value } } } })} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Active Partner</div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Referral-to-proposal threshold" disabled={ro}
                value={draft.stages.activePartner.referralToProposalThreshold}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, referralToProposalThreshold: v } } })} />
              <NumberField label="Trailing months" disabled={ro} suffix="mo"
                value={draft.stages.activePartner.referralToProposalMonths}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, referralToProposalMonths: v } } })} />
              <NumberField label="Signed client threshold" disabled={ro}
                value={draft.stages.activePartner.signedClientThreshold}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, signedClientThreshold: v } } })} />
              <NumberField label="Trailing months" disabled={ro} suffix="mo"
                value={draft.stages.activePartner.signedClientMonths}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, signedClientMonths: v } } })} />
              <NumberField label="Referred revenue threshold ($)" disabled={ro}
                value={draft.stages.activePartner.referredRevenueThreshold}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, referredRevenueThreshold: v } } })} />
              <NumberField label="Trailing months" disabled={ro} suffix="mo"
                value={draft.stages.activePartner.referredRevenueMonths}
                onChange={v => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, referredRevenueMonths: v } } })} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-sm">Public partnership required</Label>
              <Switch disabled={ro}
                checked={draft.stages.activePartner.publicPartnershipRequired}
                onCheckedChange={(v) => setDraft({ ...draft, stages: { ...draft.stages, activePartner: { ...draft.stages.activePartner, publicPartnershipRequired: v } } })} />
            </div>
          </div>

          {!ro && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => rules && setDraft(rules)}>Discard</Button>
              <Button size="sm" disabled={!dirty || save.isPending}
                onClick={() => persist(draft, summarizeDiff(rules, draft))}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </section>

        {/* CHANNEL TYPES */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Channel Type Definitions</h3>
          <ChannelTypesTable channels={channels} ro={ro}
            onUpsert={(c) => upsertChannel.mutate(c)} onRemove={(id) => removeChannel.mutate(id)} />
        </section>

        {/* AUDIT LOG */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" /> Audit Trail</h3>
          <div className="rounded-md border divide-y max-h-80 overflow-y-auto">
            {audit.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No changes recorded yet.</div>
            ) : audit.map(a => (
              <div key={a.id} className="p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.changed_by_email || 'Unknown'}</span>
                  <span className="text-muted-foreground">{format(new Date(a.changed_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">{a.summary || 'Rules updated'}</div>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function ChannelTypesTable({ channels, ro, onUpsert, onRemove }: {
  channels: ChannelType[]; ro: boolean;
  onUpsert: (c: Partial<ChannelType> & { name: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Channel</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map(c => (
            <TableRow key={c.id}>
              <TableCell>
                <Input className="h-8" defaultValue={c.name} disabled={ro}
                  onBlur={e => e.target.value !== c.name && onUpsert({ ...c, name: e.target.value })} />
              </TableCell>
              <TableCell>
                <Textarea className="min-h-[36px] text-sm" rows={1} defaultValue={c.description} disabled={ro}
                  onBlur={e => e.target.value !== c.description && onUpsert({ ...c, description: e.target.value })} />
              </TableCell>
              <TableCell>
                {!ro && (
                  <Button size="icon" variant="ghost" onClick={() => onRemove(c.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!ro && (
            <TableRow>
              <TableCell>
                <Input className="h-8" placeholder="New channel name" value={newName} onChange={e => setNewName(e.target.value)} />
              </TableCell>
              <TableCell>
                <Textarea className="min-h-[36px] text-sm" rows={1} placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" disabled={!newName.trim()}
                  onClick={() => { onUpsert({ name: newName.trim(), description: newDesc.trim(), sort_order: channels.length }); setNewName(''); setNewDesc(''); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function summarizeDiff(prev: PartnerRules | undefined, next: PartnerRules): string {
  if (!prev) return 'Initial rules saved';
  const changes: string[] = [];
  const cmp = (path: string, a: any, b: any) => { if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(path); };
  cmp('Tier 1', prev.tiers.tier1, next.tiers.tier1);
  cmp('Tier 2', prev.tiers.tier2, next.tiers.tier2);
  cmp('Tier 3', prev.tiers.tier3, next.tiers.tier3);
  cmp('Tier 4', prev.tiers.tier4, next.tiers.tier4);
  cmp('Qualified stages', prev.tiers.qualifiedDealStages, next.tiers.qualifiedDealStages);
  cmp('Trial labels', prev.stages.trial.labels, next.stages.trial.labels);
  cmp('Active Partner criteria', prev.stages.activePartner, next.stages.activePartner);
  return changes.length ? `Updated: ${changes.join(', ')}` : 'Rules updated';
}
