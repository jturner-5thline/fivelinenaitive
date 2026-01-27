import { User, Mail, Phone, Briefcase, Trash2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LenderContact } from '@/hooks/useLenderContacts';

interface LenderContactsListProps {
  contacts: LenderContact[];
  onDelete?: (contactId: string) => void;
  isEditMode?: boolean;
}

export function LenderContactsList({ contacts, onDelete, isEditMode }: LenderContactsListProps) {
  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Additional Contacts ({contacts.length})
      </div>
      <div className="space-y-2">
        {contacts.map((contact) => (
          <div 
            key={contact.id} 
            className="p-3 rounded-lg border bg-muted/30 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{contact.name}</span>
                {contact.is_primary && (
                  <Badge variant="amber" className="text-xs shrink-0">
                    <Star className="h-3 w-3 mr-1" />
                    Primary
                  </Badge>
                )}
              </div>
              {isEditMode && onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => onDelete(contact.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete contact</TooltipContent>
                </Tooltip>
              )}
            </div>
            
            <div className="grid gap-1.5 pl-6">
              {contact.title && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  <span>{contact.title}</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <a href={`tel:${contact.phone}`} className="hover:underline">
                    {contact.phone}
                  </a>
                </div>
              )}
              {contact.notes && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {contact.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
