import { useState, useMemo } from 'react';
import { Sparkles, Check, X, AlertCircle, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface WriteUpAutoFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedFields: ExtractedWriteUpField[];
  currentData: DealWriteUpData;
  onApply: (selectedFields: ExtractedWriteUpField[]) => void;
  documentCount: number;
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

const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
  switch (confidence) {
    case 'high':
      return <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">High</Badge>;
    case 'medium':
      return <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">Medium</Badge>;
    case 'low':
      return <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">Low</Badge>;
  }
};

const formatValue = (field: keyof DealWriteUpData, value: unknown): string => {
  if (value === null || value === undefined) return '';
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // Handle KeyItem/CompanyHighlight arrays
    if (typeof value[0] === 'object' && 'title' in value[0]) {
      return value.map((item: { title: string }) => item.title).join(', ');
    }
    return value.join(', ');
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
};

export function WriteUpAutoFillDialog({
  open,
  onOpenChange,
  extractedFields,
  currentData,
  onApply,
  documentCount,
}: WriteUpAutoFillDialogProps) {
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<Set<string>>(() => 
    new Set(extractedFields.map(f => f.field))
  );

  // Reset selection when fields change
  useMemo(() => {
    setSelectedFieldKeys(new Set(extractedFields.map(f => f.field)));
  }, [extractedFields]);

  const toggleField = (field: string) => {
    const newSelected = new Set(selectedFieldKeys);
    if (newSelected.has(field)) {
      newSelected.delete(field);
    } else {
      newSelected.add(field);
    }
    setSelectedFieldKeys(newSelected);
  };

  const toggleAll = () => {
    if (selectedFieldKeys.size === extractedFields.length) {
      setSelectedFieldKeys(new Set());
    } else {
      setSelectedFieldKeys(new Set(extractedFields.map(f => f.field)));
    }
  };

  const handleApply = () => {
    const selectedFields = extractedFields.filter(f => selectedFieldKeys.has(f.field));
    onApply(selectedFields);
    onOpenChange(false);
  };

  const hasExistingValue = (field: keyof DealWriteUpData): boolean => {
    const current = currentData[field];
    if (current === null || current === undefined) return false;
    if (typeof current === 'string') return current.trim().length > 0;
    if (Array.isArray(current)) return current.length > 0;
    return true;
  };

  if (extractedFields.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Auto-Fill from Deal Space
            </DialogTitle>
            <DialogDescription>
              No extractable data found in your documents.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              Upload more detailed documents to enable auto-fill, such as pitch decks, financial statements, or company profiles.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Auto-Fill from Deal Space
          </DialogTitle>
          <DialogDescription>
            Review extracted data from {documentCount} document{documentCount !== 1 ? 's' : ''}. 
            Select the fields you want to apply.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFieldKeys.size === extractedFields.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm font-medium">
              Select All ({selectedFieldKeys.size}/{extractedFields.length})
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Extracted
          </Badge>
        </div>

        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div className="space-y-3 py-2">
            {extractedFields.map((field) => {
              const isSelected = selectedFieldKeys.has(field.field);
              const hasExisting = hasExistingValue(field.field);
              const currentValue = formatValue(field.field, currentData[field.field]);
              const newValue = formatValue(field.field, field.value);

              return (
                <div
                  key={field.field}
                  className={cn(
                    "p-3 rounded-lg border transition-colors cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                    hasExisting && "ring-1 ring-amber-500/30"
                  )}
                  onClick={() => toggleField(field.field)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleField(field.field)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {FIELD_LABELS[field.field] || field.field}
                        </span>
                        {getConfidenceBadge(field.confidence)}
                        {hasExisting && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Will Replace
                          </Badge>
                        )}
                      </div>

                      {hasExisting && currentValue && (
                        <div className="mb-2 text-xs">
                          <span className="text-muted-foreground">Current: </span>
                          <span className="text-muted-foreground line-through">{currentValue.substring(0, 100)}{currentValue.length > 100 ? '...' : ''}</span>
                        </div>
                      )}

                      <div className="text-sm bg-muted/50 rounded px-2 py-1.5">
                        <span className="text-foreground">{newValue.substring(0, 200)}{newValue.length > 200 ? '...' : ''}</span>
                      </div>

                      {field.source && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>{field.source}</span>
                          {field.sourceLocation && (
                            <>
                              <ChevronRight className="h-3 w-3" />
                              <span>{field.sourceLocation}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
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
            disabled={selectedFieldKeys.size === 0}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Apply {selectedFieldKeys.size} Field{selectedFieldKeys.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
