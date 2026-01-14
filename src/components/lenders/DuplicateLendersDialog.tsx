import { useState, useMemo } from 'react';
import { Users, Merge, Trash2, Check, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';

interface DuplicateLendersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
  onMergeLenders: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  onDeleteLender: (id: string) => Promise<void>;
}

interface DuplicateGroup {
  normalizedName: string;
  lenders: MasterLender[];
}

interface ContactOption {
  id: string;
  contactName: string | null;
  contactTitle: string | null;
  email: string | null;
}

function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special chars
    .trim();
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function MergeField({ 
  label, 
  options, 
  selectedId, 
  onSelect 
}: { 
  label: string; 
  options: { id: string; value: string | null }[]; 
  selectedId: string; 
  onSelect: (id: string) => void;
}) {
  const uniqueOptions = options.filter((opt, idx, arr) => 
    opt.value && arr.findIndex(o => o.value === opt.value) === idx
  );

  if (uniqueOptions.length <= 1) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <RadioGroup value={selectedId} onValueChange={onSelect} className="space-y-1">
        {uniqueOptions.map((opt) => (
          <div key={opt.id} className="flex items-center space-x-2">
            <RadioGroupItem value={opt.id} id={`${label}-${opt.id}`} />
            <Label htmlFor={`${label}-${opt.id}`} className="text-sm font-normal cursor-pointer">
              {opt.value}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

function DuplicateGroupCard({
  group,
  onMerge,
  onQuickMerge,
  onDelete,
  isProcessing,
}: {
  group: DuplicateGroup;
  onMerge: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => void;
  onQuickMerge: (group: DuplicateGroup) => void;
  onDelete: (id: string) => void;
  isProcessing: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [primaryLenderId, setPrimaryLenderId] = useState(group.lenders[0].id);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set([group.lenders[0].id]));
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showQuickMergeConfirm, setShowQuickMergeConfirm] = useState(false);

  // Field selections for merge
  const [fieldSelections, setFieldSelections] = useState<Record<string, string>>({});

  const contactOptions: ContactOption[] = group.lenders
    .filter(l => l.contact_name || l.email)
    .map(l => ({
      id: l.id,
      contactName: l.contact_name,
      contactTitle: l.contact_title,
      email: l.email,
    }));

  const hasMultipleContacts = contactOptions.length > 1 && 
    new Set(contactOptions.map(c => `${c.contactName}|${c.email}`)).size > 1;

  const handleStartMerge = () => {
    setIsMerging(true);
    // Initialize field selections with primary lender
    const selections: Record<string, string> = {};
    const fields = ['lender_type', 'geo', 'min_deal', 'max_deal', 'min_revenue'] as const;
    fields.forEach(field => {
      const lenderWithValue = group.lenders.find(l => l[field]);
      if (lenderWithValue) {
        selections[field] = lenderWithValue.id;
      }
    });
    setFieldSelections(selections);
  };

  const handleConfirmMerge = () => {
    const primaryLender = group.lenders.find(l => l.id === primaryLenderId)!;
    const mergeIds = group.lenders.filter(l => l.id !== primaryLenderId).map(l => l.id);

    // Build merged data from selections
    const mergedData: Partial<MasterLenderInsert> = {
      name: primaryLender.name,
    };

    // Apply field selections
    Object.entries(fieldSelections).forEach(([field, lenderId]) => {
      const lender = group.lenders.find(l => l.id === lenderId);
      if (lender) {
        (mergedData as any)[field] = (lender as any)[field];
      }
    });

    // Handle contacts - if multiple selected, we'll concatenate
    const selectedContactLenders = group.lenders.filter(l => selectedContacts.has(l.id));
    if (selectedContactLenders.length === 1) {
      mergedData.contact_name = selectedContactLenders[0].contact_name;
      mergedData.contact_title = selectedContactLenders[0].contact_title;
      mergedData.email = selectedContactLenders[0].email;
    } else if (selectedContactLenders.length > 1) {
      // Concatenate multiple contacts
      const names = selectedContactLenders
        .map(l => l.contact_name)
        .filter(Boolean)
        .join('; ');
      const titles = selectedContactLenders
        .map(l => l.contact_title)
        .filter(Boolean)
        .join('; ');
      const emails = selectedContactLenders
        .map(l => l.email)
        .filter(Boolean)
        .join('; ');
      
      mergedData.contact_name = names || null;
      mergedData.contact_title = titles || null;
      mergedData.email = emails || null;
    }

    // Merge arrays (loan_types, industries)
    const allLoanTypes = new Set<string>();
    const allIndustries = new Set<string>();
    group.lenders.forEach(l => {
      l.loan_types?.forEach(t => allLoanTypes.add(t));
      l.industries?.forEach(i => allIndustries.add(i));
    });
    mergedData.loan_types = allLoanTypes.size > 0 ? Array.from(allLoanTypes) : null;
    mergedData.industries = allIndustries.size > 0 ? Array.from(allIndustries) : null;

    // Take notes from any that have them
    const allNotes = group.lenders
      .map(l => l.deal_structure_notes)
      .filter(Boolean)
      .join('\n\n---\n\n');
    if (allNotes) {
      mergedData.deal_structure_notes = allNotes;
    }

    onMerge(primaryLenderId, mergeIds, mergedData);
    setIsMerging(false);
    setIsOpen(false);
  };

  const toggleContact = (id: string) => {
    const newSet = new Set(selectedContacts);
    if (newSet.has(id)) {
      if (newSet.size > 1) { // Must keep at least one
        newSet.delete(id);
      }
    } else {
      newSet.add(id);
    }
    setSelectedContacts(newSet);
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-lg p-3 bg-card">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -m-3 p-3 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">{group.lenders[0].name}</p>
                  <p className="text-sm text-muted-foreground">
                    {group.lenders.length} duplicate entries found
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{group.lenders.length} duplicates</Badge>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-4">
            <Separator className="mb-4" />
            
            {!isMerging ? (
              <>
                <div className="space-y-3">
                  {group.lenders.map((lender, idx) => (
                    <div 
                      key={lender.id} 
                      className="p-3 rounded-lg border bg-muted/30 flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{lender.name}</p>
                          {idx === 0 && <Badge variant="secondary" className="text-xs">First entry</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                          {lender.contact_name && <p>Contact: {lender.contact_name}</p>}
                          {lender.email && <p>Email: {lender.email}</p>}
                          {lender.lender_type && <p>Type: {lender.lender_type}</p>}
                          {(lender.min_deal || lender.max_deal) && (
                            <p>Deal Size: {formatCurrency(lender.min_deal)} - {formatCurrency(lender.max_deal)}</p>
                          )}
                          {lender.geo && <p>Geography: {lender.geo}</p>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setDeleteConfirmId(lender.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowQuickMergeConfirm(true)} 
                    disabled={isProcessing}
                    className="gap-2"
                  >
                    <Merge className="h-4 w-4" />
                    Quick Merge
                  </Button>
                  <Button onClick={handleStartMerge} disabled={isProcessing} className="gap-2">
                    <Merge className="h-4 w-4" />
                    Merge with Options
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    Select which data to keep for the merged lender
                  </p>
                </div>

                {/* Primary lender selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Primary Record (name to keep)</Label>
                  <RadioGroup value={primaryLenderId} onValueChange={setPrimaryLenderId} className="space-y-1">
                    {group.lenders.map((l) => (
                      <div key={l.id} className="flex items-center space-x-2">
                        <RadioGroupItem value={l.id} id={`primary-${l.id}`} />
                        <Label htmlFor={`primary-${l.id}`} className="text-sm font-normal cursor-pointer">
                          {l.name} {l.contact_name && `(${l.contact_name})`}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <Separator />

                {/* Contact selection */}
                {hasMultipleContacts && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Contacts to Keep (select one or multiple)</Label>
                    <div className="space-y-2">
                      {contactOptions.map((contact) => (
                        <div key={contact.id} className="flex items-start space-x-2">
                          <Checkbox
                            checked={selectedContacts.has(contact.id)}
                            onCheckedChange={() => toggleContact(contact.id)}
                            id={`contact-${contact.id}`}
                          />
                          <Label htmlFor={`contact-${contact.id}`} className="text-sm font-normal cursor-pointer">
                            <span className="font-medium">{contact.contactName || 'No name'}</span>
                            {contact.contactTitle && <span className="text-muted-foreground"> ({contact.contactTitle})</span>}
                            {contact.email && <span className="text-muted-foreground"> - {contact.email}</span>}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedContacts.size > 1 
                        ? 'Multiple contacts will be combined into one record' 
                        : 'Only the selected contact will be kept'}
                    </p>
                  </div>
                )}

                {/* Other field selections */}
                <MergeField
                  label="Lender Type"
                  options={group.lenders.map(l => ({ id: l.id, value: l.lender_type }))}
                  selectedId={fieldSelections['lender_type'] || group.lenders[0].id}
                  onSelect={(id) => setFieldSelections(prev => ({ ...prev, lender_type: id }))}
                />

                <MergeField
                  label="Geography"
                  options={group.lenders.map(l => ({ id: l.id, value: l.geo }))}
                  selectedId={fieldSelections['geo'] || group.lenders[0].id}
                  onSelect={(id) => setFieldSelections(prev => ({ ...prev, geo: id }))}
                />

                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium mb-1">Auto-merged fields:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Loan types and industries will be combined</li>
                    <li>Deal size ranges will use the widest range</li>
                    <li>Notes will be concatenated</li>
                  </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsMerging(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleConfirmMerge} className="gap-2">
                    <Check className="h-4 w-4" />
                    Confirm Merge
                  </Button>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lender entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this duplicate entry. The other entries will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteConfirmId) {
                onDelete(deleteConfirmId);
                setDeleteConfirmId(null);
              }
            }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick merge confirmation */}
      <AlertDialog open={showQuickMergeConfirm} onOpenChange={setShowQuickMergeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quick merge "{group.lenders[0].name}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will merge <strong>{group.lenders.length} entries</strong> into one, 
                using the first entry as the primary record.
              </p>
              <p>
                Data from all entries will be combined automatically. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowQuickMergeConfirm(false);
              onQuickMerge(group);
            }}>
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper to build merged data for a group using first entry as primary
function buildAutoMergedData(group: DuplicateGroup): { 
  keepId: string; 
  mergeIds: string[]; 
  mergedData: Partial<MasterLenderInsert>; 
} {
  const primaryLender = group.lenders[0]; // First (oldest) entry as primary
  const mergeIds = group.lenders.slice(1).map(l => l.id);

  const mergedData: Partial<MasterLenderInsert> = {
    name: primaryLender.name,
  };

  // Take first non-null value for each field
  const fields = ['lender_type', 'geo', 'min_deal', 'max_deal', 'min_revenue', 'contact_name', 'contact_title', 'email'] as const;
  fields.forEach(field => {
    const lenderWithValue = group.lenders.find(l => l[field]);
    if (lenderWithValue) {
      (mergedData as any)[field] = (lenderWithValue as any)[field];
    }
  });

  // Merge arrays (loan_types, industries)
  const allLoanTypes = new Set<string>();
  const allIndustries = new Set<string>();
  group.lenders.forEach(l => {
    l.loan_types?.forEach(t => allLoanTypes.add(t));
    l.industries?.forEach(i => allIndustries.add(i));
  });
  mergedData.loan_types = allLoanTypes.size > 0 ? Array.from(allLoanTypes) : null;
  mergedData.industries = allIndustries.size > 0 ? Array.from(allIndustries) : null;

  // Take notes from any that have them
  const allNotes = group.lenders
    .map(l => l.deal_structure_notes)
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (allNotes) {
    mergedData.deal_structure_notes = allNotes;
  }

  return { keepId: primaryLender.id, mergeIds, mergedData };
}

export function DuplicateLendersDialog({
  open,
  onOpenChange,
  lenders,
  onMergeLenders,
  onDeleteLender,
}: DuplicateLendersDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Find duplicate groups
  const duplicateGroups = useMemo(() => {
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
  }, [lenders]);

  const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.lenders.length - 1, 0);

  const handleQuickMerge = async (group: DuplicateGroup) => {
    setIsProcessing(true);
    try {
      const { keepId, mergeIds, mergedData } = buildAutoMergedData(group);
      await onMergeLenders(keepId, mergeIds, mergedData);
      toast({ 
        title: 'Lenders merged', 
        description: `Successfully merged ${mergeIds.length + 1} "${group.lenders[0].name}" entries into one.` 
      });
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

  const handleMerge = async (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => {
    setIsProcessing(true);
    try {
      await onMergeLenders(keepId, mergeIds, mergedData);
      toast({ 
        title: 'Lenders merged', 
        description: `Successfully merged ${mergeIds.length + 1} entries into one.` 
      });
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

  const handleDelete = async (id: string) => {
    setIsProcessing(true);
    try {
      await onDeleteLender(id);
      toast({ title: 'Lender deleted' });
    } catch (error) {
      toast({ 
        title: 'Delete failed', 
        description: 'An error occurred while deleting the lender.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Duplicate Lenders
            </DialogTitle>
            <DialogDescription>
              {duplicateGroups.length > 0 
                ? `Found ${duplicateGroups.length} group${duplicateGroups.length !== 1 ? 's' : ''} with ${totalDuplicates} duplicate entries`
                : 'No duplicate lenders found in your database'}
            </DialogDescription>
          </DialogHeader>

          {duplicateGroups.length > 0 ? (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-3 pb-4">
                {duplicateGroups.map((group) => (
                  <DuplicateGroupCard
                    key={group.normalizedName}
                    group={group}
                    onMerge={handleMerge}
                    onQuickMerge={handleQuickMerge}
                    onDelete={handleDelete}
                    isProcessing={isProcessing}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-success" />
              </div>
              <p className="text-lg font-medium">No duplicates found</p>
              <p className="text-muted-foreground mt-1">
                Your lender database is clean with no duplicate entries.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
