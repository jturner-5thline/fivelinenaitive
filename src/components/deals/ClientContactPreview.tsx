import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LastContactChip } from '@/components/contacts/LastContactChip';
import { Building2, Mail, User } from 'lucide-react';

interface Props {
  email?: string | null;
  name?: string | null;
}

interface PreviewData {
  name: string;
  email: string | null;
  companyName: string | null;
  lastContactAt: string | null;
}

/**
 * Compact confirmation card shown next to the Client Contact picker so
 * the user can verify they selected the right person before saving.
 */
export function ClientContactPreview({ email, name }: Props) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = (email || '').trim().toLowerCase();
    if (!key) {
      setData(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from('contacts')
        .select(
          'id, first_name, last_name, full_name, email, last_contact_at, crm_company:crm_companies!crm_company_id(name)'
        )
        .ilike('email', key)
        .limit(1);
      if (cancelled) return;
      const c: any = rows?.[0];
      if (!c) {
        setData({
          name: name || key,
          email: key,
          companyName: null,
          lastContactAt: null,
        });
      } else {
        const composed =
          [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
          c.full_name ||
          name ||
          key;
        setData({
          name: composed,
          email: c.email || key,
          companyName: c.crm_company?.name ?? null,
          lastContactAt: c.last_contact_at ?? null,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [email, name]);

  if (!email) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs space-y-1.5">
      {loading && !data ? (
        <div className="text-muted-foreground italic">Loading contact…</div>
      ) : data ? (
        <>
          <div className="flex items-center gap-1.5 text-foreground font-medium">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{data.name}</span>
          </div>
          {data.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{data.email}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {data.companyName || <span className="italic">No linked company</span>}
            </span>
          </div>
          <LastContactChip value={data.lastContactAt} variant="long" />
        </>
      ) : null}
    </div>
  );
}

export default ClientContactPreview;