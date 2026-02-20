import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Save, Loader2, Plus, X, FolderOpen, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDealMemo } from '@/hooks/useDealMemo';
import { useDealMemoNotification } from '@/hooks/useDealMemoNotification';
import { useDealMemoAuditLog } from '@/hooks/useDealMemoAuditLog';
import { MemoAuditLogPopover } from '@/components/deal/MemoAuditLogPopover';

interface DealMemoDialogProps {
  dealId: string;
  companyName: string;
  onGoToDataRoom?: () => void;
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

export function DealMemoDialog({ dealId, companyName, onGoToDataRoom }: DealMemoDialogProps) {
  const { user } = useAuth();
  const { memo, isLoading, isSaving, saveMemo } = useDealMemo(dealId);
  const { hasUnreadUpdates, markAsViewed } = useDealMemoNotification(dealId);
  const { entries: auditEntries, isLoading: auditLoading, logChanges } = useDealMemoAuditLog(dealId);
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
  const [hurdlesList, setHurdlesList] = useState<{ hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[]>([]);
  const [newHurdle, setNewHurdle] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<number | null>(null);
  const [editingHurdle, setEditingHurdle] = useState<number | null>(null);
  const [editingRemedy, setEditingRemedy] = useState<number | null>(null);

  // Helper to convert list string to array
  const parseList = (str: string | null): string[] => {
    if (!str) return [];
    return str.split('\n').filter(h => h.trim() !== '');
  };

  // Parse hurdles with remedies (stored as "hurdle||remedy")
  const parseHurdles = (str: string | null): { hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[] => {
    if (!str) return [];
    return str.split('\n').filter(h => h.trim() !== '').map(line => {
      const parts = line.split('||');
      return { hurdle: parts[0] || '', remedy: parts[1] || '', resolved: parts[2] === 'true', resolvedBy: parts[3] || '' };
    });
  };

  const stringifyHurdles = (items: { hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[]): string => {
    return items.map(h => {
      const parts = [h.hurdle, h.remedy, h.resolved ? 'true' : 'false', h.resolvedBy];
      return parts.join('||');
    }).join('\n');
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
      setHurdlesList(parseHurdles(memo.hurdles));
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
    setEditingHighlight(null);
    setHasChanges(true);
  };

  const handleEditHighlight = (index: number, value: string) => {
    const updated = [...highlightsList];
    updated[index] = value;
    setHighlightsList(updated);
    setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
    setHasChanges(true);
  };

  const handleAddHurdle = () => {
    if (newHurdle.trim()) {
      const updated = [...hurdlesList, { hurdle: newHurdle.trim(), remedy: '', resolved: false, resolvedBy: '' }];
      setHurdlesList(updated);
      setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
      setNewHurdle('');
      setHasChanges(true);
    }
  };

  const handleRemoveHurdle = (index: number) => {
    const updated = hurdlesList.filter((_, i) => i !== index);
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setEditingHurdle(null);
    setEditingRemedy(null);
    setHasChanges(true);
  };

  const handleEditHurdle = (index: number, value: string) => {
    const updated = [...hurdlesList];
    updated[index] = { ...updated[index], hurdle: value };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setHasChanges(true);
  };

  const handleEditRemedy = (index: number, value: string) => {
    const updated = [...hurdlesList];
    updated[index] = { ...updated[index], remedy: value };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setHasChanges(true);
  };

  const handleToggleHurdleResolved = (index: number) => {
    const updated = [...hurdlesList];
    const isNowResolved = !updated[index].resolved;
    const resolverName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email || 'Unknown';
    updated[index] = { 
      ...updated[index], 
      resolved: isNowResolved, 
      resolvedBy: isNowResolved ? resolverName : '' 
    };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
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
    const newValues = {
      narrative: localValues.narrative || null,
      highlights: localValues.highlights || null,
      hurdles: localValues.hurdles || null,
      lender_notes: localValues.lender_notes || null,
      analyst_notes: localValues.analyst_notes || null,
      other_notes: localValues.other_notes || null,
    };

    // Build old values from current memo
    const oldValues: Record<string, string | null> = {
      narrative: memo?.narrative || null,
      highlights: memo?.highlights || null,
      hurdles: memo?.hurdles || null,
      lender_notes: memo?.lender_notes || null,
      analyst_notes: memo?.analyst_notes || null,
      other_notes: memo?.other_notes || null,
    };

    await saveMemo(newValues);
    await logChanges(dealId, oldValues, newValues);
    setHasChanges(false);
  };

  const handleRevert = (entry: import('@/hooks/useDealMemoAuditLog').MemoAuditEntry) => {
    if (entry.old_value !== null) {
      const field = entry.field_changed;
      setLocalValues(prev => ({ ...prev, [field]: entry.old_value || '' }));
      // Update lists if highlights or hurdles
      if (field === 'highlights') {
        setHighlightsList(parseList(entry.old_value));
      } else if (field === 'hurdles') {
        setHurdlesList(parseHurdles(entry.old_value));
      }
      setHasChanges(true);
    }
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
                className={`h-9 gap-2 relative border-primary text-primary bg-gradient-to-r from-primary/10 to-transparent hover:bg-primary/10 ${hasUnreadUpdates ? '' : ''}`}
              >
                <FileText className="h-4 w-4" />
                <span className="text-sm">Deal Memo</span>
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
            <div className="flex items-center gap-2">
              {onGoToDataRoom && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    onGoToDataRoom();
                  }}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Data Room
                </Button>
              )}
              <MemoAuditLogPopover entries={auditEntries} isLoading={auditLoading} onRevert={handleRevert} />
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
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-4 px-6 space-y-6">
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
                        <span className="text-sm font-medium text-muted-foreground min-w-[20px] mt-0.5">
                          {index + 1}.
                        </span>
                        {editingHighlight === index ? (
                          <Input
                            autoFocus
                            value={highlight}
                            onChange={(e) => handleEditHighlight(index, e.target.value)}
                            onBlur={() => setEditingHighlight(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingHighlight(null);
                              if (e.key === 'Escape') setEditingHighlight(null);
                            }}
                            className="flex-1 h-7 text-sm"
                          />
                        ) : (
                          <span
                            className="flex-1 text-sm cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setEditingHighlight(index)}
                          >
                            {highlight}
                          </span>
                        )}
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
                  <TooltipProvider>
                  <ol className="space-y-2">
                    {hurdlesList.map((item, index) => (
                      <li 
                        key={index}
                        className={`p-2 rounded-md group ${item.resolved ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleToggleHurdleResolved(index)}
                                className={`mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                                  item.resolved 
                                    ? 'bg-primary border-primary text-primary-foreground' 
                                    : 'border-muted-foreground/30 hover:border-primary'
                                }`}
                              >
                                {item.resolved && <Check className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            {item.resolved && item.resolvedBy && (
                              <TooltipContent side="top">
                                <p>Resolved by {item.resolvedBy}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <div className="flex-1 min-w-0">
                            {editingHurdle === index ? (
                              <Input
                                autoFocus
                                value={item.hurdle}
                                onChange={(e) => handleEditHurdle(index, e.target.value)}
                                onBlur={() => setEditingHurdle(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingHurdle(null);
                                  if (e.key === 'Escape') setEditingHurdle(null);
                                }}
                                className="h-7 text-sm"
                              />
                            ) : (
                              <span
                                className={`text-sm cursor-pointer hover:text-primary transition-colors block ${item.resolved ? 'line-through text-muted-foreground' : ''}`}
                                onClick={() => setEditingHurdle(index)}
                              >
                                {item.hurdle}
                              </span>
                            )}
                            {/* Remedy sub-field */}
                            {editingRemedy === index ? (
                              <Input
                                autoFocus
                                value={item.remedy}
                                onChange={(e) => handleEditRemedy(index, e.target.value)}
                                onBlur={() => setEditingRemedy(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingRemedy(null);
                                  if (e.key === 'Escape') setEditingRemedy(null);
                                }}
                                placeholder="Add a remedy..."
                                className="h-7 text-sm mt-1"
                              />
                            ) : (
                              <span
                                className={`text-xs cursor-pointer hover:text-primary transition-colors block mt-1 ${item.resolved ? 'line-through text-muted-foreground/60' : 'text-muted-foreground'}`}
                                onClick={() => setEditingRemedy(index)}
                              >
                                {item.remedy ? `Remedy: ${item.remedy}` : '+ Add remedy'}
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveHurdle(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  </TooltipProvider>
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
