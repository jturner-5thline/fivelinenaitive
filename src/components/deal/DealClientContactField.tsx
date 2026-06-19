import type { Deal } from '@/types/deal';
import type { PrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { EMPTY_CLIENT_CONTACT_LABEL, resolveDealClientContact } from '@/lib/dealClientContact';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
}

const formatContactName = (c: ContactRow): string => {
  const composed = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  const full = (c.full_name || '').trim();
  // Avoid showing the email as the "name" when full_name was backfilled with it
  if (full && full.toLowerCase() !== (c.email || '').toLowerCase()) return full;
  return c.email || 'Unnamed contact';
};

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
  const { company } = useCompany();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const searchAbort = useRef(0);

  useEffect(() => {
    if (!contactPopoverOpen) {
      setSearch('');
      setResults([]);
      return;
    }
  }, [contactPopoverOpen]);

  useEffect(() => {
    if (!contactPopoverOpen || !company?.id) return;
    const q = search.trim();
    const myToken = ++searchAbort.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        let query = supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email')
          .eq('org_company_id', company.id)
          .order('full_name', { ascending: true })
          .limit(10);
        if (q.length > 0) {
          const escaped = q.replace(/[\\%_,()]/g, (m) => '\\' + m);
          const pat = `%${escaped}%`;
          query = query.or(
            `full_name.ilike.${pat},first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat}`,
          );
        }
        const { data } = await query;
        if (myToken !== searchAbort.current) return;
        setResults((data || []) as ContactRow[]);
      } finally {
        if (myToken === searchAbort.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [search, contactPopoverOpen, company?.id]);

  const handlePickContact = (c: ContactRow) => {
    const name = formatContactName(c);
    onUpdateField('contact', name);
    if (c.email) onUpdateField('contactInfo', c.email);
    setSearch('');
    setResults([]);
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
              <PopoverContent className="w-72 p-4 bg-popover" align="start">
                <div className="space-y-4">
                  {resolved.isLinked && (
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      Linked from Contacts: <span className="font-medium text-foreground">{resolved.name}</span>
                      {resolved.info && <> · {resolved.info}</>}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pick from Contacts</label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search contacts…"
                        className="pl-7 h-8 text-sm"
                      />
                    </div>
                    {(loading || results.length > 0 || search.trim().length > 0) && (
                      <div className="max-h-44 overflow-auto rounded-md border border-border bg-popover">
                        {loading ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          </div>
                        ) : results.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                            No matching contacts
                          </div>
                        ) : (
                          results.map((c) => {
                            const name = formatContactName(c);
                            const hasRealName = name && name !== c.email;
                            const selected = (deal.contact || '').trim().toLowerCase() === name.toLowerCase();
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handlePickContact(c)}
                                className={cn(
                                  'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/60',
                                  selected && 'bg-muted font-medium',
                                )}
                              >
                                <span className="flex-1 min-w-0 flex flex-col">
                                  <span className="truncate text-foreground">
                                    {hasRealName ? name : (c.email || 'Unnamed contact')}
                                  </span>
                                  {hasRealName && c.email && (
                                    <span className="truncate text-[11px] text-muted-foreground">{c.email}</span>
                                  )}
                                </span>
                                {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">Or enter free text below.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact Name</label>
                    <DebouncedInput
                      value={deal.contact || ''}
                      onChange={(value) => onUpdateField('contact', String(value))}
                      onSave={() => onContactPopoverOpenChange(false)}
                      placeholder="Enter contact name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact Info</label>
                    <DebouncedInput
                      value={deal.contactInfo || ''}
                      onChange={(value) => onUpdateField('contactInfo', String(value))}
                      onSave={() => onContactPopoverOpenChange(false)}
                      placeholder="Email or phone number"
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