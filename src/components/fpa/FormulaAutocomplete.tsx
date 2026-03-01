import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FormulaHint {
  name: string;
  syntax: string;
  description: string;
  category: 'math' | 'lookup' | 'logic' | 'date' | 'text' | 'financial';
}

const FORMULA_HINTS: FormulaHint[] = [
  { name: 'SUM', syntax: 'SUM(range)', description: 'Adds all numbers in a range', category: 'math' },
  { name: 'AVERAGE', syntax: 'AVERAGE(range)', description: 'Returns the average of a range', category: 'math' },
  { name: 'IF', syntax: 'IF(condition, true, false)', description: 'Conditional value', category: 'logic' },
  { name: 'VLOOKUP', syntax: 'VLOOKUP(value, range, col, match)', description: 'Vertical lookup', category: 'lookup' },
  { name: 'INDEX', syntax: 'INDEX(range, row, col)', description: 'Returns value at position', category: 'lookup' },
  { name: 'MATCH', syntax: 'MATCH(value, range, type)', description: 'Returns position of value', category: 'lookup' },
  { name: 'SUMIF', syntax: 'SUMIF(range, criteria, sum_range)', description: 'Sum with condition', category: 'math' },
  { name: 'COUNTIF', syntax: 'COUNTIF(range, criteria)', description: 'Count with condition', category: 'math' },
  { name: 'NPV', syntax: 'NPV(rate, cashflows)', description: 'Net present value', category: 'financial' },
  { name: 'IRR', syntax: 'IRR(cashflows, guess)', description: 'Internal rate of return', category: 'financial' },
  { name: 'PMT', syntax: 'PMT(rate, nper, pv)', description: 'Payment for a loan', category: 'financial' },
  { name: 'CONCATENATE', syntax: 'CONCATENATE(text1, text2)', description: 'Join text strings', category: 'text' },
  { name: 'LEFT', syntax: 'LEFT(text, num_chars)', description: 'Extract left characters', category: 'text' },
  { name: 'TODAY', syntax: 'TODAY()', description: 'Current date', category: 'date' },
  { name: 'EOMONTH', syntax: 'EOMONTH(date, months)', description: 'End of month date', category: 'date' },
  { name: 'ROUND', syntax: 'ROUND(number, decimals)', description: 'Round to decimals', category: 'math' },
  { name: 'ABS', syntax: 'ABS(number)', description: 'Absolute value', category: 'math' },
  { name: 'MIN', syntax: 'MIN(range)', description: 'Smallest value in range', category: 'math' },
  { name: 'MAX', syntax: 'MAX(range)', description: 'Largest value in range', category: 'math' },
  { name: 'IFERROR', syntax: 'IFERROR(value, error_value)', description: 'Handle errors gracefully', category: 'logic' },
];

const CATEGORY_COLORS: Record<string, string> = {
  math: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  lookup: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  logic: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  date: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  text: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  financial: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};

interface FormulaAutocompleteProps {
  inputValue: string;
  visible: boolean;
  onSelect: (formula: string) => void;
  position?: { top: number; left: number };
}

export function FormulaAutocomplete({ inputValue, visible, onSelect, position }: FormulaAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const query = useMemo(() => {
    if (!inputValue.startsWith('=')) return '';
    const after = inputValue.slice(1).toUpperCase();
    // Get last token after operators
    const tokens = after.split(/[+\-*/(),\s]/);
    return tokens[tokens.length - 1] || '';
  }, [inputValue]);

  const filtered = useMemo(() => {
    if (!query) return FORMULA_HINTS.slice(0, 8);
    return FORMULA_HINTS.filter(f => f.name.startsWith(query)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!visible || !inputValue.startsWith('=') || filtered.length === 0) return null;

  return (
    <Card className="absolute z-50 w-80 shadow-lg border" style={position}>
      <CardContent className="p-0">
        <div className="p-2 border-b">
          <p className="text-[10px] text-muted-foreground font-medium">Formula Suggestions</p>
        </div>
        <ScrollArea className="max-h-52">
          {filtered.map((hint, i) => (
            <div
              key={hint.name}
              className={cn(
                "flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors",
                i === selectedIndex ? "bg-muted" : "hover:bg-muted/50"
              )}
              onClick={() => onSelect(hint.name)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold text-primary">{hint.name}</span>
                  <Badge className={cn("text-[8px] px-1 h-3.5", CATEGORY_COLORS[hint.category])}>
                    {hint.category}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{hint.syntax}</p>
                <p className="text-[10px] text-muted-foreground">{hint.description}</p>
              </div>
            </div>
          ))}
        </ScrollArea>
        <div className="p-1.5 border-t text-[9px] text-muted-foreground text-center">
          ↑↓ navigate · ↵ insert · Esc dismiss
        </div>
      </CardContent>
    </Card>
  );
}

// Standalone demo panel for the Sheets module
export function FormulaHelpPanel() {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return FORMULA_HINTS;
    return FORMULA_HINTS.filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Formula Reference</p>
          <Badge variant="outline" className="text-[9px]">{FORMULA_HINTS.length} formulas</Badge>
        </div>
        <input
          placeholder="Search formulas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-7 text-xs px-2 border rounded-md bg-background"
        />
        <ScrollArea className="h-48">
          <div className="space-y-1">
            {filtered.map(f => (
              <div key={f.name} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer">
                <span className="text-[11px] font-mono font-semibold text-primary w-24 shrink-0">{f.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{f.description}</span>
                <Badge className={cn("text-[7px] px-1 h-3 shrink-0 ml-auto", CATEGORY_COLORS[f.category])}>
                  {f.category}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
