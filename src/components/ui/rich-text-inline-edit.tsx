import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil } from 'lucide-react';
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
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedValueRef = useRef(value);

  // Sync editValue when value prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
      lastSavedValueRef.current = value;
    }
  }, [value, isEditing]);

  // Auto-save with debounce
  const debouncedSave = useCallback((newValue: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (newValue !== lastSavedValueRef.current) {
        onSave(newValue);
        lastSavedValueRef.current = newValue;
      }
    }, autoSaveDelay);
  }, [onSave, autoSaveDelay]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
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
      <RichTextEditor
        content={editValue}
        onChange={handleChange}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  const isEmpty = !value || value === '<p></p>';

  return (
    <div
      className={cn(
        "group flex items-start gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors",
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
    </div>
  );
}
