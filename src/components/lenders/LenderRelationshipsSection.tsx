import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EVIDENCE_TYPES, PATH_TYPES, introEvidenceUrl, labelize } from '@/lib/lenderIntroPaths';

type Profile = { id: string; full_name: string | null; email: string | null };
const NONE = '__none__';

export function LenderRelationshipsSection({ lenderId }: { lenderId: string }) {
  const qc = useQueryClient();
  const key = ['lender-relationships', lenderId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: ml, error } = await supabase.from('master_lenders')
        .select('relationship_owners, crm_company_id, company_id').eq('id', lenderId).maybeSingle();
      if (error) throw error;
      const [team, lcs, paths, members] = await Promise.all([
        ml?.crm_company_id
          ? supabase.from('crm_company_team').select('id, user_id, role, created_at').eq('crm_company_id', ml.crm_company_id)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from('lender_contacts').select('id, name, contact_id').eq('lender_id', lenderId).order('name'),
        supabase.from('lender_intro_paths').select('*').eq('lender_id', lenderId).order('created_at', { ascending: false }),
        ml?.company_id
          ? supabase.from('company_members').select('user_id').eq('company_id', ml.company_id)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      for (const r of [team, lcs, paths, members]) if (r.error) throw r.error;
      const contactIds = (lcs.data ?? []).map((c: any) => c.contact_id).filter(Boolean);
      const { data: contacts } = contactIds.length
        ? await supabase.from('contacts').select('id, full_name, owner_user_id').in('id', contactIds)
        : { data: [] as any[] };
      const userIds = new Set<string>([
        ...(members.data ?? []).map((m: any) => m.user_id),
        ...(team.data ?? []).map((t: any) => t.user_id),
        ...(contacts ?? []).map((c: any) => c.owner_user_id).filter(Boolean),
        ...(paths.data ?? []).map((p: any) => p.from_user_id).filter(Boolean),
      ]);
      const { data: profiles } = userIds.size
        ? await supabase.from('profiles').select('user_id, email, first_name, last_name, display_name').in('user_id', [...userIds])
        : { data: [] as any[] };
      return {
        ownerNotes: ml?.relationship_owners as string | null, crmCompanyId: ml?.crm_company_id as string | null,
        team: team.data ?? [], lenderContacts: lcs.data ?? [], contacts: contacts ?? [], paths: paths.data ?? [],
        memberIds: (members.data ?? []).map((m: any) => m.user_id) as string[], profiles: (profiles ?? []).map((p: any) => ({ id: p.user_id, email: p.email, full_name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null })) as Profile[],
      };
    },
  });
  const nameOf = (id?: string | null) => {
    const p = data?.profiles.find((x) => x.id === id);
    return p ? p.full_name || p.email || 'Unknown' : '—';
  };
  const members = (data?.profiles ?? []).filter((p) => data?.memberIds.includes(p.id))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const [ownerForm, setOwnerForm] = useState<{ user_id: string; role: string } | null>(null);
  const addOwner = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('crm_company_team').insert({
        crm_company_id: data!.crmCompanyId!, user_id: ownerForm!.user_id, role: ownerForm!.role || 'owner',
      });
      if (error) throw error;
    },
    onSuccess: () => { setOwnerForm(null); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e.message),
  });

  const blank = { from_kind: 'name', from_name: '', from_user_id: '', lender_contact_id: NONE, path_type: 'introduced_by', evidence_type: 'manual', evidence_ref: '', occurred_on: '', notes: '' };
  const [pathForm, setPathForm] = useState<typeof blank | null>(null);
  const addPath = useMutation({
    mutationFn: async () => {
      const f = pathForm!;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('lender_intro_paths').insert({
        lender_id: lenderId, created_by: u.user?.id,
        lender_contact_id: f.lender_contact_id === NONE ? null : f.lender_contact_id,
        from_user_id: f.from_kind === 'user' ? f.from_user_id || null : null,
        from_name: f.from_kind === 'name' ? f.from_name.trim() || null : null,
        path_type: f.path_type, evidence_type: f.evidence_type, evidence_ref: f.evidence_ref || null,
        occurred_on: f.occurred_on || null, notes: f.notes || null, status: 'confirmed',
      });
      if (error) throw error;
    },
    onSuccess: () => { setPathForm(null); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e.code === '23505' ? 'This intro path is already logged.' : e.message),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('lender_intro_paths').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  const fromLabel = (p: any) => p.from_name || (p.from_user_id && nameOf(p.from_user_id))
    || (p.from_contact_id && 'Contact') || (p.from_referral_source_id && 'Referral source') || '—';
  const sub = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2';

  return (
    <section className="mt-6 space-y-4" aria-label="Relationships">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Relationships</h3>

      <div>
        <div className={sub}>Current owner notes</div>
        <p className="text-sm whitespace-pre-wrap">{data?.ownerNotes?.trim() || <span className="italic text-muted-foreground">None</span>}</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className={sub}>Company owners <Badge variant="secondary">{data?.team.length ?? 0}</Badge></div>
          {data?.crmCompanyId && (
            <Button size="sm" variant="outline" onClick={() => setOwnerForm(ownerForm ? null : { user_id: '', role: 'owner' })}>
              {ownerForm ? 'Cancel' : 'Add owner'}
            </Button>
          )}
        </div>
        {!data?.crmCompanyId && <p className="text-xs text-muted-foreground italic">Not linked to a company yet.</p>}
        {ownerForm && (
          <form className="flex gap-2 my-2" aria-label="Add company owner" onSubmit={(e: FormEvent) => { e.preventDefault(); if (ownerForm.user_id) addOwner.mutate(); }}>
            <Select value={ownerForm.user_id} onValueChange={(v) => setOwnerForm({ ...ownerForm, user_id: v })}>
              <SelectTrigger aria-label="Owner" className="w-56"><SelectValue placeholder="Choose teammate" /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="w-40" placeholder="Role" value={ownerForm.role} onChange={(e) => setOwnerForm({ ...ownerForm, role: e.target.value })} />
            <Button size="sm" type="submit" disabled={!ownerForm.user_id || addOwner.isPending}>Save</Button>
          </form>
        )}
        {data?.crmCompanyId && data.team.length === 0 && !ownerForm && <p className="text-sm italic text-muted-foreground">No company owners yet.</p>}
        <ul className="text-sm space-y-1">
          {data?.team.map((t: any) => <li key={t.id}>{nameOf(t.user_id)} <span className="text-muted-foreground">· {t.role || 'owner'}</span></li>)}
        </ul>
      </div>

      <div>
        <div className={sub}>Contact owners</div>
        {(data?.lenderContacts.length ?? 0) === 0 ? <p className="text-sm italic text-muted-foreground">No contacts.</p> : (
          <ul className="text-sm space-y-1">
            {data!.lenderContacts.map((lc: any) => {
              const c: any = data!.contacts.find((x: any) => x.id === lc.contact_id);
              return (
                <li key={lc.id} className="flex justify-between gap-4">
                  {c ? <Link to={`/contacts/${c.id}`} className="text-primary hover:underline">{c.full_name || lc.name}</Link> : <span>{lc.name}</span>}
                  <span className="text-muted-foreground">{c?.owner_user_id ? nameOf(c.owner_user_id) : 'No owner'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className={sub}>Intro paths <Badge variant="secondary">{data?.paths.length ?? 0}</Badge></div>
          <Button size="sm" variant="outline" onClick={() => setPathForm(pathForm ? null : blank)}>{pathForm ? 'Cancel' : 'Add intro path'}</Button>
        </div>
        {pathForm && (
          <form aria-label="Add intro path" className="grid grid-cols-2 md:grid-cols-4 gap-2 my-2"
            onSubmit={(e: FormEvent) => { e.preventDefault(); if (pathForm.from_kind === 'name' ? pathForm.from_name.trim() : pathForm.from_user_id) addPath.mutate(); }}>
            <Select value={pathForm.from_kind} onValueChange={(v) => setPathForm({ ...pathForm, from_kind: v })}>
              <SelectTrigger aria-label="From kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="name">Person (name)</SelectItem><SelectItem value="user">Teammate</SelectItem></SelectContent>
            </Select>
            {pathForm.from_kind === 'name'
              ? <Input placeholder="From (name)" value={pathForm.from_name} onChange={(e) => setPathForm({ ...pathForm, from_name: e.target.value })} />
              : (
                <Select value={pathForm.from_user_id} onValueChange={(v) => setPathForm({ ...pathForm, from_user_id: v })}>
                  <SelectTrigger aria-label="From teammate"><SelectValue placeholder="Teammate" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}</SelectContent>
                </Select>
              )}
            <Select value={pathForm.path_type} onValueChange={(v) => setPathForm({ ...pathForm, path_type: v })}>
              <SelectTrigger aria-label="Path type"><SelectValue /></SelectTrigger>
              <SelectContent>{PATH_TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={pathForm.lender_contact_id} onValueChange={(v) => setPathForm({ ...pathForm, lender_contact_id: v })}>
              <SelectTrigger aria-label="To contact"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Funding source (no contact)</SelectItem>
                {data?.lenderContacts.map((lc: any) => <SelectItem key={lc.id} value={lc.id}>{lc.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={pathForm.evidence_type} onValueChange={(v) => setPathForm({ ...pathForm, evidence_type: v })}>
              <SelectTrigger aria-label="Evidence type"><SelectValue /></SelectTrigger>
              <SelectContent>{EVIDENCE_TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Evidence link or id" value={pathForm.evidence_ref} onChange={(e) => setPathForm({ ...pathForm, evidence_ref: e.target.value })} />
            <Input type="date" aria-label="Occurred on" value={pathForm.occurred_on} onChange={(e) => setPathForm({ ...pathForm, occurred_on: e.target.value })} />
            <Input placeholder="Notes" value={pathForm.notes} onChange={(e) => setPathForm({ ...pathForm, notes: e.target.value })} />
            <Button size="sm" type="submit" className="col-span-2 md:col-span-1" disabled={addPath.isPending}>Save intro path</Button>
          </form>
        )}
        {(data?.paths.length ?? 0) === 0 && !pathForm && <p className="text-sm italic text-muted-foreground">No intro paths logged.</p>}
        <ul className="space-y-2">
          {data?.paths.map((p: any) => {
            const url = introEvidenceUrl(p.evidence_type, p.evidence_ref);
            const to = data.lenderContacts.find((lc: any) => lc.id === p.lender_contact_id)?.name;
            return (
              <li key={p.id} className="text-sm flex flex-wrap items-center gap-2 border-b border-border pb-2">
                <span className="font-medium">{fromLabel(p)}</span>
                <span className="text-muted-foreground">{labelize(p.path_type)}{to ? ` → ${to}` : ''}</span>
                {p.occurred_on && <span className="text-muted-foreground">{p.occurred_on}</span>}
                {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">{labelize(p.evidence_type)} <ExternalLink className="h-3 w-3" /></a>
                  : p.evidence_type && <span className="text-muted-foreground">{labelize(p.evidence_type)}</span>}
                <Badge variant={p.status === 'confirmed' ? 'default' : p.status === 'rejected' ? 'destructive' : 'secondary'}>{p.status}</Badge>
                {p.status === 'proposed' && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: p.id, status: 'confirmed' })}>Confirm</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: p.id, status: 'rejected' })}>Reject</Button>
                  </span>
                )}
                {p.notes && <span className="w-full text-xs text-muted-foreground">{p.notes}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
