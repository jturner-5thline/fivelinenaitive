import { useCallback, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Layers, GitBranch, Plus, Bookmark, Rows3, LayoutGrid, List, Kanban, ChartGantt, RotateCcw, Flag, CopyCheck, Check } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { PIPELINE_SORT_LABELS, PipelineSortMode, usePipelineSortMode } from '@/hooks/usePipelineSortMode';
import { toast } from 'sonner';
import type { SortField, SortDirection } from '@/hooks/useDeals';

type ViewMode = 'grid' | 'list' | 'pipeline' | 'timeline';
type SubmenuId = 'pipeline' | 'layout' | 'sort' | 'stageSort' | 'group' | null;

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
  flaggedOnly?: boolean;
  onFlaggedOnlyChange?: (v: boolean) => void;
  duplicatesEnabled?: boolean;
  showDuplicates?: boolean;
  onShowDuplicatesChange?: (v: boolean) => void;
  duplicateCount?: number;
  onOpenSavedViews?: () => void;
  savedViewsCount?: number;
}

export function DealsViewMenu({
  viewMode, setViewMode,
  sortField, sortDirection, setSortField, setSortDirection, toggleSort,
  groupBy, setGroupBy, toggleGroup,
  timelineEnabled,
  flaggedOnly = false,
  onFlaggedOnlyChange,
  duplicatesEnabled = false,
  showDuplicates = false,
  onShowDuplicatesChange,
  duplicateCount = 0,
  onOpenSavedViews,
  savedViewsCount = 0,
}: Props) {
  const { pipelines, activePipelineId, activePipeline, setActivePipelineId, createPipeline } = usePipelineContext();
  const { stages: currentStages } = useDealStages();
  const { sortMode, setSortMode } = usePipelineSortMode();
  const [createOpen, setCreateOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0] || null;
  const otherPipelines = pipelines.filter(p => p !== defaultPipeline && p.name !== 'naitive Pipeline' && p.name !== 'FinServ Pipeline');
  const activePipelineLabel = activePipeline?.name || 'Active Pipeline';
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
              className="gap-1.5 h-9 px-3 shrink-0 transition-colors duration-200"
              aria-label="View options"
            >
              {viewIcon}
              <span>View</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Pipeline, layout, sort, group & saved views</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60">
        {pipelines.length > 0 && renderSub('pipeline',
          <>
            <span className="inline-flex items-center gap-2">
              <GitBranch className="h-4 w-4 opacity-70" />
              <span>Pipeline</span>
            </span>
            <span className="ml-2 max-w-[110px] truncate text-xs text-muted-foreground">{activePipelineLabel}</span>
          </>,
          <>
            {defaultPipeline && (
              <DropdownMenuItem onClick={() => setActivePipelineId(defaultPipeline.id)} className={cn(activePipelineId === defaultPipeline.id && 'bg-accent')}>
                <span className="truncate">{defaultPipeline.name || 'Active Pipeline'}</span>
                <span className="ml-auto text-xs text-muted-foreground">Default</span>
              </DropdownMenuItem>
            )}
            {otherPipelines.map(p => (
              <DropdownMenuItem key={p.id} onClick={() => setActivePipelineId(p.id)} className={cn(activePipelineId === p.id && 'bg-accent')}>
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setNewPipelineName(''); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New pipeline
            </DropdownMenuItem>
          </>,
          'w-56',
        )}
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
        {viewMode === 'pipeline' && renderSub('stageSort',
          <>
            <span className="inline-flex items-center gap-2">
              <Rows3 className="h-4 w-4 opacity-70" />
              <span>Sort within stage</span>
            </span>
          </>,
          <>
            {(Object.keys(PIPELINE_SORT_LABELS) as PipelineSortMode[]).map(mode => (
              <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)} className="gap-2">
                <Check className={cn('h-3.5 w-3.5', sortMode === mode ? 'opacity-100' : 'opacity-0')} />
                {PIPELINE_SORT_LABELS[mode]}
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
        {onOpenSavedViews && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenSavedViews()} className="justify-between">
              <span className="inline-flex items-center gap-2">
                <Bookmark className="h-4 w-4 opacity-70" />
                <span>Saved views</span>
              </span>
              {savedViewsCount > 0 && <span className="text-xs text-muted-foreground">{savedViewsCount}</span>}
            </DropdownMenuItem>
          </>
        )}
        {(onFlaggedOnlyChange || (duplicatesEnabled && onShowDuplicatesChange)) && <DropdownMenuSeparator />}
        {onFlaggedOnlyChange && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onFlaggedOnlyChange(!flaggedOnly); }}
            className={cn('justify-between', flaggedOnly && 'bg-accent')}
          >
            <span className="inline-flex items-center gap-2">
              <Flag className="h-4 w-4 opacity-70" />
              <span>Flagged deals only</span>
            </span>
            {flaggedOnly && <Check className="h-3.5 w-3.5 opacity-80" />}
          </DropdownMenuItem>
        )}
        {duplicatesEnabled && onShowDuplicatesChange && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onShowDuplicatesChange(!showDuplicates); }}
            className={cn('justify-between', showDuplicates && 'bg-accent')}
          >
            <span className="inline-flex items-center gap-2">
              <CopyCheck className="h-4 w-4 opacity-70" />
              <span>Find duplicates</span>
            </span>
            <span className="inline-flex items-center gap-2">
              {showDuplicates && duplicateCount > 0 && (
                <span className="text-xs text-muted-foreground">{duplicateCount}</span>
              )}
              {showDuplicates && <Check className="h-3.5 w-3.5 opacity-80" />}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Create Pipeline</DialogTitle>
            <DialogDescription>The pipeline will use your current deal stages. You can customize them later in settings.</DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const name = newPipelineName.trim();
            if (!name) return;
            setIsCreating(true);
            const pipeline = await createPipeline(name, currentStages, pipelines.length === 0);
            setIsCreating(false);
            if (pipeline) {
              toast.success(`Pipeline "${name}" created`);
              setActivePipelineId(pipeline.id);
              setCreateOpen(false);
            }
          }}>
            <div className="py-4">
              <Input placeholder="Pipeline name" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" variant="gradient" disabled={isCreating || !newPipelineName.trim()}>
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}