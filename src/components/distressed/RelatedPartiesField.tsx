import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, User, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContactSearchAndCreate, formatPickedContactName, type PickedContact } from '@/components/contacts/ContactSearchAndCreate';
import { useCompany } from '@/hooks/useCompany';

interface Row { id: string; kind: 'company' | 'contact'; entityId: string; name: string }

export function RelatedPartiesField({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const { company } = useCompany();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const key = ['deal-related-parties', dealId];

  const { data: rows = [] } = useQuery({
    queryKey: key,
    enabled: !!dealId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase.from('deal_related_parties') as any)
        .select('id, crm_company_id, contact_id, created_at')
        .eq('deal_id', dealId)
        .order('created_at');
      if (error) throw error;
      const compIds = (data || []).map((r: any) => r.crm_company_id).filter(Boolean);
      const contIds = (data || []).map((r: any) => r.contact_id).filter(Boolean);
      const [comps, conts] = await Promise.all([
        compIds.length ? supabase.from('crm_companies').select('id, name').in('id', compIds) : Promise.resolve({ data: [] as any[] }),
        contIds.length ? supabase.from('contacts').select('id, first_name, last_name, full_name, email').in('id', contIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const cm = new Map((comps.data || []).map((c: any) => [c.id, c.name]));
      const ct = new Map((conts.data || []).map((c: any) => [c.id, formatPickedContactName(c)]));
      return (data || []).map((r: any) => r.crm_company_id
        ? { id: r.id, kind: 'company' as const, entityId: r.crm_company_id, name: cm.get(r.crm_company_id) || 'Company' }
        : { id: r.id, kind: 'contact' as const, entityId: r.contact_id, name: ct.get(r.contact_id) || 'Contact' });
    },
  });

  const { data: companyResults = [] } = useQuery({
    queryKey: ['related-party-company-search', company?.id, q.trim().toLowerCase()],
    enabled: open && !!company?.id,
    queryFn: async () => {
      let query = supabase.from('crm_companies').select('id, name').eq('org_company_id', company!.id).order('name').limit(50);
      if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
      const { data } = await query;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const existingCompanies = useMemo(() => new Set(rows.filter((r) => r.kind === 'company').map((r) => r.entityId)), [rows]);
  const existingContacts = useMemo(() => new Set(rows.filter((r) => r.kind === 'contact').map((r) => r.entityId)), [rows]);

  const insertCompany = async (crmCompanyId: string) => {
    if (existingCompanies.has(crmCompanyId)) return;
    const { error } = await (supabase.from('deal_related_parties') as any).insert({ deal_id: dealId, crm_company_id: crmCompanyId });
    if (error && error.code !== '23505') throw error;
  };

  const addCompany = useMutation({
    mutationFn: insertCompany,
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setOpen(false); },
    onError: (e: any) => toast.error(e?.message || 'Failed to add company'),
  });

  const addContact = useMutation({
    mutationFn: async (c: PickedContact) => {
      if (!existingContacts.has(c.id)) {
        const { error } = await (supabase.from('deal_related_parties') as any).insert({ deal_id: dealId, contact_id: c.id });
        if (error && error.code !== '23505') throw error;
      }
      // Auto-add the contact's connected company.
      const { data: contact } = await supabase.from('contacts').select('crm_company_id, primary_company_id').eq('id', c.id).maybeSingle();
      const companyId = (contact as any)?.crm_company_id || (contact as any)?.primary_company_id;
      if (companyId) await insertCompany(companyId);
      return !!companyId;
    },
    onSuccess: (addedCompany) => {
      qc.invalidateQueries({ queryKey: key });
      setOpen(false);
      toast.success(addedCompany ? 'Contact and their company added' : 'Contact added');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add contact'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('deal_related_parties') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e?.message || 'Failed to remove'),
  });

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-muted-foreground text-xs font-medium">Related Parties</span>
      <div className="min-h-8 rounded-md border border-input bg-background px-2 py-1 flex flex-wrap items-center gap-1.5">
        {rows.map((r) => (
          <Badge key={r.id} variant="secondary" className="h-6 pl-2 pr-1 gap-1 text-xs font-normal max-w-full">
            {r.kind === 'company' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
            <span className="truncate max-w-[160px]">{r.name}</span>
            <button type="button" aria-label={`Remove ${r.name}`} className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20" onClick={() => remove.mutate(r.id)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />{rows.length === 0 ? 'Add party' : 'Add'}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 overflow-hidden flex flex-col" style={{ width: 'min(92vw, 600px)', maxWidth: 'min(92vw, 600px)', maxHeight: '85vh' }}>
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle>Add related party</DialogTitle>
            <DialogDescription className="text-[12px]">Adding a contact also adds the company they're connected to.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="contact" className="flex-1 min-h-0 flex flex-col px-5 py-4">
            <TabsList className="self-start mb-3">
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="company">Company</TabsTrigger>
            </TabsList>
            <TabsContent value="contact" className="flex-1 min-h-0 overflow-y-auto mt-0">
              <ContactSearchAndCreate open={open} onSelect={(c) => addContact.mutate(c)} autoFocus />
            </TabsContent>
            <TabsContent value="company" className="flex-1 min-h-0 overflow-y-auto mt-0">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies..." className="h-8 pl-7 text-sm" />
              </div>
              <div className="space-y-0.5">
                {companyResults.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No companies found.</p>
                ) : companyResults.map((c) => (
                  <button key={c.id} type="button" disabled={existingCompanies.has(c.id)} onClick={() => addCompany.mutate(c.id)}
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                    {existingCompanies.has(c.id) && <span className="ml-auto text-[10px] text-muted-foreground">Added</span>}
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
