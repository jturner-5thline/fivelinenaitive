import { DealStatus, STATUS_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface InlineStatusDropdownProps {
  dealId: string;
  status: DealStatus;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  className?: string;
}

export function InlineStatusDropdown({ dealId, status, onStatusChange, className = '' }: InlineStatusDropdownProps) {
  const statusConfig = STATUS_CONFIG[status] || { label: status, dotColor: 'bg-muted', badgeColor: 'bg-muted' };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Badge
          variant="outline"
          className={`${statusConfig.badgeColor} border-0 text-xs rounded-lg font-semibold cursor-pointer hover:opacity-80 transition-opacity ${className}`}
        >
          {statusConfig.label}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {Object.entries(STATUS_CONFIG).map(([key, { label, dotColor }]) => (
          <DropdownMenuItem
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStatusChange(dealId, key as DealStatus);
            }}
            className={`flex items-center gap-2 ${status === key ? 'bg-muted' : ''}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
