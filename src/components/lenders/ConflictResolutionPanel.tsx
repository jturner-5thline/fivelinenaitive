import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  GitMerge,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { LenderSyncRequest } from '@/hooks/useLenderSyncRequests';
import { formatDistanceToNow } from 'date-fns';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  aliases: 'Aliases',
  email: 'Email',
  lender_type: 'Funding Source Type',
  loan_types: 'Loan Types',
  sub_debt: 'Sub Debt',
  cash_burn: 'Cash Burn',
  sponsorship: 'Sponsorship',
  min_revenue: 'Min Revenue',
  ebitda_min: 'EBITDA Min',
  min_deal: 'Min Deal Size',
  max_deal: 'Max Deal Size',
  industries: 'Industries',
  industries_to_avoid: 'Industries to Avoid',
  b2b_b2c: 'B2B/B2C',
  refinancing: 'Refinancing',
  company_requirements: 'Company Requirements',
  deal_structure_notes: 'Deal Structure Notes',
  geo: 'Geography',
  contact_name: 'Contact Name',
  contact_title: 'Contact Title',
  relationship_owners: 'Relationship Owners',
  lender_one_pager_url: 'One Pager URL',
  notes: 'Notes',
  tags: 'Tags',
  tier: 'Tier',
  active: 'Active',
  last_modified: 'Last Modified',
};

// Logical grouping for the side-by-side view
const FIELD_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Identity', keys: ['name', 'aliases', 'lender_type', 'tier', 'active'] },
  { title: 'Mandate', keys: ['loan_types', 'min_deal', 'max_deal', 'min_revenue', 'ebitda_min', 'sub_debt', 'cash_burn', 'sponsorship', 'refinancing', 'b2b_b2c'] },
  { title: 'Coverage', keys: ['industries', 'industries_to_avoid', 'geo'] },
  { title: 'Contacts', keys: ['contact_name', 'contact_title', 'email', 'relationship_owners'] },
  { title: 'Notes & Tags', keys: ['notes', 'tags', 'company_requirements', 'deal_structure_notes', 'lender_one_pager_url'] },
];

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return formatValue(a) === formatValue(b);
}

interface ConflictResolutionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: LenderSyncRequest[];
  initialIndex: number;
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string, notes?: string) => Promise<boolean>;
  onMerge: (id: string, mergedData: Record<string, unknown>) => Promise<boolean>;
}

