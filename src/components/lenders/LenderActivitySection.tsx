import { useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLenderEngagements, useLenderImportedEmails, engagementSourceUrl } from '@/hooks/useLenderEngagements';

const TYPES = ['all', 'email', 'call', 'meeting', 'intro', 'key_item', 'submission', 'pass_feedback', 'announcement'];
const PAGE = 10;

export function LenderActivitySection({ lenderId }: { lenderId: string }) {
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [impPage, setImpPage] = useState(0);
  const { data, isLoading } = useLenderEngagements(lenderId, page, PAGE, type);
  const { data: imported = [], isLoading: impLoading } = useLenderImportedEmails(lenderId);
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const impRows = imported.slice(impPage * PAGE, impPage * PAGE + PAGE);
  const impPages = Math.max(1, Math.ceil(imported.length / PAGE));

  return (
    <section className="mt-6" aria-label="Activity">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          Activity <Badge variant="secondary">{count}</Badge>
        </h3>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-40" aria-label="Activity type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t === 'all' ? 'All types' : t.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No logged engagements yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-2">Date</th><th className="pr-2">Type</th><th className="pr-2">Subject</th>
              <th className="pr-2">Summary</th><th className="pr-2">Direction</th><th className="pr-2">Deal</th><th>Source</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const url = engagementSourceUrl(r.external_ref);
                return (
                  <tr key={r.id} className="border-b border-border/50 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{format(new Date(r.occurred_at), 'MMM d, yyyy')}</td>
                    <td className="pr-2"><Badge variant="outline">{r.activity_type}</Badge></td>
                    <td className="pr-2">{r.subject || '—'}</td>
                    <td className="pr-2 text-muted-foreground max-w-xs truncate" title={r.body ?? ''}>{r.body || '—'}</td>
                    <td className="pr-2">{r.direction || '—'}</td>
                    <td className="pr-2">{r.deal_id ? <Badge variant="secondary">{r.deals?.name ?? 'Deal'}</Badge> : '—'}</td>
                    <td>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">{r.source}<ExternalLink className="h-3 w-3" /></a> : r.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {count > PAGE && (
        <div className="flex items-center justify-end gap-2 mt-2 text-xs">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <span>{page + 1} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-5 mb-2 flex items-center gap-2">
        Imported history (to Jul 2026) <Badge variant="secondary">{imported.length}</Badge>
      </h4>
      {impLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : impRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No imported emails</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Imported history">
          {impRows.map((r: any) => (
            <li key={r.id} className="text-sm flex gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{format(new Date(r.occurred_at), 'MMM d, yyyy h:mm a')}</span>
              <span className="truncate">{r.subject || '(no subject)'}</span>
            </li>
          ))}
        </ul>
      )}
      {imported.length > PAGE && (
        <div className="flex items-center justify-end gap-2 mt-2 text-xs">
          <Button size="sm" variant="ghost" disabled={impPage === 0} onClick={() => setImpPage(impPage - 1)}>Prev</Button>
          <span>{impPage + 1} / {impPages}</span>
          <Button size="sm" variant="ghost" disabled={impPage + 1 >= impPages} onClick={() => setImpPage(impPage + 1)}>Next</Button>
        </div>
      )}
    </section>
  );
}
