import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Building2, User, Search, Check, Loader2 } from 'lucide-react';
import { useSearchContacts, useSearchCrmCompanies, useCreateChannelEntry, type ChannelType } from '@/hooks/useChannelEntries';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

const CHANNEL_TYPES: ChannelType[] = ['Banks', 'M&A and Investment Bankers', 'Service Providers', 'Investors'];

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

  const { data: contacts = [], isLoading: contactsLoading } = useSearchContacts(contactSearch);
  const { data: companies = [], isLoading: companiesLoading } = useSearchCrmCompanies(companySearch);
  const createChannel = useCreateChannelEntry();
  const { company } = useCompany();

  const reset = () => {
    setContactSearch('');
    setCompanySearch('');
    setSelectedContactId(null);
    setSelectedCompanyId(null);
    setSelectedContactCompanyId(null);
    setChannelType('Banks');
    setNotes('');
    setSearchTab('contacts');
  };

  const handleSelectContact = async (contact: typeof contacts[0]) => {
    setSelectedContactId(contact.id);
    setSelectedCompanyId(null);
    // Auto-attach company if contact has one
    const crmId = contact.crm_company_id || contact.primary_company_id;
    if (crmId) {
      setSelectedContactCompanyId(crmId);
    } else {
      setSelectedContactCompanyId(null);
    }
  };

  const handleSelectCompany = (comp: typeof companies[0]) => {
    setSelectedCompanyId(comp.id);
    setSelectedContactId(null);
    setSelectedContactCompanyId(null);
  };

  const handleSave = async () => {
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
  };

  const hasSelection = selectedContactId || selectedCompanyId;

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Channels</DialogTitle>
        </DialogHeader>

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
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-1">
              {contactsLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
              {!contactsLoading && contactSearch.length >= 2 && contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No contacts found</p>
              )}
              {contactSearch.length < 2 && (
                <p className="text-xs text-muted-foreground text-center py-3">Type at least 2 characters to search</p>
              )}
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectContact(c)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors flex items-center justify-between ${selectedContactId === c.id ? 'bg-accent' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{c.full_name || 'Unnamed'}</p>
                    <p className="text-muted-foreground truncate">{c.email} {c.job_title && `· ${c.job_title}`}</p>
                  </div>
                  {selectedContactId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
            {selectedContactCompanyId && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
                <Building2 className="h-3.5 w-3.5" />
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
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-1">
              {companiesLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
              {!companiesLoading && companySearch.length >= 2 && companies.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No companies found</p>
              )}
              {companySearch.length < 2 && (
                <p className="text-xs text-muted-foreground text-center py-3">Type at least 2 characters to search</p>
              )}
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCompany(c)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors flex items-center justify-between ${selectedCompanyId === c.id ? 'bg-accent' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-muted-foreground truncate">{c.industry || c.domain || ''}</p>
                  </div>
                  {selectedCompanyId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {hasSelection && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <Label className="text-xs">Channel Type</Label>
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" placeholder="Add notes about this channel..." />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={!hasSelection || createChannel.isPending}>
            {createChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
