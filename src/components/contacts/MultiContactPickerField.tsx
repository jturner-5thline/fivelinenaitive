import { useState } from 'react';
import { Plus, UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
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
        </DialogTrigger>
        <DialogContent
          className="p-0 gap-0 overflow-hidden flex flex-col"
          style={{ width: 'min(92vw, 600px)', maxWidth: 'min(92vw, 600px)', maxHeight: '85vh' }}
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0">
            <DialogTitle>Add client contact</DialogTitle>
            <DialogDescription className="text-[12px]">
              Pick from the Contacts database or create a new contact.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <ContactSearchAndCreate open={open} onSelect={handleSelect} autoFocus />
          </div>
        </DialogContent>
      </Dialog>
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
    </div>
  );
}