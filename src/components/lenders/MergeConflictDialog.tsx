import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GitMerge, ArrowRight } from 'lucide-react';

interface MergeField {
  key: string;
  label: string;
  naitive: unknown;
  flex: unknown;
}

interface MergeConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenderName: string;
  changesDiff: Record<string, { old: unknown; new: unknown }>;
  incomingData: Record<string, unknown>;
  onMerge: (mergedData: Record<string, unknown>) => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
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
  referral_lender: 'Referral Lender',
  referral_fee_offered: 'Referral Fee Offered',
  referral_agreement: 'Referral Agreement',
  nda: 'NDA',
  onboarded_to_flex: 'Onboarded to FLEx',
  upfront_checklist: 'Upfront Checklist',
  post_term_sheet_checklist: 'Post Term Sheet Checklist',
  gift_address: 'Gift Address',
  tier: 'Tier',
  active: 'Active',
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '(empty)';
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '(empty)';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}

export function MergeConflictDialog({
  open,
  onOpenChange,
  lenderName,
  changesDiff,
  incomingData,
  onMerge,
}: MergeConflictDialogProps) {
  // For each changed field, track whether user picks 'naitive' or 'flex'
  const [selections, setSelections] = useState<Record<string, 'naitive' | 'flex'>>({});

  const fields: MergeField[] = useMemo(() => {
    if (!changesDiff) return [];
    return Object.entries(changesDiff).map(([key, { old: naitive, new: flex }]) => ({
      key,
      label: FIELD_LABELS[key] || key.replace(/_/g, ' '),
      naitive,
      flex,
    }));
  }, [changesDiff]);

  // Default: keep Naitive values for all fields
  useEffect(() => {
    if (fields.length > 0) {
      const defaults: Record<string, 'naitive' | 'flex'> = {};
      fields.forEach(f => { defaults[f.key] = 'naitive'; });
      setSelections(defaults);
    }
  }, [fields]);

  const flexCount = Object.values(selections).filter(v => v === 'flex').length;
  const naitiveCount = Object.values(selections).filter(v => v === 'naitive').length;

  const handleSelectAll = (source: 'naitive' | 'flex') => {
    const updated: Record<string, 'naitive' | 'flex'> = {};
    fields.forEach(f => { updated[f.key] = source; });
    setSelections(updated);
  };

  const handleMerge = () => {
    // Build merged data: start with incoming (FLEx) data, then override fields where user picked Naitive
    const merged = { ...incomingData };
    fields.forEach(field => {
      if (selections[field.key] === 'naitive') {
        merged[field.key] = field.naitive;
      }
    });
    onMerge(merged);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-amber-500" />
            Resolve Merge Conflict
          </DialogTitle>
          <DialogDescription>
            Choose which values to keep for <strong>{lenderName}</strong>. For each field, select the Naitive (current) or FLEx (incoming) value.
          </DialogDescription>
        </DialogHeader>

        {/* Quick select buttons */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Quick select:</span>
          <Button variant="outline" size="sm" onClick={() => handleSelectAll('naitive')}>
            Keep All Naitive
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSelectAll('flex')}>
            Use All FLEx
          </Button>
        </div>

        <ScrollArea className="max-h-[420px] pr-2">
          <div className="space-y-3">
            {fields.map((field) => {
              const selected = selections[field.key] || 'naitive';
              return (
                <div key={field.key} className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b">
                    <span className="text-sm font-medium capitalize">{field.label}</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x">
                    {/* Naitive side */}
                    <button
                      type="button"
                      onClick={() => setSelections(prev => ({ ...prev, [field.key]: 'naitive' }))}
                      className={cn(
                        'p-3 text-left transition-colors text-sm cursor-pointer',
                        selected === 'naitive'
                          ? 'bg-primary/10 ring-2 ring-inset ring-primary'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Naitive
                        </Badge>
                        {selected === 'naitive' && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-foreground break-words">{formatValue(field.naitive)}</p>
                    </button>

                    {/* FLEx side */}
                    <button
                      type="button"
                      onClick={() => setSelections(prev => ({ ...prev, [field.key]: 'flex' }))}
                      className={cn(
                        'p-3 text-left transition-colors text-sm cursor-pointer',
                        selected === 'flex'
                          ? 'bg-amber-500/10 ring-2 ring-inset ring-amber-500'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600">
                          FLEx
                        </Badge>
                        {selected === 'flex' && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-foreground break-words">{formatValue(field.flex)}</p>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-xs text-muted-foreground flex items-center gap-1 mr-auto">
            <span>{naitiveCount} Naitive</span>
            <ArrowRight className="h-3 w-3" />
            <span>{flexCount} FLEx</span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMerge}>
            <GitMerge className="h-4 w-4 mr-1" />
            Apply Merge ({fields.length} fields)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
