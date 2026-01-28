import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDealMemo } from '@/hooks/useDealMemo';
import { useDealMemoNotification } from '@/hooks/useDealMemoNotification';

interface DealMemoDialogProps {
  dealId: string;
  companyName: string;
}

interface MemoSection {
  key: 'lender_notes' | 'analyst_notes' | 'other_notes';
  label: string;
  placeholder: string;
}

const MEMO_SECTIONS: MemoSection[] = [
  {
    key: 'lender_notes',
    label: 'Lender Notes',
    placeholder: 'Notes about specific lenders, their feedback, or strategy...',
  },
  {
    key: 'analyst_notes',
    label: 'Analyst Notes',
    placeholder: 'Background checks, litigation, fraud analysis, and other due diligence...',
  },
  {
    key: 'other_notes',
    label: 'Other Notes',
    placeholder: 'Any additional notes or observations...',
  },
];

export function DealMemoDialog({ dealId, companyName }: DealMemoDialogProps) {
  const { memo, isLoading, isSaving, saveMemo } = useDealMemo(dealId);
  const { hasUnreadUpdates, markAsViewed } = useDealMemoNotification(dealId);
  const [isOpen, setIsOpen] = useState(false);
  const [localValues, setLocalValues] = useState<Record<string, string>>({
    narrative: '',
    highlights: '',
    hurdles: '',
    lender_notes: '',
    analyst_notes: '',
    other_notes: '',
  });
  const [highlightsList, setHighlightsList] = useState<string[]>([]);
  const [newHighlight, setNewHighlight] = useState('');
  const [hurdlesList, setHurdlesList] = useState<string[]>([]);
  const [newHurdle, setNewHurdle] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Helper to convert list string to array
  const parseList = (str: string | null): string[] => {
    if (!str) return [];
    return str.split('\n').filter(h => h.trim() !== '');
  };

  // Helper to convert list array to string
  const stringifyList = (items: string[]): string => {
    return items.join('\n');
  };

  // Sync local values with memo data when dialog opens or memo changes
  useEffect(() => {
    if (memo) {
      setLocalValues({
        narrative: memo.narrative || '',
        highlights: memo.highlights || '',
        hurdles: memo.hurdles || '',
        lender_notes: memo.lender_notes || '',
        analyst_notes: memo.analyst_notes || '',
        other_notes: memo.other_notes || '',
      });
      setHighlightsList(parseList(memo.highlights));
      setHurdlesList(parseList(memo.hurdles));
    } else {
      setLocalValues({
        narrative: '',
        highlights: '',
        hurdles: '',
        lender_notes: '',
        analyst_notes: '',
        other_notes: '',
      });
      setHighlightsList([]);
      setHurdlesList([]);
    }
    setNewHighlight('');
    setNewHurdle('');
    setHasChanges(false);
  }, [memo, isOpen]);

  const handleChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      const updated = [...highlightsList, newHighlight.trim()];
      setHighlightsList(updated);
      setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
      setNewHighlight('');
      setHasChanges(true);
    }
  };

  const handleRemoveHighlight = (index: number) => {
    const updated = highlightsList.filter((_, i) => i !== index);
    setHighlightsList(updated);
    setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
    setHasChanges(true);
  };

  const handleAddHurdle = () => {
    if (newHurdle.trim()) {
      const updated = [...hurdlesList, newHurdle.trim()];
      setHurdlesList(updated);
      setLocalValues(prev => ({ ...prev, hurdles: stringifyList(updated) }));
      setNewHurdle('');
      setHasChanges(true);
    }
  };

  const handleRemoveHurdle = (index: number) => {
    const updated = hurdlesList.filter((_, i) => i !== index);
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyList(updated) }));
    setHasChanges(true);
  };

  const handleHighlightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHighlight();
    }
  };

  const handleHurdleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHurdle();
    }
  };

  const handleSave = async () => {
    await saveMemo({
      narrative: localValues.narrative || null,
      highlights: localValues.highlights || null,
      hurdles: localValues.hurdles || null,
      lender_notes: localValues.lender_notes || null,
      analyst_notes: localValues.analyst_notes || null,
      other_notes: localValues.other_notes || null,
    });
    setHasChanges(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && hasUnreadUpdates) {
      markAsViewed();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className={`h-9 w-9 relative ${hasUnreadUpdates ? 'text-primary border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <FileText className="h-4 w-4" />
                {hasUnreadUpdates && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-background" />
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{hasUnreadUpdates ? 'Deal Memo (new updates)' : 'View Deal Memo'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 pr-14">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">Deal Memo</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {companyName}
              </p>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || isSaving}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-4 space-y-6">
              {/* Narrative Section */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Narrative
                </label>
                <Textarea
                  value={localValues.narrative}
                  onChange={(e) => handleChange('narrative', e.target.value)}
                  placeholder="Describe the company, what they are looking for, and the proposed solution..."
                  className="min-h-[100px] resize-none"
                />
                <Separator className="mt-6" />
              </div>

              {/* Deal Highlights Section - List based */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Deal Highlights: Why We Can Get Them an Offer
                </label>
                <div className="flex gap-2 mb-3">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={handleAddHighlight}
                    disabled={!newHighlight.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Input
                    value={newHighlight}
                    onChange={(e) => setNewHighlight(e.target.value)}
                    onKeyDown={handleHighlightKeyDown}
                    placeholder="Add a highlight..."
                    className="flex-1"
                  />
                </div>
                {highlightsList.length > 0 ? (
                  <ol className="space-y-2">
                    {highlightsList.map((highlight, index) => (
                      <li 
                        key={index}
                        className="flex items-start gap-2 p-2 bg-muted/50 rounded-md group"
                      >
                        <span className="text-sm font-medium text-muted-foreground min-w-[20px]">
                          {index + 1}.
                        </span>
                        <span className="flex-1 text-sm">{highlight}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveHighlight(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No highlights added yet
                  </p>
                )}
                <Separator className="mt-6" />
              </div>

              {/* Deal Hurdles Section - List based */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Deal Hurdles & Remedies
                </label>
                <div className="flex gap-2 mb-3">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon"
                    onClick={handleAddHurdle}
                    disabled={!newHurdle.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Input
                    value={newHurdle}
                    onChange={(e) => setNewHurdle(e.target.value)}
                    onKeyDown={handleHurdleKeyDown}
                    placeholder="Add a hurdle..."
                    className="flex-1"
                  />
                </div>
                {hurdlesList.length > 0 ? (
                  <ol className="space-y-2">
                    {hurdlesList.map((hurdle, index) => (
                      <li 
                        key={index}
                        className="flex items-start gap-2 p-2 bg-muted/50 rounded-md group"
                      >
                        <span className="text-sm font-medium text-muted-foreground min-w-[20px]">
                          {index + 1}.
                        </span>
                        <span className="flex-1 text-sm">{hurdle}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveHurdle(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No hurdles added yet
                  </p>
                )}
                <Separator className="mt-6" />
              </div>

              {/* Other sections */}
              {MEMO_SECTIONS.map((section, index) => (
                <div key={section.key}>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    {section.label}
                  </label>
                  <Textarea
                    value={localValues[section.key]}
                    onChange={(e) => handleChange(section.key, e.target.value)}
                    placeholder={section.placeholder}
                    className="min-h-[100px] resize-none"
                  />
                  {index < MEMO_SECTIONS.length - 1 && (
                    <Separator className="mt-6" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {hasChanges && (
          <div className="px-6 py-3 border-t bg-muted/30 text-sm text-muted-foreground">
            You have unsaved changes
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
