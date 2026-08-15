import { useState } from 'react';
import { DealStatus, STATUS_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { CircleDashed } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOptionalRequestStatusChange } from '@/components/deal/StatusChangeGate';

// Low-saturation status treatment: a subtle tinted wash + a matching
// hairline border and a readable, high-contrast label. Never a bright
// solid pill — colour carries meaning, not emphasis.
//   green = on track · red = off track · amber = at risk / attention
//   slate = on hold / archived (neutral, non-alarming states)
const STATUS_TAG_THEME: Record<DealStatus, string> = {
  'on-track': '!bg-emerald-400/10 !text-emerald-200 border !border-emerald-300/25',
  'at-risk': '!bg-amber-400/10 !text-amber-200 border !border-amber-300/25',
  'off-track': '!bg-red-400/10 !text-red-200 border !border-red-300/25',
  'on-hold': '!bg-slate-300/[0.07] !text-slate-200 border !border-slate-300/20',
  'archived': '!bg-slate-300/[0.05] !text-slate-300 border !border-slate-300/15',
};

const STATUS_DOT: Record<DealStatus, string> = {
  'on-track': 'bg-emerald-400',
  'at-risk': 'bg-amber-400',
  'off-track': 'bg-red-400',
  'on-hold': 'bg-slate-400',
  'archived': 'bg-slate-500',
};

interface InlineStatusDropdownProps {
  dealId: string;
  status: DealStatus | null;
  /**
   * Optional. Status changes are routed through the global
   * StatusChangeGate (which requires a fresh status note before saving),
   * so this callback is no longer required and is kept only for
   * backwards compatibility with existing call sites.
   */
  onStatusChange?: (dealId: string, newStatus: DealStatus | null) => void;
  className?: string;
}

export function InlineStatusDropdown({ dealId, status, onStatusChange, className = '' }: InlineStatusDropdownProps) {
  const requestStatusChange = useOptionalRequestStatusChange();
  const [open, setOpen] = useState(false);
  const statusConfig = status ? STATUS_CONFIG[status] : null;

  const handlePick = (next: DealStatus | null) => {
    // Close the status menu immediately so the "Add a status note"
    // dialog (opened by the gate) is the only surface visible after
    // selection — never overlapping/layered behind the dropdown.
    setOpen(false);
    if (next === status) return;
    if (!requestStatusChange) return;
    // Gate enforces the new-note requirement and writes status+notes
    // together in a single update. We ignore onStatusChange so external
    // call paths can't bypass the gate.
    void requestStatusChange({ dealId, currentStatus: status, nextStatus: next });
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // No provider available: render a read-only badge so the page still
  // loads instead of crashing with a missing-context error.
  if (!requestStatusChange) {
    return statusConfig ? (
      <Badge
        variant="secondary"
        className={`${STATUS_TAG_THEME[status as DealStatus] ?? ''} gap-1.5 text-xs rounded-lg font-semibold ${className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status as DealStatus] ?? ''}`} />
        {statusConfig.label}
      </Badge>
    ) : (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border border-white/15 bg-white/10 text-foreground/80 dark:!text-[#c3c4d0] ${className}`}
      >
        <CircleDashed className="h-3 w-3" />
        No status
      </span>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleTriggerClick}
          onPointerDown={(e) => e.stopPropagation()}
          className="focus:outline-none"
        >
          {statusConfig ? (
            <Badge
              variant="secondary"
              className={`${STATUS_TAG_THEME[status as DealStatus] ?? ''} gap-1.5 text-xs rounded-lg font-semibold cursor-pointer hover:opacity-80 transition-opacity ${className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status as DealStatus] ?? ''}`} />
              {statusConfig.label}
            </Badge>
          ) : (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border border-white/15 bg-white/10 text-foreground/80 dark:!text-[#c3c4d0] cursor-pointer hover:bg-white/15 transition-colors ${className}`}
            >
              <CircleDashed className="h-3 w-3" />
              No status
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
        className="max-h-[300px] overflow-y-auto"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          key="__no_status__"
          onClick={(e) => {
            e.stopPropagation();
            handlePick(null);
          }}
          className={`flex items-center gap-2 ${status === null ? 'bg-muted' : ''}`}
        >
          <CircleDashed className="h-2.5 w-2.5 text-muted-foreground" />
          No status
        </DropdownMenuItem>
        {Object.entries(STATUS_CONFIG).map(([key, { label, dotColor }]) => (
          <DropdownMenuItem
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              handlePick(key as DealStatus);
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
