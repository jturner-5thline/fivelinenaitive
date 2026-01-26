import { useState, useMemo } from 'react';
import { Check, X, Merge, ChevronLeft, ChevronRight, Building2, User, Mail, MapPin, DollarSign, Briefcase, FileText, Tag, Globe, Phone, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';

interface SideBySideMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
  onMergeLenders: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  /** Optional: manually selected lender IDs to merge (bypasses duplicate detection) */
  selectedLenderIds?: string[];
}

interface DuplicateGroup {
  normalizedName: string;
  lenders: MasterLender[];
}

interface FieldSelection {
  field: string;
  selectedLenderId: string | null;
  customValue?: any;
}

function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function formatArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '-';
  return arr.join(', ');
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString();
}

// Fields that support multi-select (combining values from multiple lenders)
const MULTI_SELECT_FIELDS = [
  'contact_name',
  'contact_title', 
  'email',
  'lender_one_pager_url',
  'relationship_owners',
];

// Define all the fields we want to show
interface MergeFieldDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  format: (v: any) => string;
  multiline?: boolean;
  multiSelect?: boolean;
}

const MERGE_FIELDS: MergeFieldDef[] = [
  { key: 'name', label: 'Lender Name', icon: Building2, format: (v: any) => v || '-' },
  { key: 'lender_type', label: 'Lender Type', icon: Tag, format: (v: any) => v || '-' },
  { key: 'contact_name', label: 'Contact Name', icon: User, format: (v: any) => v || '-', multiSelect: true },
  { key: 'contact_title', label: 'Contact Title', icon: Briefcase, format: (v: any) => v || '-', multiSelect: true },
  { key: 'email', label: 'Email', icon: Mail, format: (v: any) => v || '-', multiSelect: true },
  { key: 'geo', label: 'Geography', icon: MapPin, format: (v: any) => v || '-' },
  { key: 'min_deal', label: 'Min Deal Size', icon: DollarSign, format: formatCurrency },
  { key: 'max_deal', label: 'Max Deal Size', icon: DollarSign, format: formatCurrency },
  { key: 'min_revenue', label: 'Min Revenue', icon: DollarSign, format: formatCurrency },
  { key: 'ebitda_min', label: 'Min EBITDA', icon: DollarSign, format: formatCurrency },
  { key: 'loan_types', label: 'Loan Types', icon: FileText, format: formatArray },
  { key: 'industries', label: 'Industries', icon: Briefcase, format: formatArray },
  { key: 'industries_to_avoid', label: 'Industries to Avoid', icon: X, format: formatArray },
  { key: 'sponsorship', label: 'Sponsorship', icon: Tag, format: (v: any) => v || '-' },
  { key: 'sub_debt', label: 'Sub Debt', icon: Tag, format: (v: any) => v || '-' },
  { key: 'cash_burn', label: 'Cash Burn', icon: Tag, format: (v: any) => v || '-' },
  { key: 'b2b_b2c', label: 'B2B/B2C', icon: Tag, format: (v: any) => v || '-' },
  { key: 'refinancing', label: 'Refinancing', icon: Tag, format: (v: any) => v || '-' },
  { key: 'company_requirements', label: 'Company Requirements', icon: FileText, format: (v: any) => v || '-', multiline: true },
  { key: 'deal_structure_notes', label: 'Deal Structure Notes', icon: FileText, format: (v: any) => v || '-', multiline: true },
  { key: 'relationship_owners', label: 'Relationship Owners', icon: User, format: (v: any) => v || '-', multiSelect: true },
  { key: 'referral_lender', label: 'Referral Lender', icon: Tag, format: (v: any) => v || '-' },
  { key: 'nda', label: 'NDA', icon: FileText, format: (v: any) => v || '-' },
  { key: 'onboarded_to_flex', label: 'Onboarded to Flex', icon: Check, format: (v: any) => v || '-' },
  { key: 'gift_address', label: 'Gift Address', icon: MapPin, format: (v: any) => v || '-' },
  { key: 'lender_one_pager_url', label: 'One Pager URL', icon: Globe, format: (v: any) => v || '-', multiSelect: true },
  { key: 'created_at', label: 'Created', icon: Calendar, format: formatDate },
];

interface FieldRowProps {
  fieldDef: MergeFieldDef;
  lenders: MasterLender[];
  selectedLenderIds: string[];
  onSelect: (lenderId: string) => void;
  onToggle: (lenderId: string) => void;
}

