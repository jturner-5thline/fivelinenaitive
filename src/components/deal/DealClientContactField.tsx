import type { Deal } from '@/types/deal';
import type { PrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { EMPTY_CLIENT_CONTACT_LABEL, resolveDealClientContact } from '@/lib/dealClientContact';

import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

  const preferredChip = chips.find((c) => c.isPreferred) ?? chips[0] ?? null;
  const extraCount = Math.max(0, chips.length - 1);

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium break-words">Client Contacts</span>
      <Popover open={contactPopoverOpen} onOpenChange={onContactPopoverOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-left hover:bg-muted/30 transition-colors"
          >
            {preferredChip ? (
              <>
                <Star className="h-3 w-3 shrink-0 fill-current text-muted-foreground" />
                <span className="truncate text-xs" data-testid="deal-client-contact-value">
                  {preferredChip.name}
                </span>
                {extraCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal shrink-0">
                    +{extraCount}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">Manage</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground italic truncate" data-testid="deal-client-contact-value">
                  {EMPTY_CLIENT_CONTACT_LABEL}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">Add</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover" align="start">
          <div className="space-y-3">
            {chips.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Client contacts</span>
                  <DraftEmailToClientContactButton
                    dealId={deal.id}
                    dealName={deal.name || deal.company}
                    contactName={resolved.name}
                    contactInfo={resolved.info}
                    companyDomain={deal.companyUrl}
                    size="sm"
                    variant="outline"
                    iconOnly
                    label="Draft email to preferred contact"
                    className="shrink-0"
                  />
                </div>
                <ul className="space-y-0.5">
                  {chips.map((chip, idx) => (
                    <li
                      key={chip.id ?? `legacy-${idx}`}
                      className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        disabled={!chip.id || chip.isPreferred}
                        title={chip.isPreferred ? 'Preferred contact — used for emails, reminders & lender submissions' : 'Set as preferred contact'}
                        aria-label={chip.isPreferred ? `${chip.name} is preferred` : `Set ${chip.name} as preferred`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted-foreground/20 disabled:cursor-default"
                        onClick={() => chip.id && handleSetPreferred(chip.id)}
                      >
                        <Star className={chip.isPreferred ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5 opacity-50'} />
                      </button>
                      <div className="min-w-0 flex-1">
                        {chip.id ? (
                          <DealContactQuickView contactId={chip.id} contactName={chip.name} dealId={deal.id}>
                            <button type="button" className="block truncate text-xs hover:underline max-w-full text-left">
                              {chip.name}
                            </button>
                          </DealContactQuickView>
                        ) : (
                          <span className="block truncate text-xs">{chip.name}</span>
                        )}
                        {chip.email && (
                          <span className="block truncate text-[11px] text-muted-foreground">{chip.email}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${chip.name}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted-foreground/20"
                        onClick={() => (chip.id ? handleRemove(chip.id) : handleClearLegacy())}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <label className="text-sm font-medium flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add client contact
              </label>
              <ContactSearchAndCreate open={contactPopoverOpen} onSelect={handlePickContact} autoFocus={chips.length === 0} />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
