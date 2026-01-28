import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SpreadsheetCellProps {
  value: number | string;
  isInput?: boolean;
  isHeader?: boolean;
  isBold?: boolean;
  isNegative?: boolean;
  format?: 'currency' | 'percent' | 'number' | 'text';
  onChange?: (value: number) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function SpreadsheetCell({
  value,
  isInput = false,
  isHeader = false,
  isBold = false,
  isNegative = false,
  format = 'number',
  onChange,
  className,
  align = 'right',
}: SpreadsheetCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const formatValue = useCallback((val: number | string): string => {
    if (typeof val === 'string') return val;
    if (isNaN(val)) return '-';
    
    switch (format) {
      case 'currency':
        const absVal = Math.abs(val);
        const formatted = absVal >= 1000000
          ? `$${(absVal / 1000000).toFixed(2)}M`
          : absVal >= 1000
          ? `$${(absVal / 1000).toFixed(1)}K`
          : `$${absVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        return val < 0 ? `(${formatted})` : formatted;
      case 'percent':
        return `${(val * 100).toFixed(1)}%`;
      case 'number':
        return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
      default:
        return String(val);
    }
  }, [format]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    if (isInput && onChange) {
      setIsEditing(true);
      setEditValue(typeof value === 'number' ? String(value) : value);
    }
  }, [isInput, onChange, value]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (onChange) {
      const numValue = parseFloat(editValue.replace(/[^0-9.-]/g, ''));
      if (!isNaN(numValue)) {
        onChange(numValue);
      }
    }
  }, [editValue, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleBlur]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full h-full px-2 py-1 text-sm border-2 border-primary bg-background outline-none',
          align === 'right' && 'text-right',
          align === 'center' && 'text-center',
        )}
      />
    );
  }

  const displayValue = formatValue(value);
  const actuallyNegative = isNegative || (typeof value === 'number' && value < 0);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'px-2 py-1 text-sm truncate transition-colors',
        isHeader && 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200',
        isBold && 'font-semibold',
        isInput && !isHeader && 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer border-l-2 border-l-blue-400',
        !isInput && !isHeader && 'bg-background',
        actuallyNegative && 'text-red-600 dark:text-red-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {displayValue}
    </div>
  );
}
