import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, Clock, AlertTriangle, CheckCircle2, Flag, UserPlus, Flame, Thermometer, Snowflake, Pencil, Bell, Check } from 'lucide-react';
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

interface DealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
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

export function DealCard({ deal, onStatusChange, onMarkReviewed, onToggleFlag, flexEngagement, flexNotificationCount = 0, compact = false, hideStatus = false, onStageChange, mentionUsers = [], children }: DealCardProps) {
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  const [activeFlagCount, setActiveFlagCount] = useState(deal.isFlagged ? 1 : 0);
  // Show the corner indicator if either source of truth says flagged:
  // the legacy `deals.is_flagged` boolean OR an active row in `deal_flag_notes`.
  const showFlagIndicator = activeFlagCount > 0 || !!deal.isFlagged;
  const displayFlagCount = Math.max(activeFlagCount, deal.isFlagged ? 1 : 0);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [isEditDrawerMounted, setIsEditDrawerMounted] = useState(false);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState('');
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
    setStatusText(deal.notes || '');
    setIsEditingStatus(true);
  };

  const handleStatusSave = async () => {
    setIsEditingStatus(false);
    const isEmpty = !statusText.trim() || statusText === '<p></p>';
    const newNotes = isEmpty ? '' : statusText;
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
  
  const statusConfig = STATUS_CONFIG[deal.status] || { label: deal.status, dotColor: 'bg-muted', badgeColor: 'bg-muted' };
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

  const timeAgoData = getTimeAgoData(deal.updatedAt);

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
  const __isOverlayRoute = __location.pathname === '/deals' || __location.pathname.startsWith('/naitive-pipeline');
  const __handleCardClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isEditingStatus) { e.preventDefault(); return; }
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
    <Link to={`/deal/${deal.id}`} className="block w-full min-w-0 h-full" onClick={__handleCardClick}>
      <Card
        className={`deal-glass group relative cursor-pointer h-full flex flex-col transition-all duration-200 hover:-translate-y-0.5 min-w-0 max-w-full ${timeAgoData.isStale ? 'ring-2 ring-warning/50' : ''}`}>

        {/*
          Flagged-for-discussion indicator — small red flag pinned to the
          top-LEFT corner so it never collides with the notification badge
          that lives at top-right. Always rendered when the deal is
          flagged, in both grid and list views (and in pipeline views,
          where onToggleFlag isn't passed). The dialog is self-contained
          via useFlagNotes(dealId), so it works without a parent handler.
          Color matches the toolbar's flag filter (red-400).
        */}
        {showFlagIndicator && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Flagged for discussion"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsFlagDialogOpen(true);
                  }}
                  className="absolute -top-1.5 -left-1.5 z-30 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-500/95 text-white ring-[3px] ring-background shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_3px_10px_rgba(239,68,68,0.55)] hover:bg-red-500 transition-colors"
                  style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                >
                  <Flag className="h-3 w-3 fill-current" />
                  {displayFlagCount > 1 && (
                    <span className="absolute -bottom-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-background text-red-400 text-[9px] font-bold flex items-center justify-center ring-1 ring-red-500/50 tabular-nums">
                      {displayFlagCount > 9 ? '9+' : displayFlagCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Flagged for discussion — click to view / unflag</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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

        {/*
          Notification indicator — single overlay anchored to the top-right
          corner of the tile. Pure absolute overlay (outside content flow)
          so its presence/absence cannot shift the title's top inset or any
          other in-card content. Renders as a small solid dot when there is
          no count, or a compact red pill with the count when > 1. Includes
          a 2px ring in the page background so it pops cleanly off the tile,
          and a soft red glow for visibility on dark surfaces.
        */}
        {notificationCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {notificationCount > 1 ? (
                  <div
                    aria-label={`${notificationCount} notifications`}
                    className="absolute -top-1.5 -right-1.5 z-30 flex h-[27px] min-w-[27px] items-center justify-center rounded-full bg-destructive px-1.5 text-[15px] font-semibold leading-none text-destructive-foreground tabular-nums ring-[3px] ring-background shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_3px_12px_hsl(var(--destructive)/0.55)]"
                    style={{
                      // Snap to the device pixel grid + isolate into its own
                      // compositor layer so the circle stays crisp at any DPR
                      // (no half-pixel blur from inherited transforms/filters).
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </div>
                ) : (
                  <div
                    aria-label="1 notification"
                    className="absolute -top-1.5 -right-1.5 z-30 h-[18px] w-[18px] rounded-full bg-destructive ring-[3px] ring-background shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_3px_12px_hsl(var(--destructive)/0.55)]"
                    style={{
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden',
                    }}
                  />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{notificationCount} item{notificationCount !== 1 ? 's' : ''} need attention</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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
        <div className="px-6 pt-5 pb-6 flex flex-col flex-1 gap-3.5">

          {/* ── TOP ROW: Name + Value (left) | Status + Stage pills (right) ── */}
          <div className="flex items-start justify-between gap-4 min-w-0">
            {/* Left: Name + Value — anchored to top of the card body */}
            <div className="flex-1 min-w-0 self-start">
              {/* Title sub-row — FIXED 24px height, items-start pins the
                  text glyphs to the top so the h3 baseline is identical
                  on every tile (EverFi reference). */}
              <div className="flex items-start gap-2 min-w-0 h-6">
                <h3 className="text-lg font-bold leading-6 truncate flex-1 min-w-0" style={{ color: '#f1f6fc' }}>{deal.company}</h3>
                {/* Action buttons inline with name */}
                {onToggleFlag && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 shrink-0 relative ${showFlagIndicator ? 'text-destructive' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsFlagDialogOpen(true);
                      }}
                    >
                      <Flag className={`h-3.5 w-3.5 ${showFlagIndicator ? 'fill-current' : ''}`} />
                      {displayFlagCount > 1 && (
                        <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                          {displayFlagCount}
                        </span>
                      )}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsEditDrawerMounted(true);
                    setIsEditDrawerOpen(true);
                  }}
                >
                  <Search className="h-3.5 w-3.5" />
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
              {/* Currency value — fixed mt and leading so it sits the same
                  exact distance below the title on every tile. */}
              <p
                className="text-xl font-semibold tracking-tight tabular-nums leading-7 mt-1"
                style={{ color: '#f1f6fc' }}
              >
                {formatCurrencyValue(deal.value)}
              </p>
            </div>

            {/* Right: Status + Stage pills */}
            {!hideStatus && (
            <div className="flex flex-col items-end gap-1.5 shrink-0 self-start">
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
                  onStageChange={onStageChange || ((id, newStage) => updateDeal(id, { stage: newStage }))}
                />
              )}
            </div>
            )}
          </div>

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

          {/* ── MIDDLE: Notes snippet ── */}
          {!compact && (
            <div className="flex-1">
              {isEditingStatus ? (
                <div className="min-h-[2.5rem]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseDown={(e) => e.stopPropagation()}>
                  <MentionTextarea
                    value={statusText}
                    onChange={(html) => setStatusText(html)}
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
                <div className="relative group/status">
                  <HoverCard openDelay={300}>
                    <HoverCardTrigger asChild>
                      <p className="text-sm leading-relaxed line-clamp-2 cursor-pointer pr-6" style={{ color: 'rgba(210, 225, 245, 0.82)' }}>
                        {notesPlainText}
                      </p>
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
                    className="absolute top-0 right-0 p-1 rounded-md opacity-0 group-hover/status:opacity-100 transition-opacity hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="relative group/status">
                  <p className="text-sm leading-relaxed line-clamp-2 italic pr-6" style={{ color: 'rgba(180, 205, 235, 0.60)' }}>
                    No Status
                  </p>
                  <button
                    onClick={handleStatusEdit}
                    className="absolute top-0 right-0 p-1 rounded-md opacity-0 group-hover/status:opacity-100 transition-opacity hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── DIVIDER ── */}
          {!compact && <Separator className="opacity-30" />}

          {/* ── ROW: Manager (left) | Time ago (right) ── */}
          {!compact && (
            <div className="flex items-center justify-between gap-4 min-w-0">
              <div className="flex items-center gap-1.5 text-sm" style={{ color: 'rgba(195, 215, 240, 0.78)' }}>
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{deal.manager || 'No manager'}</span>
              </div>
              <div className={`flex items-center gap-1.5 text-xs shrink-0 ${timeAgoData.highlightClass}`} style={timeAgoData.highlightClass ? undefined : { color: 'rgba(195, 215, 240, 0.75)' }}>
                <Clock className="h-3 w-3" />
                <span>{timeAgoData.text}</span>
              </div>
            </div>
          )}

          {/* ── ROW: Engagement + Deal Type pills ── */}
          {!compact && (
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <span className="text-xs font-medium" style={{ color: 'rgba(205, 222, 245, 0.82)' }}>
                {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
              </span>
              {deal.exclusivity && EXCLUSIVITY_CONFIG[deal.exclusivity] && (
                <Badge variant="outline" className="text-xs rounded-lg bg-primary/10 text-primary border-primary/20">
                  {EXCLUSIVITY_CONFIG[deal.exclusivity].label}
                </Badge>
              )}
              {dealTypeLabels.map((label, index) => (
                <span key={index} className="text-xs font-medium" style={{ color: 'rgba(205, 222, 245, 0.82)' }}>
                  {label}
                </span>
              ))}
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
