import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, User, Building2 } from 'lucide-react';
import type { ChannelEntry } from '@/hooks/useChannelEntries';

interface Props {
  entry: ChannelEntry;
  onClick: () => void;
  onEntityClick?: (type: 'company' | 'contact') => void;
}

export function ChannelCard({ entry, onClick, onEntityClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const companyName = entry.crm_company?.name;
  const contactName = entry.contact?.full_name;
  const contactTitle = entry.contact?.job_title;
  const email = entry.contact?.email || entry.crm_company?.main_contact_email;
  const phone = entry.contact?.phone_work || entry.contact?.phone_mobile || entry.crm_company?.phone;

  const entityLabel = entry.contact_id && entry.crm_company_id
    ? 'Both'
    : entry.contact_id
      ? 'Contact'
      : 'Company';

  const primaryName = companyName || contactName || 'Unnamed Channel';
  const secondaryLine = companyName && contactName
    ? `${contactName}${contactTitle ? ' · ' + contactTitle : ''}`
    : !companyName && contactName && contactTitle
      ? contactTitle
      : null;

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!pointerDownPos.current) { onClick(); return; }
    const dx = Math.abs(e.clientX - pointerDownPos.current.x);
    const dy = Math.abs(e.clientY - pointerDownPos.current.y);
    if (dx < 5 && dy < 5) onClick();
    pointerDownPos.current = null;
  };

  const handleEntityNameClick = (e: React.MouseEvent, type: 'company' | 'contact') => {
    e.stopPropagation();
    onEntityClick?.(type);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="group bg-slate-800 border border-slate-600 rounded-md p-3 cursor-grab hover:border-slate-500 transition-colors touch-none"
    >
      {/* Row 1: Primary name + drag handle */}
      <div className="flex items-start justify-between">
        {companyName && onEntityClick ? (
          <span
            className="font-medium text-sm text-primary truncate cursor-pointer hover:underline"
            onClick={(e) => handleEntityNameClick(e, 'company')}
          >
            {companyName}
          </span>
        ) : (
          <span className="font-medium text-sm text-white truncate">{primaryName}</span>
        )}
        <GripVertical data-drag-handle className="h-4 w-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      {/* Row 2: Secondary line (contact name / title) */}
      <p className="text-xs text-slate-400 mt-0.5 truncate">
        {secondaryLine || (email || phone || entry.crm_company?.industry || entityLabel)}
      </p>

      {/* Row 3: Contact detail + entity badge */}
      <div className="flex items-center justify-between gap-1.5 mt-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          {contactName ? (
            onEntityClick ? (
              <span
                className="text-xs font-medium truncate cursor-pointer hover:underline"
                style={{ color: 'hsl(var(--primary))' }}
                onClick={(e) => handleEntityNameClick(e, 'contact')}
              >
                {contactName}
              </span>
            ) : (
              <span className="text-xs font-medium truncate" style={{ color: 'hsl(var(--primary))' }}>
                {contactName}
              </span>
            )
          ) : (
            <span className="text-xs text-slate-500">No contact</span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 bg-slate-700 rounded px-1.5 py-0.5 shrink-0 uppercase tracking-wider">
          {entityLabel}
        </span>
      </div>

      {/* Row 4: Notes preview (compact) */}
      {entry.notes && (
        <p className="text-xs text-slate-500 mt-1.5 truncate">{entry.notes}</p>
      )}
    </div>
  );
}
