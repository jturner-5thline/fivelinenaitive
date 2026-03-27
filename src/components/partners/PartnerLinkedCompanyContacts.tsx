import { useState, useEffect, useCallback } from 'react';
import { X, Search, Building2, UserRound, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface LinkedCompany {
  id: string;
  partner_company_id: string;
  name: string;
}

interface LinkedContact {
  id: string;
  partner_contact_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_id: string | null;
}

export function PartnerLinkedCompanyContacts({ partnerId }: { partnerId: string }) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [searchMode, setSearchMode] = useState<'companies' | 'contacts'>('companies');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [unlinkCompanyId, setUnlinkCompanyId] = useState<string | null>(null);

  // Fetch linked companies
  const { data: linkedCompanies = [] } = useQuery({
    queryKey: ['partner-companies', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_companies' as any)
        .select('id, company_id')
        .eq('partner_id', partnerId);
      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];
      const companyIds = rows.map(r => r.company_id);
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);
      return (companies || []).map((c: any) => ({
        id: c.id,
        partner_company_id: rows.find((r: any) => r.company_id === c.id)?.id,
        name: c.name,
      })) as LinkedCompany[];
    },
    enabled: !!partnerId,
  });

  // Fetch linked contacts
  const { data: linkedContacts = [] } = useQuery({
    queryKey: ['partner-contacts', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_contacts' as any)
        .select('id, contact_id')
        .eq('partner_id', partnerId);
      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];
      const contactIds = rows.map(r => r.contact_id);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, primary_company_id')
        .in('id', contactIds);
      return (contacts || []).map((c: any) => ({
        id: c.id,
        partner_contact_id: rows.find((r: any) => r.contact_id === c.id)?.id,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        company_id: c.primary_company_id,
      })) as LinkedContact[];
    },
    enabled: !!partnerId,
  });

  // Search companies
  const { data: companyResults = [] } = useQuery({
    queryKey: ['search-companies', searchTerm, searchMode],
    queryFn: async () => {
      if (searchMode !== 'companies' || searchTerm.length < 2) return [];
      const { data } = await supabase
        .from('companies')
        .select('id, name')
        .ilike('name', `%${searchTerm}%`)
        .limit(10);
      return (data || []) as { id: string; name: string }[];
    },
    enabled: searchMode === 'companies' && searchTerm.length >= 2,
  });

  // Search contacts
  const { data: contactResults = [] } = useQuery({
    queryKey: ['search-contacts', searchTerm, searchMode],
    queryFn: async () => {
      if (searchMode !== 'contacts' || searchTerm.length < 2) return [];
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, primary_company_id')
        .or(`full_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(10);
      return (data || []) as any[];
    },
    enabled: searchMode === 'contacts' && searchTerm.length >= 2,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['partner-companies', partnerId] });
    queryClient.invalidateQueries({ queryKey: ['partner-contacts', partnerId] });
  };

  const linkCompanyAndContacts = async (companyId: string) => {
    try {
      // Link company
      await supabase.from('partner_companies' as any).upsert(
        { partner_id: partnerId, company_id: companyId } as any,
        { onConflict: 'partner_id,company_id' }
      );

      // Fetch all contacts for this company
      const { data: companyContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('primary_company_id', companyId);

      if (companyContacts && companyContacts.length > 0) {
        const contactRows = companyContacts.map((c: any) => ({
          partner_id: partnerId,
          contact_id: c.id,
        }));
        await supabase.from('partner_contacts' as any).upsert(
          contactRows as any,
          { onConflict: 'partner_id,contact_id' }
        );
      }

      invalidate();
      setSearchOpen(false);
      setSearchTerm('');
      toast.success('Company and contacts linked');
    } catch (e: any) {
      toast.error(e.message || 'Failed to link company');
    }
  };

  const linkContactAndCompany = async (contact: any) => {
    try {
      // Link this contact
      await supabase.from('partner_contacts' as any).upsert(
        { partner_id: partnerId, contact_id: contact.id } as any,
        { onConflict: 'partner_id,contact_id' }
      );

      // If contact has a company, link that company and all its contacts
      if (contact.primary_company_id) {
        await supabase.from('partner_companies' as any).upsert(
          { partner_id: partnerId, company_id: contact.primary_company_id } as any,
          { onConflict: 'partner_id,company_id' }
        );

        const { data: companyContacts } = await supabase
          .from('contacts')
          .select('id')
          .eq('primary_company_id', contact.primary_company_id);

        if (companyContacts && companyContacts.length > 0) {
          const contactRows = companyContacts.map((c: any) => ({
            partner_id: partnerId,
            contact_id: c.id,
          }));
          await supabase.from('partner_contacts' as any).upsert(
            contactRows as any,
            { onConflict: 'partner_id,contact_id' }
          );
        }
      }

      invalidate();
      setSearchOpen(false);
      setSearchTerm('');
      toast.success('Contact linked');
    } catch (e: any) {
      toast.error(e.message || 'Failed to link contact');
    }
  };

  const unlinkContact = async (partnerContactId: string) => {
    await supabase.from('partner_contacts' as any).delete().eq('id', partnerContactId);
    invalidate();
  };

  const unlinkCompany = async (companyId: string) => {
    // Remove company link
    await supabase.from('partner_companies' as any).delete().eq('partner_id', partnerId).eq('company_id', companyId);
    // Also remove all contacts from that company
    const contactsToRemove = linkedContacts.filter(c => c.company_id === companyId);
    for (const c of contactsToRemove) {
      await supabase.from('partner_contacts' as any).delete().eq('id', c.partner_contact_id);
    }
    invalidate();
    setUnlinkCompanyId(null);
    toast.success('Company unlinked');
  };

  const getContactName = (c: LinkedContact) =>
    c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';

  const alreadyLinkedCompanyIds = new Set(linkedCompanies.map(c => c.id));
  const alreadyLinkedContactIds = new Set(linkedContacts.map(c => c.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Linked Company & Contacts</h3>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Link
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 bg-slate-900 border-slate-700" side="bottom" align="end">
            {/* Mode toggle */}
            <div className="flex border-b border-slate-700">
              <button
                onClick={() => { setSearchMode('companies'); setSearchTerm(''); }}
                className={`flex-1 text-xs py-2 px-3 font-medium transition-colors ${searchMode === 'companies' ? 'text-white border-b-2 border-primary' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <Building2 className="h-3 w-3 inline mr-1" /> Companies
              </button>
              <button
                onClick={() => { setSearchMode('contacts'); setSearchTerm(''); }}
                className={`flex-1 text-xs py-2 px-3 font-medium transition-colors ${searchMode === 'contacts' ? 'text-white border-b-2 border-primary' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <UserRound className="h-3 w-3 inline mr-1" /> Contacts
              </button>
            </div>
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 pb-2">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={searchMode === 'companies' ? 'Search companies...' : 'Search contacts...'}
                  className="h-8 bg-slate-800 border-slate-600 text-white text-xs"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {searchMode === 'companies' && companyResults.length === 0 && searchTerm.length >= 2 && (
                  <p className="text-xs text-slate-500 text-center py-3">No companies found</p>
                )}
                {searchMode === 'companies' && companyResults.map(c => (
                  <button
                    key={c.id}
                    disabled={alreadyLinkedCompanyIds.has(c.id)}
                    onClick={() => linkCompanyAndContacts(c.id)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Building2 className="h-3 w-3 text-slate-500 shrink-0" />
                    {c.name}
                    {alreadyLinkedCompanyIds.has(c.id) && <span className="ml-auto text-[10px] text-slate-500">Linked</span>}
                  </button>
                ))}
                {searchMode === 'contacts' && contactResults.length === 0 && searchTerm.length >= 2 && (
                  <p className="text-xs text-slate-500 text-center py-3">No contacts found</p>
                )}
                {searchMode === 'contacts' && contactResults.map((c: any) => {
                  const cName = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';
                  return (
                    <button
                      key={c.id}
                      disabled={alreadyLinkedContactIds.has(c.id)}
                      onClick={() => linkContactAndCompany(c)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <UserRound className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{cName}</span>
                      {alreadyLinkedContactIds.has(c.id) && <span className="ml-auto text-[10px] text-slate-500">Linked</span>}
                    </button>
                  );
                })}
                {searchTerm.length < 2 && (
                  <p className="text-xs text-slate-500 text-center py-3">Type at least 2 characters...</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Linked Companies */}
      {linkedCompanies.length > 0 && (
        <div className="space-y-2 mb-3">
          {linkedCompanies.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2">
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-sm text-white font-medium truncate">{c.name}</span>
              <button
                onClick={() => setUnlinkCompanyId(c.id)}
                className="ml-auto text-slate-500 hover:text-red-400 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Linked Contacts */}
      {linkedContacts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {linkedContacts.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-slate-700/60 border border-slate-600 rounded-full px-2.5 py-1 text-xs text-slate-300">
              <UserRound className="h-3 w-3 text-slate-400" />
              {getContactName(c)}
              <button onClick={() => unlinkContact(c.partner_contact_id)} className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : linkedCompanies.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
          <p className="text-sm text-slate-400">No linked companies or contacts.</p>
          <p className="text-xs text-slate-500 mt-1">Use the Link button to connect companies and contacts to this partner.</p>
        </div>
      ) : null}

      {/* Unlink Company Confirmation */}
      <AlertDialog open={!!unlinkCompanyId} onOpenChange={(v) => { if (!v) setUnlinkCompanyId(null); }}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink company?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove the company and all associated contacts from this partner.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => unlinkCompanyId && unlinkCompany(unlinkCompanyId)}>Unlink</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
