import { useState, useMemo } from 'react';
import { Check, X, AlertCircle, FileText, ChevronRight, Loader2, Pencil, AlertTriangle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ExtractedWriteUpField } from '@/hooks/useDealSpaceAutoFill';
import { DealWriteUpData } from './DealWriteUp';
import { CitationChip, SourceReference } from './writeup/CitationChip';

interface WriteUpAutoFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedFields: ExtractedWriteUpField[];
  currentData: DealWriteUpData;
  onApply: (selectedFields: ExtractedWriteUpField[]) => string[] | void;
  documentCount: number;
  sourceCount?: number;
  /** Field keys that failed to apply on the most recent attempt. */
  failedFields?: string[];
}

const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company Name',
  companyUrl: 'Company URL',
  linkedinUrl: 'LinkedIn URL',
  industries: 'Industry',
  location: 'Location',
  yearFounded: 'Year Founded',
  headcount: 'Headcount',
  dealTypes: 'Deal Type',
  billingModels: 'Billing Model',
  profitability: 'Profitability',
  grossMargins: 'Gross Margins',
  capitalAsk: 'Capital Ask',
  useOfFunds: 'Use of Funds',
  existingDebtDetails: 'Existing Debt',
  description: 'Company Overview',
  accountingSystem: 'Accounting System',
  companyHighlights: 'Company Highlights',
  keyItems: 'Key Items',
};

const HUMAN_ONLY_FIELDS = new Set(['status']);

const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
  switch (confidence) {
    case 'high':
      return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/20">High</Badge>;
    case 'medium':
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">Medium</Badge>;
    case 'low':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/10 text-red-600 border-red-500/20">Low</Badge>;
  }
};

