import { useState } from 'react';
import { Plus, UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ContactSearchAndCreate,
  formatPickedContactName,
  type PickedContact,
} from './ContactSearchAndCreate';
import type { ContactPickerValue } from './ContactPickerField';

interface Props {
  value: ContactPickerValue[];
  onChange: (value: ContactPickerValue[]) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  id?: string;
}

export function MultiContactPickerField({
  value,
  onChange,
  placeholder = 'Add a contact…',
  className,
  invalid,
  id,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleSelect = (c: PickedContact) => {
    if (value.some((v) => v.id && v.id === c.id)) {
      setOpen(false);
      return;
    }
    onChange([
      ...value,
      { id: c.id, name: formatPickedContactName(c), email: c.email || '' },
    ]);
    setOpen(false);
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div
      id={id}
      className={cn(
        'min-h-9 w-full rounded-md border bg-background px-2 py-1.5 flex flex-wrap items-center gap-1.5',
        invalid ? 'border-destructive/40' : 'border-input',
        className,
      )}
    >
      {value.length === 0 && (
        <span className="text-sm text-muted-foreground px-1">{placeholder}</span>
      )}
      {value.map((c, idx) => (
        <Badge
          key={c.id ?? `inline-${idx}`}
          variant="secondary"
          className="h-6 pl-2 pr-1 gap-1 text-xs font-normal"
        >
          <span className="truncate max-w-[180px]">{c.name || c.email}</span>
          <button
            type="button"
            aria-label={`Remove ${c.name || c.email}`}
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20"
            onClick={() => handleRemove(idx)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
          >
            {value.length === 0 ? (
              <>
                <UserPlus className="h-3.5 w-3.5" /> Add contact
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover" align="start">
          <div className="space-y-2">
            <label className="text-sm font-medium">Add client contact</label>
            <p className="text-[11px] text-muted-foreground">
              Pick from the Contacts database or create a new contact.
            </p>
            <ContactSearchAndCreate open={open} onSelect={handleSelect} autoFocus />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}