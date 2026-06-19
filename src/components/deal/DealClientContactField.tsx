import type { Deal } from '@/types/deal';
import type { PrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { EMPTY_CLIENT_CONTACT_LABEL, resolveDealClientContact } from '@/lib/dealClientContact';
import { Button } from '@/components/ui/button';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

  const handlePickContact = (c: PickedContact) => {
    const name = formatPickedContactName(c);
    onUpdateField('contact', name);
    onUpdateField('contactInfo', c.email || '');
    onContactPopoverOpenChange(false);
  };

  return (
    <div className="grid grid-cols-[minmax(5rem,6.5rem)_minmax(0,1fr)] items-center gap-2 min-w-0">
      <span className="text-muted-foreground text-sm break-words">Client Contact</span>
      <div className="min-w-0 w-full flex flex-wrap items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <Popover open={contactPopoverOpen} onOpenChange={onContactPopoverOpenChange}>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 min-w-0 justify-start h-8 px-3 font-normal text-sm overflow-hidden">
                    <span className="truncate" data-testid="deal-client-contact-value">
                      {resolved.name || <span className="text-muted-foreground italic">{EMPTY_CLIENT_CONTACT_LABEL}</span>}
                    </span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              {resolved.name && resolved.info && (
                <TooltipContent side="left" className="max-w-[200px]">
                  <p className="font-medium">{resolved.name}</p>
                  <p className="text-xs text-muted-foreground">{resolved.info}</p>
                </TooltipContent>
              )}
              <PopoverContent className="w-80 p-3 bg-popover" align="start">
                <div className="space-y-3">
                  {resolved.isLinked && (
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      Linked from Contacts: <span className="font-medium text-foreground">{resolved.name}</span>
                      {resolved.info && <> · {resolved.info}</>}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pick from Contacts</label>
                    <ContactSearchAndCreate
                      open={contactPopoverOpen}
                      onSelect={handlePickContact}
                      selectedName={deal.contact || null}
                      autoFocus
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </Tooltip>
        </TooltipProvider>
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