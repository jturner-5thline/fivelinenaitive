import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, User, Search, Check, Loader2, AlertCircle, Link2 } from 'lucide-react';
import { useSearchContacts, useSearchCrmCompanies, useCreateChannelEntry, useChannelEntries, type ChannelType } from '@/hooks/useChannelEntries';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';

const CHANNEL_TYPES: ChannelType[] = CHANNEL_TYPE_OPTIONS.map(o => o.value);

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddChannelDialog({ open, onClose }: Props) {
  const [searchTab, setSearchTab] = useState<'contacts' | 'companies'>('contacts');
  const [contactSearch, setContactSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedContactCompanyId, setSelectedContactCompanyId] = useState<string | null>(null);
  const [channelType, setChannelType] = useState<ChannelType>('Banks');
  const [notes, setNotes] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: contacts = [], isLoading: contactsLoading } = useSearchContacts(contactSearch);
  const { data: companies = [], isLoading: companiesLoading } = useSearchCrmCompanies(companySearch);
  const { data: existingEntries = [] } = useChannelEntries();
  const createChannel = useCreateChannelEntry();

  const isDuplicate = useMemo(() => {
    const contactId = selectedContactId;
    const companyId = selectedCompanyId || selectedContactCompanyId;
    if (!contactId && !companyId) return false;
    return existingEntries.some(e =>
      (contactId ? e.contact_id === contactId : !e.contact_id) &&
      (companyId ? e.crm_company_id === companyId : !e.crm_company_id)
    );
  }, [selectedContactId, selectedCompanyId, selectedContactCompanyId, existingEntries]);

  const reset = () => {
    setContactSearch('');
    setCompanySearch('');
    setSelectedContactId(null);
    setSelectedCompanyId(null);
    setSelectedContactCompanyId(null);
    setChannelType('Banks');
    setNotes('');
    setSearchTab('contacts');
    setSaveError(null);
  };

  const handleSelectContact = (contact: typeof contacts[0]) => {
    setSelectedContactId(contact.id);
    setSelectedCompanyId(null);
    setSaveError(null);
    const crmId = contact.crm_company_id || contact.primary_company_id;
    setSelectedContactCompanyId(crmId || null);
  };

  const handleSelectCompany = (comp: typeof companies[0]) => {
    setSelectedCompanyId(comp.id);
    setSelectedContactId(null);
    setSelectedContactCompanyId(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (isDuplicate) {
      setSaveError('This contact/company is already added to a channel.');
      return;
    }
    setSaveError(null);
    try {
      const contactId = selectedContactId;
      const crmCompanyId = selectedCompanyId || selectedContactCompanyId;
      await createChannel.mutateAsync({
        channel_type: channelType,
        contact_id: contactId,
        crm_company_id: crmCompanyId,
        notes: notes || null,
      });
      reset();
      onClose();
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        setSaveError('This contact/company is already added to a channel.');
      } else {
        setSaveError(err.message || 'Failed to save. Please try again.');
      }
    }
  };

  const hasSelection = selectedContactId || selectedCompanyId;

  const existingContactIds = useMemo(() => new Set(existingEntries.map(e => e.contact_id).filter(Boolean)), [existingEntries]);
  const existingCompanyIds = useMemo(() => new Set(existingEntries.map(e => e.crm_company_id).filter(Boolean)), [existingEntries]);

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Company to Channel</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Search for a contact or company to add within a channel.
        </p>

        <Tabs value={searchTab} onValueChange={(v) => setSearchTab(v as any)} className="flex-1 min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="contacts" className="flex-1 gap-1.5">
              <User className="h-3.5 w-3.5" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="companies" className="flex-1 gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Companies
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts by name or email..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 border rounded-md p-1">
              {contactsLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
              {!contactsLoading && contactSearch.length >= 2 && contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No contacts found</p>
              )}
              {contactSearch.length < 2 && !contactsLoading && (
                <p className="text-xs text-muted-foreground text-center py-3">Type at least 2 characters to search</p>
              )}
              {contacts.map((c) => {
                const alreadyAdded = existingContactIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    disabled={alreadyAdded}
                    className={`w-full text-left px-2.5 py-2 rounded text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2 ${selectedContactId === c.id ? 'bg-accent ring-1 ring-primary/30' : ''} ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{c.full_name || 'Unnamed'}</p>
                      <p className="text-muted-foreground truncate">
                        {c.email}{c.job_title ? ` · ${c.job_title}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.crm_company_id && <Link2 className="h-3 w-3 text-muted-foreground" />}
                      {alreadyAdded && <span className="text-[10px] text-muted-foreground">Added</span>}
                      {selectedContactId === c.id && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedContactCompanyId && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-2">
                 <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                 <span>Associated company will be auto-linked</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="companies" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies by name..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 border rounded-md p-1">
              {companiesLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
              {!companiesLoading && companySearch.length >= 2 && companies.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No companies found</p>
              )}
              {companySearch.length < 2 && !companiesLoading && (
                <p className="text-xs text-muted-foreground text-center py-3">Type at least 2 characters to search</p>
              )}
              {companies.map((c) => {
                const alreadyAdded = existingCompanyIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCompany(c)}
                    disabled={alreadyAdded}
                    className={`w-full text-left px-2.5 py-2 rounded text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2 ${selectedCompanyId === c.id ? 'bg-accent ring-1 ring-primary/30' : ''} ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-muted-foreground truncate">{c.industry || c.domain || ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {alreadyAdded && <span className="text-[10px] text-muted-foreground">Added</span>}
                      {selectedCompanyId === c.id && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {hasSelection && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" placeholder="Add notes..." />
            </div>
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-2.5 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {isDuplicate && hasSelection && (
          <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-md px-2.5 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>This contact/company is already added to a channel.</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={!hasSelection || createChannel.isPending || isDuplicate}>
            {createChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add Company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
