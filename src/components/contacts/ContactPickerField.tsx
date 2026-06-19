import { useState } from 'react';
import { ChevronDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ContactSearchAndCreate,
  formatPickedContactName,
  type PickedContact,
} from './ContactSearchAndCreate';

export interface ContactPickerValue {
  id?: string;
  name: string;
  email: string;
}

interface Props {
  value: ContactPickerValue | null;
  onChange: (value: ContactPickerValue) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  id?: string;
}

export function ContactPickerField({
  value,
  onChange,
  placeholder = 'Select a contact…',
  className,
  invalid,
  id,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleSelect = (c: PickedContact) => {
    onChange({
      id: c.id,
      name: formatPickedContactName(c),
      email: c.email || '',
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-between font-normal h-9 px-3',
            !value && 'text-muted-foreground',
            invalid && 'border-destructive/40',
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-left">
              {value ? (
                <>
                  <span className="text-foreground">{value.name || value.email || placeholder}</span>
                  {value.email && value.name && value.name !== value.email && (
                    <span className="text-muted-foreground"> · {value.email}</span>
                  )}
                </>
              ) : (
                placeholder
              )}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 bg-popover" align="start">
        <ContactSearchAndCreate
          open={open}
          onSelect={handleSelect}
          selectedName={value?.name || null}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}