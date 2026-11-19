import { FormEvent, useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatOutsideDealAmount, outsideDealSourceUrl, isDuplicateError } from '@/lib/lenderDealHistory';

const ROLES = ['lead', 'participant', 'agent', 'sole', 'unknown'];

export function LenderOtherDealsSection({ lenderId }: { lenderId: string }) {
  const qc = useQueryClient();
  const key = ['lender-deal-history', lenderId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('lender_deal_history').select('*')
        .eq('lender_id', lenderId).order('announced_on', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ borrower_name: '', announced_on: '', amount: '', product_type: '', industry: '', lender_role: 'unknown', source_ref: '' });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('lender_deal_history').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const amt = f.amount.replace(/[$,\s]/g, '');
      const num = /^\d+(\.\d+)?$/.test(amt) ? Number(amt) : null;
      const { error } = await supabase.from('lender_deal_history').insert({
        lender_id: lenderId, borrower_name: f.borrower_name.trim(), announced_on: f.announced_on || null,
        amount_usd: num, amount_text: num == null && f.amount ? f.amount : null,
        product_type: f.product_type || null, industry: f.industry || null, lender_role: f.lender_role,
        source_ref: f.source_ref || null, source_type: f.source_ref ? 'other' : null,
        status: 'confirmed', proposed_by: 'manual', created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setOpen(false);
      setF({ borrower_name: '', announced_on: '', amount: '', product_type: '', industry: '', lender_role: 'unknown', source_ref: '' });
    },
    onError: (e: any) => toast.error(isDuplicateError(e) ? 'This deal is already logged for that month.' : e.message),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); if (f.borrower_name.trim()) add.mutate(); };

  return (
    <section className="mt-6" aria-label="Other deals">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          Other deals <Badge variant="secondary">{rows.length}</Badge>
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Add deal'}</Button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4" aria-label="Add outside deal">
          <Input required placeholder="Borrower" value={f.borrower_name} onChange={(e) => setF({ ...f, borrower_name: e.target.value })} />
          <Input type="date" aria-label="Announced on" value={f.announced_on} onChange={(e) => setF({ ...f, announced_on: e.target.value })} />
          <Input placeholder="Amount (e.g. 5000000 or $10-15MM)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input placeholder="Product" value={f.product_type} onChange={(e) => setF({ ...f, product_type: e.target.value })} />
          <Input placeholder="Industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} />
          <Select value={f.lender_role} onValueChange={(v) => setF({ ...f, lender_role: v })}>
            <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Source link" value={f.source_ref} onChange={(e) => setF({ ...f, source_ref: e.target.value })} />
          <Button type="submit" disabled={add.isPending}>Save</Button>
        </form>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No outside deals logged.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-2">Borrower</th><th className="pr-2">Date</th><th className="pr-2">Amount</th><th className="pr-2">Product</th>
              <th className="pr-2">Industry</th><th className="pr-2">Role</th><th className="pr-2">Source</th><th className="pr-2">Evidence</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r: any) => {
                const url = outsideDealSourceUrl(r.source_ref);
                return (
                  <tr key={r.id} className="border-b border-border/50 align-top">
                    <td className="py-1.5 pr-2 font-medium">{r.borrower_name}</td>
                    <td className="pr-2 whitespace-nowrap">{r.announced_on ? format(new Date(r.announced_on + 'T00:00:00'), 'MMM d, yyyy') : '—'}</td>
                    <td className="pr-2">{formatOutsideDealAmount(r.amount_usd, r.amount_text)}</td>
                    <td className="pr-2">{r.product_type || '—'}</td>
                    <td className="pr-2">{r.industry || '—'}</td>
                    <td className="pr-2">{r.lender_role || '—'}</td>
                    <td className="pr-2">{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">{r.source_type || 'link'}<ExternalLink className="h-3 w-3" /></a> : (r.source_type || '—')}</td>
                    <td className="pr-2">{r.evidence_grade ? <Badge variant="outline">{r.evidence_grade.replace('_', ' ')}</Badge> : '—'}</td>
                    <td>
                      {r.status === 'proposed' ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: 'confirmed' })}>Confirm</Button>
                          <Button size="sm" variant="ghost" className="h-7" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: 'rejected' })}>Reject</Button>
                        </div>
                      ) : <Badge variant={r.status === 'confirmed' ? 'secondary' : 'outline'}>{r.status}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
