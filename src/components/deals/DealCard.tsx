import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Search, User, Clock, AlertTriangle, CheckCircle2, Flag, UserPlus, Flame, Thermometer, Snowflake, Pencil, Bell, Check, MoreVertical } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG } from '@/types/deal';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { InlineStatusDropdown } from './InlineStatusDropdown';
import { InlineStageDropdown } from './InlineStageDropdown';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { TeamMember } from '@/hooks/useTeamMembers';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import { FlagNoteDialog } from './FlagNoteDialog';
import { DealEditDrawer } from './DealEditDrawer';
import { CreateTaskForMentionDialog, extractMentionsFromHtml, MentionedUser } from './CreateTaskForMentionDialog';
import { stripHtml } from '@/lib/stripHtml';
import { preloadDealDetail } from '@/lib/lazyDealDetail';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Separator } from '@/components/ui/separator';
import { shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';

interface DealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: DealFlexEngagement;
  flexNotificationCount?: number;
  compact?: boolean;
  hideStatus?: boolean;
  onStageChange?: (dealId: string, newStage: string) => void;
  mentionUsers?: TeamMember[];
  children?: React.ReactNode;
}

function DealCardImpl({ deal, onStatusChange, onMarkReviewed, onToggleFlag, flexEngagement, flexNotificationCount = 0, compact = false, hideStatus = false, onStageChange, mentionUsers = [], children }: DealCardProps) {
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  // `null` = real count not yet loaded from `deal_flag_notes`. While null we
  // fall back to the legacy `deal.isFlagged` boolean as a seed so flagged
  // deals don't flicker. Once the dialog hook resolves, the active-notes
  // count becomes the SOLE source of truth — resolved/dismissed flags must
  // not leave the tile showing flagged.
  const [activeFlagCount, setActiveFlagCount] = useState<number | null>(null);
  // Self-heal stale legacy `deals.is_flagged=true` rows that have zero
  // active flag notes (e.g. flags were resolved before the boolean sync
  // existed). One-shot per card mount.
  useEffect(() => {
    if (activeFlagCount === 0 && deal.isFlagged) {
      updateDeal(deal.id, { isFlagged: false }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFlagCount]);
  const effectiveFlagCount = activeFlagCount ?? (deal.isFlagged ? 1 : 0);
  const showFlagIndicator = effectiveFlagCount > 0;
  const displayFlagCount = effectiveFlagCount;
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [isEditDrawerMounted, setIsEditDrawerMounted] = useState(false);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState('');
  const statusTextRef = useRef('');
  const [mentionTaskUsers, setMentionTaskUsers] = useState<MentionedUser[]>([]);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const statusInputRef = useRef<HTMLTextAreaElement>(null);
  const { formatCurrencyValue, preferences } = usePreferences();
  const { updateDeal } = useDealsContext();
  const { dealTypes } = useDealTypes();
  const { getStageConfigForDeal } = usePipelineStageConfig();

  useEffect(() => {
    if (isEditingStatus && statusInputRef.current) {
      statusInputRef.current.focus();
      statusInputRef.current.select();
    }
  }, [isEditingStatus]);

  const handleStatusEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const initial = deal.notes || '';
    setStatusText(initial);
    statusTextRef.current = initial;
    setIsEditingStatus(true);
  };

  const handleStatusSave = async () => {
    setIsEditingStatus(false);
    const latest = statusTextRef.current;
    const isEmpty = !latest.trim() || latest === '<p></p>';
    const newNotes = isEmpty ? '' : latest;
    if (newNotes !== (deal.notes || '')) {
      await updateDeal(deal.id, { notes: newNotes || null });
      const oldMentions = extractMentionsFromHtml(deal.notes || '');
      const newMentions = extractMentionsFromHtml(newNotes);
      const oldIds = new Set(oldMentions.map(m => m.id));
      const freshMentions = newMentions.filter(m => !oldIds.has(m.id));
      if (freshMentions.length > 0) {
        setMentionTaskUsers(freshMentions);
        setIsTaskDialogOpen(true);
      }
    }
  };

  const handleStatusKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStatusSave();
    } else if (e.key === 'Escape') {
      setIsEditingStatus(false);
    }
  };
  
  const statusConfig = STATUS_CONFIG[deal.status as DealStatus] || { label: deal.status, dotColor: 'bg-muted', badgeColor: 'bg-muted' };
  const stageConfig = getStageConfigForDeal(deal.stage, deal.pipelineId);

  const getDealTypeLabels = () => {
    if (!deal.dealTypes || deal.dealTypes.length === 0) return [];
    return deal.dealTypes
      .map(id => dealTypes.find(dt => dt.id === id)?.label)
      .filter(Boolean);
  };

  const dealTypeLabels = getDealTypeLabels();

  const getTimeAgoData = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    const weeks = differenceInWeeks(now, date);
    
    let text: string;
    let highlightClass = '';
    const isStale = days >= preferences.staleDealsDays && deal.status !== 'archived';
    const isCritical = days >= 30;
    
    if (minutes < 60) {
      text = `${minutes} Min. Ago`;
    } else if (hours < 24) {
      text = `${hours} Hours Ago`;
    } else if (days < 7) {
      text = `${days} Days Ago`;
      if (isStale) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded text-warning';
      }
    } else if (days <= 30) {
      text = `${weeks} Weeks Ago`;
      if (isStale) {
        highlightClass = isCritical ? 'bg-destructive/20 px-1.5 py-0.5 rounded text-destructive' : 'bg-warning/20 px-1.5 py-0.5 rounded text-warning';
      }
    } else {
      text = 'Over 30 Days';
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded text-destructive';
    }
    
    return { text, highlightClass, isStale, days };
  };

  // Use the status-note timestamp so the tile's "X Min. Ago" reflects when
  // the note text was last edited, not the deal's generic updated_at (which
  // bumps on every field change — status, stage, lenders, etc.). Falls back
  // to updated_at only for legacy deals that never had a note edited.
  const timeAgoSource = deal.notesUpdatedAt || deal.updatedAt;
  const timeAgoData = getTimeAgoData(timeAgoSource);

  const isClosedOrArchived = deal.status === 'archived' || deal.stage === 'closed-lost';

  const notificationCount = useMemo(() => {
    if (isClosedOrArchived) return 0;

    let count = flexNotificationCount;

    if (isPostSubmissionDealStage(deal.stage)) {
      deal.lenders?.forEach(lender => {
        if (lender.trackingStatus === 'active' && lender.updatedAt) {
          const days = differenceInDays(new Date(), new Date(lender.updatedAt));
          if (days >= preferences.staleDealsDays) count++;
        }
      });
    }

    deal.milestones?.forEach(m => {
      if (!m.completed && m.dueDate && new Date(m.dueDate) < new Date()) count++;
    });

    return count;
  }, [deal.lenders, deal.milestones, deal.stage, preferences.staleDealsDays, flexNotificationCount, isClosedOrArchived]);

  const notesPlainText = useMemo(() => {
    if (!deal.notes || deal.notes === '<p></p>') return '';
    return stripHtml(deal.notes);
  }, [deal.notes]);

  const __location = useLocation();
  const [, __setSearchParams] = useSearchParams();
  const __isOverlayRoute =
    __location.pathname === '/deals' ||
    __location.pathname.startsWith('/naitive-pipeline') ||
    __location.pathname.startsWith('/finserv');
  const __handleCardClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isEditingStatus) { e.preventDefault(); return; }
    // The fullscreen Pipeline grid lives inside a Radix Dialog, which
    // normally triggers the overlay-origin suppression and swallows the
    // click. The dialog opts out via `data-pipeline-fullscreen` so deal
    // tiles in the expanded grid still open the deal overlay on top.
    const inPipelineFullscreen = !!(e.target as Element | null)?.closest?.(
      '[data-pipeline-fullscreen]',
    );
    if (!inPipelineFullscreen && shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Allow new-tab / open-in-new-window via modifier keys.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
    if (!__isOverlayRoute) return;
    e.preventDefault();
    const next = new URLSearchParams(window.location.search);
    next.set('deal', deal.id);
    __setSearchParams(next, { replace: false });
  };

  return (
    <>
    <Link
      to={`/deal/${deal.id}`}
      className="block w-full min-w-0 h-full"
      onClick={__handleCardClick}
      // Warm the DealDetail chunk on first hover so the click-to-open
      // latency drops by the chunk-parse cost. Idempotent — shared loader
      // dedupes across cards.
      onPointerEnter={preloadDealDetail}
    >
      <Card
        className="deal-glass deal-tile group relative cursor-pointer h-full flex flex-col transition-all duration-200 hover:-translate-y-0.5 min-w-0 max-w-full">

        {/*
          Flagged-for-discussion indicator — small red flag pinned to the
          top-LEFT corner so it never collides with the notification badge
          that lives at top-right. Always rendered when the deal is
          flagged, in both grid and list views (and in pipeline views,
          where onToggleFlag isn't passed). The dialog is self-contained
          via useFlagNotes(dealId), so it works without a parent handler.
          Color matches the toolbar's flag filter (red-400).
        */}
        {/* Corner flag indicator removed for cleaner tile design.
            Flagged state is preserved in data and remains accessible via
            the inline Flag action button in the card header. */}

        {/* Flag dialog — mounted whenever the card is, so the corner
            indicator can open it even if no onToggleFlag handler exists
            (e.g. in pipeline kanbans). */}
        <FlagNoteDialog
          dealId={deal.id}
          dealName={deal.company}
          isOpen={isFlagDialogOpen}
          onClose={() => setIsFlagDialogOpen(false)}
          onFlagCountChange={setActiveFlagCount}
        />

        {/* Notification indicator is now rendered inline in the header row
            (next to the menu button) to match the refreshed tile design. */}

        {/*
          Stale state is communicated via the card ring (warning) and the
          notification dot — the previous top-left AlertTriangle badge was
          removed per design to keep a single corner indicator.
        */}

        {/* Mark reviewed button */}
        {timeAgoData.isStale && onMarkReviewed && !compact && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 h-7 gap-1.5 bg-background shadow-md border-success/50 text-success hover:bg-success/10 hover:text-success opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMarkReviewed(deal.id);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Reviewed
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Update timestamp to mark as reviewed</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* ═══ CARD BODY ═══ */}
        {/*
          ALIGNMENT CONTRACT — every deal title MUST start at the exact same
          top inset and baseline as the EverFi tile, regardless of:
            • presence/absence of status+stage pills, FLEx badges, alert chips
            • whether the inline Flag/Search action buttons are visible
            • notification bell / stale icon overlays (absolute, not in flow)
            • currency value width or company name length

          Mechanism:
            1. Fixed `pt-5` top padding on the body.
            2. Title sub-row is a HARD fixed height (h-6) with items-start so
               the h3's first line is anchored to the top of the row — inline
               buttons (also h-6) cannot shift it.
            3. The whole TOP ROW uses items-start (not center) so the left
               column is top-aligned to the row regardless of right column.
            4. The right column is also self-start with a fixed visual height
               so a missing stage pill does not cause baseline drift.
        */}
        <div className="px-5 pt-4 pb-5 flex flex-col flex-1 gap-2">

          {/* ── ROW 1: Name | inline notification bell + menu ── */}
          <div className="flex items-start justify-between gap-2 min-w-0">
            <h3
              className="text-[20px] font-semibold leading-tight line-clamp-2 break-words min-w-0 flex-1"
              style={{ color: '#f8fbff' }}
              title={deal.company}
            >
              {deal.company}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {notificationCount > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        aria-label={`${notificationCount} notifications`}
                        className="flex h-6 items-center gap-1 rounded-full bg-destructive/15 px-2 text-[11px] font-semibold text-destructive border border-destructive/30"
                      >
                        <Bell className="h-3 w-3" />
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{notificationCount} item{notificationCount !== 1 ? 's' : ''} need attention</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onToggleFlag && showFlagIndicator && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 relative text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsFlagDialogOpen(true);
                  }}
                >
                  <Flag className="h-3.5 w-3.5 fill-current" />
                  {displayFlagCount > 1 && (
                    <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                      {displayFlagCount}
                    </span>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-60 hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEditDrawerMounted(true);
                  setIsEditDrawerOpen(true);
                }}
                aria-label="More options"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
              {isEditDrawerMounted && (
                <DealEditDrawer
                  deal={deal}
                  isOpen={isEditDrawerOpen}
                  onClose={() => {
                    setIsEditDrawerOpen(false);
                    setTimeout(() => setIsEditDrawerMounted(false), 350);
                  }}
                  onStatusChange={onStatusChange}
                />
              )}
            </div>
          </div>

          {/* ── ROW 2: amount | type/engagement tags ── */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-w-0">
            <span
              className="flex items-baseline gap-1 text-[28px] font-bold leading-none tracking-tight tabular-nums whitespace-nowrap"
              style={{ color: '#f8fbff' }}
              title={formatUSDFromDollars(deal.dealClass === 'finserv' ? (deal.mrr ?? 0) : deal.value)}
            >
              {formatUSDFromDollars(deal.dealClass === 'finserv' ? (deal.mrr ?? 0) : deal.value)}
              {deal.dealClass === 'finserv' && (
                <span className="text-[13px] font-medium" style={{ color: 'rgba(180, 198, 224, 0.75)' }}>
                  /mo
                </span>
              )}
            </span>
            {!compact && (deal.engagementType || deal.exclusivity || dealTypeLabels.length > 0) && (
              <div className="flex items-center justify-end gap-1.5 flex-wrap min-w-0">
                {deal.engagementType && ENGAGEMENT_TYPE_CONFIG[deal.engagementType] && (
                  <Badge variant="outline" className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-white/[0.03] border-white/10" style={{ color: 'rgba(222, 234, 250, 0.92)' }}>
                    {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
                  </Badge>
                )}
                {deal.exclusivity && EXCLUSIVITY_CONFIG[deal.exclusivity] && (
                  <Badge variant="outline" className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-primary/10 text-primary border-primary/25">
                    {EXCLUSIVITY_CONFIG[deal.exclusivity].label}
                  </Badge>
                )}
                {dealTypeLabels.map((label, index) => (
                  <Badge key={index} variant="outline" className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-white/[0.03] border-white/10" style={{ color: 'rgba(222, 234, 250, 0.92)' }}>
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* ── ROW 3: Status pill + Stage pill (inline pills row) ── */}
          {!hideStatus && (
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <InlineStatusDropdown
                dealId={deal.id}
                status={deal.status}
                onStatusChange={onStatusChange}
              />
              {!compact && (
                <InlineStageDropdown
                  dealId={deal.id}
                  stage={deal.stage}
                  pipelineId={deal.pipelineId}
                  dealName={deal.company}
                  onStageChange={onStageChange || ((id, newStage) => updateDeal(id, { stage: newStage }))}
                />
              )}
              {timeAgoData.isStale && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-warning/15 text-warning border-warning/40 gap-1"
                      >
                        <Flag className="h-3 w-3" />
                        Stale
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>No update in {timeAgoData.days} days</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}


          {/* Migrated + FLEx badges row */}
          {(deal.migratedFromPersonal || (flexEngagement && flexEngagement.level !== "none")) && (
            <div className="flex items-center gap-2 flex-wrap">
              {deal.migratedFromPersonal && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs rounded-lg bg-accent/50 text-accent-foreground border-accent gap-1">
                        <UserPlus className="h-3 w-3" />
                        Migrated
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent><p>This deal was migrated from a personal account</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {flexEngagement && flexEngagement.level !== "none" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`text-xs rounded-lg gap-1 ${
                          flexEngagement.level === "hot" 
                            ? "bg-red-500/10 text-red-600 border-red-500/20" 
                            : flexEngagement.level === "warm"
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        }`}
                      >
                        {flexEngagement.level === "hot" ? <Flame className="h-3 w-3" /> : flexEngagement.level === "warm" ? <Thermometer className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}
                        {flexEngagement.lenderCount} FLEx
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium capitalize">{flexEngagement.level} Lender Interest</p>
                        <p className="text-muted-foreground">{flexEngagement.lenderCount} lender{flexEngagement.lenderCount !== 1 ? 's' : ''} engaged</p>
                        {flexEngagement.hasTermSheetRequest && <p className="text-green-500 mt-1">✓ Term sheet requested</p>}
                        {flexEngagement.hasNdaRequest && <p className="text-green-500">✓ NDA requested</p>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}

          {/* ── MIDDLE: Notes snippet (inset panel with leading dot) ── */}
          {!compact && (
            <div className="flex-1">
              {isEditingStatus ? (
                <div className="min-h-[2.5rem]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseDown={(e) => e.stopPropagation()}>
                  <MentionTextarea
                    value={statusText}
                    onChange={(html) => { statusTextRef.current = html; setStatusText(html); }}
                    onBlur={() => {}}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleStatusSave();
                      } else if (e.key === 'Escape') {
                        setIsEditingStatus(false);
                      }
                    }}
                    placeholder="Add a status note..."
                    mentionUsers={mentionUsers}
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStatusSave(); }}
                    >
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditingStatus(false); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : notesPlainText ? (
                <div className="relative group/status rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-3 min-h-[5.5rem]">
                  <HoverCard openDelay={300}>
                    <HoverCardTrigger asChild>
                      <div className="cursor-pointer pr-6">
                        {(() => {
                          const lines = notesPlainText.split('\n').filter(l => l.trim());
                          const headline = lines[0] || notesPlainText;
                          const rest = lines.slice(1).join(' ').trim();
                          return (
                            <>
                              <p className="text-[14px] font-semibold leading-snug line-clamp-2 text-left" style={{ color: '#ffffff' }}>
                                {headline}
                              </p>
                              {rest && (
                                <p className="text-[13px] leading-snug mt-1 line-clamp-3 text-left" style={{ color: '#ffffff' }}>
                                  {rest}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 max-h-60 overflow-y-auto" align="start">
                      <div
                        className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_.mention]:text-primary [&_.mention]:font-medium"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(deal.notes!, { ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'span'], ALLOWED_ATTR: ['class', 'data-type', 'data-id', 'data-label'] }) }}
                      />
                    </HoverCardContent>
                  </HoverCard>
                  <button
                    onClick={handleStatusEdit}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover/status:opacity-100 transition-opacity hover:bg-white/10"
                  >
                    <Pencil className="h-3 w-3" style={{ color: 'rgba(200, 215, 238, 0.7)' }} />
                  </button>
                </div>
              ) : (
                <div className="relative group/status rounded-lg bg-white/[0.02] border border-dashed border-white/[0.08] px-3 py-3 min-h-[5.5rem]">
                  <p className="text-[12px] leading-snug italic pr-6" style={{ color: 'rgba(200, 215, 238, 0.65)' }}>
                    No status update yet
                  </p>
                  <button
                    onClick={handleStatusEdit}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover/status:opacity-100 transition-opacity hover:bg-white/10"
                  >
                    <Pencil className="h-3 w-3" style={{ color: 'rgba(200, 215, 238, 0.7)' }} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── DIVIDER ── */}
          {!compact && <Separator className="opacity-30" />}

          {/* ── FOOTER: Avatar + manager | Time ago ── */}
          {!compact && (
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold shrink-0"
                  style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#dde4ff', border: '1px solid rgba(255,255,255,0.08)' }}
                  aria-hidden
                >
                  {(deal.manager || 'NA').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'NA'}
                </div>
                <span className="truncate text-[12px] font-medium" style={{ color: 'rgba(220, 232, 250, 0.92)' }}>
                  {deal.manager || 'No manager'}
                </span>
              </div>
              <div className={`flex items-center gap-1 text-[11px] shrink-0 ${timeAgoData.highlightClass}`} style={timeAgoData.highlightClass ? undefined : { color: 'rgba(190, 206, 232, 0.78)' }}>
                <Clock className="h-3 w-3" />
                <span>{timeAgoData.text}</span>
              </div>
            </div>
          )}
        {children}
        </div>
      </Card>
    </Link>
    <CreateTaskForMentionDialog
      open={isTaskDialogOpen}
      onOpenChange={setIsTaskDialogOpen}
      mentionedUsers={mentionTaskUsers}
      dealId={deal.id}
    />
    </>
  );
}

/**
 * Memoized export. Skips re-render when sibling cards or unrelated parent
 * state changes; only re-renders when this deal's reference, its FLEx data,
 * or one of the small visual flags actually change. Callback prop identity
 * is intentionally excluded so parents don't have to wrap handlers in
 * useCallback to benefit.
 */
export const DealCard = memo(DealCardImpl, (prev, next) => {
  return (
    prev.deal === next.deal &&
    prev.flexEngagement === next.flexEngagement &&
    prev.flexNotificationCount === next.flexNotificationCount &&
    prev.compact === next.compact &&
    prev.hideStatus === next.hideStatus &&
    prev.mentionUsers === next.mentionUsers &&
    prev.children === next.children
  );
});