const formatValue = (field: keyof DealWriteUpData, value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (typeof value[0] === 'object' && 'title' in value[0]) {
      return value.map((item: { title: string }) => item.title).join(', ');
    }
    return value.join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

type FieldState = 'pending' | 'accepted' | 'rejected' | 'editing';

export function WriteUpAutoFillDialog({
  open,
  onOpenChange,
  extractedFields,
  currentData,
  onApply,
  documentCount,
  sourceCount,
  failedFields = [],
}: WriteUpAutoFillDialogProps) {
  // Track per-field state
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Reset when fields change
  useMemo(() => {
    const states: Record<string, FieldState> = {};
    for (const f of extractedFields) {
      if (!HUMAN_ONLY_FIELDS.has(f.field)) {
        states[f.field] = 'pending';
      }
    }
    setFieldStates(states);
    setEditValues({});
  }, [extractedFields]);

  const getFieldState = (field: string): FieldState => fieldStates[field] || 'pending';

  const setFieldState = (field: string, state: FieldState) => {
    setFieldStates(prev => ({ ...prev, [field]: state }));
  };

  const acceptField = (field: string) => setFieldState(field, 'accepted');
  const rejectField = (field: string) => setFieldState(field, 'rejected');
  const startEditing = (field: string, currentValue: string) => {
    setEditValues(prev => ({ ...prev, [field]: currentValue }));
    setFieldState(field, 'editing');
  };
  const confirmEdit = (field: string) => setFieldState(field, 'accepted');
  const cancelEdit = (field: string) => setFieldState(field, 'pending');

  const acceptAll = () => {
    const newStates = { ...fieldStates };
    for (const f of extractedFields) {
      if (!HUMAN_ONLY_FIELDS.has(f.field) && newStates[f.field] !== 'rejected') {
        newStates[f.field] = 'accepted';
      }
    }
    setFieldStates(newStates);
  };

  const pendingCount = extractedFields.filter(f => getFieldState(f.field) === 'pending').length;
  const acceptedCount = extractedFields.filter(f => getFieldState(f.field) === 'accepted').length;

  const handleApply = () => {
    const acceptedFields = extractedFields
      .filter(f => getFieldState(f.field) === 'accepted')
      .map(f => {
        // If user edited the value, use the edited value
        if (editValues[f.field] !== undefined) {
          return { ...f, value: editValues[f.field] };
        }
        return f;
      });
    const failed = onApply(acceptedFields) || [];
    if (failed.length === 0) {
      onOpenChange(false);
    }
    // Otherwise keep dialog open so the user sees the inline warnings.
  };

  const hasExistingValue = (field: keyof DealWriteUpData): boolean => {
    const current = currentData[field];
    if (current === null || current === undefined) return false;
    if (typeof current === 'string') return current.trim().length > 0;
    if (Array.isArray(current)) return current.length > 0;
    return true;
  };

  // Build source description
  const sourceDesc = sourceCount && sourceCount > documentCount
    ? `${sourceCount} sources (${documentCount} document${documentCount !== 1 ? 's' : ''}, notes, memos & more)`
    : `${documentCount} document${documentCount !== 1 ? 's' : ''}`;

  if (extractedFields.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Auto-Fill from Deal Space
              <span className="ml-1 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Powered by Claude</span>
            </DialogTitle>
            <DialogDescription>
              No extractable data found in your deal space.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              Upload documents, add notes, or fill in deal details to enable auto-fill.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Auto-Fill from Deal Space
            <span className="ml-1 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Powered by Claude</span>
          </DialogTitle>
          <DialogDescription>
            Claude extracted {extractedFields.length} field{extractedFields.length !== 1 ? 's' : ''} from {sourceDesc}. 
            Review each suggestion, then apply.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              AI Extracted
            </Badge>
            <span className="text-xs text-muted-foreground">
              {acceptedCount} accepted · {pendingCount} pending
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={acceptAll} className="text-xs h-7">
            Accept All Pending
          </Button>
        </div>

        <ScrollArea className="flex-1 max-h-[450px] pr-4">
          <div className="space-y-2 py-2">
            {extractedFields.map((field) => {
              const state = getFieldState(field.field);
              const hasExisting = hasExistingValue(field.field);
              const currentValue = formatValue(field.field, currentData[field.field]);
              const newValue = formatValue(field.field, field.value);
              const sources: SourceReference[] = (field as any).sources || [];
              const isEditing = state === 'editing';
              const didFail = failedFields.includes(field.field);

              if (HUMAN_ONLY_FIELDS.has(field.field)) return null;

              return (
                <div
                  key={field.field}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    state === 'accepted' && "border-green-500/40 bg-green-500/5",
                    state === 'rejected' && "border-border/30 bg-muted/30 opacity-50",
                    state === 'pending' && "border-border hover:border-primary/50",
                    state === 'editing' && "border-primary bg-primary/5",
                    didFail && "border-destructive/60 bg-destructive/5",
                  )}
                >
                  {didFail && (
                    <div className="mb-2 flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Could not apply — please select manually in the form.</span>
                    </div>
                  )}
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {FIELD_LABELS[field.field] || field.field}
                      </span>
                      {getConfidenceBadge(field.confidence)}
                      {hasExisting && state !== 'rejected' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                          Replace
                        </Badge>
                      )}
                    </div>
                    <CitationChip sources={sources} confidence={field.confidence} />
                  </div>

                  {/* Current value (if exists) */}
                  {hasExisting && currentValue && state !== 'rejected' && (
                    <div className="mb-1.5 text-xs">
                      <span className="text-muted-foreground">Current: </span>
                      <span className="text-muted-foreground line-through">
                        {currentValue.substring(0, 80)}{currentValue.length > 80 ? '…' : ''}
                      </span>
                    </div>
                  )}

                  {/* Suggested value or edit mode */}
                  {isEditing ? (
                    <div className="space-y-2">
                      {newValue.length > 80 ? (
                        <Textarea
                          value={editValues[field.field] ?? newValue}
                          onChange={(e) => setEditValues(prev => ({ ...prev, [field.field]: e.target.value }))}
                          className="text-sm min-h-[60px]"
                          autoFocus
                        />
                      ) : (
                        <Input
                          value={editValues[field.field] ?? newValue}
                          onChange={(e) => setEditValues(prev => ({ ...prev, [field.field]: e.target.value }))}
                          className="text-sm h-8"
                          autoFocus
                        />
                      )}
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => confirmEdit(field.field)}>
                          <Check className="h-3 w-3" /> Save & Accept
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => cancelEdit(field.field)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm bg-muted/50 rounded px-2 py-1.5">
                        <span className="text-foreground">
                          {newValue.substring(0, 200)}{newValue.length > 200 ? '…' : ''}
                        </span>
                      </div>

                      {/* Action buttons */}
                      {state === 'pending' && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-green-600 hover:text-green-700 hover:bg-green-500/10" onClick={() => acceptField(field.field)}>
                            <Check className="h-3 w-3" /> Accept
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => startEditing(field.field, newValue)}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => rejectField(field.field)}>
                            <X className="h-3 w-3" /> Reject
                          </Button>
                        </div>
                      )}
                      {state === 'accepted' && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <Check className="h-3 w-3" /> Accepted
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setFieldState(field.field, 'pending')}>
                            Undo
                          </Button>
                        </div>
                      )}
                      {state === 'rejected' && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <X className="h-3 w-3" /> Rejected
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setFieldState(field.field, 'pending')}>
                            Undo
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={acceptedCount === 0}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Apply {acceptedCount} Field{acceptedCount !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
