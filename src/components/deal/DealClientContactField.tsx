import type { Deal } from '@/types/deal';
import type { PrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { EMPTY_CLIENT_CONTACT_LABEL, resolveDealClientContact } from '@/lib/dealClientContact';
import { Button } from '@/components/ui/button';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Plus, X, UserPlus, Star } from 'lucide-react';
import {
  useDealClientContacts,
  useAddDealClientContact,
  useRemoveDealClientContact,
  useSetPreferredDealContact,
} from '@/hooks/useDealClientContacts';
import {
  ContactSearchAndCreate,
  formatPickedContactName,
  type PickedContact,
} from '@/components/contacts/ContactSearchAndCreate';
import { DealContactQuickView } from '@/components/deal/DealContactQuickView';

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
  const setPreferred = useSetPreferredDealContact();

  // Chips to display: prefer the full linked list from contact_deals.
  // Fall back to the legacy free-text contact when no junction rows exist
  // (older deals not yet migrated to contact_deals links).
  const chips: Array<{
    id: string | null;
    name: string;
    email: string | null;
    isPreferred: boolean;
    lastContactAt: string | null;
  }> =
    linkedContacts.length > 0
      ? (() => {
          const explicit = linkedContacts.find(
            (c) => (c.role || '').toLowerCase() === 'primary',
          );
          const preferredId = explicit?.id ?? linkedContacts[0]?.id ?? null;
          return linkedContacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            isPreferred: c.id === preferredId,
            lastContactAt: c.lastContactAt,
          }));
        })()
      : resolved.name
        ? [{ id: null, name: resolved.name, email: resolved.info, isPreferred: true, lastContactAt: null }]
        : [];

  const linkedIds = new Set(linkedContacts.map((c) => c.id));

  const syncLegacyFromList = (list: typeof linkedContacts) => {
    const preferred =
      list.find((c) => (c.role || '').toLowerCase() === 'primary') || list[0];
    onUpdateField('contact', preferred ? preferred.name : '');
    onUpdateField('contactInfo', preferred?.email || '');
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
        { id: c.id, name, email: c.email ?? null, role: null, createdAt: null, lastContactAt: null },
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

  const handleSetPreferred = async (contactId: string) => {
    const target = linkedContacts.find((c) => c.id === contactId);
    if (!target) return;
    try {
      await setPreferred.mutateAsync({ dealId: deal.id, contactId });
      // Mirror into legacy fields so emails, drafts, reminders, lender
      // submissions immediately draft against the newly chosen contact.
      onUpdateField('contact', target.name);
      onUpdateField('contactInfo', target.email || '');
    } catch {
      // toast handled by hook
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium break-words">Client Contacts</span>
      <div className="flex min-h-8 w-full min-w-0 flex-col gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
        {chips.length === 0 && (
          <span className="text-xs text-muted-foreground italic mr-1" data-testid="deal-client-contact-value">
            {EMPTY_CLIENT_CONTACT_LABEL}
          </span>
        )}
        <TooltipProvider>
          {chips.map((chip, idx) => (
            <Tooltip key={chip.id ?? `legacy-${idx}`}>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="h-6 pl-2 pr-1 gap-1 text-xs font-normal max-w-full min-w-0"
                >

                  {chip.id && chips.length > 1 ? (
                    <button
                      type="button"
                      aria-label={
                        chip.isPreferred
                          ? `${chip.name} is the preferred contact`
                          : `Set ${chip.name} as preferred contact`
                      }
                      title={
                        chip.isPreferred
                          ? 'Preferred contact — used for emails, reminders & lender submissions'
                          : 'Set as preferred contact for this deal'
                      }
                      className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!chip.isPreferred && chip.id) handleSetPreferred(chip.id);
                      }}
                    >
                      <Star
                        className={
                          chip.isPreferred
                            ? 'h-3 w-3 fill-current'
                            : 'h-3 w-3 opacity-60'
                        }
                      />
                    </button>
                  ) : chip.isPreferred ? (
                    <Star className="h-3 w-3 fill-current" />
                  ) : null}
                  {chip.id ? (
                    <DealContactQuickView contactId={chip.id} contactName={chip.name} dealId={deal.id}>
                      <button
                        type="button"
                        className="truncate max-w-[180px] hover:underline"
                        data-testid="deal-client-contact-value"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {chip.name}
                      </button>
                    </DealContactQuickView>
                  ) : (
                    <span className="truncate max-w-[180px]" data-testid="deal-client-contact-value">
                      {chip.name}
                    </span>
                  )}
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
              <TooltipContent side="top" className="max-w-[240px]">
                <p className="font-medium">{chip.name}</p>
                {chip.email && (
                  <p className="text-xs text-muted-foreground">{chip.email}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Last contact:{' '}
                  {chip.lastContactAt
                    ? new Date(chip.lastContactAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'no activity yet'}
                </p>
                {chip.isPreferred ? (
                  <p className="text-[11px] mt-1">
                    Preferred — emails, reminders & lender submissions use this contact.
                  </p>
                ) : chip.id && chips.length > 1 ? (
                  <p className="text-[11px] mt-1">
                    Click the star to make this the preferred contact for this deal.
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
        </div>
        <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-1.5">
        <Popover open={contactPopoverOpen} onOpenChange={onContactPopoverOpenChange}>

          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
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