export function ConflictResolutionPanel({
  open,
  onOpenChange,
  conflicts,
  initialIndex,
  onApprove,
  onReject,
  onMerge,
}: ConflictResolutionPanelProps) {
  const [index, setIndex] = useState(initialIndex);
  const [selections, setSelections] = useState<Record<string, 'existing' | 'incoming'>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = conflicts[index];

  // Build a unified field list combining changes_diff (conflicts) with stable
  // fields from incoming_data so the panel always shows the key attributes.
  const allFields = useMemo(() => {
    if (!current) return [] as { key: string; label: string; existing: unknown; incoming: unknown; differs: boolean }[];
    const diff = (current.changes_diff || {}) as Record<string, { old: unknown; new: unknown }>;
    const incoming = (current.incoming_data || {}) as Record<string, unknown>;
    const keys = new Set<string>();
    Object.keys(diff).forEach((k) => keys.add(k));
    FIELD_GROUPS.forEach((g) => g.keys.forEach((k) => keys.add(k)));

    return Array.from(keys).map((key) => {
      const existing = key in diff ? diff[key].old : incoming[key];
      const incomingVal = key in diff ? diff[key].new : incoming[key];
      return {
        key,
        label: FIELD_LABELS[key] || key.replace(/_/g, ' '),
        existing,
        incoming: incomingVal,
        differs: key in diff || !valuesEqual(existing, incomingVal),
      };
    });
  }, [current]);

  // Default per-field selection: keep existing for everything (safer default)
  useEffect(() => {
    if (!current) return;
    const defaults: Record<string, 'existing' | 'incoming'> = {};
    allFields.forEach((f) => { defaults[f.key] = 'existing'; });
    setSelections(defaults);
  }, [current?.id, allFields]);

  if (!current) return null;

  const incomingData = (current.incoming_data || {}) as Record<string, unknown>;
  const lenderName = (incomingData.name as string) || current.existing_lender_name || 'Unknown lender';
  const conflictFieldCount = Object.keys(current.changes_diff || {}).length;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(conflicts.length - 1, i + 1));
  const advanceOrClose = () => {
    if (index < conflicts.length - 1) goNext();
    else onOpenChange(false);
  };

  const handleKeepExisting = async () => {
    setIsProcessing(true);
    const ok = await onReject(current.id, 'Kept existing record');
    setIsProcessing(false);
    if (ok) {
      toast({ title: 'Kept existing', description: `Existing record kept for ${lenderName}.` });
      advanceOrClose();
    } else {
      toast({ title: 'Error', description: 'Failed to keep existing.', variant: 'destructive' });
    }
  };

  const handleReplaceWithIncoming = async () => {
    setIsProcessing(true);
    // Replace = merge using incoming values for every field
    const ok = await onMerge(current.id, { ...incomingData });
    setIsProcessing(false);
    if (ok) {
      toast({ title: 'Replaced', description: `${lenderName} replaced with incoming Flex record.` });
      advanceOrClose();
    } else {
      toast({ title: 'Error', description: 'Failed to replace.', variant: 'destructive' });
    }
  };

  const handleMergeFields = async () => {
    // Build merged: start from incoming, override with existing where user picked it
    const merged: Record<string, unknown> = { ...incomingData };
    allFields.forEach((f) => {
      if (selections[f.key] === 'existing') merged[f.key] = f.existing;
    });
    setIsProcessing(true);
    const ok = await onMerge(current.id, merged);
    setIsProcessing(false);
    if (ok) {
      toast({ title: 'Merged', description: `Saved selected values for ${lenderName}.` });
      advanceOrClose();
    } else {
      toast({ title: 'Error', description: 'Failed to merge.', variant: 'destructive' });
    }
  };

  const handleMarkNotDuplicate = async () => {
    setIsProcessing(true);
    // Approve treats incoming as a separate record (handled upstream).
    // We use reject with explicit note so audit trail is clear and existing record is untouched.
    const ok = await onReject(current.id, 'Marked as not duplicate');
    setIsProcessing(false);
    if (ok) {
      toast({ title: 'Marked as not duplicate', description: `${lenderName} flagged as a separate record.` });
      advanceOrClose();
    } else {
      toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' });
    }
  };

  const setAll = (source: 'existing' | 'incoming') => {
    const updated: Record<string, 'existing' | 'incoming'> = {};
    allFields.forEach((f) => { updated[f.key] = source; });
    setSelections(updated);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Resolve Conflict
                <Badge variant="outline" className="ml-1 text-[10px]">
                  {index + 1} of {conflicts.length}
                </Badge>
              </SheetTitle>
              <SheetDescription className="mt-1 truncate">
                <span className="font-medium text-foreground">{lenderName}</span>
                {current.existing_lender_name && current.existing_lender_name !== lenderName && (
                  <span className="text-muted-foreground"> · matches existing “{current.existing_lender_name}”</span>
                )}
                <span className="text-muted-foreground"> · {conflictFieldCount} field{conflictFieldCount === 1 ? '' : 's'} differ</span>
              </SheetDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} disabled={index === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} disabled={index >= conflicts.length - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Per-field selection helpers */}
        <div className="flex items-center gap-2 px-6 py-2 border-b bg-muted/30 text-xs">
          <span className="text-muted-foreground">Quick pick:</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAll('existing')}>
            All Existing
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAll('incoming')}>
            All Incoming
          </Button>
          <div className="ml-auto text-muted-foreground">
            Created {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
          </div>
        </div>

        {/* Body: side-by-side comparison */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground sticky top-0 bg-background pb-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Existing Lender</Badge>
              </div>
              <ArrowRight className="h-3 w-3" />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">Incoming Flex Record</Badge>
              </div>
            </div>

            {FIELD_GROUPS.map((group) => {
              const groupFields = allFields.filter((f) => group.keys.includes(f.key));
              if (groupFields.length === 0) return null;
              return (
                <div key={group.title} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
                  <div className="rounded-lg border divide-y">
                    {groupFields.map((f) => {
                      const selected = selections[f.key] || 'existing';
                      return (
                        <div key={f.key} className="grid grid-cols-[1fr_auto_1fr] items-stretch">
                          <button
                            type="button"
                            onClick={() => setSelections((p) => ({ ...p, [f.key]: 'existing' }))}
                            className={cn(
                              'p-3 text-left text-sm transition-colors min-w-0',
                              selected === 'existing' && f.differs
                                ? 'bg-primary/10 ring-2 ring-inset ring-primary'
                                : 'hover:bg-muted/40',
                            )}
                          >
                            <p className="text-[11px] text-muted-foreground mb-1">{f.label}</p>
                            <p className="break-words">{formatValue(f.existing)}</p>
                          </button>
                          <div className="flex items-center justify-center px-2 border-x bg-muted/20">
                            {f.differs ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-muted-foreground/60" />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelections((p) => ({ ...p, [f.key]: 'incoming' }))}
                            className={cn(
                              'p-3 text-left text-sm transition-colors min-w-0',
                              selected === 'incoming' && f.differs
                                ? 'bg-amber-500/10 ring-2 ring-inset ring-amber-500'
                                : 'hover:bg-muted/40',
                            )}
                          >
                            <p className="text-[11px] text-muted-foreground mb-1">{f.label}</p>
                            <p className="break-words">{formatValue(f.incoming)}</p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <Separator />
        <div className="px-6 py-3 flex flex-wrap items-center gap-2 bg-background">
          <Button variant="outline" size="sm" onClick={handleKeepExisting} disabled={isProcessing}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            Keep Existing
          </Button>
          <Button variant="outline" size="sm" onClick={handleReplaceWithIncoming} disabled={isProcessing}>
            <ArrowRight className="h-4 w-4 mr-1" />
            Replace with Incoming
          </Button>
          <Button variant="outline" size="sm" onClick={handleMarkNotDuplicate} disabled={isProcessing}>
            <X className="h-4 w-4 mr-1" />
            Mark as Not Duplicate
          </Button>
          <div className="ml-auto" />
          <Button
            size="sm"
            className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground hover:from-primary/90 hover:to-primary/60"
            onClick={handleMergeFields}
            disabled={isProcessing}
          >
            <GitMerge className="h-4 w-4 mr-1" />
            Apply Field Selections
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
