import { useCallback, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Layers, LayoutGrid, List, Kanban, ChartGantt, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { SortField, SortDirection } from '@/hooks/useDeals';

type ViewMode = 'grid' | 'list' | 'pipeline' | 'timeline';
type SubmenuId = 'layout' | 'sort' | 'group' | null;

interface Props {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  setSortField: (v: SortField) => void;
  setSortDirection: (v: SortDirection) => void;
  toggleSort: (v: SortField) => void;
  groupBy: string | null;
  setGroupBy: (v: string | null) => void;
  toggleGroup: (v: string) => void;
  timelineEnabled: boolean;
}

export function DealsViewMenu({
  viewMode, setViewMode,
  sortField, sortDirection, setSortField, setSortDirection, toggleSort,
  groupBy, setGroupBy, toggleGroup,
  timelineEnabled,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuId>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Single source of truth: any interaction (hover/click/keyboard) sets openSubmenu.
  const focusSubmenu = useCallback((id: Exclude<SubmenuId, null>) => {
    clearCloseTimer();
    setOpenSubmenu(prev => (prev === id ? prev : id));
  }, []);

  const scheduleClose = useCallback((id: Exclude<SubmenuId, null>) => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setOpenSubmenu(prev => (prev === id ? null : prev));
    }, 120);
  }, []);

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      clearCloseTimer();
      setOpenSubmenu(null);
    }
  };

  const sortOptions: Array<{ value: SortField; label: string }> = [
    { value: 'updatedAt', label: 'Last Updated' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'value', label: 'Deal Value' },
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'stage', label: 'Stage' },
  ];
  const groupOptions: Array<{ value: string; label: string }> = [
    { value: 'status', label: 'Status' },
    { value: 'stage', label: 'Stage' },
    { value: 'engagementType', label: 'Engagement Type' },
    { value: 'manager', label: 'Manager' },
    { value: 'lender', label: 'Lender' },
    { value: 'referredBy', label: 'Referred By' },
  ];
  const layoutOptions: Array<{ value: ViewMode; label: string; icon: JSX.Element }> = [
    { value: 'grid', label: 'Grid', icon: <LayoutGrid className="h-4 w-4 opacity-70" /> },
    { value: 'list', label: 'List', icon: <List className="h-4 w-4 opacity-70" /> },
    { value: 'pipeline', label: 'Pipeline', icon: <Kanban className="h-4 w-4 opacity-70" /> },
    ...(timelineEnabled ? [{ value: 'timeline' as const, label: 'Timeline', icon: <ChartGantt className="h-4 w-4 opacity-70" /> }] : []),
  ];

  const viewIcon =
    viewMode === 'grid' ? <LayoutGrid className="h-4 w-4" /> :
    viewMode === 'list' ? <List className="h-4 w-4" /> :
    viewMode === 'pipeline' ? <Kanban className="h-4 w-4" /> :
    <ChartGantt className="h-4 w-4" />;

  const activeLayoutLabel = layoutOptions.find(o => o.value === viewMode)?.label;
  const activeSortLabel = sortOptions.find(o => o.value === sortField)?.label;
  const activeGroupLabel = groupBy ? (groupOptions.find(o => o.value === groupBy)?.label ?? 'None') : 'None';
  const isDefaultSort = sortField === 'updatedAt' && sortDirection === 'desc';

  const renderSub = (
    id: Exclude<SubmenuId, null>,
    trigger: JSX.Element,
    content: JSX.Element,
    contentClass = 'w-48',
  ) => (
    <DropdownMenuSub
      open={openSubmenu === id}
      onOpenChange={(open) => {
        clearCloseTimer();
        setOpenSubmenu(prev => (open ? id : (prev === id ? null : prev)));
      }}
    >
      <DropdownMenuSubTrigger
        className="flex items-center justify-between"
        onPointerEnter={() => focusSubmenu(id)}
        onPointerLeave={() => scheduleClose(id)}
        onFocus={() => focusSubmenu(id)}
        onClick={() => focusSubmenu(id)}
      >
        {trigger}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className={contentClass}
        collisionPadding={8}
        onPointerEnter={clearCloseTimer}
        onPointerLeave={() => scheduleClose(id)}
      >
        {content}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9 px-2.5 shrink-0 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
              aria-label="View options"
            >
              {viewIcon}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Layout, sort & group</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        {renderSub('layout',
          <>
            <span className="inline-flex items-center gap-2">
              {viewIcon}
              <span>Layout</span>
            </span>
            {activeLayoutLabel && (
              <span className="ml-2 text-xs text-muted-foreground">{activeLayoutLabel}</span>
            )}
          </>,
          <>
            {layoutOptions.map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setViewMode(opt.value)}
                className={cn(viewMode === opt.value && 'bg-accent')}
              >
                {opt.icon}
                <span className="ml-2">{opt.label}</span>
              </DropdownMenuItem>
            ))}
          </>,
        )}
        {renderSub('sort',
          <>
            <span className="inline-flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 opacity-70" />
              <span>Sort</span>
            </span>
            {activeSortLabel && (
              <span className="ml-2 text-xs text-muted-foreground">
                {activeSortLabel} {sortDirection === 'desc' ? '↓' : '↑'}
              </span>
            )}
          </>,
          <>
            {!isDefaultSort && (
              <>
                <DropdownMenuItem
                  onClick={() => { setSortField('updatedAt'); setSortDirection('desc'); }}
                >
                  <RotateCcw className="h-3.5 w-3.5 opacity-70" />
                  <span className="ml-2">Reset to default</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {sortOptions.map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => toggleSort(opt.value)}
                className={cn('justify-between', sortField === opt.value && 'bg-accent')}
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                  {opt.label}
                </span>
                {sortField === opt.value && (
                  <span className="text-xs text-muted-foreground">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                )}
              </DropdownMenuItem>
            ))}
          </>,
          'w-56',
        )}
        {viewMode === 'grid' && renderSub('group',
          <>
            <span className="inline-flex items-center gap-2">
              <Layers className="h-4 w-4 opacity-70" />
              <span>Group by</span>
            </span>
            <span className="ml-2 text-xs text-muted-foreground">{activeGroupLabel}</span>
          </>,
          <>
            <DropdownMenuItem
              onClick={() => setGroupBy(null)}
              className={cn(!groupBy && 'bg-accent')}
            >
              <span>None</span>
            </DropdownMenuItem>
            {groupOptions.map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => toggleGroup(opt.value)}
                className={cn(groupBy === opt.value && 'bg-accent')}
              >
                <Layers className="h-3.5 w-3.5 opacity-70" />
                <span className="ml-2">{opt.label}</span>
              </DropdownMenuItem>
            ))}
          </>,
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}