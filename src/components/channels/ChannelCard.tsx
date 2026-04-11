import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Building2, User, Mail, Phone, StickyNote } from 'lucide-react';
import type { ChannelEntry } from '@/hooks/useChannelEntries';

interface Props {
  entry: ChannelEntry;
  onClick: () => void;
}

export function ChannelCard({ entry, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const companyName = entry.crm_company?.name;
  const contactName = entry.contact?.full_name;
  const contactTitle = entry.contact?.job_title;
  const email = entry.contact?.email || entry.crm_company?.main_contact_email;
  const phone = entry.contact?.phone_work || entry.contact?.phone_mobile || entry.crm_company?.phone;

  const entityBadge = entry.contact_id && entry.crm_company_id
    ? 'Both'
    : entry.contact_id
      ? 'Contact'
      : 'Company';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {companyName && (
            <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {companyName}
            </p>
          )}
          {contactName && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              {contactName}
              {contactTitle && <span className="text-muted-foreground/60">· {contactTitle}</span>}
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0 uppercase tracking-wider">
          {entityBadge}
        </Badge>
      </div>

      {(email || phone) && (
        <div className="space-y-0.5">
          {email && (
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Mail className="h-2.5 w-2.5 shrink-0" /> {email}
            </p>
          )}
          {phone && (
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Phone className="h-2.5 w-2.5 shrink-0" /> {phone}
            </p>
          )}
        </div>
      )}

      {entry.notes && (
        <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-1">
          <StickyNote className="h-2.5 w-2.5 shrink-0" /> {entry.notes}
        </p>
      )}
    </div>
  );
}
