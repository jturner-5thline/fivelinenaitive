import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, Replace, ChevronDown, ChevronUp } from 'lucide-react';
import { SpreadsheetSheet } from '@/hooks/useSpreadsheetWorkbook';

interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: SpreadsheetSheet;
  onCellSelect: (row: number, col: number) => void;
  onCellChange: (row: number, col: number, value: string) => void;
}

interface FoundCell {
  row: number;
  col: number;
}

export function FindReplaceDialog({ open, onOpenChange, sheet, onCellSelect, onCellChange }: FindReplaceDialogProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [results, setResults] = useState<FoundCell[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const doFind = useCallback(() => {
    if (!findText) { setResults([]); setCurrentIndex(-1); return; }
    const found: FoundCell[] = [];
    let regex: RegExp | null = null;
    if (useRegex) {
      try { regex = new RegExp(findText, caseSensitive ? 'g' : 'gi'); } catch { return; }
    }
    sheet.data.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell === null || cell === undefined) return;
        const str = String(cell);
        if (regex) {
          if (regex.test(str)) found.push({ row: r, col: c });
          regex.lastIndex = 0;
        } else {
          const a = caseSensitive ? str : str.toLowerCase();
          const b = caseSensitive ? findText : findText.toLowerCase();
          if (a.includes(b)) found.push({ row: r, col: c });
        }
      });
    });
    setResults(found);
    setCurrentIndex(found.length > 0 ? 0 : -1);
    if (found.length > 0) onCellSelect(found[0].row, found[0].col);
  }, [findText, caseSensitive, useRegex, sheet.data, onCellSelect]);

  useEffect(() => { doFind(); }, [findText, caseSensitive, useRegex]);

  const goNext = useCallback(() => {
    if (results.length === 0) return;
    const next = (currentIndex + 1) % results.length;
    setCurrentIndex(next);
    onCellSelect(results[next].row, results[next].col);
  }, [results, currentIndex, onCellSelect]);

  const goPrev = useCallback(() => {
    if (results.length === 0) return;
    const prev = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prev);
    onCellSelect(results[prev].row, results[prev].col);
  }, [results, currentIndex, onCellSelect]);

  const replaceCurrent = useCallback(() => {
    if (currentIndex < 0 || !results[currentIndex]) return;
    const { row, col } = results[currentIndex];
    const cell = sheet.data[row]?.[col];
    if (cell === null || cell === undefined) return;
    const str = String(cell);
    let newVal: string;
    if (useRegex) {
      try { newVal = str.replace(new RegExp(findText, caseSensitive ? '' : 'i'), replaceText); } catch { return; }
    } else {
      const idx = caseSensitive ? str.indexOf(findText) : str.toLowerCase().indexOf(findText.toLowerCase());
      if (idx === -1) return;
      newVal = str.substring(0, idx) + replaceText + str.substring(idx + findText.length);
    }
    onCellChange(row, col, newVal);
    doFind();
  }, [currentIndex, results, sheet.data, findText, replaceText, caseSensitive, useRegex, onCellChange, doFind]);

  const replaceAll = useCallback(() => {
    results.forEach(({ row, col }) => {
      const cell = sheet.data[row]?.[col];
      if (cell === null || cell === undefined) return;
      const str = String(cell);
      let newVal: string;
      if (useRegex) {
        try { newVal = str.replace(new RegExp(findText, caseSensitive ? 'g' : 'gi'), replaceText); } catch { return; }
      } else {
        const flags = caseSensitive ? 'g' : 'gi';
        newVal = str.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), replaceText);
      }
      onCellChange(row, col, newVal);
    });
    doFind();
  }, [results, sheet.data, findText, replaceText, caseSensitive, useRegex, onCellChange, doFind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4" /> Find {showReplace && '& Replace'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find..."
              className="text-sm h-8"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
            />
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goPrev} disabled={results.length === 0}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goNext} disabled={results.length === 0}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            {findText && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {results.length > 0 ? `${currentIndex + 1}/${results.length}` : '0 found'}
              </Badge>
            )}
          </div>

          {showReplace && (
            <div className="flex items-center gap-2">
              <Input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with..."
                className="text-sm h-8"
              />
              <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={replaceCurrent} disabled={currentIndex < 0}>
                Replace
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={replaceAll} disabled={results.length === 0}>
                All
              </Button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={caseSensitive} onCheckedChange={(c) => setCaseSensitive(!!c)} />
              Match case
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={useRegex} onCheckedChange={(c) => setUseRegex(!!c)} />
              Regex
            </label>
            <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => setShowReplace(!showReplace)}>
              <Replace className="h-3 w-3 mr-1" /> {showReplace ? 'Hide' : 'Show'} Replace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
