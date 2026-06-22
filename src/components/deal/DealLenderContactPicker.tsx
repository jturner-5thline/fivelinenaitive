import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import { useLenderContacts } from '@/hooks/useLenderContacts';
import {
  useDealLenderSelectedContact,
  useSetDealLenderSelectedContact,
} from '@/hooks/useDealLenderSelectedContact';

interface Props {
  dealLenderId: string;
  masterLenderId: string | null | undefined;
  /** Directory-default contact (from master_lenders) — shown as the fallback option. */
  directoryDefault: {
    name: string | null;
    title?: string | null;
    email: string | null;
  } | null;
}

const DEFAULT_VALUE = '__default__';

/**
 * Picker for the per-deal preferred contact at a funding source. When the
 * user picks a non-default contact, automatic reminders, lender
 * submissions, and AI email drafts for this deal/funding-source pair will
 * use the selected contact instead of the directory default.
 */
export function DealLenderContactPicker({
  dealLenderId,
  masterLenderId,
  directoryDefault,
}: Props) {
  const { contacts: additionalContacts } = useLenderContacts(masterLenderId ?? null);
  const { data: selectedContactId } = useDealLenderSelectedContact(dealLenderId);
  const setSelected = useSetDealLenderSelectedContact();

  const value = selectedContactId ?? DEFAULT_VALUE;

  const directoryLabel = useMemo(() => {
    if (!directoryDefault?.name && !directoryDefault?.email) return 'Directory default';
    const name = directoryDefault?.name || directoryDefault?.email || 'Directory default';
    return `${name} · Directory default`;
  }, [directoryDefault]);

  const selectedFromAdditional = additionalContacts.find((c) => c.id === selectedContactId);
  const hasAlternates = additionalContacts.length > 0;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preferred contact for this deal
        </Label>
        {selectedContactId && (
          <Badge variant="secondary" className="h-5 gap-1 text-[10px] font-normal">
            <Star className="h-2.5 w-2.5 fill-current" />
            Override active
          </Badge>
        )}
      </div>
      <Select
        value={value}
        onValueChange={(v) =>
          setSelected.mutate({
            dealLenderId,
            contactId: v === DEFAULT_VALUE ? null : v,
          })
        }
        disabled={setSelected.isPending || !masterLenderId}
      >
        <SelectTrigger className="h-9 text-sm bg-background">
          <SelectValue placeholder="Select a contact" />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value={DEFAULT_VALUE}>
            <span className="flex flex-col">
              <span className="text-sm">{directoryLabel}</span>
              {directoryDefault?.email && (
                <span className="text-[11px] text-muted-foreground">
                  {directoryDefault.email}
                </span>
              )}
            </span>
          </SelectItem>
          {additionalContacts.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex flex-col">
                <span className="text-sm">
                  {c.name}
                  {c.title ? `, ${c.title}` : ''}
                </span>
                {c.email && (
                  <span className="text-[11px] text-muted-foreground">{c.email}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {hasAlternates
          ? 'Reminders, lender submissions, and AI email drafts for this deal will be addressed to the contact above.'
          : 'No alternate contacts saved yet for this funding source. Add more from the Funding Sources page to enable selection.'}
        {selectedFromAdditional && selectedFromAdditional.email && (
          <>
            {' '}Currently overriding the directory default with{' '}
            <span className="text-foreground">{selectedFromAdditional.email}</span>.
          </>
        )}
      </p>
    </div>
  );
}