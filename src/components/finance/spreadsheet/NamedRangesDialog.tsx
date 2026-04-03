import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import { CellRange } from '@/hooks/useSpreadsheetWorkbook';
import { getCellRef } from './FormulaBar';

export interface NamedRange {
  name: string;
  range: string; // e.g. "Sheet1!A1:B10"
}

interface NamedRangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namedRanges: Record<string, string>;
  onAdd: (name: string, range: string) => void;
  onDelete: (name: string) => void;
  currentSheet: string;
  selectionRange: CellRange | null;
  selectedCell: { row: number; col: number };
}

export function NamedRangesDialog({
  open, onOpenChange, namedRanges, onAdd, onDelete,
  currentSheet, selectionRange, selectedCell,
}: NamedRangesDialogProps) {
  const [newName, setNewName] = useState('');
  const namedRangeEntries = Object.entries(namedRanges || {});

  const currentRange = selectionRange
    ? `${currentSheet}!${getCellRef(selectionRange.startRow, selectionRange.startCol)}:${getCellRef(selectionRange.endRow, selectionRange.endCol)}`
    : `${currentSheet}!${getCellRef(selectedCell.row, selectedCell.col)}`;

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || !/^[a-zA-Z_]\w*$/.test(name)) return;
    onAdd(name, currentRange);
    setNewName('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Named Ranges</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Revenue"
                className="h-8 text-xs"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Range</Label>
              <Input value={currentRange} readOnly className="h-8 text-xs bg-muted/30 font-mono" />
            </div>
            <Button size="sm" className="h-8 gap-1" onClick={handleAdd} disabled={!newName.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {/* Existing ranges */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {namedRangeEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No named ranges defined. Select cells and add a name above.</p>
            ) : (
              namedRangeEntries.map(([name, range]) => (
                <div key={name} className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded text-xs">
                  <span className="font-medium">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{range}</span>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDelete(name)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
