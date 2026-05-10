import { Briefcase, User, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Props {
  task: any;
  className?: string;
  size?: 'xs' | 'sm';
  /** Render greyed-out "Link Deal/Contact/Company" chips for missing associations. */
  showPlaceholders?: boolean;
}

/** Renders Deal / Contact / Company chips for a task, in that order. */
export function TaskAssociationChips({ task, className, size = 'xs', showPlaceholders = false }: Props) {
  const dealName = task?.deal_id ? (task.deal?.company || 'Deal') : null;
  const contactName = task?.contact_id ? (task.contact?.full_name || 'Contact') : null;
  const companyName = task?.crm_company_id ? (task.crm_company?.name || 'Company') : null;

  if (!dealName && !contactName && !companyName && !showPlaceholders) return null;

  const iconCls = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const textCls = size === 'xs' ? 'text-[10px]' : 'text-xs';

  const Chip = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-muted/30 hover:bg-muted/60 max-w-[140px]',
        textCls,
      )}
      title={label}
    >
      <Icon className={cn(iconCls, 'flex-shrink-0 text-muted-foreground')} />
      <span className="truncate">{label}</span>
    </Link>
  );

  const PlaceholderChip = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-dashed bg-muted/10 text-muted-foreground/70 max-w-[140px]',
        textCls,
      )}
      title={label}
    >
      <Icon className={cn(iconCls, 'flex-shrink-0 opacity-60')} />
      <span className="truncate">{label}</span>
    </span>
  );

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {dealName && <Chip to={`/deal/${task.deal_id}`} icon={Briefcase} label={dealName} />}
      {!dealName && showPlaceholders && <PlaceholderChip icon={Briefcase} label="Link Deal" />}
      {contactName && <Chip to={`/contacts/${task.contact_id}`} icon={User} label={contactName} />}
      {!contactName && showPlaceholders && <PlaceholderChip icon={User} label="Link Contact" />}
      {companyName && <Chip to={`/crm-companies/${task.crm_company_id}`} icon={Building2} label={companyName} />}
      {!companyName && showPlaceholders && <PlaceholderChip icon={Building2} label="Link Company" />}
    </div>
  );
}