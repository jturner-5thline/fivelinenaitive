import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { FunctionSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormulaBarProps {
  cellRef: string; // e.g. "A1"
  cellValue: string;
  onValueChange: (value: string) => void;
  onValueCommit: (value: string) => void;
  onCellRefClick?: () => void;
}

export function FormulaBar({ cellRef, cellValue, onValueChange, onValueCommit, onCellRefClick }: FormulaBarProps) {
  const [localValue, setLocalValue] = useState(cellValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(cellValue);
  }, [cellValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onValueCommit(localValue);
    } else if (e.key === 'Escape') {
      setLocalValue(cellValue);
    }
  }, [localValue, cellValue, onValueCommit]);

  return (
    <div className="flex items-center border-b bg-background">
      {/* Cell reference */}
      <button
        onClick={onCellRefClick}
        className="flex items-center justify-center min-w-[80px] px-3 py-1.5 border-r text-xs font-mono font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {cellRef}
      </button>

      {/* Function icon */}
      <div className="flex items-center px-2 border-r">
        <FunctionSquare className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Formula/value input */}
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onValueChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => onValueCommit(localValue)}
        className="h-8 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono"
        placeholder="Enter value or formula..."
      />
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