function FieldRow({ fieldDef, lenders, selectedLenderIds, onSelect, onToggle }: FieldRowProps) {
  const Icon = fieldDef.icon;
  const isMultiSelect = fieldDef.multiSelect;
  const values = lenders.map(l => ({
    id: l.id,
    value: (l as any)[fieldDef.key],
    formatted: fieldDef.format((l as any)[fieldDef.key]),
  }));

  // Check if all values are the same (or all empty)
  const uniqueValues = new Set(values.map(v => JSON.stringify(v.value)));
  const allSame = uniqueValues.size === 1;
  const hasAnyValue = values.some(v => v.value != null && v.value !== '' && (Array.isArray(v.value) ? v.value.length > 0 : true));

  if (!hasAnyValue) return null;

  // Count how many are selected for multi-select fields
  const selectedCount = isMultiSelect ? selectedLenderIds.length : 0;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-1.5 py-1.5 px-2 bg-muted/30">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate">{fieldDef.label}</span>
        {allSame && <Badge variant="secondary" className="text-[10px] ml-auto px-1.5 py-0">Same</Badge>}
        {isMultiSelect && !allSame && (
          <Badge variant="outline" className="text-[10px] ml-auto gap-0.5 px-1.5 py-0">
            <span className="text-primary">{selectedCount}</span> • Multi
          </Badge>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${lenders.length}, 1fr)` }}>
        {values.map((val, idx) => {
          const isSelected = selectedLenderIds.includes(val.id);
          const hasValue = val.value != null && val.value !== '' && (Array.isArray(val.value) ? val.value.length > 0 : true);
          
          return (
            <button
              key={val.id}
              onClick={() => {
                if (!hasValue) return;
                if (isMultiSelect) {
                  onToggle(val.id);
                } else {
                  onSelect(val.id);
                }
              }}
              disabled={!hasValue}
              className={cn(
                "p-2 text-left transition-all relative border-r last:border-r-0 border-border/30",
                hasValue && "hover:bg-primary/5 cursor-pointer",
                !hasValue && "bg-muted/20 cursor-not-allowed",
                isSelected && !isMultiSelect && "bg-primary/10 ring-2 ring-primary ring-inset",
                isSelected && isMultiSelect && "bg-green-500/10 ring-2 ring-green-500 ring-inset",
                fieldDef.multiline && "min-h-[80px]"
              )}
            >
              {isSelected && (
                <div className="absolute top-0.5 right-0.5">
                  <Check className={cn("h-3 w-3", isMultiSelect ? "text-green-500" : "text-primary")} />
                </div>
              )}
              <span className={cn(
                "text-xs block truncate",
                !hasValue && "text-muted-foreground italic",
                fieldDef.multiline && "whitespace-pre-wrap line-clamp-2"
              )}>
                {val.formatted}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MergeView({ 
  group, 
  onMerge, 
  onSkip,
  isProcessing 
}: { 
  group: DuplicateGroup; 
  onMerge: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => void;
  onSkip: () => void;
  isProcessing: boolean;
}) {
  // Initialize selections - for each field, select the first lender that has a value
  // For multi-select fields, we store an array of lender IDs
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    MERGE_FIELDS.forEach(field => {
      const lenderWithValue = group.lenders.find(l => {
        const val = (l as any)[field.key];
        return val != null && val !== '' && (Array.isArray(val) ? val.length > 0 : true);
      });
      if (lenderWithValue) {
        initial[field.key] = [lenderWithValue.id];
      } else {
        initial[field.key] = [];
      }
    });
    return initial;
  });

  const handleFieldSelect = (fieldKey: string, lenderId: string) => {
    // Single select - replace the selection
    setSelections(prev => ({ ...prev, [fieldKey]: [lenderId] }));
  };

  const handleFieldToggle = (fieldKey: string, lenderId: string) => {
    // Multi-select - toggle the selection
    setSelections(prev => {
      const current = prev[fieldKey] || [];
      if (current.includes(lenderId)) {
        // Remove from selection
        return { ...prev, [fieldKey]: current.filter(id => id !== lenderId) };
      } else {
        // Add to selection
        return { ...prev, [fieldKey]: [...current, lenderId] };
      }
    });
  };

  const handleConfirmMerge = () => {
    // Use the first lender as the "keep" record, merge others into it
    const keepId = group.lenders[0].id;
    const mergeIds = group.lenders.slice(1).map(l => l.id);

    // Build merged data from selections
    const mergedData: Partial<MasterLenderInsert> = {};
    
    Object.entries(selections).forEach(([fieldKey, lenderIds]) => {
      if (fieldKey === 'created_at') return; // Skip read-only fields
      if (lenderIds.length === 0) return;

      const fieldDef = MERGE_FIELDS.find(f => f.key === fieldKey);
      const isMultiSelect = fieldDef?.multiSelect;

      if (isMultiSelect && lenderIds.length > 1) {
        // Combine values from multiple lenders with delimiter
        const values = lenderIds
          .map(id => {
            const lender = group.lenders.find(l => l.id === id);
            return lender ? (lender as any)[fieldKey] : null;
          })
          .filter(v => v != null && v !== '');
        
        // Join with " | " delimiter for multiple values
        (mergedData as any)[fieldKey] = values.join(' | ');
      } else {
        // Single selection - use the value from the selected lender
        const lender = group.lenders.find(l => l.id === lenderIds[0]);
        if (lender) {
          (mergedData as any)[fieldKey] = (lender as any)[fieldKey];
        }
      }
    });

    onMerge(keepId, mergeIds, mergedData);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable container */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Header with lender columns */}
        <div className="border-b bg-muted/50 sticky top-0 z-10">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${group.lenders.length}, 1fr)` }}>
            {group.lenders.map((lender, idx) => (
              <div key={lender.id} className="p-2 border-r last:border-r-0 border-border/30">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{lender.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {idx === 0 ? 'Primary' : `#${idx + 1}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {MERGE_FIELDS.map(field => (
            <FieldRow
              key={field.key}
              fieldDef={field}
              lenders={group.lenders}
              selectedLenderIds={selections[field.key] || []}
              onSelect={(lenderId) => handleFieldSelect(field.key, lenderId)}
              onToggle={(lenderId) => handleFieldToggle(field.key, lenderId)}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t p-3 flex justify-between items-center bg-background gap-4">
        <p className="text-xs text-muted-foreground hidden sm:block">
          Click to select • Green fields combine values
        </p>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={onSkip} disabled={isProcessing}>
            Skip
          </Button>
          <Button size="sm" onClick={handleConfirmMerge} disabled={isProcessing} className="gap-1.5">
            <Merge className="h-3.5 w-3.5" />
            Merge {group.lenders.length} → 1
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SideBySideMergeDialog({
  open,
  onOpenChange,
  lenders,
  onMergeLenders,
  selectedLenderIds,
}: SideBySideMergeDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

  // Determine if we're in manual selection mode
  const isManualSelectionMode = selectedLenderIds && selectedLenderIds.length >= 2;

  // Find duplicate groups OR use manually selected lenders
  const duplicateGroups = useMemo(() => {
    // If manual selection mode, create a single group from selected lenders
    if (isManualSelectionMode) {
      const selectedLenders = lenders.filter(l => selectedLenderIds.includes(l.id));
      if (selectedLenders.length >= 2) {
        return [{
          normalizedName: 'manual-selection',
          lenders: selectedLenders.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
        }];
      }
      return [];
    }

    // Otherwise, auto-detect duplicates by name
    const nameMap = new Map<string, MasterLender[]>();
    
    lenders.forEach(lender => {
      const normalized = normalizeNameForComparison(lender.name);
      const existing = nameMap.get(normalized) || [];
      existing.push(lender);
      nameMap.set(normalized, existing);
    });

    const groups: DuplicateGroup[] = [];
    nameMap.forEach((lenderList, normalizedName) => {
      if (lenderList.length > 1) {
        groups.push({
          normalizedName,
          lenders: lenderList.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
        });
      }
    });

    return groups.sort((a, b) => b.lenders.length - a.lenders.length);
  }, [lenders, selectedLenderIds, isManualSelectionMode]);

  const currentGroup = duplicateGroups[currentGroupIndex];
  const totalGroups = duplicateGroups.length;

  const handleMerge = async (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => {
    setIsProcessing(true);
    try {
      await onMergeLenders(keepId, mergeIds, mergedData);
      toast({ 
        title: 'Lenders merged', 
        description: `Successfully merged ${mergeIds.length + 1} entries into one.` 
      });
      // Move to next group or close if done
      if (currentGroupIndex < totalGroups - 1) {
        setCurrentGroupIndex(prev => prev + 1);
      } else {
        onOpenChange(false);
        setCurrentGroupIndex(0);
      }
    } catch (error) {
      toast({ 
        title: 'Merge failed', 
        description: 'An error occurred while merging lenders.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    if (currentGroupIndex < totalGroups - 1) {
      setCurrentGroupIndex(prev => prev + 1);
    } else {
      onOpenChange(false);
      setCurrentGroupIndex(0);
    }
  };

  const handlePrevious = () => {
    if (currentGroupIndex > 0) {
      setCurrentGroupIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentGroupIndex < totalGroups - 1) {
      setCurrentGroupIndex(prev => prev + 1);
    }
  };

  // Reset index when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setCurrentGroupIndex(0);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Merge className="h-5 w-5" />
                Side-by-Side Merge
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isManualSelectionMode
                  ? `Merging ${currentGroup?.lenders.length || 0} selected lenders`
                  : totalGroups > 0 
                    ? `Group ${currentGroupIndex + 1} of ${totalGroups} • "${currentGroup?.lenders[0]?.name}"`
                    : 'No duplicate lenders found'}
              </DialogDescription>
            </div>
            {totalGroups > 1 && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handlePrevious}
                  disabled={currentGroupIndex === 0 || isProcessing}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {currentGroupIndex + 1} / {totalGroups}
                </span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handleNext}
                  disabled={currentGroupIndex === totalGroups - 1 || isProcessing}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <Separator className="my-2" />

        <div className="flex-1 overflow-hidden">
          {currentGroup ? (
            <MergeView
              key={currentGroup.normalizedName}
              group={currentGroup}
              onMerge={handleMerge}
              onSkip={handleSkip}
              isProcessing={isProcessing}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <p className="text-lg font-medium">No duplicates found</p>
                <p className="text-muted-foreground mt-1">
                  Your lender database is clean with no duplicate entries.
                </p>
                <Button className="mt-4" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
