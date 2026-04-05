import { useState, useCallback, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

interface LenderNotesFieldProps {
  lenderId: string;
  initialValue: string;
  onSave: (lenderId: string, notes: string) => void;
  isSaving?: boolean;
  showSuccess?: boolean;
  onFocusChange?: (lenderId: string, focused: boolean) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

/**
 * Self-contained notes field that keeps value in local state only.
 * Saves ONLY on Enter (Shift+Enter = newline).
 * Shows "Press Enter to save" hint when there are unsaved changes.
 */
export function LenderNotesField({
  lenderId,
  initialValue,
  onSave,
  isSaving,
  showSuccess,
  onFocusChange,
  placeholder = 'Add notes... (Press Enter to save)',
  className,
  rows = 2,
}: LenderNotesFieldProps) {
  const [localValue, setLocalValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const prevInitialRef = useRef(initialValue);

  // Sync from parent ONLY when not focused (i.e. after a refetch completes)
  useEffect(() => {
    if (!isFocused && initialValue !== prevInitialRef.current) {
      setLocalValue(initialValue);
    }
    prevInitialRef.current = initialValue;
  }, [initialValue, isFocused]);

  const hasUnsavedChanges = localValue !== initialValue;

  const handleSave = useCallback(() => {
    const trimmed = localValue.trim();
    if (!trimmed && !initialValue) return; // nothing to save
    if (trimmed === (initialValue || '').trim()) return; // no change
    onSave(lenderId, trimmed);
  }, [localValue, initialValue, lenderId, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocusChange?.(lenderId, true);
  }, [lenderId, onFocusChange]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onFocusChange?.(lenderId, false);
  }, [lenderId, onFocusChange]);

  return (
    <div className="flex-1 relative">
      <Textarea
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          'text-xs resize-none py-1.5 transition-all pr-8',
          hasUnsavedChanges && isFocused && 'border-amber-500/50',
          showSuccess && 'ring-2 ring-success border-success',
          className,
        )}
        rows={rows}
      />
      <div className="absolute right-2 top-1.5 flex items-center gap-1">
        {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {showSuccess && <Check className="h-3 w-3 text-success" />}
      </div>
      {hasUnsavedChanges && isFocused && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-0.5">
          Press Enter to save · Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
