import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';

interface RichTextInlineEditProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  displayClassName?: string;
}

export function RichTextInlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit',
  displayClassName,
}: RichTextInlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <RichTextEditor
        content={editValue}
        onChange={setEditValue}
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
          dangerouslySetInnerHTML={{ __html: value }} 
        />
      )}
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
    </div>
  );
}
