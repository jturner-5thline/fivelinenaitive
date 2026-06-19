import type { Deal } from '@/types/deal';
import type { PrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { EMPTY_CLIENT_CONTACT_LABEL, resolveDealClientContact } from '@/lib/dealClientContact';
import { Button } from '@/components/ui/button';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Plus, X, UserPlus } from 'lucide-react';
import {
  useDealClientContacts,
  useAddDealClientContact,
  useRemoveDealClientContact,
} from '@/hooks/useDealClientContacts';
import {
  ContactSearchAndCreate,
  formatPickedContactName,
  type PickedContact,
} from '@/components/contacts/ContactSearchAndCreate';

interface Props {
  deal: Pick<Deal, 'id' | 'name' | 'company' | 'contact' | 'contactInfo' | 'contactEmail' | 'companyUrl'>;
  linkedContact?: PrimaryDealContact | null;
  contactPopoverOpen: boolean;
  onContactPopoverOpenChange: (open: boolean) => void;
  onUpdateField: (field: 'contact' | 'contactInfo', value: string) => void;
}

export function DealClientContactField({
  deal,
  linkedContact,
  contactPopoverOpen,
  onContactPopoverOpenChange,
  onUpdateField,
}: Props) {
  const resolved = resolveDealClientContact(deal, linkedContact);
  const { data: linkedContacts = [] } = useDealClientContacts(deal.id);
  const addContact = useAddDealClientContact();
  const removeContact = useRemoveDealClientContact();

  // Chips to display: prefer the full linked list from contact_deals.
  // Fall back to the legacy free-text contact when no junction rows exist
  // (older deals not yet migrated to contact_deals links).
  const chips: Array<{ id: string | null; name: string; email: string | null }> =
    linkedContacts.length > 0
      ? linkedContacts.map((c) => ({ id: c.id, name: c.name, email: c.email }))
      : resolved.name
        ? [{ id: null, name: resolved.name, email: resolved.info }]
        : [];

  const linkedIds = new Set(linkedContacts.map((c) => c.id));

  const syncLegacyFromList = (list: typeof linkedContacts) => {
    const first = list[0];
    onUpdateField('contact', first ? first.name : '');
    onUpdateField('contactInfo', first?.email || '');
  };

  const handlePickContact = async (c: PickedContact) => {
    if (linkedIds.has(c.id)) {
      onContactPopoverOpenChange(false);
      return;
    }
    try {
      await addContact.mutateAsync({ dealId: deal.id, contactId: c.id });
      // Mirror first contact into the legacy fields so existing surfaces
      // (emails, drafts, etc.) keep working.
      const name = formatPickedContactName(c);
      const newList = [
        ...linkedContacts,
        { id: c.id, name, email: c.email ?? null, role: null, createdAt: null },
      ];
      syncLegacyFromList(newList);
    } finally {
      onContactPopoverOpenChange(false);
    }
  };

  const handleRemove = async (contactId: string) => {
    try {
      await removeContact.mutateAsync({ dealId: deal.id, contactId });
      const remaining = linkedContacts.filter((c) => c.id !== contactId);
      syncLegacyFromList(remaining);
    } catch {
      // toast handled by hook
    }
  };

  const handleClearLegacy = () => {
    onUpdateField('contact', '');
    onUpdateField('contactInfo', '');
  };

  return (
    <div className="grid grid-cols-[minmax(5rem,6.5rem)_minmax(0,1fr)] items-start gap-2 min-w-0">
      <span className="text-muted-foreground text-sm break-words mt-1.5">Client Contacts</span>
      <div className="min-w-0 w-full flex flex-wrap items-center gap-1.5">
        {chips.length === 0 && (
          <span className="text-sm text-muted-foreground italic mr-1" data-testid="deal-client-contact-value">
            {EMPTY_CLIENT_CONTACT_LABEL}
          </span>
        )}
        <TooltipProvider>
          {chips.map((chip, idx) => (
            <Tooltip key={chip.id ?? `legacy-${idx}`}>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="h-7 pl-2 pr-1 gap-1 text-xs font-normal max-w-full"
                >
                  <span className="truncate max-w-[180px]" data-testid="deal-client-contact-value">
                    {chip.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${chip.name}`}
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (chip.id) handleRemove(chip.id);
                      else handleClearLegacy();
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </TooltipTrigger>
              {chip.email && (
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="font-medium">{chip.name}</p>
                  <p className="text-xs text-muted-foreground">{chip.email}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </TooltipProvider>
        <Popover open={contactPopoverOpen} onOpenChange={onContactPopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 font-normal"
              type="button"
            >
              {chips.length === 0 ? (
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
              <ContactSearchAndCreate
                open={contactPopoverOpen}
                onSelect={handlePickContact}
                autoFocus
              />
            </div>
          </PopoverContent>
        </Popover>
        <DraftEmailToClientContactButton
          dealId={deal.id}
          dealName={deal.name || deal.company}
          contactName={resolved.name}
          contactInfo={resolved.info}
          companyDomain={deal.companyUrl}
          size="sm"
          variant="outline"
          iconOnly
          label="Draft email to client contact"
          className="shrink-0"
        />
      </div>
    </div>
  );
}