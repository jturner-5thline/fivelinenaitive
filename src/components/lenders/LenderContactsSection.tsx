import { useState } from 'react';
import { Plus, User, Mail, Phone, Briefcase, Trash2, Star, Loader2, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLenderContacts, LenderContact } from '@/hooks/useLenderContacts';
import { cn } from '@/lib/utils';

interface LenderContactsSectionProps {
  lenderId: string | null;
  isEditMode?: boolean;
}

interface ContactFormData {
  name: string;
  title: string;
  email: string;
  phone: string;
}

const emptyForm: ContactFormData = {
  name: '',
  title: '',
  email: '',
  phone: '',
};

export function LenderContactsSection({ lenderId, isEditMode = false }: LenderContactsSectionProps) {
  const { contacts, loading, addContact, updateContact, deleteContact, setPrimaryContact } = useLenderContacts(lenderId);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState<ContactFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactFormData>(emptyForm);

  const handleAddContact = async () => {
    if (!newContact.name.trim()) return;

    setIsSaving(true);
    const result = await addContact({
      name: newContact.name.trim(),
      title: newContact.title.trim() || null,
      email: newContact.email.trim() || null,
      phone: newContact.phone.trim() || null,
      is_primary: contacts.length === 0, // First contact is primary by default
    });

    if (result) {
      setNewContact(emptyForm);
      setIsAddingContact(false);
    }
    setIsSaving(false);
  };

  const handleStartEdit = (contact: LenderContact) => {
    setEditingId(contact.id);
    setEditForm({
      name: contact.name,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editForm.name.trim()) return;

    setIsSaving(true);
    const success = await updateContact(id, {
      name: editForm.name.trim(),
      title: editForm.title.trim() || null,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
    });

    if (success) {
      setEditingId(null);
      setEditForm(emptyForm);
    }
    setIsSaving(false);
  };

  const handleDeleteContact = async (id: string) => {
    await deleteContact(id);
  };

  const handleSetPrimary = async (id: string) => {
    await setPrimaryContact(id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contact List */}
      {contacts.length === 0 && !isAddingContact ? (
        <p className="text-muted-foreground text-sm italic">No contacts added</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={cn(
                "p-3 rounded-lg border bg-card",
                contact.is_primary && "border-primary/50 bg-primary/5"
              )}
            >
              {editingId === contact.id ? (
                // Edit mode for this contact
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name *</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Contact name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Title</Label>
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="e.g., Managing Director"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="email@example.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="(555) 555-5555"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={() => handleSaveEdit(contact.id)}
                      disabled={isSaving || !editForm.name.trim()}
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode for this contact
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{contact.name}</span>
                      {contact.is_primary && (
                        <Badge variant="amber" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    {contact.title && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Briefcase className="h-3 w-3" />
                        <span>{contact.title}</span>
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">
                          {contact.email}
                        </a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <a href={`tel:${contact.phone}`} className="hover:underline">
                          {contact.phone}
                        </a>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!contact.is_primary && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleSetPrimary(contact.id)}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set as primary</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleStartEdit(contact)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit contact</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteContact(contact.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete contact</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add New Contact Form */}
      {isAddingContact ? (
        <div className="p-3 rounded-lg border border-dashed bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact name"
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={newContact.title}
                onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                placeholder="e.g., Managing Director"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="email@example.com"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="(555) 555-5555"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setIsAddingContact(false);
                setNewContact(emptyForm);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={handleAddContact}
              disabled={isSaving || !newContact.name.trim()}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Add Contact
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8"
          onClick={() => setIsAddingContact(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Contact
        </Button>
      )}
    </div>
  );
}
