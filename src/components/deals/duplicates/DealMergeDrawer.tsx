import { useState, useMemo, useEffect } from 'react';
import { DuplicateCluster } from '@/hooks/useDealDuplicates';
import { Deal, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EngagementType } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Crown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelines } from '@/hooks/usePipelines';
import { useCompany } from '@/hooks/useCompany';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DealMergeDrawerProps {
  cluster: DuplicateCluster | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MergeField = 'company' | 'stage' | 'status' | 'value' | 'manager' | 'dealOwner' | 'analyst' | 'engagementType' | 'contact' | 'notes' | 'narrative' | 'pipelineId';

const MERGE_FIELDS: { key: MergeField; label: string }[] = [
  { key: 'company', label: 'Company Name' },
  { key: 'pipelineId', label: 'Pipeline' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'value', label: 'Deal Value' },
  { key: 'manager', label: 'Manager' },
  { key: 'dealOwner', label: 'Deal Owner' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'engagementType', label: 'Engagement Type' },
  { key: 'contact', label: 'Contact' },
  { key: 'notes', label: 'Notes' },
  { key: 'narrative', label: 'Narrative' },
];

// Stage ordering for "most advanced" logic
const STAGE_ORDER: string[] = [
  'prospect', 'qualification', 'engaged', 'submitted-to-lenders', 'lenders-in-review',
  'write-up-pending', 'client-strategy-review', 'final-credit-items',
  'due-diligence', 'in-due-diligence', 'under-loi', 'term-sheet', 'terms-issued',
  'closing', 'funded-invoiced', 'closed-won',
];

function getSmartDefaults(deals: Deal[]): Record<MergeField, string> {
  const first = deals[0];
  const defaults = Object.fromEntries(MERGE_FIELDS.map(f => [f.key, first.id])) as Record<MergeField, string>;

  // Value: highest
  const highestValue = deals.reduce((best, d) => (d.value || 0) > (best.value || 0) ? d : best, deals[0]);
  if (highestValue.value) defaults.value = highestValue.id;

  // Manager: first non-empty
  const withManager = deals.find(d => d.manager && d.manager.trim());
  if (withManager) defaults.manager = withManager.id;

  // Deal Owner: first non-empty
  const withOwner = deals.find(d => d.dealOwner && d.dealOwner.trim());
  if (withOwner) defaults.dealOwner = withOwner.id;

  // Stage: most advanced
  const mostAdvanced = deals.reduce((best, d) => {
    const bestIdx = STAGE_ORDER.indexOf(best.stage);
    const dIdx = STAGE_ORDER.indexOf(d.stage);
    return dIdx > bestIdx ? d : best;
  }, deals[0]);
  defaults.stage = mostAdvanced.id;

  // Lenders count is not a merge field but stage from most advanced helps

  // Notes: first non-empty
  const withNotes = deals.find(d => d.notes && d.notes.trim());
  if (withNotes) defaults.notes = withNotes.id;

  // Narrative: first non-empty
  const withNarrative = deals.find(d => d.narrative && d.narrative.trim());
  if (withNarrative) defaults.narrative = withNarrative.id;

  // Contact: first non-empty
  const withContact = deals.find(d => d.contact && d.contact.trim());
  if (withContact) defaults.contact = withContact.id;

  return defaults;
}

/** Shared display-value resolver for merge table fields */
function resolveDisplayValue(
  field: MergeField,
  val: unknown,
  pipelineMap: Map<string, string>,
  pipelineStageMap: Map<string, string>,
  memberNameMap: Map<string, string>,
): string {
  if (val === null || val === undefined || val === '') return '—';

  const str = String(val);

  switch (field) {
    case 'pipelineId':
      return pipelineMap.get(str) || str || '—';
    case 'value':
      return `$${Number(val).toLocaleString()}`;
    case 'stage':
      return STAGE_CONFIG[str]?.label || pipelineStageMap.get(str) || str;
    case 'status':
      return STATUS_CONFIG[str]?.label || str;
    case 'engagementType':
      return ENGAGEMENT_TYPE_CONFIG[str as keyof typeof ENGAGEMENT_TYPE_CONFIG]?.label || str;
    case 'manager':
    case 'dealOwner':
    case 'analyst':
      // If the value looks like a numeric ID (e.g. HubSpot owner ID), try resolving from members
      if (/^\d+$/.test(str)) {
        return memberNameMap.get(str) || str;
      }
      // If it's a UUID, try resolving
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(str)) {
        return memberNameMap.get(str) || str;
      }
      // Already a display name
      return str;
    case 'notes':
    case 'narrative':
      return str.length > 80 ? str.slice(0, 80) + '…' : str;
    default:
      if (Array.isArray(val)) {
        return val.length > 0 ? val.join(', ') : '—';
      }
      return str;
  }
}

