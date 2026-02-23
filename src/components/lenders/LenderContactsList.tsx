import { useState, useMemo } from 'react';
import { User, Mail, Phone, Briefcase, Trash2, Star, MapPin, Pencil, Check, ChevronsUpDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LenderContact } from '@/hooks/useLenderContacts';
import { LOCATION_OPTIONS } from '@/constants/locations';

interface LenderContactsListProps {
  contacts: LenderContact[];
  onDelete?: (contactId: string) => void;
  onUpdate?: (contactId: string, updates: Partial<{ title: string | null; geography: string | null }>) => Promise<boolean>;
  isEditMode?: boolean;
}

function EditableField({ 
  contactId, 
  field, 
  value, 
  onUpdate, 
  isEditMode 
}: { 
  contactId: string; 
  field: 'title' | 'geography'; 
  value: string | null; 
  onUpdate?: (contactId: string, updates: any) => Promise<boolean>;
  isEditMode?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoSearch, setGeoSearch] = useState('');

  const filteredLocations = useMemo(() => {
    if (!geoSearch) return LOCATION_OPTIONS;
    const search = geoSearch.toLowerCase();
    return LOCATION_OPTIONS.filter(loc => loc.toLowerCase().includes(search));
  }, [geoSearch]);

  if (!isEditMode || !onUpdate) {
    if (!value) return null;
    if (field === 'title') {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Briefcase className="h-3 w-3" />
          <span>{value}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span>{value}</span>
      </div>
    );
  }

  if (editing) {
    if (field === 'geography') {
      return (
        <div className="flex items-center gap-1">
          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
          <Popover open={geoOpen} onOpenChange={setGeoOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs justify-between w-full max-w-[200px] font-normal"
              >
                {editValue || "Select geography"}
                <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0 z-[200]" align="start">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search..."
                  value={geoSearch}
                  onChange={(e) => setGeoSearch(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="max-h-[180px] overflow-y-auto p-1">
                {filteredLocations.length === 0 ? (
                  <div className="py-2 px-3 text-xs text-muted-foreground">No locations found</div>
                ) : (
                  filteredLocations.map(option => (
                    <div
                      key={option}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded-sm cursor-pointer text-xs hover:bg-accent",
                        editValue === option && "bg-accent"
                      )}
                      onClick={async () => {
                        const success = await onUpdate(contactId, { geography: option || null });
                        if (success) { setEditValue(option); setEditing(false); }
                        setGeoOpen(false);
                        setGeoSearch('');
                      }}
                    >
                      <Check className={cn("h-3 w-3", editValue === option ? "opacity-100" : "opacity-0")} />
                      {option}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    // Title (role) field - simple text input
    return (
      <div className="flex items-center gap-1">
        <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 text-xs w-full max-w-[200px]"
          placeholder="e.g., Managing Director"
          autoFocus
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              const success = await onUpdate(contactId, { title: editValue.trim() || null });
              if (success) setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={async () => {
            const success = await onUpdate(contactId, { title: editValue.trim() || null });
            if (success) setEditing(false);
          }}
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(false); setEditValue(value || ''); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Not editing - show value with edit button
  const icon = field === 'title' ? <Briefcase className="h-3 w-3" /> : <MapPin className="h-3 w-3" />;
  const label = field === 'title' ? 'Role' : 'Geography';

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground group/field">
      {icon}
      <span>{value || <span className="italic text-xs">No {label.toLowerCase()}</span>}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover/field:opacity-100 transition-opacity"
        onClick={() => { setEditValue(value || ''); setEditing(true); }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function LenderContactsList({ contacts, onDelete, onUpdate, isEditMode }: LenderContactsListProps) {
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
              <EditableField
                contactId={contact.id}
                field="title"
                value={contact.title}
                onUpdate={onUpdate}
                isEditMode={isEditMode}
              />
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
              <EditableField
                contactId={contact.id}
                field="geography"
                value={contact.geography}
                onUpdate={onUpdate}
                isEditMode={isEditMode}
              />
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
