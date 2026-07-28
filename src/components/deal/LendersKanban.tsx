import { useState, useMemo, useCallback } from 'react';
import { Clock, MessageSquare, Search, RefreshCw, Settings2, ListChecks, CheckSquare, Briefcase, User, AlertTriangle } from 'lucide-react';
import { LenderFlagIndicator } from '@/components/lenders/LenderNotesPopover';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { DealLender } from '@/types/deal';
import { OutstandingItem } from '@/hooks/useOutstandingItems';
import { StageGroup, PassReasonOption, TrackingStatusOption } from '@/contexts/LenderStagesContext';
import { getScoreStyles, type LenderScoreConfig, DEFAULT_SCORE_LEVELS } from '@/hooks/useLenderScoreConfig';
import { cn } from '@/lib/utils';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SaveIndicator } from '@/components/ui/save-indicator';
import { CreateLenderTaskButton } from '@/components/deal/CreateLenderTaskButton';
import { LenderFollowUpPopover } from '@/components/deal/LenderFollowUpPopover';
import { LogLenderActivityPopover } from '@/components/deal/LogLenderActivityPopover';
import { getLenderStatusTheme } from '@/components/deal/lenderStatusTheme';
import { LenderRowBoundary } from '@/components/deal/LenderRowBoundary';
import { bucketLender, isExcludedFromClientReport } from '@/lib/lenderStatusBuckets';

// Map lender to the same bucket label used on the Funding Sources snapshot
// (On Deck / In Review / Terms Issued / Passed / On Hold) so cards show the
// stage bucket, not the internal milestone (e.g. "Reviewing DRL").
function bucketDisplayLabel(
  lender: DealLender,
  configuredStages: { id: string; label: string; group: StageGroup }[],
): string {
  if (isExcludedFromClientReport(lender, configuredStages)) return 'On Hold';
  const b = bucketLender(lender, configuredStages);
  switch (b) {
    case 'onDeck': return 'On Deck';
    case 'inReview': return 'In Review';
    case 'termsIssued': return 'Terms Issued';
    case 'passed': return 'Passed';
    default: return 'On Deck';
  }
}


interface LenderMetrics {
  activeDealCount: number;
  outstandingItemsCount: number;
  openTasksCount: number;
  contactName?: string;
  notesOutSince?: string;
}

interface LendersKanbanProps {
  lenders: DealLender[];
  dealId?: string;
  dealName?: string;
  dealCompany?: string;
  configuredStages: { id: string; label: string; group: StageGroup; description?: string }[];
  stageGroups: { id: StageGroup; label: string; color: string }[];
  passReasons: PassReasonOption[];
  onUpdateLenderGroup: (lenderId: string, newGroup: StageGroup, passReason?: string) => void;
  /** Move a lender to a specific stage (preferred by the kanban). */
  onUpdateLenderStage?: (lenderId: string, newStageId: string, passReason?: string) => void;
  onEditPassReasons?: (lenderId: string) => void;
  isSaving?: (id: string) => boolean;
  failedSaves?: Set<string>;
  onRetry?: (lenderId: string) => void;
  /** Metrics per funding source, keyed by lender name (lowercase) */
  lenderMetrics?: Record<string, LenderMetrics>;
  /** Callback when a funding source card is clicked for detail view */
  onCardClick?: (lender: DealLender) => void;
  showScore?: boolean;
  scoreConfig?: LenderScoreConfig;
  /** Optional callback after a follow-up email is sent. */
  onFollowUpSent?: () => void;
}

