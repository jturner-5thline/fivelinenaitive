import { useState, useMemo } from 'react';
import { DuplicateCluster } from '@/hooks/useDealDuplicates';
import { Deal, STATUS_CONFIG, STAGE_CONFIG } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Crown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useDealsContext } from '@/contexts/DealsContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DealMergeDrawerProps {
  cluster: DuplicateCluster | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MergeField = 'name' | 'company' | 'stage' | 'status' | 'value' | 'manager' | 'dealOwner' | 'analyst' | 'engagementType' | 'contact' | 'notes' | 'narrative';

const MERGE_FIELDS: { key: MergeField; label: string }[] = [
  { key: 'company', label: 'Company Name' },
  { key: 'name', label: 'Deal Name' },
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

export function DealMergeDrawer({ cluster, open, onOpenChange }: DealMergeDrawerProps) {
  const { refreshDeals } = useDealsContext();
  const [isMerging, setIsMerging] = useState(false);

  // Primary deal = most recently updated
  const deals = cluster?.deals || [];
  const [primaryDealId, setPrimaryDealId] = useState<string>(deals[0]?.id || '');

  // Selected values per field — default to primary deal's values
  const [selections, setSelections] = useState<Record<MergeField, string>>(() => {
    const primary = deals[0];
    if (!primary) return {} as Record<MergeField, string>;
    return Object.fromEntries(MERGE_FIELDS.map(f => [f.key, primary.id])) as Record<MergeField, string>;
  });

  // Reset when cluster changes
  useMemo(() => {
    if (deals.length > 0) {
      setPrimaryDealId(deals[0].id);
      setSelections(Object.fromEntries(MERGE_FIELDS.map(f => [f.key, deals[0].id])) as Record<MergeField, string>);
    }
  }, [cluster?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getFieldValue = (deal: Deal, field: MergeField): string => {
    const val = deal[field];
    if (val === null || val === undefined) return '—';
    if (field === 'value') return `$${Number(val).toLocaleString()}`;
    if (field === 'stage') return STAGE_CONFIG[val as string]?.label || String(val);
    if (field === 'status') return STATUS_CONFIG[val as string]?.label || String(val);
    return String(val);
  };

  const handleMerge = async () => {
    if (!cluster || deals.length < 2) return;
    setIsMerging(true);

    try {
      const primary = deals.find(d => d.id === primaryDealId)!;
      const otherDeals = deals.filter(d => d.id !== primaryDealId);

      // Build merged field values
      const mergedData: Record<string, any> = {};
      for (const field of MERGE_FIELDS) {
        const sourceDealId = selections[field.key];
        const sourceDeal = deals.find(d => d.id === sourceDealId) || primary;
        const val = sourceDeal[field.key];
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

      // Archive other deals with merged_into reference
      for (const deal of otherDeals) {
        const { error } = await supabase
          .from('deals')
          .update({
            status: 'archived',
            merged_into: primaryDealId,
          })
          .eq('id', deal.id);
        if (error) throw error;
      }

      await refreshDeals();
      onOpenChange(false);
      toast({
        title: 'Deals merged successfully',
        description: `${otherDeals.length} deal${otherDeals.length !== 1 ? 's' : ''} archived and merged into ${primary.company || primary.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Merge failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsMerging(false);
    }
  };

  if (!cluster) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Merge Deals</SheetTitle>
          <SheetDescription>
            Select the value to keep for each field. Click a cell to choose it. The primary deal survives; others are archived.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)] mt-4 pr-4">
          {/* Primary deal selector */}
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">PRIMARY DEAL (survives after merge)</p>
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

          {/* Field comparison table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Field</th>
                  {deals.map(deal => (
                    <th key={deal.id} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {deal.id === primaryDealId && <Crown className="h-3 w-3 text-primary" />}
                        <span className="truncate">{deal.company || deal.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MERGE_FIELDS.map(field => (
                  <tr key={field.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs font-medium text-muted-foreground">{field.label}</td>
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
                              <span className="truncate">{value}</span>
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Info about what happens */}
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <p>• The primary deal will be updated with selected values</p>
            <p>• Notes from all deals will be concatenated</p>
            <p>• {deals.length - 1} deal{deals.length > 2 ? 's' : ''} will be archived with a reference to the primary</p>
            <p>• HubSpot IDs from archived deals will be preserved to prevent re-import</p>
          </div>
        </ScrollArea>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background p-4">
          <div className="flex justify-end gap-2">
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
                'Confirm Merge'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
