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

// Brighter gradient tone treatment so list tags read clearly against the
// dark glass table fill (the flat 15% translucency looked near-black).
// Glassy bordered treatment: opaque colored border + translucent gradient
// fill + bright legible label (matches the stage tag / "+ New Deal" button).
const STATUS_TAG_THEME: Record<DealStatus, string> = {
  'on-track': '!bg-gradient-to-br !from-teal-400/25 !to-emerald-400/15 !text-teal-50 border !border-teal-300/95 backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]',
  'at-risk': '!bg-gradient-to-br !from-yellow-400/25 !to-amber-400/15 !text-yellow-50 border !border-yellow-300/95 backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]',
  'off-track': '!bg-gradient-to-br !from-red-500/25 !to-rose-400/15 !text-red-50 border !border-red-300/95 backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]',
  'on-hold': '!bg-gradient-to-br !from-blue-500/25 !to-sky-400/15 !text-blue-50 border !border-blue-300/95 backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]',
  'archived': '!bg-gradient-to-br !from-orange-500/25 !to-amber-500/15 !text-orange-50 border !border-orange-300/95 backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]',
};

const STATUS_DOT: Record<DealStatus, string> = {
  'on-track': 'bg-teal-300',
  'at-risk': 'bg-yellow-400',
  'off-track': 'bg-red-400',
  'on-hold': 'bg-blue-400',
  'archived': 'bg-orange-400',
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
