import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check } from 'lucide-react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

interface RichTextInlineEditProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  displayClassName?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

export function RichTextInlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit',
  displayClassName,
  autoSave = false,
  autoSaveDelay = 1000,
}: RichTextInlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [showSaved, setShowSaved] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedValueRef = useRef(value);

  // Sync editValue when value prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
      lastSavedValueRef.current = value;
    }
  }, [value, isEditing]);

  // Show saved indicator briefly
  const showSavedIndicator = useCallback(() => {
    setShowSaved(true);
    if (savedIndicatorTimeoutRef.current) {
      clearTimeout(savedIndicatorTimeoutRef.current);
    }
    savedIndicatorTimeoutRef.current = setTimeout(() => {
      setShowSaved(false);
    }, 2000);
  }, []);

  // Auto-save with debounce
  const debouncedSave = useCallback((newValue: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (newValue !== lastSavedValueRef.current) {
        onSave(newValue);
        lastSavedValueRef.current = newValue;
        showSavedIndicator();
      }
    }, autoSaveDelay);
  }, [onSave, autoSaveDelay, showSavedIndicator]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (savedIndicatorTimeoutRef.current) {
        clearTimeout(savedIndicatorTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (newValue: string) => {
    setEditValue(newValue);
    if (autoSave) {
      debouncedSave(newValue);
    }
  };

  const handleSave = () => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (editValue !== lastSavedValueRef.current) {
      onSave(editValue);
      lastSavedValueRef.current = editValue;
      showSavedIndicator();
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="relative">
        <RichTextEditor
          content={editValue}
          onChange={handleChange}
          onSave={handleSave}
          onCancel={handleCancel}
        />
        {showSaved && (
          <div className="absolute -top-6 right-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 animate-fade-in">
            <Check className="h-3 w-3" />
            <span>Saved</span>
          </div>
        )}
      </div>
    );
  }

  const isEmpty = !value || value === '<p></p>';

  return (
    <div
      className={cn(
        "group flex items-start gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors relative",
        displayClassName
      )}
      onClick={() => setIsEditing(true)}
    >
      {isEmpty ? (
        <span className="text-muted-foreground/50 italic">{placeholder}</span>
      ) : (
        <div 
          className="prose prose-sm max-w-[600px] w-[600px] break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value, { ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br'], ALLOWED_ATTR: [] }) }}
        />
      )}
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
      {showSaved && (
        <div className="absolute -top-5 right-0 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 animate-fade-in">
          <Check className="h-3 w-3" />
          <span>Saved</span>
        </div>
      )}
    </div>
  );
}
