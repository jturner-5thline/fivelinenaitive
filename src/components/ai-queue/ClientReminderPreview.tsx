import { Mail, Users, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';

interface Props {
  item: QueuedAiAction;
}

/**
 * Preview block shown inside the AQ expanded review for the two client-reminder
 * bundles produced by the Deal Admin Agent:
 *   - `outstanding_items_reminder:{deal_id}` (Rule D-1)
 *   - `client_followup:{deal_id}`            (Rule D-2)
 *
 * Surfaces the recipient summary + a rendered draft preview of the reminder
 * email so the reviewer knows exactly WHO will be contacted and WHAT will be
 * drafted on approve — before the composer opens.
 */
export function ClientReminderPreview({ item }: Props) {
  const nv = (item.new_values || {}) as any;
  const bundleKey: string = nv?.bundle_key ?? '';
  const isOutstanding = bundleKey.startsWith('outstanding_items_reminder:');
  const isClientFollowup = bundleKey.startsWith('client_followup:');
  if (!isOutstanding && !isClientFollowup) return null;

  const dealName = item.deal_name || 'this deal';

  // Recipients
  const recipients: Array<{ name: string; email?: string; note?: string }> = [];
  if (isClientFollowup && Array.isArray(nv?.client_contacts)) {
    for (const c of nv.client_contacts) {
      recipients.push({
        name: c?.name || c?.email || 'Client contact',
        email: c?.email,
        note:
          typeof c?.business_days_since_sent === 'number'
            ? `silent ${c.business_days_since_sent} BD`
            : undefined,
      });
    }
  } else if (isOutstanding) {
    recipients.push({
      name: 'Primary client contact',
      note: `on ${dealName} — resolved at composer open`,
    });
  }

  // Subject preview
  const subject = isOutstanding
    ? `Following up: outstanding items on ${dealName}`
    : `Following up on ${dealName}`;

  // Body preview lines
  const bodyLines: string[] = [];
  if (isOutstanding && Array.isArray(nv?.outstanding_items) && nv.outstanding_items.length > 0) {
    bodyLines.push(`Hi — circling back on a few items we still need for ${dealName}:`);
    bodyLines.push('');
    const sorted = [...nv.outstanding_items].sort(
      (a: any, b: any) => (b?.business_days_stale ?? 0) - (a?.business_days_stale ?? 0),
    );
    for (const it of sorted.slice(0, 8)) {
      const bd = it?.business_days_stale ?? 0;
      bodyLines.push(`• ${it?.description ?? 'Outstanding item'} — waiting ${bd} BD`);
    }
    if (sorted.length > 8) bodyLines.push(`…and ${sorted.length - 8} more`);
    bodyLines.push('');
    bodyLines.push('Let me know if anything is blocked on your side — happy to jump on a quick call.');
  } else if (isClientFollowup && recipients.length > 0) {
    bodyLines.push(
      `Hi ${recipients[0].name?.split(' ')[0] || 'there'} — following up on my note from last week on ${dealName}.`,
    );
    bodyLines.push('');
    bodyLines.push('Wanted to make sure it did not slip — let me know if you need anything more from my end to move it forward.');
  } else {
    bodyLines.push(item.description || 'Draft opens in the composer after approve.');
  }

  return (
    <div className="rounded-md border border-primary/25 bg-primary/[0.04] p-2.5 space-y-2 text-[11px]">
      <div className="flex items-center gap-1.5 text-primary">
        <Mail className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wider font-semibold">
          Reminder email preview
        </span>
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] border-amber-500/40 text-amber-400 ml-auto"
        >
          Draft only — opens in composer on approve
        </Badge>
      </div>

      {/* Recipients */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="text-[10px] uppercase tracking-wider">
            Recipient{recipients.length === 1 ? '' : 's'} ({recipients.length})
          </span>
        </div>
        <ul className="pl-4 space-y-0.5">
          {recipients.map((r, i) => (
            <li key={i} className="text-foreground">
              <span className="font-medium">{r.name}</span>
              {r.email && (
                <span className="text-muted-foreground"> &lt;{r.email}&gt;</span>
              )}
              {r.note && (
                <span className="text-muted-foreground italic"> — {r.note}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Draft body */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="text-[10px] uppercase tracking-wider">Draft</span>
        </div>
        <div className="rounded border border-white/10 bg-background/60 p-2 space-y-1">
          <div className="text-[10px] text-muted-foreground">
            Subject: <span className="text-foreground font-medium">{subject}</span>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[11px] text-foreground/90 leading-relaxed border-t border-white/10 pt-1.5">
{bodyLines.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default ClientReminderPreview;