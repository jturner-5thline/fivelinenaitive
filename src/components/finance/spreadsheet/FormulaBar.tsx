import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { FunctionSquare, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormulaBarProps {
  cellRef: string;
  cellValue: string;
  onValueChange: (value: string) => void;
  onValueCommit: (value: string) => void;
  onCellRefClick?: () => void;
}

// Formula function definitions for autocomplete
const FORMULA_FUNCTIONS = [
  { name: 'SUM', signature: 'SUM(range)', description: 'Adds all numbers in a range' },
  { name: 'AVERAGE', signature: 'AVERAGE(range)', description: 'Returns the average of numbers' },
  { name: 'COUNT', signature: 'COUNT(range)', description: 'Counts cells with numbers' },
  { name: 'MAX', signature: 'MAX(range)', description: 'Returns the largest value' },
  { name: 'MIN', signature: 'MIN(range)', description: 'Returns the smallest value' },
  { name: 'IF', signature: 'IF(condition, true_val, false_val)', description: 'Returns value based on condition' },
  { name: 'VLOOKUP', signature: 'VLOOKUP(value, range, col, exact)', description: 'Vertical lookup in a range' },
  { name: 'CONCATENATE', signature: 'CONCATENATE(text1, text2, ...)', description: 'Joins text strings' },
  { name: 'LEN', signature: 'LEN(text)', description: 'Returns text length' },
  { name: 'TRIM', signature: 'TRIM(text)', description: 'Removes extra spaces' },
  { name: 'UPPER', signature: 'UPPER(text)', description: 'Converts to uppercase' },
  { name: 'LOWER', signature: 'LOWER(text)', description: 'Converts to lowercase' },
  { name: 'LEFT', signature: 'LEFT(text, n)', description: 'Returns leftmost characters' },
  { name: 'RIGHT', signature: 'RIGHT(text, n)', description: 'Returns rightmost characters' },
  { name: 'MID', signature: 'MID(text, start, n)', description: 'Returns characters from middle' },
  { name: 'ABS', signature: 'ABS(number)', description: 'Returns absolute value' },
  { name: 'ROUND', signature: 'ROUND(number, decimals)', description: 'Rounds to decimal places' },
  { name: 'POWER', signature: 'POWER(base, exponent)', description: 'Raises to a power' },
  { name: 'SQRT', signature: 'SQRT(number)', description: 'Returns square root' },
  { name: 'NOW', signature: 'NOW()', description: 'Current date and time' },
  { name: 'TODAY', signature: 'TODAY()', description: 'Current date' },
  { name: 'SPARKLINE', signature: 'SPARKLINE(range, "type")', description: 'Inline chart (line/bar/area)' },
  { name: 'COUNTA', signature: 'COUNTA(range)', description: 'Counts non-empty cells' },
  { name: 'SUMIF', signature: 'SUMIF(range, criteria, sum_range)', description: 'Conditional sum' },
  { name: 'COUNTIF', signature: 'COUNTIF(range, criteria)', description: 'Conditional count' },
];

export function FormulaBar({ cellRef, cellValue, onValueChange, onValueCommit, onCellRefClick }: FormulaBarProps) {
  const [localValue, setLocalValue] = useState(cellValue);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalValue(cellValue);
  }, [cellValue]);

  const filteredFunctions = useMemo(() => {
    if (!localValue.startsWith('=')) return [];
    // Extract the last function token being typed
    const afterEquals = localValue.slice(1);
    const lastToken = afterEquals.split(/[\(\),+\-*/\s]/).pop() || '';
    if (!lastToken || lastToken.length === 0) {
      // Show all when just "=" typed
      if (afterEquals.length === 0) return FORMULA_FUNCTIONS.slice(0, 10);
      return [];
    }
    return FORMULA_FUNCTIONS.filter(f =>
      f.name.toLowerCase().startsWith(lastToken.toLowerCase())
    ).slice(0, 8);
  }, [localValue]);

  useEffect(() => {
    setShowAutocomplete(filteredFunctions.length > 0 && localValue.startsWith('='));
    setSelectedIndex(0);
  }, [filteredFunctions, localValue]);

  const insertFunction = useCallback((funcName: string) => {
    const afterEquals = localValue.slice(1);
    const lastTokenMatch = afterEquals.match(/([A-Za-z_]+)$/);
    const prefix = lastTokenMatch
      ? '=' + afterEquals.slice(0, afterEquals.length - lastTokenMatch[1].length)
      : '=' + afterEquals;
    const newValue = prefix + funcName + '(';
    setLocalValue(newValue);
    onValueChange(newValue);
    setShowAutocomplete(false);
    inputRef.current?.focus();
  }, [localValue, onValueChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredFunctions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && filteredFunctions.length > 0)) {
        e.preventDefault();
        insertFunction(filteredFunctions[selectedIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onValueCommit(localValue);
      setShowAutocomplete(false);
    } else if (e.key === 'Escape') {
      setLocalValue(cellValue);
      setShowAutocomplete(false);
    }
  }, [localValue, cellValue, onValueCommit, showAutocomplete, filteredFunctions, selectedIndex, insertFunction]);

  const handleCommit = useCallback(() => {
    onValueCommit(localValue);
    setShowAutocomplete(false);
  }, [localValue, onValueCommit]);

  const handleCancel = useCallback(() => {
    setLocalValue(cellValue);
    setShowAutocomplete(false);
  }, [cellValue]);

  const isFormula = localValue.startsWith('=');
  const isDirty = localValue !== cellValue;

  return (
    <div className="flex items-center border-b bg-background relative">
      {/* Cell reference */}
      <button
        onClick={onCellRefClick}
        className="flex items-center justify-center min-w-[80px] px-3 py-1.5 border-r text-xs font-mono font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {cellRef}
      </button>

      {/* Function icon */}
      <div className="flex items-center px-2 border-r">
        <FunctionSquare className={cn("h-3.5 w-3.5", isFormula ? "text-primary" : "text-muted-foreground")} />
      </div>

      {/* Commit / cancel buttons when dirty */}
      {isDirty && (
        <div className="flex items-center gap-0.5 px-1 border-r">
          <button onClick={handleCancel} className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive">
            <X className="h-3 w-3" />
          </button>
          <button onClick={handleCommit} className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/10 text-primary">
            <Check className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Formula/value input */}
      <div className="flex-1 relative">
        <Input
          ref={inputRef}
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onValueChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay to allow autocomplete clicks
            setTimeout(() => {
              onValueCommit(localValue);
              setShowAutocomplete(false);
            }, 200);
          }}
          className={cn(
            "h-8 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono",
            isFormula && "text-primary"
          )}
          placeholder="Enter value or formula (start with =)..."
        />

        {/* Autocomplete dropdown */}
        {showAutocomplete && (
          <div
            ref={autocompleteRef}
            className="absolute top-full left-0 z-50 bg-popover border rounded-md shadow-lg min-w-[320px] max-h-[240px] overflow-y-auto"
          >
            {filteredFunctions.map((fn, i) => (
              <button
                key={fn.name}
                className={cn(
                  "w-full text-left px-3 py-1.5 flex items-center gap-3 text-xs hover:bg-accent transition-colors",
                  i === selectedIndex && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertFunction(fn.name);
                }}
              >
                <span className="font-mono font-semibold text-primary min-w-[80px]">{fn.name}</span>
                <span className="font-mono text-muted-foreground">{fn.signature}</span>
                <span className="ml-auto text-muted-foreground text-[10px]">{fn.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function getCellRef(row: number, col: number): string {
  let label = '';
  let num = col;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return `${label}${row + 1}`;
}