// Helper to get relative time string
const getRelativeTime = (updatedAt?: string) => {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);
  const weeks = differenceInWeeks(now, date);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${weeks}w ago`;
};

// Enriched Draggable Lender Tile
function DraggableLenderTile({
  lender,
  dealId,
  dealName,
  dealCompany,
  configuredStages,
  isSaving,
  hasFailed,
  onRetry,
  onEditPassReasons,
  metrics,
  onClick,
  showScore,
  scoreConfig,
  onFollowUpSent,
}: {
  lender: DealLender;
  dealId?: string;
  dealName?: string;
  dealCompany?: string;
  configuredStages: { id: string; label: string; group: StageGroup }[];
  isSaving?: boolean;
  hasFailed?: boolean;
  onRetry?: () => void;
  onEditPassReasons?: () => void;
  metrics?: LenderMetrics;
  onClick?: () => void;
  showScore?: boolean;
  scoreConfig?: LenderScoreConfig;
  onFollowUpSent?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lender.id,
    data: { lender },
  });

  // Don't apply transform — the DragOverlay handles the moving copy
  const style: React.CSSProperties | undefined = isDragging ? {
    opacity: 0,
    pointerEvents: 'none',
  } : undefined;

  const displayName = (typeof lender?.name === 'string' && lender.name.trim()) || 'Unknown funding source';
  const stageConfig = lender?.stage ? configuredStages.find(s => s.id === lender.stage) : undefined;
  const stageLabel = bucketDisplayLabel(lender, configuredStages);
  const hideTime = stageConfig?.group === 'on-deck' || stageConfig?.group === 'passed' || lender?.trackingStatus === 'passed' || lender?.trackingStatus === 'on-deck';
  const timeAgo = hideTime ? '' : getRelativeTime(lender?.updatedAt);

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging
    if (!isDragging && onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-white/10 rounded-xl p-3.5 cursor-grab active:cursor-grabbing relative select-none overflow-hidden",
        "shadow-[0_6px_18px_-12px_rgba(0,0,0,0.6)]",
        !isDragging && "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7)]",
        isDragging && "opacity-40 scale-[1.03] shadow-2xl ring-2 ring-primary/40",
        hasFailed && "border-destructive/50 bg-destructive/5"
      )}
      onClick={handleClick}
      {...listeners}
      {...attributes}
    >
      {/* Save status indicator + task button */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
        {dealId && (
          <CreateLenderTaskButton
            dealId={dealId}
            lenderId={lender.id}
            lenderName={lender.name}
          />
        )}
        {dealId && (
          <LenderFollowUpPopover
            dealId={dealId}
            dealName={dealName || ''}
            company={dealCompany || ''}
            dealLenderId={lender.id}
            lenderName={lender.name}
            lenderStage={configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
            lenderNotes={lender.notes}
            lenderUpdatedAt={lender.updatedAt}
            onSent={onFollowUpSent}
          />
        )}
        {dealId && (
          <LogLenderActivityPopover
            dealId={dealId}
            dealLenderId={lender.id}
            lenderName={lender.name}
            currentNotes={lender.notes}
            onLogged={onFollowUpSent}
          />
        )}
        {isSaving && <SaveIndicator isSaving={true} size="sm" />}
        {hasFailed && !isSaving && onRetry && (
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            title="Retry save"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Lender name + contact */}
      <div className="pr-8 mb-2">
        <p className="text-sm font-semibold truncate flex items-center gap-1.5">
          {showScore !== false && lender.score != null && (() => {
            const sc = scoreConfig || { enabled: true, levels: DEFAULT_SCORE_LEVELS };
            const styles = getScoreStyles(lender.score, sc);
            return (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
                style={{ ...styles.bg, ...styles.text, ...styles.ring }}
              >
                {lender.score}
              </span>
            );
          })()}
          {displayName}
          <LenderFlagIndicator lenderName={displayName} />
        </p>
        {metrics?.contactName && (
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3 shrink-0" />
            {metrics.contactName}
          </p>
        )}
      </div>

      {/* Stage pill + time */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 transition-colors",
            getLenderStatusTheme(lender.trackingStatus).tag,
          )}
        >
          {stageLabel}
        </Badge>
        {timeAgo && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo}
          </span>
        )}
      </div>

      {/* Metrics row */}
      {metrics && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mb-2">
          {metrics.activeDealCount > 0 && (
            <span className="flex items-center gap-0.5" title="Active deals">
              <Briefcase className="h-2.5 w-2.5" />
              {metrics.activeDealCount} deal{metrics.activeDealCount !== 1 ? 's' : ''}
            </span>
          )}
          {metrics.outstandingItemsCount > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-400" title="Outstanding items">
              <ListChecks className="h-2.5 w-2.5" />
              {metrics.outstandingItemsCount} outstanding
            </span>
          )}
          {metrics.openTasksCount > 0 && (
            <span className="flex items-center gap-0.5" title="Open tasks">
              <CheckSquare className="h-2.5 w-2.5" />
              {metrics.openTasksCount} task{metrics.openTasksCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Notes out indicator */}
      {metrics?.notesOutSince && (
        <div className="flex items-center gap-1 text-[10px] text-amber-400 mb-2">
          <AlertTriangle className="h-2.5 w-2.5" />
          Notes out since {metrics.notesOutSince}
        </div>
      )}

      {/* Notes preview */}
      {lender.notes && (
        <div className="flex items-start gap-1 text-xs text-muted-foreground mt-1 min-w-0">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2 break-words min-w-0">{lender.notes}</span>
        </div>
      )}

      {/* Pass reasons */}
      {typeof lender?.passReason === 'string' && lender.passReason && (
        <div className="mt-2 flex flex-wrap gap-1 items-center overflow-hidden">
          {lender.passReason.split(', ').map((reason, idx) => (
            <span key={idx} className="text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded truncate max-w-full">
              {reason}
            </span>
          ))}
          {onEditPassReasons && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditPassReasons(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="Edit pass reasons"
            >
              <Settings2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {hasFailed && (
        <p className="text-xs text-destructive mt-2">Save failed — tap retry</p>
      )}
    </div>
  );
}

// Droppable Kanban Column with larger drop target
function DroppableColumn({
  column,
  dealId,
  dealName,
  dealCompany,
  lenders,
  configuredStages,
  isSaving,
  failedSaves,
  onRetry,
  onEditPassReasons,
  lenderMetrics,
  onCardClick,
  showScore,
  scoreConfig,
  onFollowUpSent,
}: {
  dealId?: string;
  dealName?: string;
  dealCompany?: string;
  column: { id: string; label: string; color: string };
  lenders: DealLender[];
  configuredStages: { id: string; label: string; group: StageGroup }[];
  isSaving?: (id: string) => boolean;
  failedSaves?: Set<string>;
  onRetry?: (lenderId: string) => void;
  onEditPassReasons?: (lenderId: string) => void;
  lenderMetrics?: Record<string, LenderMetrics>;
  onCardClick?: (lender: DealLender) => void;
  showScore?: boolean;
  scoreConfig?: LenderScoreConfig;
  onFollowUpSent?: () => void;
}) {
  const safeId = column?.id ?? '__missing__';
  const { setNodeRef, isOver } = useDroppable({ id: safeId });
  if (!column) return null;

  return (
    <div className="flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("w-3 h-3 rounded-full shrink-0", column.color)} />
        <h3 className="font-medium text-sm truncate">{column.label}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
          {lenders.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          ref={setNodeRef}
          className={cn(
            "bg-muted/20 rounded-lg p-2 min-h-[400px] space-y-2.5 transition-all duration-200",
            isOver && "bg-primary/10 ring-2 ring-primary/40 shadow-inner"
          )}
        >
          {lenders.length === 0 && (
            <div className={cn(
              "border-2 border-dashed rounded-lg py-8 text-center transition-colors",
              isOver ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
            )}>
              <p className="text-xs text-muted-foreground">
                Drop lenders here
              </p>
            </div>
          )}
          {lenders.map((lender, idx) => {
            // Defensive: a malformed record (null lender, missing name, missing id)
            // must not crash the section. Log and render an inline fallback.
            if (!lender || typeof lender !== 'object') {
              // eslint-disable-next-line no-console
              console.warn('[FundingSources] skipping non-object deal_lender at index', idx, lender);
              return (
                <div key={`malformed-${idx}`} className="bg-destructive/5 border border-destructive/40 rounded-xl p-3 text-xs text-destructive">
                  Malformed funding source record at position {idx + 1}.
                </div>
              );
            }
            const safeKey = lender.id || `lender-idx-${idx}`;
            const metricsKey = typeof lender.name === 'string'
              ? lender.name.toLowerCase().trim()
              : '';
            return (
              <LenderRowBoundary key={safeKey} lenderId={lender.id} lenderName={lender.name}>
                <DraggableLenderTile
                  lender={lender}
                  dealId={dealId}
                  dealName={dealName}
                  dealCompany={dealCompany}
                  configuredStages={configuredStages}
                  isSaving={lender.id ? isSaving?.(`lender-stage-${lender.id}`) : false}
                  hasFailed={lender.id ? failedSaves?.has(lender.id) : false}
                  onRetry={onRetry && lender.id ? () => onRetry(lender.id) : undefined}
                  onEditPassReasons={onEditPassReasons && lender.id ? () => onEditPassReasons(lender.id) : undefined}
                  metrics={metricsKey ? lenderMetrics?.[metricsKey] : undefined}
                  onClick={onCardClick ? () => onCardClick(lender) : undefined}
                  showScore={showScore}
                  scoreConfig={scoreConfig}
                  onFollowUpSent={onFollowUpSent}
                />
              </LenderRowBoundary>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LendersKanban({
  lenders,
  dealId,
  dealName,
  dealCompany,
  configuredStages,
  stageGroups,
  passReasons,
  onUpdateLenderGroup,
  onUpdateLenderStage,
  onEditPassReasons,
  isSaving,
  failedSaves,
  onRetry,
  lenderMetrics,
  onCardClick,
  showScore,
  scoreConfig,
  onFollowUpSent,
}: LendersKanbanProps) {
  const [activeLender, setActiveLender] = useState<DealLender | null>(null);
  const [passReasonDialogOpen, setPassReasonDialogOpen] = useState(false);
  const [pendingPassChange, setPendingPassChange] = useState<{ lenderId: string; stageId: string } | null>(null);
  const [selectedPassReasons, setSelectedPassReasons] = useState<string[]>([]);
  const [passReasonSearch, setPassReasonSearch] = useState('');

  const filteredPassReasons = useMemo(() => {
    if (!passReasonSearch.trim()) return passReasons;
    return passReasons.filter(reason =>
      reason.label.toLowerCase().includes(passReasonSearch.toLowerCase())
    );
  }, [passReasons, passReasonSearch]);

  // Reduced activation distance for smoother DnD
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const lender = lenders.find(l => l.id === event.active.id);
    if (lender) setActiveLender(lender);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLender(null);
    if (!over || active.id === over.id) return;

    const targetId = String(over.id);
    const lenderId = String(active.id);

    if (targetId === '__unassigned__') return;

    const targetStage = configuredStages.find(s => s.id === targetId);
    if (!targetStage) return;

    if (targetStage.group === 'passed') {
      setPendingPassChange({ lenderId, stageId: targetStage.id });
      setSelectedPassReasons([]);
      setPassReasonDialogOpen(true);
      return;
    }

    if (onUpdateLenderStage) {
      onUpdateLenderStage(lenderId, targetStage.id);
    } else {
      onUpdateLenderGroup(lenderId, targetStage.group);
    }
  };

  const handleConfirmPass = () => {
    if (pendingPassChange && selectedPassReasons.length > 0) {
      const reason = selectedPassReasons.join(', ');
      if (onUpdateLenderStage) {
        onUpdateLenderStage(pendingPassChange.lenderId, pendingPassChange.stageId, reason);
      } else {
        onUpdateLenderGroup(pendingPassChange.lenderId, 'passed', reason);
      }
      setPassReasonDialogOpen(false);
      setPendingPassChange(null);
      setSelectedPassReasons([]);
    }
  };

  const handleCancelPass = () => {
    setPassReasonDialogOpen(false);
    setPendingPassChange(null);
    setSelectedPassReasons([]);
    setPassReasonSearch('');
  };

  const togglePassReason = (reasonLabel: string) => {
    setSelectedPassReasons(prev => {
      if (prev.includes(reasonLabel)) return prev.filter(r => r !== reasonLabel);
      if (prev.length >= 3) return prev;
      return [...prev, reasonLabel];
    });
  };

  // Build columns from configured stages (one column per stage), preserving order.
  const stageColumns = useMemo(() => {
    const groupColorById = new Map((stageGroups || []).map(g => [g.id, g.color] as const));
    return (configuredStages || [])
      .filter((s): s is { id: string; label: string; group: StageGroup; description?: string } => !!s && !!s.id)
      .map(s => ({
        id: s.id,
        label: s.label || s.id,
        color: groupColorById.get(s.group as StageGroup) || 'bg-muted',
      }));
  }, [configuredStages, stageGroups]);

  const lendersByStage = useMemo(() => {
    const map = new Map<string, DealLender[]>();
    map.set('__unassigned__', []);
    stageColumns.forEach(c => map.set(c.id, []));
    const validIds = new Set(stageColumns.map(c => c.id));
    lenders.forEach(l => {
      const key = l?.stage && validIds.has(l.stage) ? l.stage : '__unassigned__';
      if (!l?.stage || !validIds.has(l.stage)) {
        if (l?.stage) {
          // eslint-disable-next-line no-console
          console.warn('[LendersKanban] deal_lender has unknown stage, routing to Unassigned', {
            lenderId: l?.id,
            stage: l?.stage,
          });
        }
      }
      const bucket = map.get(key);
      if (bucket) bucket.push(l);
    });
    return map;
  }, [lenders, stageColumns]);

  const hasUnassigned = (lendersByStage.get('__unassigned__')?.length ?? 0) > 0;
  const renderedColumns = hasUnassigned
    ? [{ id: '__unassigned__', label: 'Unassigned', color: 'bg-muted-foreground/40' }, ...stageColumns]
    : stageColumns;

  const overlayStageLabel = activeLender ? configuredStages.find(s => s.id === activeLender.stage)?.label || activeLender.stage : '';
  const overlayMetrics = activeLender ? lenderMetrics?.[activeLender.name.toLowerCase().trim()] : undefined;
  const pendingLenderName = pendingPassChange ? lenders.find(l => l.id === pendingPassChange.lenderId)?.name : '';

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`grid gap-4 overflow-x-auto py-2`} style={{ gridTemplateColumns: `repeat(${renderedColumns.length}, minmax(220px, 1fr))` }}>
          {renderedColumns.filter(Boolean).map((col) => (
            <DroppableColumn
              key={col.id}
              column={col}
              dealId={dealId}
              dealName={dealName}
              dealCompany={dealCompany}
              lenders={lendersByStage.get(col.id) || []}
              configuredStages={configuredStages}
              isSaving={isSaving}
              failedSaves={failedSaves}
              onRetry={onRetry}
              onEditPassReasons={onEditPassReasons}
              lenderMetrics={lenderMetrics}
              onCardClick={onCardClick}
              showScore={showScore}
              scoreConfig={scoreConfig}
              onFollowUpSent={onFollowUpSent}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}>
          {activeLender ? (
            <div className="bg-card border border-primary/40 rounded-lg p-3.5 shadow-2xl rotate-1 scale-105 w-[240px]">
              <p className="text-sm font-semibold mb-1 truncate">{activeLender.name}</p>
              {overlayMetrics?.contactName && (
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mb-1.5">
                  <User className="h-3 w-3" />
                  {overlayMetrics.contactName}
                </p>
              )}
              <Badge variant="secondary" className="text-[10px]">
                {overlayStageLabel}
              </Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Pass Reason Dialog */}
      <Dialog open={passReasonDialogOpen} onOpenChange={(open) => !open && handleCancelPass()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Pass Reasons for {pendingLenderName}</DialogTitle>
            <p className="text-sm text-muted-foreground">Select up to 3 reasons ({selectedPassReasons.length}/3)</p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pass reasons..."
                value={passReasonSearch}
                onChange={(e) => setPassReasonSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {filteredPassReasons.map((reason) => {
                const isSelected = selectedPassReasons.includes(reason.label);
                const isDisabled = !isSelected && selectedPassReasons.length >= 3;
                return (
                  <Button
                    key={reason.id}
                    variant={isSelected ? "default" : "outline"}
                    className="h-auto py-2 px-3 text-sm justify-start"
                    disabled={isDisabled}
                    onClick={() => togglePassReason(reason.label)}
                  >
                    {reason.label}
                  </Button>
                );
              })}
              {filteredPassReasons.length === 0 && (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">
                  No pass reasons match your search
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelPass}>Cancel</Button>
            <Button onClick={handleConfirmPass} disabled={selectedPassReasons.length === 0}>
              Confirm ({selectedPassReasons.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