export function DealMergeDrawer({ cluster, open, onOpenChange }: DealMergeDrawerProps) {
  const { refreshDeals } = useDealsContext();
  const { pipelines } = usePipelines();
  const { members } = useCompany();
  const [isMerging, setIsMerging] = useState(false);

  const deals = cluster?.deals || [];

  const [primaryDealId, setPrimaryDealId] = useState<string>('');
  const [selections, setSelections] = useState<Record<MergeField, string>>({} as any);
  const [mergedName, setMergedName] = useState('');
  // Custom engagement type override — when set, overrides the source-deal selection
  const [customEngagementType, setCustomEngagementType] = useState<EngagementType | null>(null);

  const pipelineMap = useMemo(() => {
    const map = new Map<string, string>();
    pipelines.forEach(p => map.set(p.id, p.name));
    return map;
  }, [pipelines]);

  // Build a stage ID → label map from all pipeline stages
  const pipelineStageMap = useMemo(() => {
    const map = new Map<string, string>();
    pipelines.forEach(p => {
      const stages = (p as any).stages;
      if (Array.isArray(stages)) {
        stages.forEach((s: any) => {
          if (s.id && s.label) map.set(s.id, s.label);
        });
      }
    });
    return map;
  }, [pipelines]);

  // Build a member lookup map (user_id → display_name, also index by display_name for pass-through)
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach(m => {
      const name = m.display_name || m.email || 'Team Member';
      if (m.user_id) map.set(m.user_id, name);
    });
    return map;
  }, [members]);

  // Unified field value getter using the shared resolver
  const getFieldValue = (deal: Deal, field: MergeField): string => {
    const val = field === 'pipelineId' ? deal.pipelineId : deal[field as keyof Deal];
    return resolveDisplayValue(field, val, pipelineMap, pipelineStageMap, memberNameMap);
  };

  // Reset state when cluster changes
  useEffect(() => {
    if (deals.length > 0 && open) {
      setPrimaryDealId(deals[0].id);
      setSelections(getSmartDefaults(deals));
      setMergedName(cluster?.primaryName || deals[0].company || deals[0].name);
      setCustomEngagementType(null);
    }
  }, [cluster?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute merged preview
  const mergedPreview = useMemo(() => {
    if (deals.length === 0) return {};
    const preview: Record<string, string> = { name: mergedName };
    for (const field of MERGE_FIELDS) {
      const sourceDeal = deals.find(d => d.id === selections[field.key]) || deals[0];
      preview[field.key] = getFieldValue(sourceDeal, field.key);
    }
    // Lenders: combine from all
    const totalLenders = deals.reduce((sum, d) => sum + (d.lenders?.length || 0), 0);
    preview.lenders = `${totalLenders} lenders (combined)`;
    return preview;
  }, [deals, selections, mergedName, pipelineMap, pipelineStageMap, memberNameMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedFeeCount = MERGE_FIELDS.filter(f => {
    const deal = deals.find(d => d.id === selections[f.key]);
    if (!deal) return false;
    const val = deal[f.key as keyof Deal];
    return val !== null && val !== undefined && val !== '' && val !== '—';
  }).length;

  const handleMerge = async () => {
    if (!cluster || deals.length < 2) return;
    setIsMerging(true);

    try {
      const primary = deals.find(d => d.id === primaryDealId)!;
      const otherDeals = deals.filter(d => d.id !== primaryDealId);

      // Build merged field values
      const mergedData: Record<string, any> = { name: mergedName, company: mergedName };
      for (const field of MERGE_FIELDS) {
        const sourceDealId = selections[field.key];
        const sourceDeal = deals.find(d => d.id === sourceDealId) || primary;
        const val = sourceDeal[field.key as keyof Deal];
        if (val !== undefined && val !== null) {
          mergedData[field.key] = val;
        }
      }

      // Concatenate notes from all deals
      const allNotes = deals
        .map(d => d.notes ? `[From ${d.company || d.name}]: ${d.notes}` : '')
        .filter(Boolean)
        .join('\n\n');
      if (allNotes) mergedData.notes = allNotes;

      // Collect HubSpot IDs from merged deals
      const hubspotIds = otherDeals
        .map(d => (d as any).hubspot_deal_id)
        .filter(Boolean);

      // Convert field names to snake_case for DB
      const dbUpdate: Record<string, any> = {};
      for (const [key, val] of Object.entries(mergedData)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbUpdate[snakeKey] = val;
      }

      // Update primary deal
      const { error: updateError } = await supabase
        .from('deals')
        .update(dbUpdate)
        .eq('id', primaryDealId);
      if (updateError) throw updateError;

      // If there are hubspot IDs to preserve
      if (hubspotIds.length > 0) {
        await supabase
          .from('deals')
          .update({ merged_hubspot_ids: hubspotIds })
          .eq('id', primaryDealId);
      }

      // Delete other deals
      for (const deal of otherDeals) {
        const { error } = await supabase
          .from('deals')
          .delete()
          .eq('id', deal.id);
        if (error) throw error;
      }

      await refreshDeals();
      onOpenChange(false);
      toast.success('Deals merged successfully', {
        description: `${otherDeals.length} duplicate${otherDeals.length !== 1 ? 's' : ''} removed. "${mergedName}" updated.`,
      });
    } catch (error: any) {
      toast.error('Merge failed', { description: error.message || 'Something went wrong.' });
    } finally {
      setIsMerging(false);
    }
  };

  const isOpen = open && !!cluster && deals.length >= 2;
  const clusterName = cluster?.primaryName || '';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[85vw] w-[85vw] max-h-[80vh] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-lg">Merge {clusterName} Deals</DialogTitle>
          <DialogDescription>
            Select which value to keep for each field. The primary deal survives; duplicates are deleted.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-5">
            {/* Merged deal name */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Merged Deal Name</label>
              <Input
                value={mergedName}
                onChange={e => setMergedName(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Primary deal selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Deal (survives after merge)</label>
              <div className="flex flex-wrap gap-2">
                {deals.map(deal => (
                  <button
                    key={deal.id}
                    onClick={() => setPrimaryDealId(deal.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all',
                      primaryDealId === deal.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40'
                    )}
                  >
                    {primaryDealId === deal.id && <Crown className="h-3.5 w-3.5 text-primary" />}
                    {deal.company || deal.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison table + merged preview */}
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30 min-w-[120px]">Field</th>
                    {deals.map(deal => (
                      <th key={deal.id} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          {deal.id === primaryDealId && <Crown className="h-3 w-3 text-primary shrink-0" />}
                          <span className="truncate">{deal.company || deal.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60">
                          Updated {format(new Date(deal.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 text-xs font-medium text-primary min-w-[180px] bg-primary/5 border-l border-border">
                      Merged Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Lenders row (informational) */}
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 bg-background">Lenders</td>
                    {deals.map(deal => (
                      <td key={deal.id} className="px-3 py-2 text-xs text-muted-foreground">
                        {deal.lenders?.length || 0} lenders
                      </td>
                    ))}
                    <td className="px-3 py-2 text-xs text-primary bg-primary/5 border-l border-border font-medium">
                      {mergedPreview.lenders}
                    </td>
                  </tr>

                  {MERGE_FIELDS.map(field => (
                    <tr key={field.key} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 bg-background">{field.label}</td>
                      {deals.map(deal => {
                        const isSelected = selections[field.key] === deal.id;
                        const value = getFieldValue(deal, field.key);
                        return (
                          <td key={deal.id} className="px-1 py-1">
                            <button
                              onClick={() => setSelections(prev => ({ ...prev, [field.key]: deal.id }))}
                              className={cn(
                                'w-full text-left px-2 py-1.5 rounded-md text-xs transition-all',
                                isSelected
                                  ? 'bg-primary/15 border border-primary/40 text-foreground'
                                  : 'hover:bg-muted/50 text-muted-foreground border border-transparent'
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                {isSelected && <Check className="h-3 w-3 text-primary shrink-0" />}
                                <span className="truncate max-w-[150px]">{value}</span>
                              </div>
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-xs text-foreground bg-primary/5 border-l border-border font-medium">
                        <span className="truncate block max-w-[150px]">{mergedPreview[field.key] || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Info */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <p>• The primary deal will be updated with all selected values</p>
              <p>• Notes from all deals will be concatenated</p>
              <p>• {deals.length - 1} duplicate deal{deals.length > 2 ? 's' : ''} will be permanently deleted</p>
              <p>• HubSpot IDs from deleted deals will be preserved to prevent re-import</p>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {deals.length} deals · {selectedFeeCount} fields resolved · Primary: {deals.find(d => d.id === primaryDealId)?.company || '—'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={isMerging}>
              {isMerging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Merging...
                </>
              ) : (
                `Merge ${deals.length} Deals`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
