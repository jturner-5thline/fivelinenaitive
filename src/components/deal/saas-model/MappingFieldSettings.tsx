import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RotateCcw, CheckSquare, Square } from 'lucide-react';
import { IS_SECTIONS, BS_SECTIONS } from './dataMappingUtils';
import { IS_FIELDS, BS_FIELDS } from './types';

const ALL_FIELDS = new Set([...IS_FIELDS, ...BS_FIELDS] as string[]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabledFields: Set<string>;
  onUpdateEnabledFields: (fields: Set<string>) => void;
}

export function MappingFieldSettings({ open, onOpenChange, enabledFields, onUpdateEnabledFields }: Props) {
  const [draft, setDraft] = useState<Set<string>>(new Set(enabledFields));

  // Sync draft when opening
  const handleOpenChange = useCallback((o: boolean) => {
    if (o) setDraft(new Set(enabledFields));
    onOpenChange(o);
  }, [enabledFields, onOpenChange]);

  const totalEnabled = draft.size;
  const totalFields = ALL_FIELDS.size;

  const toggleField = (field: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  };

  const selectAllInSection = (fields: string[]) => {
    setDraft(prev => {
      const next = new Set(prev);
      fields.forEach(f => next.add(f));
      return next;
    });
  };

  const deselectAllInSection = (fields: string[]) => {
    setDraft(prev => {
      const next = new Set(prev);
      fields.forEach(f => next.delete(f));
      return next;
    });
  };

  const selectAll = () => setDraft(new Set(ALL_FIELDS));
  const deselectAll = () => setDraft(new Set());
  const resetToDefault = () => setDraft(new Set(ALL_FIELDS));

  const handleSave = () => {
    onUpdateEnabledFields(new Set(draft));
    onOpenChange(false);
  };

  const renderSection = (sectionLabel: string, fields: string[]) => {
    const enabledInSection = fields.filter(f => draft.has(f)).length;
    const allEnabled = enabledInSection === fields.length;
    const noneEnabled = enabledInSection === 0;

    return (
      <div key={sectionLabel} className="mb-3">
        <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/30 rounded-md mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{sectionLabel}</span>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 tabular-nums border-border/[0.08]">
              {enabledInSection}/{fields.length}
            </Badge>
            <Button
              variant="ghost" size="sm"
              className="h-5 w-5 p-0 text-muted-foreground/60 hover:text-foreground"
              onClick={() => allEnabled ? deselectAllInSection(fields) : selectAllInSection(fields)}
            >
              {allEnabled ? <Square className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="space-y-0.5">
          {fields.map(field => (
            <label
              key={field}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors",
                draft.has(field) ? "hover:bg-primary/5" : "opacity-50 hover:opacity-75 hover:bg-muted/10"
              )}
            >
              <Checkbox
                checked={draft.has(field)}
                onCheckedChange={() => toggleField(field)}
                className="h-3.5 w-3.5"
              />
              <span className="text-xs">{field}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Visible Mapping Fields</DialogTitle>
          <DialogDescription>
            Choose which fields appear in the mapping panel. Hidden fields won't be deleted — just hidden from the workflow.
          </DialogDescription>
        </DialogHeader>

        {/* Summary + global actions */}
        <div className="flex items-center justify-between py-2 border-b border-border/[0.06]">
          <Badge variant="outline" className="text-[10px] h-5 px-2 tabular-nums">
            {totalEnabled} of {totalFields} fields enabled
          </Badge>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAll}>Select All</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={deselectAll}>Deselect All</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground" onClick={resetToDefault}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 pr-2">
          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Income Statement</h4>
              {IS_SECTIONS.map(s => renderSection(s.label, s.fields))}
            </div>
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Balance Sheet</h4>
              {BS_SECTIONS.map(s => renderSection(s.label, s.fields))}
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/[0.06]">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save Field Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
