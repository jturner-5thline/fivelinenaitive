import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, User, FileText, Clock, Undo2, Building2, Plus, X, ChevronDown, ChevronUp, ChevronRight, Paperclip, File, Trash2, Upload, Download, Save, MessageSquare, Maximize2, Minimize2, History, LayoutGrid, AlertCircle, Search, Loader2, Flag, Archive, RotateCcw, Check, UserPlus, ArrowRight, CheckCircle, Send, FileSignature, Megaphone, Mail, Settings2, Folder, Pencil, ArrowDownUp, Filter, TrendingUp, CalendarIcon, GitBranch, ListChecks, Video, Activity } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { BetaBadge } from '@/components/ui/beta-badge';
import { HubSpotDealBadge } from '@/components/integrations/hubspot/HubSpotDealBadge';
import { LenderFlagIndicator, LenderNotesPopover } from '@/components/lenders/LenderNotesPopover';
import { LenderCommsTimeline } from '@/components/lenders/LenderCommsTimeline';
import { LenderHistoryHint } from '@/components/deal/LenderHistoryHint';
import { LenderNotesField } from '@/components/deal/LenderNotesField';
import { LenderHistoryDrawer } from '@/components/deal/LenderHistoryDrawer';
import { useLenderHistoryWarnings } from '@/hooks/useLenderHistoryWarning';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import {
  loadPersistedDealOrigin,
  persistDealOrigin,
  clearPersistedDealOrigin,
  pushPendingReopen,
  type DealOrigin,
  type DealOriginLocationState,
  type DealOriginReturnState,
} from '@/lib/dealOriginContext';
import { INDUSTRY_OPTIONS } from '@/constants/industries';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverEvent, pointerWithin, rectIntersection } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableLenderItem } from '@/components/deal/SortableLenderItem';
import { DealMilestones } from '@/components/deals/DealMilestones';
import { NaitiveStageMilestonesSection } from '@/components/naitive-pipeline/NaitiveStageMilestonesSection';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, format } from 'date-fns';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { FlagNoteDialog } from '@/components/deals/FlagNoteDialog';
import { useDealAttachments, DealAttachmentCategory, DEAL_ATTACHMENT_CATEGORIES, UploadProgress } from '@/hooks/useDealAttachments';
import { UploadProgressOverlay } from '@/components/deal/UploadProgressOverlay';
import { useDealMilestones } from '@/hooks/useDealMilestones';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { PipelineSpecificFields } from '@/components/deal/PipelineSpecificFields';
import { Checkbox } from '@/components/ui/checkbox';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRecordDealOpened } from '@/hooks/useRecentDeals';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { Deal, DealStatus, DealStage, EngagementType, ExclusivityType, LenderStatus, LenderStage, LenderSubstage, LenderTrackingStatus, DealLender, DealMilestone, Referrer, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG } from '@/types/deal';
import { useLenders } from '@/contexts/LendersContext';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useLenderStages, StageGroup } from '@/contexts/LenderStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ActivityTimeline, ActivityItem, activityLogToItem } from '@/components/deals/ActivityTimeline';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useFlexActivityNotifications } from '@/hooks/useFlexActivityNotifications';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { RichTextInlineEdit } from '@/components/ui/rich-text-inline-edit';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { ReferralSourceInput } from '@/components/ui/referral-source-input';
import { CreateTaskForMentionDialog, extractMentionsFromHtml, MentionedUser } from '@/components/deals/CreateTaskForMentionDialog';
import { OutstandingItems } from '@/components/deal/OutstandingItems';
import { FlexInfoNotificationsPanel } from '@/components/deal/FlexInfoNotificationsPanel';
import { useFlexInfoNotifications } from '@/hooks/useFlexInfoNotifications';
import { useOutstandingItems, OutstandingItem } from '@/hooks/useOutstandingItems';
import { useLenderAttachmentsSummary } from '@/hooks/useLenderAttachmentsSummary';
import { LendersKanban } from '@/components/deal/LendersKanban';
import { LenderSuggestionsPanel } from '@/components/deal/LenderSuggestionsPanel';
import { useFeatureAccess, usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDemoCapabilities } from '@/hooks/useDemoCapabilities';
import { LenderSearchInput } from '@/components/deal/LenderSearchInput';
import { LenderDirectoryDialog } from '@/components/deal/LenderDirectoryDialog';
import { RequestedItemsSummary } from '@/components/deal/RequestedItemsSummary';
import { RequestedItemsPanel } from '@/components/deal/RequestedItemsPanel';
import { DealWriteUp, DealWriteUpData, DealDataForWriteUp, getEmptyDealWriteUpData } from '@/components/deal/DealWriteUp';
import { DealActivityTab } from '@/components/deal/DealActivityTab';
import { DealTasksPanel } from '@/components/deal/DealTasksPanel';
import { InfoRequestsPanel } from '@/components/deal/InfoRequestsPanel';
import { DealManagementTab } from '@/components/deal/DealManagementTab';
import { CreateTaskButton } from '@/components/deal/CreateTaskButton';
import { CreateLenderTaskButton } from '@/components/deal/CreateLenderTaskButton';
import { SortableAttachmentTile } from '@/components/deal/SortableAttachmentTile';
import { DroppableAttachmentFolder } from '@/components/deal/DroppableAttachmentFolder';
import { AttachmentDragOverlay } from '@/components/deal/AttachmentDragOverlay';

import { DataRoomBulkActions } from '@/components/deal/DataRoomBulkActions';
import { useDealWriteup } from '@/hooks/useDealWriteup';
import { useDealMatchingCriteria } from '@/hooks/useDealMatchingCriteria';
import { DealResearchPanel } from '@/components/deal/DealResearchPanel';
import { DealPulseDashboard } from '@/components/deal/DealPulseDashboard';
import { ProactiveAlertBar } from '@/components/deal/ProactiveAlertBar';
import { DealCommandPalette } from '@/components/deal/DealCommandPalette';
import { UnifiedTimeline } from '@/components/deal/UnifiedTimeline';
import { DealFlagLog } from '@/components/deal/DealFlagLog';
import { DealBenchmarkPanel } from '@/components/deal/DealBenchmarkPanel';
import { DealAssistantPanel } from '@/components/deal/DealAssistantPanel';
import { ActivitySummaryPanel } from '@/components/deal/ActivitySummaryPanel';
import { ContextualSuggestionsPanel } from '@/components/deal/ContextualSuggestionsPanel';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { FloatingDealAssistant } from '@/components/deals/FloatingDealAssistant';
import { DealDetailSideNavigation } from '@/components/deal/DealDetailSideNavigation';

import { DealSpaceTab } from '@/components/deal/DealSpaceTab';
import { DealPanelReorderDialog } from '@/components/deal/DealPanelReorderDialog';
import { DealMemoDialog } from '@/components/deal/DealMemoDialog';
import { AgreementDrafterDialog } from '@/components/agreement/AgreementDrafterDialog';
import { EmailPromptCenterButton } from '@/components/deal/EmailPromptCenter';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { DataRoomChecklistPanel } from '@/components/deal/DataRoomChecklistPanel';
import { DataRoomV2 } from '@/components/deal/DataRoomV2';
import { VdrShell } from '@/components/vdr/VdrShell';
import { DealActivityLogTab } from '@/components/deal/DealActivityLogTab';
import DealCrmSearch from '@/components/deals/DealCrmSearch';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';
import { ClaapRecordingsPanel } from '@/components/deal/ClaapRecordingsPanel';
import { ClaapMeetingsTab } from '@/components/deal/ClaapMeetingsTab';
import { ChecklistLinkDialog } from '@/components/deal/ChecklistLinkDialog';
import { DealUpdatesUnified } from '@/components/deal/DealUpdatesUnified';
import { useDataRoomChecklist, useDealChecklistStatus } from '@/hooks/useDataRoomChecklist';
import { useLenderScoreConfig, getScoreStyles } from '@/hooks/useLenderScoreConfig';
import { useDealChecklistItems } from '@/hooks/useDealChecklistItems';
import { useChecklistCategories } from '@/hooks/useChecklistCategories';

import { useDealClaapRecordings } from '@/hooks/useDealClaapRecordings';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useUserEditedFields } from '@/hooks/useUserEditedFields';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useSaveOperation } from '@/hooks/useSaveOperation';
import { useDealPanelOrder, DealPanelId } from '@/hooks/useDealPanelOrder';
import { useDealInfoFieldOrder, DealInfoFieldId, DEAL_INFO_FIELD_DEFINITIONS } from '@/hooks/useDealInfoFieldOrder';
import { SaveIndicator, GlobalSaveBar } from '@/components/ui/save-indicator';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { exportDealToCSV, exportDealToPDF, exportDealToWord, exportStatusReportToPDF, exportStatusReportToWord } from '@/utils/dealExport';
import type { StatusReportEditableContent } from '@/utils/dealExport';
import { StatusReportPreviewModal } from '@/components/deal/StatusReportPreviewModal';
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from '@/utils/currencyFormat';
import { useAdminRole } from '@/hooks/useAdminRole';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { Label } from '@/components/ui/label';
import { useLenderLabelResolver } from '@/hooks/useLenderLabelResolver';

// Editable deal tile for lender "About" tab - extracted to avoid hooks-in-map
function EditableLenderDealTile({ 
  dealInfo, 
  configuredStages, 
  updateLenderInDb,
  trackingStatusConfig,
}: { 
  dealInfo: { dealId: string; dealName: string; company: string; lenderInfo?: DealLender };
  configuredStages: { id: string; label: string; group: string }[];
  updateLenderInDb: (lenderId: string, updates: Partial<DealLender>) => Promise<void>;
  trackingStatusConfig: Record<string, { label: string; color: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editStage, setEditStage] = useState(dealInfo.lenderInfo?.stage || '');
  const [editNotes, setEditNotes] = useState(dealInfo.lenderInfo?.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!dealInfo.lenderInfo) return;
    setIsSaving(true);
    try {
      const updates: Partial<DealLender> = {};
      if (editStage !== dealInfo.lenderInfo.stage) {
        updates.stage = editStage as LenderStage;
        const newStageConfig = configuredStages.find(s => s.id === editStage);
        if (newStageConfig) {
          updates.trackingStatus = newStageConfig.group as LenderTrackingStatus;
        }
      }
      if (editNotes !== (dealInfo.lenderInfo.notes || '')) {
        updates.notes = editNotes;
      }
      if (Object.keys(updates).length > 0) {
        await updateLenderInDb(dealInfo.lenderInfo.id, updates);
        toast({ title: "Lender updated", description: "Changes saved successfully." });
      }
      setIsEditing(false);
    } catch {
      toast({ title: "Error", description: "Failed to update lender.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing && dealInfo.lenderInfo) {
    return (
      <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2 border border-primary/30" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium">{dealInfo.company}</p>
        <div>
          <Label className="text-xs text-muted-foreground">Stage</Label>
          <Select value={editStage} onValueChange={setEditStage}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
              {configuredStages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add notes..."
            rows={2}
            className="text-xs resize-none"
          />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
            setIsEditing(false);
            setEditStage(dealInfo.lenderInfo?.stage || '');
            setEditNotes(dealInfo.lenderInfo?.notes || '');
          }} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm group hover:bg-muted transition-colors">
      <div>
        <p className="font-medium">{dealInfo.company}</p>
        <p className="text-xs text-muted-foreground">{dealInfo.dealName}</p>
        {dealInfo.lenderInfo?.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dealInfo.lenderInfo.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {dealInfo.lenderInfo && (
          <>
            <Badge variant="outline" className="text-xs">
              {configuredStages.find(s => s.id === dealInfo.lenderInfo!.stage)?.label || dealInfo.lenderInfo.stage}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {trackingStatusConfig[dealInfo.lenderInfo.trackingStatus]?.label || dealInfo.lenderInfo.trackingStatus}
            </Badge>
            <button
              className="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              title="Edit stage & notes"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Helper to calculate business days between two dates
const getBusinessDaysDiff = (date: Date) => {
  const now = new Date();
  let count = 0;
  const current = new Date(date);
  
  while (current < now) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

// Helper to get relative time string and highlight class for lender
const getLenderTimeInfo = (updatedAt?: string) => {
  if (!updatedAt) return { text: '', highlightClass: '' };
  
  const date = new Date(updatedAt);
  const now = new Date();
  
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);
  const weeks = differenceInWeeks(now, date);
  const businessDays = getBusinessDaysDiff(date);
  
  let text: string;
  if (minutes < 60) {
    text = `${minutes} min. ago`;
  } else if (hours < 24) {
    text = `${hours} hr${hours > 1 ? 's' : ''} ago`;
  } else if (days < 7) {
    text = `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    text = `${weeks} wk${weeks > 1 ? 's' : ''} ago`;
  }
  
  // Note: highlight classes are applied; stage-gating happens at the call site via isLenderStale
  let highlightClass = '';
  if (businessDays >= 5) {
    highlightClass = 'bg-destructive/20 text-destructive px-1.5 py-0.5 rounded';
  } else if (businessDays > 3) {
    highlightClass = 'bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded';
  }
  
  return { text, highlightClass };
};

interface EditHistory {
  deal: Deal;
  field: string;
  timestamp: Date;
}

interface FlagNoteHistoryItem {
  id: string;
  note: string;
  created_at: string;
}

// Component to handle flag notes with local state to prevent freezing
function FlagNotesInput({ 
  value, 
  onSave, 
  onClose,
  history,
  onDeleteHistoryItem,
  onChangeValue,
}: { 
  value: string; 
  onSave: (value: string) => void; 
  onClose?: () => void;
  history: FlagNoteHistoryItem[];
  onDeleteHistoryItem: (id: string) => void;
  onChangeValue?: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [hasChanges, setHasChanges] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    setLocalValue(value);
    setHasChanges(false);
  }, [value]);

  // Auto-focus the textarea when mounted
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    onChangeValue?.(e.target.value);
    setHasChanges(e.target.value !== value);
  };

  const handleSave = () => {
    if (localValue !== value) {
      onSave(localValue);
      setHasChanges(false);
    }
    onClose?.();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm text-muted-foreground">Flag Notes</label>
      <Textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Why is this deal flagged for discussion?"
        className="min-h-[80px] resize-none"
        maxLength={500}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {localValue.length}/500 · Press Enter to save
        </p>
        <Button
          size="sm"
          onClick={handleSave}
          className="h-7 text-xs"
        >
          <Save className="h-3 w-3 mr-1" />
          Save
        </Button>
      </div>
      
      {history.length > 0 && (
        <div className="border-t border-border pt-2 mt-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3 w-3" />
            {showHistory ? 'Hide' : 'Show'} history ({history.length})
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2 max-h-[150px] overflow-y-auto">
              {history.map((item) => (
                <div key={item.id} className="text-xs p-2 bg-muted/50 rounded group relative">
                  <p className="text-muted-foreground pr-5 break-words">{item.note}</p>
                  <p className="text-muted-foreground/70 mt-1">
                    {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <button
                    onClick={() => onDeleteHistoryItem(item.id)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Smart back-navigation: resolve origin from location.state, falling
  //    back to sessionStorage so a hard refresh on /deal/:id keeps the
  //    "Back to {drilldown}" button intact.
  const dealOrigin: DealOrigin | null = useMemo(() => {
    const fromState = (location.state as DealOriginLocationState | null)?.dealOrigin;
    if (fromState) return fromState;
    if (id) return loadPersistedDealOrigin(id);
    return null;
  }, [location.state, id]);

  // Persist origin so refreshes don't lose it.
  useEffect(() => {
    if (!id || !dealOrigin) return;
    persistDealOrigin(id, dealOrigin);
  }, [id, dealOrigin]);

  const handleSmartBack = useCallback(() => {
    if (!dealOrigin) return;
    if (id) clearPersistedDealOrigin(id);
    if (dealOrigin.reopen) pushPendingReopen(dealOrigin.reopen);
    navigate(dealOrigin.returnTo, {
      state: { reopenDrilldown: dealOrigin.reopen } satisfies DealOriginReturnState,
    });
  }, [dealOrigin, id, navigate]);
  const { state: sidebarState, isHovering } = useSidebar();
  const isEffectivelyExpanded = sidebarState === 'expanded' || isHovering;
  const highlightStale = searchParams.get('highlight') === 'stale';
  const deleteAction = searchParams.get('action') === 'delete';
  const initialTab = searchParams.get('tab') as 'deal-info' | 'lenders' | 'deal-management' | 'deal-writeup' | 'data-room' | 'deal-space' | 'communication' | null;
  const { getLenderNames, getLenderDetails } = useLenders();
  const { lenders: masterLenders, loading: masterLendersLoading, loadingMore: masterLendersLoadingMore } = useMasterLenders({ eagerAll: true });
  const { stages: configuredStages, substages: configuredSubstages, passReasons, getTrackingStatusConfig, stageGroups } = useLenderStages();
  const { resolveLenderActivityLabel } = useLenderLabelResolver();
  const { dealTypes: availableDealTypes } = useDealTypes();
  const { stages: dealStages, getStageConfig } = useDealStages();
  const dynamicStageConfig = getStageConfig();
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const { pipelines } = usePipelineContext();
  const { hasAccess: hasLenderMatchingAccess } = useFeatureAccess('lender_matching');
  const { hasPageAccess } = usePageAccessFlags();
  const hasDealSpaceAccess = hasPageAccess('deal_space');
  const hasDealManagementAccess = hasPageAccess('deal_management');
  const { canPushFlex: demoCanPushFlex } = useDemoCapabilities();
  const canPushToFlex = hasPageAccess('flex_push') && demoCanPushFlex;
  const { formatCurrencyValue, preferences } = usePreferences();
  const { getDealById, updateDeal: updateDealInDb, addLenderToDeal, updateLender: updateLenderInDb, deleteLender: deleteLenderInDb, deleteLenderNoteHistory, deleteDeal, deals, isLoading: isDealsLoading, refreshDeals } = useDealsContext();
  const { activities: activityLogs, logActivity, isLoading: isLoadingActivities } = useActivityLog(id);
  
  // Real-time FLEx activity notifications
  useFlexActivityNotifications(id);
  const { actionRequiredCount: infoRequestActionCount, markAllAsRead: markInfoRequestsAsRead, pendingCount: infoRequestPendingCount } = useFlexInfoNotifications(id);
  const { statusNotes, addStatusNote, deleteStatusNote, isLoading: isLoadingStatusNotes } = useStatusNotes(id);
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  const [activeFlagCount, setActiveFlagCount] = useState(0);
  const { milestones: dbMilestones, addMilestone: addMilestoneToDb, updateMilestone: updateMilestoneInDb, deleteMilestone: deleteMilestoneFromDb, reorderMilestones, pendingClosingDateSync, dismissClosingDateSync } = useDealMilestones(id);
  const { user } = useAuth();
  const { company, members } = useCompany();
  const { features: companyFeatures } = useCompanyFeatures();
  const { scoreConfig } = useLenderScoreConfig();
  const teamMembers = useTeamMembers();
  const mentionUsers = useMemo(() => teamMembers, [teamMembers]);
  const [mentionTaskUsers, setMentionTaskUsers] = useState<MentionedUser[]>([]);
  const [mentionNoteContext, setMentionNoteContext] = useState('');
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [showStatusReportPreview, setShowStatusReportPreview] = useState(false);
  const { profile } = useProfile();
  const { isAdmin } = useAdminRole();
  const { getLenderSummary } = useLenderAttachmentsSummary();
  const { linkedRecordings: claapLinkedRecordings } = useDealClaapRecordings(id || '');
  const lenderNames = useMemo(() => {
    // Use master lenders database as primary source
    const masterLenderNames = masterLenders.map(l => l.name);
    // Fall back to static lender names if master lenders is empty
    const staticNames = getLenderNames();
    const names = masterLenderNames.length > 0 ? masterLenderNames : staticNames;
    // De-dupe to avoid React key collisions + confusing dropdown results
    return Array.from(new Set(names.filter((n) => typeof n === 'string' && n.trim().length > 0)));
  }, [masterLenders, getLenderNames]);
  
  // Get member options for manager/owner dropdowns - show all company team members
  const memberOptions = useMemo(() => {
    const options = members.map(member => {
      const label = member.display_name || member.email || 'Team Member';
      return {
        value: label,
        label: label,
      };
    });
    
    // If current user is not in the list, add them
    const currentUserLabel = profile?.display_name || user?.email || 'Me';
    if (user && !options.some(opt => opt.value === currentUserLabel)) {
      options.unshift({
        value: currentUserLabel,
        label: currentUserLabel,
      });
    }
    
    return options;
  }, [members, user, profile]);
  
  // Get deal from context
  const contextDeal = getDealById(id || '');
  const [deal, setDeal] = useState<Deal | undefined>(contextDeal);

  // Track that this user opened this deal so the Deals sidebar dropdown can
  // surface the 5 most recently opened deals (per user, most recent first).
  const recordDealOpened = useRecordDealOpened();
  useEffect(() => {
    if (id) recordDealOpened(id);
  }, [id, recordDealOpened]);

  const formatRenderedLenderStage = useCallback(
    (value: string | null | undefined) => resolveLenderActivityLabel(value, 'stage'),
    [resolveLenderActivityLabel],
  );
  const formatRenderedLenderMilestone = useCallback(
    (value: string | null | undefined) => resolveLenderActivityLabel(value, 'milestone'),
    [resolveLenderActivityLabel],
  );
  const [naitiveFallbackLoading, setNaitiveFallbackLoading] = useState(false);
  const { hasAccess: hasNaitivePipelineAccess } = useNaitivePipelineAccess();

  // Fallback: if deal not in DealsContext and user is 5th Line member, fetch directly
  useEffect(() => {
    if (contextDeal || !id || !hasNaitivePipelineAccess || isDealsLoading) return;
    // Don't re-fetch if we already have it
    if (deal) return;

    let cancelled = false;
    setNaitiveFallbackLoading(true);

    (async () => {
      try {
        const [dealRes, lendersRes] = await Promise.all([
          supabase.from('deals').select('*').eq('id', id).maybeSingle(),
          supabase.from('deal_lenders').select('*').eq('deal_id', id),
        ]);

        if (cancelled || !dealRes.data) {
          setNaitiveFallbackLoading(false);
          return;
        }

        const dbDeal = dealRes.data;
        const dbLenders = (lendersRes.data || []) as any[];
        const dealLenders: DealLender[] = dbLenders.map((l: any) => ({
          id: l.id,
          name: l.name,
          status: 'in-review' as const,
          stage: l.stage,
          substage: l.substage || undefined,
          trackingStatus: (l.tracking_status || 'active') as LenderTrackingStatus,
          notes: l.notes || undefined,
          passReason: l.pass_reason || undefined,
          score: l.score ?? null,
          updatedAt: l.updated_at,
          notesHistory: [],
        }));

        const toReferrer = (name: string | null): Referrer | undefined => {
          if (!name) return undefined;
          return { id: `ref-${name.toLowerCase().replace(/\s+/g, '-')}`, name };
        };

        const parseDealTypes = (dealType: string | null): string[] | undefined => {
          if (!dealType) return undefined;
          try {
            const parsed = JSON.parse(dealType);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch { return [dealType]; }
        };

        const mapped: Deal = {
          id: dbDeal.id,
          name: dbDeal.company,
          company: dbDeal.company,
          stage: dbDeal.stage as DealStage,
          status: dbDeal.status as DealStatus,
          engagementType: (dbDeal.engagement_type || 'guided') as EngagementType,
          exclusivity: (dbDeal.exclusivity || undefined) as ExclusivityType | undefined,
          dealTypes: parseDealTypes(dbDeal.deal_type),
          manager: dbDeal.manager || '',
          dealOwner: dbDeal.deal_owner || undefined,
          analyst: (dbDeal as any).analyst || undefined,
          isFlagged: dbDeal.is_flagged || false,
          flagNotes: dbDeal.flag_notes || undefined,
          referredBy: toReferrer(dbDeal.referred_by),
          lender: dealLenders[0]?.name || '',
          value: Number(dbDeal.value),
          totalFee: Number(dbDeal.total_fee || 0),
          retainerFee: Number(dbDeal.retainer_fee || 0),
          milestoneFee: Number(dbDeal.milestone_fee || 0),
          successFeePercent: Number(dbDeal.success_fee_percent || 0),
          preSigningHours: Number(dbDeal.pre_signing_hours || 0),
          postSigningHours: Number(dbDeal.post_signing_hours || 0),
          notes: dbDeal.notes || undefined,
          notesUpdatedAt: dbDeal.notes_updated_at || undefined,
          narrative: dbDeal.narrative || undefined,
          contact: dbDeal.contact || '',
          contactInfo: dbDeal.contact_info || undefined,
          companyUrl: (dbDeal as any).company_url || undefined,
          businessModel: (dbDeal as any).business_model || undefined,
          sourcedVia: (dbDeal as any).sourced_via || undefined,
          createdAt: dbDeal.created_at,
          updatedAt: dbDeal.updated_at,
          lenders: dealLenders,
          migratedFromPersonal: dbDeal.migrated_from_personal || false,
          pipelineId: dbDeal.pipeline_id || undefined,
          closingDate: (dbDeal as any).closing_date || null,
          dealClass: ((dbDeal as any).deal_class || 'standard') as 'standard' | 'naitive' | 'finserv',
          onHold: (dbDeal as any).on_hold === true,
          contactEmail: (dbDeal as any).contact_email || undefined,
          leadSource: (dbDeal as any).lead_source || undefined,
          referralSource: (dbDeal as any).referral_source || undefined,
          opportunityType: (dbDeal as any).opportunity_type || undefined,
          servicesOffered: Array.isArray((dbDeal as any).services_offered) ? (dbDeal as any).services_offered : undefined,
          feeType: (dbDeal as any).fee_type || undefined,
          mrr: (dbDeal as any).mrr ?? null,
          oneTimeRevenue: (dbDeal as any).one_time_revenue ?? null,
          projectedCloseDate: (dbDeal as any).projected_close_date || null,
          contractStartDate: (dbDeal as any).contract_start_date || null,
          contractEndDate: (dbDeal as any).contract_end_date || null,
        };

        if (!cancelled) setDeal(mapped);
      } catch (err) {
        console.error('Failed to fetch naitive pipeline deal:', err);
      } finally {
        if (!cancelled) setNaitiveFallbackLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [contextDeal, id, hasNaitivePipelineAccess, isDealsLoading, deal]);
  
  // Update local deal state when context deal changes
  // Use the context (database) as source of truth, only preserve local order
  useEffect(() => {
    if (contextDeal) {
      setDeal(prev => {
        if (!prev) return contextDeal;
        
        // Preserve lender order from local state while taking data from context (DB)
        let mergedLenders = contextDeal.lenders;
        if (prev.lenders && contextDeal.lenders) {
          // Create a map of context lenders for quick lookup
          const contextLenderMap = new Map(contextDeal.lenders.map(l => [l.id, l]));
          const prevLenderIds = new Set(prev.lenders.map(l => l.id));
          
          // Keep local order but use context data (DB is source of truth)
          mergedLenders = prev.lenders
            .filter(l => contextLenderMap.has(l.id))
            .map(localLender => {
              // Use context lender data (from DB) as source of truth
              return contextLenderMap.get(localLender.id)!;
            });
          
          // Add any new lenders from context that aren't in local state
          contextDeal.lenders.forEach(cl => {
            if (!prevLenderIds.has(cl.id)) {
              mergedLenders = [...(mergedLenders || []), cl];
            }
          });
        }
        
        // Merge context changes with local state, preserving local edits for fee fields only
        return {
          ...contextDeal,
          lenders: mergedLenders,
          // Preserve local fee values that may not have been saved yet
          retainerFee: prev.retainerFee,
          milestoneFee: prev.milestoneFee,
          successFeePercent: prev.successFeePercent,
          totalFee: prev.totalFee,
          preSigningHours: prev.preSigningHours,
          postSigningHours: prev.postSigningHours,
        };
      });
    }
  }, [contextDeal]);
  
  // Determine if this is a naitive pipeline deal
  const isNaitiveDeal = deal?.dealClass === 'naitive';
  const isFinServDeal = deal?.dealClass === 'finserv';
  // FinServ deals use same simplified detail view as naitive deals
  const isSimplifiedDeal = isNaitiveDeal || isFinServDeal;

  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  
  // Memoize existing lender names to pass to the search component
  const existingLenderNames = useMemo(() => 
    deal?.lenders?.map(l => l.name) || [], 
    [deal?.lenders]
  );
  const [lenderSort, setLenderSort] = useState<'none' | 'updated-desc' | 'updated-asc' | 'stage-furthest' | 'stage-slowest'>('none');
  const [lenderDropdownOpen, setLenderDropdownOpen] = useState(false);
  const pendingReorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stableLenderSnapshot, setStableLenderSnapshot] = useState<DealLender[] | null>(null);

  // Compute the "real" sorted order from current data
  const computedSortedLenders = useMemo(() => {
    const lenders = deal?.lenders ? [...deal.lenders] : [];
    if (lenders.length === 0) return lenders;
    if (lenderSort === 'none') return lenders;
    
    switch (lenderSort) {
      case 'updated-desc':
        return lenders.sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        });
      case 'updated-asc':
        return lenders.sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return aTime - bTime;
        });
      case 'stage-furthest': {
        const stageOrder: Record<string, number> = {};
        configuredStages.forEach((s, i) => { stageOrder[s.id] = i; });
        return lenders.sort((a, b) => (stageOrder[b.stage] ?? -1) - (stageOrder[a.stage] ?? -1));
      }
      case 'stage-slowest': {
        const stageOrder: Record<string, number> = {};
        configuredStages.forEach((s, i) => { stageOrder[s.id] = i; });
        return lenders.sort((a, b) => (stageOrder[a.stage] ?? 999) - (stageOrder[b.stage] ?? 999));
      }
      default:
        return lenders;
    }
  }, [deal?.lenders, lenderSort, configuredStages]);

  // Delayed reorder: use a stable snapshot that updates after 4s delay
  // If a dropdown is open, defer until it closes + 4s
  const prevLenderSortRef = useRef(lenderSort);
  useEffect(() => {
    // Clear any pending timer
    if (pendingReorderTimer.current) {
      clearTimeout(pendingReorderTimer.current);
      pendingReorderTimer.current = null;
    }

    // If no snapshot yet, set immediately (initial load)
    if (!stableLenderSnapshot) {
      setStableLenderSnapshot(computedSortedLenders);
      prevLenderSortRef.current = lenderSort;
      return;
    }

    // If sort option changed, apply immediately
    if (prevLenderSortRef.current !== lenderSort) {
      setStableLenderSnapshot(computedSortedLenders);
      prevLenderSortRef.current = lenderSort;
      return;
    }

    // If dropdown is open, don't schedule — wait for close
    if (lenderDropdownOpen) return;

    // Schedule a delayed update
    pendingReorderTimer.current = setTimeout(() => {
      setStableLenderSnapshot(computedSortedLenders);
      pendingReorderTimer.current = null;
    }, 4000);

    return () => {
      if (pendingReorderTimer.current) {
        clearTimeout(pendingReorderTimer.current);
      }
    };
  }, [computedSortedLenders, lenderDropdownOpen, lenderSort]);

  // Use the stable snapshot but update data (not order) from computed
  const sortedLenders = useMemo(() => {
    if (!stableLenderSnapshot) return computedSortedLenders;
    // Use the order from the snapshot, but the data from computedSortedLenders
    const dataMap = new Map(computedSortedLenders.map(l => [l.id, l]));
    const result = stableLenderSnapshot
      .filter(l => dataMap.has(l.id))
      .map(l => dataMap.get(l.id)!);
    // Add any new lenders not in snapshot
    computedSortedLenders.forEach(l => {
      if (!stableLenderSnapshot.some(s => s.id === l.id)) {
        result.push(l);
      }
    });
    return result;
  }, [stableLenderSnapshot, computedSortedLenders]);


  const [selectedLenderName, setSelectedLenderName] = useState<string | null>(null);
  const [directFetchedLender, setDirectFetchedLender] = useState<import('@/hooks/useMasterLenders').MasterLender | null>(null);

  // When a lender popup opens, if the lender isn't in the cached masterLenders list yet
  // (background load still in progress), do a targeted single-row fetch so contacts show instantly.
  useEffect(() => {
    if (!selectedLenderName) {
      setDirectFetchedLender(null);
      return;
    }
    const alreadyCached = masterLenders.find(ml => ml.name === selectedLenderName);
    if (alreadyCached) {
      setDirectFetchedLender(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('master_lenders')
        .select('*')
        .ilike('name', selectedLenderName)
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setDirectFetchedLender(data as import('@/hooks/useMasterLenders').MasterLender);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedLenderName, masterLenders]);

  const [removedLenders, setRemovedLenders] = useState<{ lender: DealLender; timestamp: string; id: string }[]>([]);
  const [expandedLenderNotes, setExpandedLenderNotes] = useState<Set<string>>(new Set());
  const [requestedItemsDrawerLender, setRequestedItemsDrawerLender] = useState<string | null>(null);
  const [expandedLenderHistory, setExpandedLenderHistory] = useState<Set<string>>(new Set());
  const [selectedReferrer, setSelectedReferrer] = useState<Referrer | null>(null);
  const [isLendersKanbanOpen, setIsLendersKanbanOpen] = useState(false);
  const [dealInfoTab, setDealInfoTab] = useState<'deal-info' | 'lenders' | 'deal-management' | 'deal-writeup' | 'data-room' | 'deal-space' | 'communication'>((initialTab === 'deal-space' && !hasDealSpaceAccess) ? 'deal-info' : (initialTab || 'deal-info'));
  const prevTabRef = useRef<typeof dealInfoTab>(dealInfoTab);
  const [tabDirection, setTabDirection] = useState<'left' | 'right' | 'none'>('none');
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  
  // Track tab direction for swipe animation
  const DEAL_TABS = ['deal-info', 'lenders', 'deal-management', 'deal-writeup', 'data-room', 'deal-space', 'communication'] as const;
  
  const handleTabChange = useCallback((newTab: typeof dealInfoTab) => {
    const prevIndex = DEAL_TABS.indexOf(prevTabRef.current);
    const newIndex = DEAL_TABS.indexOf(newTab);
    
    if (prevIndex !== newIndex) {
      setTabDirection(newIndex > prevIndex ? 'right' : 'left');
    }
    
    prevTabRef.current = newTab;
    setDealInfoTab(newTab);
  }, []);

  // Auto-scroll to first stale lender when navigating from a notification
  useEffect(() => {
    if (!highlightStale || dealInfoTab !== 'lenders') return;
    const timer = setTimeout(() => {
      const staleLenderEl = document.querySelector('[data-lender-stale="true"]');
      if (staleLenderEl) {
        staleLenderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [highlightStale, dealInfoTab]);
  const [dealWriteUpData, setDealWriteUpData] = useState<DealWriteUpData>(() => getEmptyDealWriteUpData());
  const { criteria: savedMatchingCriteria } = useDealMatchingCriteria(id);
  const [isUpdatesWidgetOpen, setIsUpdatesWidgetOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [historyDrawerLender, setHistoryDrawerLender] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Lender history warnings - build deal context for matching
  const lenderHistoryDealContext = useMemo(() => {
    if (!deal || !id) return null;
    return {
      dealId: id,
      industry: savedMatchingCriteria?.industry || dealWriteUpData?.industries?.join(', ') || undefined,
      dealSize: deal.value || undefined,
      geography: dealWriteUpData?.location || undefined,
      dealTypes: deal.dealTypes || dealWriteUpData?.dealTypes || undefined,
    };
  }, [id, deal?.value, deal?.dealTypes, savedMatchingCriteria?.industry, dealWriteUpData?.industries, dealWriteUpData?.location, dealWriteUpData?.dealTypes]);

  const lenderNamesForWarnings = useMemo(() => 
    (deal?.lenders || []).map(l => l.name),
    [deal?.lenders]
  );

  const { data: lenderWarningsMap } = useLenderHistoryWarnings(
    lenderNamesForWarnings,
    lenderHistoryDealContext
  );
  
  // AI panel collapsed states with localStorage persistence
  const [isResearchPanelOpen, setIsResearchPanelOpen] = useState(() => {
    const saved = localStorage.getItem('deal-research-panel-open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAssistantPanelOpen, setIsAssistantPanelOpen] = useState(() => {
    const saved = localStorage.getItem('deal-assistant-panel-open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isActivitySummaryOpen, setIsActivitySummaryOpen] = useState(() => {
    const saved = localStorage.getItem('deal-activity-summary-open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isSuggestionsPanelOpen, setIsSuggestionsPanelOpen] = useState(() => {
    const saved = localStorage.getItem('deal-suggestions-panel-open');
    return saved !== null ? saved === 'true' : true;
  });
  
  // Persist AI panel states
  useEffect(() => {
    localStorage.setItem('deal-research-panel-open', String(isResearchPanelOpen));
  }, [isResearchPanelOpen]);
  useEffect(() => {
    localStorage.setItem('deal-assistant-panel-open', String(isAssistantPanelOpen));
  }, [isAssistantPanelOpen]);
  useEffect(() => {
    localStorage.setItem('deal-activity-summary-open', String(isActivitySummaryOpen));
  }, [isActivitySummaryOpen]);
  useEffect(() => {
    localStorage.setItem('deal-suggestions-panel-open', String(isSuggestionsPanelOpen));
  }, [isSuggestionsPanelOpen]);
  
  // Panel reorder functionality
  const { panelOrder, panelVisibility, visiblePanels, reorderPanels, togglePanelVisibility, isPanelVisible, resetToDefault } = useDealPanelOrder();
  const { fieldOrder: dealInfoFieldOrder, isFieldVisible: isDealInfoFieldVisible } = useDealInfoFieldOrder();
  const [isPanelReorderDialogOpen, setIsPanelReorderDialogOpen] = useState(false);
  
  // Mark info requests as read when Deal Management tab is viewed
  useEffect(() => {
    if (dealInfoTab === 'deal-management' && infoRequestPendingCount > 0) {
      markInfoRequestsAsRead();
    }
  }, [dealInfoTab, infoRequestPendingCount, markInfoRequestsAsRead]);

  // Listen for AI-driven lender updates dispatched from the email modal
  // (useThreadWorkflowAnalysis). When the broadcast targets THIS deal,
  // refresh the DealsContext so the Lenders tab reflects the change
  // immediately without requiring a full page reload.
  useEffect(() => {
    if (!id) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.dealId && detail.dealId === id) {
        // eslint-disable-next-line no-console
        console.debug('[DealDetail] received deal:lender-updated, refreshing', detail);
        refreshDeals();
      }
    };
    window.addEventListener('deal:lender-updated', handler);
    return () => window.removeEventListener('deal:lender-updated', handler);
  }, [id, refreshDeals]);

  // Scroll to hash element after tab change
  useEffect(() => {
    if (location.hash) {
      // Small delay to ensure the tab content is rendered
      const timeoutId = setTimeout(() => {
        const element = document.querySelector(location.hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [location.hash, dealInfoTab]);
  
  // Deal writeup persistence hook
  const { writeupData: savedWriteupData, isLoading: isLoadingWriteup, isSaving: isSavingWriteup, saveWriteup } = useDealWriteup(id);
  
  // Auto-save for deal writeup — guard against stale dealId saves during navigation
  const currentDealIdRef = useRef(id);
  currentDealIdRef.current = id;
  const guardedSaveWriteup = useCallback(async (data: DealWriteUpData): Promise<boolean> => {
    // Prevent saving if the deal has changed since the save was scheduled
    if (currentDealIdRef.current !== id) return false;
    return saveWriteup(data);
  }, [id, saveWriteup]);
  const { status: autoSaveStatus, saveNow: saveWriteupNow } = useAutoSave({
    data: dealWriteUpData,
    onSave: guardedSaveWriteup,
    delay: 1500,
    enabled: dealInfoTab === 'deal-writeup' && !isLoadingWriteup,
  });
  
  // Track per-field user edits for write protection
  const { markFieldEdited, isFieldEdited, editedCount, editedFieldKeys, resetAllFlags: resetAllEditFlags } = useUserEditedFields(id);

  // Track if writeup has been initialized to prevent overwriting user edits
  const writeupInitializedRef = useRef<string | null>(null);

  // Reset writeup state immediately when deal ID changes to prevent cross-deal data bleed
  useEffect(() => {
    if (writeupInitializedRef.current && writeupInitializedRef.current !== id) {
      setDealWriteUpData(getEmptyDealWriteUpData());
      writeupInitializedRef.current = null;
    }
  }, [id]);
  
  // Initialize deal write-up data from saved writeup or existing deal data - only once per deal
  useEffect(() => {
    // Only initialize if this is a different deal than what we've already initialized
    if (writeupInitializedRef.current === id) {
      return;
    }
    
    // Wait until loading is complete before initializing
    if (isLoadingWriteup) {
      return;
    }
    
    if (savedWriteupData) {
      // Use saved writeup data, but merge deal type from deal record if writeup has none
      const mergedData = { ...savedWriteupData };
      if ((!mergedData.dealTypes || mergedData.dealTypes.length === 0) && deal?.dealTypes && deal.dealTypes.length > 0) {
        mergedData.dealTypes = deal.dealTypes;
      }
      setDealWriteUpData(mergedData);
      writeupInitializedRef.current = id || null;
    } else if (deal) {
      // Otherwise, pre-populate from deal data
      const dealData: DealDataForWriteUp = {
        company: deal.company,
        dealTypes: deal.dealTypes,
        value: deal.value,
        narrative: deal.narrative,
        status: deal.status,
      };
      setDealWriteUpData(getEmptyDealWriteUpData(dealData));
      writeupInitializedRef.current = id || null;
    }
  }, [savedWriteupData, deal?.id, id, isLoadingWriteup]); // Re-initialize only when deal ID changes
  
  // Save operation tracking for loading indicators
  const { isSaving, withSavingAsync, isAnySaving } = useSaveOperation();
  
  // Outstanding items persistence
  const { items: outstandingItems, addItem: addOutstandingItemDb, updateItem: updateOutstandingItemDb, deleteItem: deleteOutstandingItemDb, bulkAddItems: bulkAddOutstandingItemsDb, reorderItems: reorderOutstandingItemsDb } = useOutstandingItems(id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleLenderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDeal(prev => {
        if (!prev || !prev.lenders) return prev;
        const oldIndex = prev.lenders.findIndex(l => l.id === active.id);
        const newIndex = prev.lenders.findIndex(l => l.id === over.id);
        const newLenders = arrayMove(prev.lenders, oldIndex, newIndex);
        return { ...prev, lenders: newLenders, updatedAt: new Date().toISOString() };
      });
    }
  }, []);

  // Helper to check if a lender is stale based on preferences
  const isLenderStale = useCallback((lender: DealLender) => {
    if (!isPostSubmissionDealStage(deal?.stage)) return { isStale: false, isUrgent: false };
    if (!lender.updatedAt || lender.trackingStatus !== 'active') return { isStale: false, isUrgent: false };
    const daysSinceUpdate = differenceInDays(new Date(), new Date(lender.updatedAt));
    const isUrgent = daysSinceUpdate >= preferences.lenderUpdateRedDays;
    const isStale = daysSinceUpdate >= preferences.lenderUpdateYellowDays;
    return { isStale, isUrgent };
  }, [preferences.lenderUpdateYellowDays, preferences.lenderUpdateRedDays, deal?.stage]);

  // View preferences - load from localStorage
  const savedViewPrefs = useMemo(() => {
    const saved = localStorage.getItem('dealDetailViewPrefs');
    return saved ? JSON.parse(saved) : null;
  }, []);
  
  const [isLendersExpanded, setIsLendersExpanded] = useState<boolean>(
    savedViewPrefs?.isLendersExpanded ?? true
  );
  const [lenderGroupFilters, setLenderGroupFilters] = useState<Set<StageGroup>>(() => {
    const saved = savedViewPrefs?.lenderGroupFilter;
    if (saved && saved !== 'all') return new Set([saved as StageGroup]);
    if (Array.isArray(savedViewPrefs?.lenderGroupFilters)) return new Set(savedViewPrefs.lenderGroupFilters as StageGroup[]);
    return new Set<StageGroup>();
  });
  const [lenderStageFilters, setLenderStageFilters] = useState<Set<string>>(() => {
    if (Array.isArray(savedViewPrefs?.lenderStageFilters)) return new Set(savedViewPrefs.lenderStageFilters as string[]);
    return new Set<string>();
  });
  
  // Apply individual stage filters to sorted lenders
  const filteredSortedLenders = useMemo(() => {
    if (lenderStageFilters.size === 0) return sortedLenders;
    return sortedLenders.filter(l => lenderStageFilters.has(l.stage));
  }, [sortedLenders, lenderStageFilters]);

  const [attachmentFilter, setAttachmentFilter] = useState<'all' | 'materials' | 'financials' | 'agreements' | 'other'>(
    savedViewPrefs?.attachmentFilter ?? 'all'
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['materials', 'financials', 'agreements', 'other']));
  
  // Track if view has been modified from saved state
  const [viewModified, setViewModified] = useState(false);
  
  // Check if current view differs from saved preferences
  useEffect(() => {
    const currentFilters = Array.from(lenderGroupFilters);
    const savedFilters = savedViewPrefs?.lenderGroupFilters || 
      (savedViewPrefs?.lenderGroupFilter && savedViewPrefs.lenderGroupFilter !== 'all' ? [savedViewPrefs.lenderGroupFilter] : []);
    const currentStageFilters = Array.from(lenderStageFilters);
    const savedStageFilters = savedViewPrefs?.lenderStageFilters || [];
    
    const hasChanged = 
      isLendersExpanded !== (savedViewPrefs?.isLendersExpanded ?? true) ||
      currentFilters.length !== savedFilters.length ||
      currentFilters.some(f => !savedFilters.includes(f)) ||
      currentStageFilters.length !== savedStageFilters.length ||
      currentStageFilters.some(f => !savedStageFilters.includes(f)) ||
      attachmentFilter !== (savedViewPrefs?.attachmentFilter ?? 'all');
    
    setViewModified(hasChanged);
  }, [isLendersExpanded, lenderGroupFilters, lenderStageFilters, attachmentFilter, savedViewPrefs]);
  
  const saveViewPreferences = useCallback(() => {
    const prefs = {
      isLendersExpanded,
      lenderGroupFilters: Array.from(lenderGroupFilters),
      lenderStageFilters: Array.from(lenderStageFilters),
      attachmentFilter,
    };
    localStorage.setItem('dealDetailViewPrefs', JSON.stringify(prefs));
    setViewModified(false);
    toast({
      title: "View saved",
      description: "Your view preferences have been saved as the default.",
    });
  }, [isLendersExpanded, lenderGroupFilters, attachmentFilter]);
  
  // Pass reason dialog state
  const [passReasonDialogOpen, setPassReasonDialogOpen] = useState(false);
  const [pendingPassStageChange, setPendingPassStageChange] = useState<{
    lenderId: string;
    newStageId: string;
    isEditing?: boolean;
  } | null>(null);
  const [selectedPassReasons, setSelectedPassReasons] = useState<string[]>([]);
  const [passReasonSearch, setPassReasonSearch] = useState('');
  
  // Term Sheet milestone confirmation dialog state
  const [termSheetMilestoneDialogOpen, setTermSheetMilestoneDialogOpen] = useState(false);
  const [pendingTermSheetMilestone, setPendingTermSheetMilestone] = useState<{
    milestoneId: string;
    milestoneTitle: string;
    lenderName: string;
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(deleteAction);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPushingDataRoom, setIsPushingDataRoom] = useState(false);
  
  // Failed saves tracking for retry functionality
  const [failedLenderSaves, setFailedLenderSaves] = useState<Set<string>>(new Set());
  
  // Undo state for lender stage changes
  const [lastLenderChange, setLastLenderChange] = useState<{
    lenderId: string;
    previousStage: string;
    previousTrackingStatus: string;
    previousPassReason?: string;
    lenderName: string;
  } | null>(null);

  // Handle delete action from query param
  useEffect(() => {
    if (deleteAction) {
      setIsDeleteDialogOpen(true);
      // Clear the action param from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [deleteAction, searchParams, setSearchParams]);

  // NOTE: View tracking removed - only log actual changes (updates, additions, deletions)

  const handleDeleteDeal = async () => {
    if (!deal) return;
    setIsDeleting(true);
    try {
      await deleteDeal(deal.id);
      toast({
        title: "Deal deleted",
        description: `${deal.company} has been permanently deleted.`,
      });
      navigate('/deals');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete deal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleArchiveDeal = async () => {
    if (!deal) return;
    try {
      await updateDealInDb(deal.id, { status: 'archived' as any });
      setDeal(prev => prev ? { ...prev, status: 'archived' as any } : prev);
      toast({
        title: "Deal archived",
        description: `${deal.company} has been archived. You can find it in the archived filter.`,
      });
      setIsDeleteDialogOpen(false);
      navigate('/deals');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to archive deal. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRestoreFromArchive = async () => {
    if (!deal) return;
    try {
      await updateDealInDb(deal.id, { status: 'active' as any });
      setDeal(prev => prev ? { ...prev, status: 'active' as any } : prev);
      toast({
        title: "Deal restored",
        description: `${deal.company} has been restored from archive.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore deal. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Deal attachments
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<DealAttachmentCategory>('materials');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState<typeof attachments[0] | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const selectionMode = selectedAttachments.size > 0;
  const { 
    attachments, 
    isLoading: isLoadingAttachments, 
    uploadMultipleAttachments, 
    deleteAttachment,
    updateAttachmentCategory,
    renameAttachment,
    reorderAttachments,
    formatFileSize 
  } = useDealAttachments(id || null);

  // Checklist for file upload linking
  const { items: templateChecklistItems } = useDataRoomChecklist();
  const { items: dealChecklistItems } = useDealChecklistItems(id);
  const { linkAttachment: linkChecklistAttachment } = useDealChecklistStatus(id);
  const { categories: checklistCategories } = useChecklistCategories();
  const [pendingUpload, setPendingUpload] = useState<{
    category: DealAttachmentCategory;
    files: File[];
  } | null>(null);

  // Combine template and deal-specific checklist items with deduplication
  // Deal-specific items override global template items matched by name
  const allChecklistItems = useMemo(() => {
    const dealSpecific = dealChecklistItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      is_required: item.is_required,
    }));
    if (dealSpecific.length > 0) {
      const dealItemNames = new Set(dealSpecific.map(i => i.name.toLowerCase().trim()));
      const nonOverlapping = templateChecklistItems
        .filter(item => !dealItemNames.has(item.name.toLowerCase().trim()))
        .map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          is_required: item.is_required,
        }));
      return [...nonOverlapping, ...dealSpecific];
    }
    return templateChecklistItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      is_required: item.is_required,
    }));
  }, [templateChecklistItems, dealChecklistItems]);
  
  const filteredAttachments = attachmentFilter === 'all' 
    ? attachments 
    : attachments.filter(a => a.category === attachmentFilter);

  const handleFileDrop = useCallback(async (
    files: File[], 
    category?: DealAttachmentCategory, 
    assignments?: Map<number, string | null>
  ) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setShowUploadProgress(true);
    try {
      const uploadedAttachments = await uploadMultipleAttachments(files, category || uploadCategory, (progress) => {
        setUploadProgress(progress);
      });
      
      // Link each uploaded attachment to its assigned checklist item
      if (assignments && uploadedAttachments && uploadedAttachments.length > 0) {
        for (let i = 0; i < uploadedAttachments.length; i++) {
          const checklistItemIds = assignments.get(i);
          if (checklistItemIds) {
            // Multiple checklist items may be comma-separated
            const ids = checklistItemIds.split(',').map(id => id.trim()).filter(Boolean);
            for (const itemId of ids) {
              await linkChecklistAttachment(itemId, uploadedAttachments[i].id);
            }
          }
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [uploadMultipleAttachments, uploadCategory, linkChecklistAttachment]);

  const handleFileDropToCategory = useCallback(async (
    category: DealAttachmentCategory, 
    files: File[], 
    assignments?: Map<number, string | null>
  ) => {
    if (assignments !== undefined) {
      // If assignments are provided, proceed with upload
      await handleFileDrop(files, category, assignments);
    } else if (allChecklistItems.length > 0) {
      // Show checklist dialog if there are checklist items
      setPendingUpload({ category, files });
    } else {
      // No checklist items, proceed directly
      await handleFileDrop(files, category);
    }
  }, [handleFileDrop, allChecklistItems.length]);

  const handleChecklistDialogConfirm = useCallback(async (assignments: Map<number, string | null>) => {
    if (pendingUpload) {
      await handleFileDrop(pendingUpload.files, pendingUpload.category, assignments);
      setPendingUpload(null);
    }
  }, [handleFileDrop, pendingUpload]);

  const handleChecklistDialogCancel = useCallback(() => {
    setPendingUpload(null);
  }, []);

  // Handle attachment drag between categories and reordering within
  const handleAttachmentDragStart = useCallback((event: DragStartEvent) => {
    const attachmentId = event.active.id as string;
    const attachment = attachments.find(a => a.id === attachmentId);
    if (attachment) {
      setActiveAttachment(attachment);
    }
  }, [attachments]);

  const handleAttachmentDragOver = useCallback((event: DragOverEvent) => {
    const { over, active } = event;
    if (over) {
      // Check if over a category folder or another attachment
      const overData = over.data.current;
      const targetCategory = overData?.category || 
        (overData?.type === 'attachment' ? overData.attachment?.category : null) ||
        (DEAL_ATTACHMENT_CATEGORIES.some(c => c.value === over.id) ? over.id : null);
      
      if (targetCategory && DEAL_ATTACHMENT_CATEGORIES.some(c => c.value === targetCategory)) {
        setDragOverCategory(targetCategory as string);
      }
    } else {
      setDragOverCategory(null);
    }
  }, []);

  const handleAttachmentDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveAttachment(null);
    setDragOverCategory(null);
    
    if (!over) return;
    
    const attachmentId = active.id as string;
    const attachment = attachments.find(a => a.id === attachmentId);
    
    if (!attachment) return;
    
    const overData = over.data.current;
    
    // Determine if dropping on a category or another attachment
    let targetCategory: string | null = null;
    let isReordering = false;
    let overAttachment: typeof attachment | null = null;
    
    if (overData?.type === 'attachment') {
      overAttachment = overData.attachment;
      // Dropping on another attachment - check if same category for reordering
      if (overAttachment?.category === attachment.category && over.id !== active.id) {
        isReordering = true;
      } else if (overAttachment?.category !== attachment.category) {
        targetCategory = overAttachment?.category;
      }
    } else if (overData?.category) {
      targetCategory = overData.category;
    } else if (DEAL_ATTACHMENT_CATEGORIES.some(c => c.value === over.id)) {
      targetCategory = over.id as string;
    }
    
    // Handle reordering within the same category
    if (isReordering && overAttachment) {
      const categoryAttachments = attachments
        .filter(a => a.category === attachment.category)
        .sort((a, b) => a.position - b.position);
      
      const oldIndex = categoryAttachments.findIndex(a => a.id === attachmentId);
      const newIndex = categoryAttachments.findIndex(a => a.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(categoryAttachments, oldIndex, newIndex);
        await reorderAttachments(reordered.map(a => a.id), attachment.category);
      }
    }
    // Handle category change
    else if (targetCategory && attachment.category !== targetCategory) {
      const categoryLabel = DEAL_ATTACHMENT_CATEGORIES.find(c => c.value === targetCategory)?.label || targetCategory;
      // Get the max position in the target category
      const targetCategoryAttachments = attachments.filter(a => a.category === targetCategory);
      const maxPosition = targetCategoryAttachments.length > 0 
        ? Math.max(...targetCategoryAttachments.map(a => a.position)) + 1 
        : 0;
      await updateAttachmentCategory(attachmentId, targetCategory as DealAttachmentCategory, maxPosition);
      toast({ title: `Moved "${attachment.name}" to ${categoryLabel}` });
    }
  }, [attachments, updateAttachmentCategory, reorderAttachments]);

  // Bulk selection handlers for Data Room
  const toggleAttachmentSelection = useCallback((attachmentId: string) => {
    setSelectedAttachments(prev => {
      const next = new Set(prev);
      if (next.has(attachmentId)) {
        next.delete(attachmentId);
      } else {
        next.add(attachmentId);
      }
      return next;
    });
  }, []);

  const clearAttachmentSelection = useCallback(() => {
    setSelectedAttachments(new Set());
  }, []);

  const selectAllAttachments = useCallback(() => {
    setSelectedAttachments(new Set(attachments.map(a => a.id)));
  }, [attachments]);

  const handleBulkDelete = useCallback(async () => {
    const selectedIds = Array.from(selectedAttachments);
    const count = selectedIds.length;
    
    for (const id of selectedIds) {
      const attachment = attachments.find(a => a.id === id);
      if (attachment) {
        await deleteAttachment(attachment);
      }
    }
    
    setSelectedAttachments(new Set());
    toast({ title: `Deleted ${count} file${count !== 1 ? 's' : ''}` });
  }, [selectedAttachments, attachments, deleteAttachment]);

  const handleBulkMove = useCallback(async (targetCategory: DealAttachmentCategory) => {
    const selectedIds = Array.from(selectedAttachments);
    const count = selectedIds.length;
    const categoryLabel = DEAL_ATTACHMENT_CATEGORIES.find(c => c.value === targetCategory)?.label || targetCategory;
    
    for (const id of selectedIds) {
      const attachment = attachments.find(a => a.id === id);
      if (attachment && attachment.category !== targetCategory) {
        const targetCategoryAttachments = attachments.filter(a => a.category === targetCategory);
        const maxPosition = targetCategoryAttachments.length > 0 
          ? Math.max(...targetCategoryAttachments.map(a => a.position)) + 1 
          : 0;
        await updateAttachmentCategory(id, targetCategory, maxPosition);
      }
    }
    
    setSelectedAttachments(new Set());
    toast({ title: `Moved ${count} file${count !== 1 ? 's' : ''} to ${categoryLabel}` });
  }, [selectedAttachments, attachments, updateAttachmentCategory]);

  // State for Data Room push confirmation dialog
  const [showDataRoomPushConfirm, setShowDataRoomPushConfirm] = useState(false);
  const [selectedFilesForPush, setSelectedFilesForPush] = useState<Set<string>>(new Set());

  // Initialize selected files when dialog opens
  const handleOpenPushDialog = useCallback(() => {
    setSelectedFilesForPush(new Set(attachments.map(a => a.id)));
    setShowDataRoomPushConfirm(true);
  }, [attachments]);

  // Toggle file selection
  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFilesForPush(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  // Toggle all files in a category
  const toggleCategorySelection = useCallback((categoryFiles: typeof attachments) => {
    const allSelected = categoryFiles.every(f => selectedFilesForPush.has(f.id));
    setSelectedFilesForPush(prev => {
      const next = new Set(prev);
      categoryFiles.forEach(f => {
        if (allSelected) {
          next.delete(f.id);
        } else {
          next.add(f.id);
        }
      });
      return next;
    });
  }, [selectedFilesForPush]);

  // Select/deselect all files
  const toggleAllFiles = useCallback(() => {
    const allSelected = attachments.every(a => selectedFilesForPush.has(a.id));
    if (allSelected) {
      setSelectedFilesForPush(new Set());
    } else {
      setSelectedFilesForPush(new Set(attachments.map(a => a.id)));
    }
  }, [attachments, selectedFilesForPush]);

  // Push Data Room to FLEx
  const handlePushDataRoomToFlex = useCallback(async () => {
    const filesToPush = attachments.filter(a => selectedFilesForPush.has(a.id));
    
    if (!id || !deal) {
      toast({
        title: "Error",
        description: "Deal information is missing.",
        variant: "destructive",
      });
      return;
    }
    
    setShowDataRoomPushConfirm(false);
    setIsPushingDataRoom(true);
    try {
      // Get signed URLs for selected attachments
      const attachmentData = await Promise.all(
        filesToPush.map(async (att) => {
          const { data: signedData } = await supabase.storage
            .from('deal-attachments')
            .createSignedUrl(att.file_path, 3600); // 1 hour expiry
          
          return {
            name: att.name,
            category: att.category,
            url: signedData?.signedUrl || null,
            size_bytes: att.size_bytes,
            content_type: att.content_type,
          };
        })
      );
      
      // Call the push-to-flex edge function with data room files
      const { data, error } = await supabase.functions.invoke('push-to-flex', {
        body: {
          dealId: id,
          action: 'sync_data_room',
          dataRoomFiles: attachmentData.filter(a => a.url !== null),
        },
      });
      
      if (error) throw error;
      
      toast({
        title: "Data Room pushed to FLEx",
        description: filesToPush.length > 0 ? `${filesToPush.length} file(s) synced successfully.` : 'Data room cleared on FLEx.',
      });
      
      logActivity('flex_data_room_push', `Data room pushed to FLEx (${filesToPush.length} files)`, {
        file_count: filesToPush.length,
      });
    } catch (error) {
      console.error('Error pushing data room to FLEx:', error);
      toast({
        title: "Failed to push to FLEx",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsPushingDataRoom(false);
    }
  }, [id, deal, attachments, selectedFilesForPush, logActivity]);

  // Group attachments by category for the confirmation preview
  const attachmentsByCategory = useMemo(() => {
    const grouped: Record<string, typeof attachments> = {};
    attachments.forEach(att => {
      if (!grouped[att.category]) {
        grouped[att.category] = [];
      }
      grouped[att.category].push(att);
    });
    return grouped;
  }, [attachments]);

  // Convert activity logs to ActivityItem format and combine with local undo actions
  const activities: ActivityItem[] = useMemo(() => {
    const dbActivities = activityLogs.map(activityLogToItem);
    const localActivities = removedLenders.map(item => ({
      id: item.id,
      type: 'lender_removed' as const,
      description: `Removed lender ${item.lender.name}`,
      user: 'You',
      timestamp: item.timestamp,
      metadata: { lenderName: item.lender.name, lenderData: item.lender },
      onUndo: async () => {
        if (!deal) return;
        
        // Re-add the lender to the database
        const restoredLender = await addLenderToDeal(deal.id, {
          name: item.lender.name,
          stage: item.lender.stage,
          substage: item.lender.substage,
          notes: item.lender.notes,
          passReason: item.lender.passReason,
        });
        
        if (restoredLender) {
          // Update local state with the new lender (with new ID from database)
          setDeal(prev => {
            if (!prev) return prev;
            return { ...prev, lenders: [...(prev.lenders || []), restoredLender], updatedAt: new Date().toISOString() };
          });
          // Remove from removed lenders list
          setRemovedLenders(prev => prev.filter(r => r.id !== item.id));
          toast({
            title: "Lender restored",
            description: `${item.lender.name} has been restored to the deal.`,
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to restore lender. Please try again.",
            variant: "destructive",
          });
        }
      },
    }));
    return [...localActivities, ...dbActivities].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activityLogs, removedLenders, deal, addLenderToDeal]);

  // Get all deals where selected lender appears
  const getLenderDeals = useCallback((lenderName: string) => {
    return deals
      .filter(d => d.lenders?.some(l => l.name === lenderName))
      .map(d => ({
        dealId: d.id,
        dealName: d.name,
        company: d.company,
        lenderInfo: d.lenders?.find(l => l.name === lenderName),
      }));
  }, [deals]);

  // Get all deals referred by a specific referrer
  const getReferrerDeals = useCallback((referrerId: string) => {
    return deals
      .filter(d => d.referredBy?.id === referrerId)
      .map(d => ({
        dealId: d.id,
        dealName: d.name,
        company: d.company,
        stage: d.stage,
        status: d.status,
      }));
  }, [deals]);

  const addLender = useCallback(async (lenderName: string) => {
    if (!deal || !lenderName.trim()) return;
    
    // Add to database
    const newLender = await addLenderToDeal(deal.id, {
      name: lenderName.trim(),
      stage: preferences.defaultLenderStage,
      trackingStatus: 'active',
    });
    
    if (newLender) {
      // Update local state
      setDeal(prev => {
        if (!prev) return prev;
        setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
        return { ...prev, lenders: [...(prev.lenders || []), newLender], updatedAt: new Date().toISOString() };
      });
      
      // Log activity
      logActivity('lender_added', `Added lender ${lenderName}`, { lender_name: lenderName });
      
      toast({
        title: "Lender added",
        description: `${lenderName} has been added to the deal.`,
      });
    }
  }, [deal, addLenderToDeal, logActivity, preferences.defaultLenderStage]);

  const removeLenderFromDeal = useCallback(async (lenderId: string, reason?: string) => {
    if (!deal) return;
    const lender = deal.lenders?.find(l => l.id === lenderId);
    if (!lender) return;

    const updatedLenders = deal.lenders?.filter(l => l.id !== lenderId);
    setDeal(prev => {
      if (!prev) return prev;
      setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });
    await deleteLenderInDb(lenderId);
    setRemovedLenders(prev => [...prev, {
      lender,
      timestamp: new Date().toISOString(),
      id: `removed-${Date.now()}`,
    }]);
    const desc = reason
      ? `Removed lender ${lender.name} — ${reason}`
      : `Removed lender ${lender.name}`;
    logActivity('lender_removed', desc, { lender_name: lender.name, reason });
    toast({
      title: "Lender removed",
      description: `${lender.name} has been removed from the deal.${reason ? ` Reason: ${reason}` : ''}`,
    });
  }, [deal, deleteLenderInDb, logActivity]);

  // Track which lender just had notes saved for visual feedback
  const [savedNotesFlash, setSavedNotesFlash] = useState<Set<string>>(new Set());

  // Track which lender notes fields are focused to defer refetches
  const focusedNotesRef = useRef<Set<string>>(new Set());
  const handleNotesFocusChange = useCallback((lenderId: string, focused: boolean) => {
    if (focused) {
      focusedNotesRef.current.add(lenderId);
    } else {
      focusedNotesRef.current.delete(lenderId);
    }
  }, []);

  const commitLenderNotes = useCallback((lenderId: string, notes: string) => {
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    const previousNote = lender?.notes?.trim() || '';
    
    // Don't save if nothing changed
    if (notes === previousNote) return;
    
    // Move previous note to history if it existed
    if (previousNote) {
      setDeal(prev => {
        if (!prev) return prev;
        const updatedLenders = prev.lenders?.map(l => {
          if (l.id !== lenderId) return l;
          const newHistory = [...(l.notesHistory || [])];
          newHistory.unshift({ text: previousNote, updatedAt: new Date().toISOString() });
          return { ...l, notes, notesHistory: newHistory };
        });
        return { ...prev, lenders: updatedLenders };
      });
    } else {
      setDeal(prev => {
        if (!prev) return prev;
        const updatedLenders = prev.lenders?.map(l => l.id === lenderId ? { ...l, notes } : l);
        return { ...prev, lenders: updatedLenders };
      });
    }
    
    // Persist to database with loading indicator
    withSavingAsync(`lender-notes-${lenderId}`, async () => {
      await updateLenderInDb(lenderId, { notes });
    });
    
    // Trigger visual feedback
    setSavedNotesFlash(prev => new Set(prev).add(lenderId));
    setTimeout(() => {
      setSavedNotesFlash(prev => {
        const next = new Set(prev);
        next.delete(lenderId);
        return next;
      });
    }, 1500);
    
    // Log activity for lender notes update (fire-and-forget)
    logActivity('lender_notes_updated', `${lender?.name} notes updated`, {
      lender_name: lender?.name,
    });
    
    toast({
      title: "Note saved",
      description: "Your note has been saved successfully.",
    });
  }, [deal?.lenders, updateLenderInDb, logActivity, withSavingAsync]);

  const updateLenderGroup = useCallback((lenderId: string, newGroup: StageGroup, passReason?: string) => {
    // Find the first stage in the target group (may not exist for groups like 'excluded')
    const targetStage = configuredStages.find(s => s.group === newGroup);
    
    // Get lender info for activity log and undo
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    const oldStage = lender?.stage ? configuredStages.find(s => s.id === lender.stage) : undefined;
    
    // Store previous state for undo
    if (lender) {
      setLastLenderChange({
        lenderId,
        previousStage: lender.stage,
        previousTrackingStatus: lender.trackingStatus || 'active',
        previousPassReason: lender.passReason,
        lenderName: lender.name,
      });
    }
    
    // Clear from failed saves if retrying
    setFailedLenderSaves(prev => {
      const next = new Set(prev);
      next.delete(lenderId);
      return next;
    });
    
    // Build auto-note for passed/not-a-fit lenders
    const autoNote = newGroup === 'passed' && passReason
      ? `Lender passed due to ${passReason}`
      : undefined;

    // Persist to database with loading indicator
    withSavingAsync(`lender-stage-${lenderId}`, async () => {
      try {
        await updateLenderInDb(lenderId, { 
          ...(targetStage ? { stage: targetStage.id } : {}),
          trackingStatus: newGroup,
          passReason: newGroup === 'passed' ? (passReason || null) : null,
          ...(autoNote ? { notes: autoNote } : {}),
        });
      } catch (err) {
        // Mark as failed for retry UI
        setFailedLenderSaves(prev => new Set(prev).add(lenderId));
        throw err;
      }
    });
    
    // Log activity (fire-and-forget)
    if (lender) {
      logActivity('lender_stage_change', `${lender.name} stage changed`, {
        lender_id: lender.id,
        lender_name: lender.name,
        from: oldStage?.label || lender.stage,
        to: targetStage?.label || newGroup,
      });
    }
    
    // Optimistically update local state
    setDeal(prev => {
      if (!prev) return prev;
      const updatedLenders = prev.lenders?.map(l => 
        l.id === lenderId 
          ? { ...l, ...(targetStage ? { stage: targetStage.id as any } : {}), trackingStatus: newGroup, passReason: newGroup === 'passed' ? passReason : undefined, updatedAt: new Date().toISOString() } 
          : l
      );
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });
    
    // Show undo toast for non-passed changes (passed has its own dialog)
    if (lender && newGroup !== 'passed') {
      toast({
        title: "Stage updated",
        description: `${lender.name} moved to ${targetStage.label}`,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => undoLenderChange(lenderId, lender.stage, lender.trackingStatus || 'active', lender.passReason)}
          >
            Undo
          </Button>
        ),
      });
    }
  }, [configuredStages, updateLenderInDb, deal?.lenders, logActivity, withSavingAsync]);

  const undoLenderChange = useCallback((lenderId: string, previousStage: string, previousTrackingStatus: string, previousPassReason?: string) => {
    // Persist undo to database
    withSavingAsync(`lender-stage-${lenderId}`, async () => {
      await updateLenderInDb(lenderId, { 
        stage: previousStage, 
        trackingStatus: previousTrackingStatus as StageGroup,
        passReason: previousPassReason || null 
      });
    });
    
    // Update local state
    setDeal(prev => {
      if (!prev) return prev;
      const updatedLenders = prev.lenders?.map(l => 
        l.id === lenderId 
          ? { ...l, stage: previousStage as any, trackingStatus: previousTrackingStatus as any, passReason: previousPassReason, updatedAt: new Date().toISOString() } 
          : l
      );
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });
    
    setLastLenderChange(null);
    
    toast({
      title: "Change undone",
      description: "Lender stage has been reverted.",
    });
  }, [updateLenderInDb, withSavingAsync]);

  const retryLenderSave = useCallback((lenderId: string) => {
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    if (!lender) return;
    
    // Retry the current state
    setFailedLenderSaves(prev => {
      const next = new Set(prev);
      next.delete(lenderId);
      return next;
    });
    
    withSavingAsync(`lender-stage-${lenderId}`, async () => {
      try {
        await updateLenderInDb(lenderId, { 
          stage: lender.stage, 
          trackingStatus: lender.trackingStatus,
          passReason: lender.passReason || null 
        });
      } catch (err) {
        setFailedLenderSaves(prev => new Set(prev).add(lenderId));
        throw err;
      }
    });
  }, [deal?.lenders, updateLenderInDb, withSavingAsync]);

  const addMilestone = useCallback(async (milestone: Omit<DealMilestone, 'id'>) => {
    if (!deal) return;
    const newMilestone = await addMilestoneToDb(milestone);
    if (newMilestone) {
      toast({
        title: "Milestone added",
        description: `"${milestone.title}" has been added.`,
      });
    }
  }, [deal, addMilestoneToDb]);

  const updateMilestone = useCallback(async (id: string, updates: Partial<DealMilestone>) => {
    await updateMilestoneInDb(id, updates);
  }, [updateMilestoneInDb]);

  // Helper to check if Term Sheet Received milestone should be prompted for completion
  const checkTermSheetMilestone = useCallback((lenderName: string) => {
    // Find "Term Sheet Received" milestone that's not completed
    const termSheetMilestone = dbMilestones.find(
      m => m.title.toLowerCase().includes('term sheet') && 
           m.title.toLowerCase().includes('received') && 
           !m.completed
    );
    
    if (termSheetMilestone) {
      setPendingTermSheetMilestone({
        milestoneId: termSheetMilestone.id,
        milestoneTitle: termSheetMilestone.title,
        lenderName,
      });
      setTermSheetMilestoneDialogOpen(true);
    }
  }, [dbMilestones]);

  const deleteMilestone = useCallback(async (id: string) => {
    const success = await deleteMilestoneFromDb(id);
    if (success) {
      toast({
        title: "Milestone deleted",
      });
    }
  }, [deleteMilestoneFromDb]);

  const addOutstandingItem = useCallback(async (text: string, requestedBy: string[]) => {
    await addOutstandingItemDb(text, requestedBy);
    
    // Log activity for adding requested item
    logActivity('requested_item_added', `Requested item added: "${text}"`, {
      item_text: text,
      requested_by: requestedBy.join(', ') || 'None',
    });
    
    toast({
      title: "Item added",
    });
  }, [logActivity, addOutstandingItemDb]);

  const updateOutstandingItem = useCallback(async (id: string, updates: Partial<OutstandingItem>) => {
    // Get the original item for activity logging before updating
    const originalItem = outstandingItems.find(item => item.id === id);
    
    // Log activity for significant status changes
    if (originalItem) {
      if (updates.received !== undefined && updates.received !== originalItem.received) {
        logActivity('requested_item_updated', `Requested item "${originalItem.text}" marked as ${updates.received ? 'received' : 'not received'}`, {
          item_text: originalItem.text,
          status: updates.received ? 'received' : 'not received',
        });
      }
      if (updates.approved !== undefined && updates.approved !== originalItem.approved) {
        logActivity('requested_item_updated', `Requested item "${originalItem.text}" marked as ${updates.approved ? 'approved' : 'not approved'}`, {
          item_text: originalItem.text,
          status: updates.approved ? 'approved' : 'not approved',
        });
      }
      if (updates.deliveredToLenders !== undefined && JSON.stringify(updates.deliveredToLenders) !== JSON.stringify(originalItem.deliveredToLenders)) {
        const newDeliveries = updates.deliveredToLenders.filter(l => !originalItem.deliveredToLenders.includes(l));
        if (newDeliveries.length > 0) {
          logActivity('requested_item_updated', `Requested item "${originalItem.text}" delivered to ${newDeliveries.join(', ')}`, {
            item_text: originalItem.text,
            delivered_to: newDeliveries.join(', '),
          });
        }
      }
      if (updates.text !== undefined && updates.text !== originalItem.text) {
        logActivity('requested_item_updated', `Requested item updated: "${updates.text}"`, {
          old_text: originalItem.text,
          new_text: updates.text,
        });
      }
    }
    
    await updateOutstandingItemDb(id, updates);
  }, [logActivity, outstandingItems, updateOutstandingItemDb]);

  const deleteOutstandingItem = useCallback(async (id: string) => {
    await deleteOutstandingItemDb(id);
    toast({
      title: "Item removed",
    });
  }, [deleteOutstandingItemDb]);

  const getTimeAgoData = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    const weeks = differenceInWeeks(now, date);
    
    let text: string;
    let highlightClass = '';
    
    if (minutes < 60) {
      text = `${minutes} Min. Ago`;
    } else if (hours < 24) {
      text = `${hours} Hours Ago`;
    } else if (days < 7) {
      text = `${days} Days Ago`;
      if (days > 3) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded';
      }
    } else if (days <= 30) {
      text = `${weeks} Weeks Ago`;
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    } else {
      text = 'Over 30 Days';
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    }
    
    return { text, highlightClass };
  };

  const timeAgoData = deal ? getTimeAgoData(deal.updatedAt) : { text: '', highlightClass: '' };

  // Calculate stale lenders for notification banner
  const staleLendersInfo = useMemo(() => {
    if (!deal?.lenders) return null;
    if (!isPostSubmissionDealStage(deal.stage)) return null;
    const yellowThreshold = preferences.lenderUpdateYellowDays;
    const now = new Date();
    let staleLenderCount = 0;
    let maxDays = 0;
    
    deal.lenders.forEach(lender => {
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const daysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
        if (daysSinceUpdate >= yellowThreshold) {
          staleLenderCount++;
          maxDays = Math.max(maxDays, daysSinceUpdate);
        }
      }
    });
    
    if (staleLenderCount === 0) return null;
    return { count: staleLenderCount, maxDays };
  }, [deal?.lenders, preferences.lenderUpdateYellowDays]);

  // Check if notification is dismissed for this deal
  const [isDealNotificationDismissed, setIsDealNotificationDismissed] = useState(() => {
    if (!deal) return false;
    try {
      const stored = localStorage.getItem('dismissedNotifications');
      if (stored) {
        const dismissed = JSON.parse(stored);
        const dismissedAt = dismissed[deal.id];
        return dismissedAt && (Date.now() - dismissedAt) < 24 * 60 * 60 * 1000;
      }
    } catch {}
    return false;
  });

  const handleDismissNotification = useCallback(() => {
    if (!deal) return;
    try {
      const stored = localStorage.getItem('dismissedNotifications');
      const dismissed = stored ? JSON.parse(stored) : {};
      dismissed[deal.id] = Date.now();
      localStorage.setItem('dismissedNotifications', JSON.stringify(dismissed));
      setIsDealNotificationDismissed(true);
    } catch {}
  }, [deal?.id]);

  // Show loading state only for the initial load.
  // During background refetches (e.g., realtime events), keep the page rendered to avoid a full-page "refresh".
  if ((isDealsLoading || naitiveFallbackLoading) && !deal) {
    return (
      <div className="bg-transparent min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading deal...</p>
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="bg-transparent">
        <DealsHeader />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white mb-4">Deal Not Found</h1>
            <Button variant="gradient" asChild>
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const stageConfig = STAGE_CONFIG[deal.stage];
  const statusConfig = STATUS_CONFIG[deal.status];

  const formatValue = (value: number) => formatCurrencyValue(value);

  const formatFee = (value: number) => formatCurrencyValue(value);

  // Format number with commas for display in inputs (using shared utility)
  const formatWithCommas = (value: number | undefined): string => {
    return formatCurrencyInputValue(value);
  };

  // Parse currency string (with commas) to number (using shared utility)
  const parseCurrencyInput = (valueStr: string): number | undefined => {
    return parseCurrencyInputValue(valueStr);
  };

  const parseValue = (valueStr: string): number => {
    const upperStr = valueStr.toUpperCase();
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(cleaned) || 0;
    
    // If the string contains MM, it's already in millions
    if (upperStr.includes('MM') || upperStr.includes('M')) {
      return numValue * 1000000;
    }
    // If the string contains K, it's in thousands
    if (upperStr.includes('K')) {
      return numValue * 1000;
    }
    // If the number is >= 1000, assume it's the actual value (e.g., 15000000)
    if (numValue >= 1000) {
      return numValue;
    }
    // Otherwise assume it's in millions (e.g., typing "15" means $15M)
    return numValue * 1000000;
  };

  // Fields that should log activity (significant changes only)
  const ACTIVITY_LOG_FIELDS: (keyof Deal)[] = ['status', 'stage', 'value', 'manager', 'dealOwner', 'engagementType', 'exclusivity', 'dealTypes'];
  
  const updateDeal = (field: keyof Deal, value: string | number | string[] | boolean | Referrer | null | undefined) => {
    setDeal(prev => {
      if (!prev) return prev;
      // Save current state to history before updating
      setEditHistory(history => [...history, { deal: prev, field, timestamp: new Date() }]);
      let updated = { ...prev, [field]: value, updatedAt: new Date().toISOString() };

      // Auto-calculate Total Fee = Deal Size × (Success Fee % / 100).
      // Recompute reactively whenever either input changes, and persist the
      // derived totalFee to the DB so it isn't left stale from a prior manual entry.
      let derivedTotalFee: number | undefined;
      if (field === 'successFeePercent' || field === 'value') {
        const dealValue = Number(field === 'value' ? (value as number) : prev.value) || 0;
        const successPercent = Number(field === 'successFeePercent' ? (value as number | undefined) : prev.successFeePercent) || 0;
        if (dealValue > 0 && successPercent > 0) {
          derivedTotalFee = (successPercent / 100) * dealValue;
          updated.totalFee = derivedTotalFee;
        }
      }
      
      // Log activity only for significant changes (not every keystroke for text fields)
      const oldValue = prev[field];
      if (ACTIVITY_LOG_FIELDS.includes(field) && oldValue !== value) {
        if (field === 'status' || field === 'stage') {
          logActivity(
            field === 'status' ? 'status_change' : 'stage_change',
            `${field.charAt(0).toUpperCase() + field.slice(1)} changed`,
            { from: String(oldValue), to: String(value) }
          );
          
          // Show toast confirmation for stage changes
          if (field === 'stage') {
            const oldStageLabel = dealStages.find(s => s.id === String(oldValue))?.label || String(oldValue);
            const newStageLabel = dealStages.find(s => s.id === String(value))?.label || String(value);
            toast({
              title: "Stage updated",
              description: `Changed from "${oldStageLabel}" to "${newStageLabel}"`,
            });
          }
        } else if (field === 'value') {
          logActivity('value_updated', `Deal value updated`, { 
            field,
            oldValue: String(oldValue), 
            newValue: String(value) 
          });
        } else {
          logActivity('deal_updated', `${field.charAt(0).toUpperCase() + field.slice(1)} updated`, { 
            field,
            oldValue: oldValue !== undefined ? String(oldValue) : undefined,
            newValue: value !== undefined ? String(value) : undefined,
          });
        }
      }
      
      // Log activity for lender information updates (substage, stage changes via inline edit)
      if (field === 'lenders' && Array.isArray(value) && prev.lenders && value.length > 0 && typeof value[0] === 'object') {
        const newLenders = value as unknown as DealLender[];
        prev.lenders.forEach((oldLender) => {
          const newLender = newLenders.find(l => l.id === oldLender.id);
          if (newLender) {
            // Log substage changes
            if (oldLender.substage !== newLender.substage) {
              const oldLabel = oldLender.substage ? (configuredSubstages.find(s => s.id === oldLender.substage)?.label || oldLender.substage) : 'None';
              const newLabel = newLender.substage ? (configuredSubstages.find(s => s.id === newLender.substage)?.label || newLender.substage) : 'None';
              logActivity('lender_substage_change', `${newLender.name} milestone changed`, {
                lender_id: newLender.id,
                lender_name: newLender.name,
                from: oldLabel,
                to: newLabel,
              });
            }
            // Log stage changes (if done via inline select, not updateLenderGroup)
            if (oldLender.stage !== newLender.stage) {
              const oldStageLabel = configuredStages.find(s => s.id === oldLender.stage)?.label || oldLender.stage;
              const newStageLabel = configuredStages.find(s => s.id === newLender.stage)?.label || newLender.stage;
              logActivity('lender_stage_change', `${newLender.name} stage changed`, {
                lender_id: newLender.id,
                lender_name: newLender.name,
                from: oldStageLabel,
                to: newStageLabel,
              });
            }
          }
        });
      }
      
      // Persist to database with loading indicator
      withSavingAsync(`deal-${field}`, async () => {
        const patch: Partial<Deal> = { [field]: value } as Partial<Deal>;
        if (derivedTotalFee !== undefined) {
          (patch as Partial<Deal>).totalFee = derivedTotalFee;
        }
        await updateDealInDb(prev.id, patch);
      });
      
      return updated;
    });
  };

  const handleUndo = () => {
    if (editHistory.length === 0) return;
    
    const lastEdit = editHistory[editHistory.length - 1];
    setDeal(lastEdit.deal);
    setEditHistory(history => history.slice(0, -1));
    
    toast({
      title: "Change undone",
      description: `Reverted ${lastEdit.field} to previous value.`,
    });
  };

  return (
    <>
      <Helmet>
        <title>{deal.name} - naitive</title>
        <meta name="description" content={`Deal details for ${deal.name} with ${deal.company}`} />
      </Helmet>

      {/* Delete Deal Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{isAdmin ? 'Delete or Archive Deal?' : 'Archive Deal?'}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                What would you like to do with <strong>{deal.company}</strong>?
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Archive className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <span className="font-medium">Archive</span> - Hide from active deals but keep all data. You can restore it later.
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-start gap-2">
                    <Trash2 className="h-4 w-4 mt-0.5 text-destructive" />
                    <div>
                      <span className="font-medium">Delete</span> - Permanently remove the deal and all associated data. Cannot be undone.
                    </div>
                  </div>
                )}
              </div>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Only administrators can permanently delete deals.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isDeleting} className="sm:mr-auto">Cancel</AlertDialogCancel>
            {deal.status !== 'archived' && (
              <Button
                variant="outline"
                onClick={handleArchiveDeal}
                disabled={isDeleting}
                className="gap-2"
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            )}
            {isAdmin && (
              <AlertDialogAction 
                onClick={handleDeleteDeal}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Closing Date Sync Dialog */}
      <AlertDialog open={!!pendingClosingDateSync} onOpenChange={(open) => { if (!open) dismissClosingDateSync(); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Update Closing Date?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to update the deal's closing date to match the "Closed & Funded" milestone date ({pendingClosingDateSync ? format(new Date(pendingClosingDateSync + 'T00:00:00'), 'MMM d, yyyy') : ''})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingClosingDateSync) {
                updateDeal('closingDate', pendingClosingDateSync);
              }
              dismissClosingDateSync();
            }}>
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="bg-transparent relative">
        <GlobalSaveBar isAnySaving={isAnySaving} />
        <DealsHeader />

        <main className="container mx-auto max-w-7xl px-4 py-1 sm:px-6 lg:px-8 overflow-x-hidden">
          {/* Back button, alerts, and undo - side by side */}
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            {dealOrigin ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 shrink-0"
                onClick={handleSmartBack}
                title={dealOrigin.label}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{dealOrigin.label}</span>
                <span className="sm:hidden">Back</span>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="gap-2 shrink-0" asChild>
                <Link to={isFinServDeal ? "/finserv" : isNaitiveDeal ? "/naitive-pipeline" : "/deals"}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back to Pipeline</span>
                  <span className="sm:hidden">Back</span>
                </Link>
              </Button>
            )}

            {/* Proactive Alert Bar - inline */}
            <ProactiveAlertBar 
              deal={deal}
              checklistTotal={allChecklistItems.length}
              checklistComplete={0}
              outstandingItemsCount={outstandingItems.filter(i => !i.received && !i.approved).length}
              infoRequestCount={infoRequestActionCount}
              onNavigate={handleTabChange}
            />

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete or archive deal</TooltipContent>
              </Tooltip>
              {viewModified && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={saveViewPreferences}
                >
                  <Save className="h-4 w-4" />
                  Save View
                </Button>
              )}
              {editHistory.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleUndo}
                >
                  <Undo2 className="h-4 w-4" />
                  Undo ({editHistory.length})
                </Button>
              )}
            </div>
          </div>

          {/* Deal Pulse Dashboard - hidden per user request */}

          {/* Header Card */}
          <Card className="w-full mt-4 mb-6 border-[hsl(272,100%,80%,0.45)] shadow-[0_0_16px_hsl(272,100%,70%,0.12),0_8px_32px_hsl(0,0%,0%,0.5)]">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <InlineEditField
                    value={deal.company}
                    onSave={(value) => updateDeal('company', value)}
                    displayClassName="text-3xl sm:text-5xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white"
                  />
                  <BetaBadge featureKey="page_deal_detail" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-10 w-10 relative ${activeFlagCount > 0 ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                    title={activeFlagCount > 0 ? `${activeFlagCount} flag${activeFlagCount > 1 ? 's' : ''} for discussion` : 'Flag for discussion'}
                    onClick={() => setIsFlagDialogOpen(true)}
                  >
                    <Flag className={`h-5 w-5 ${activeFlagCount > 0 ? 'fill-current' : ''}`} />
                    {activeFlagCount > 1 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                        {activeFlagCount}
                      </span>
                    )}
                  </Button>
                  <FlagNoteDialog
                    dealId={deal.id}
                    dealName={deal.company}
                    isOpen={isFlagDialogOpen}
                    onClose={() => setIsFlagDialogOpen(false)}
                    onFlagCountChange={setActiveFlagCount}
                  />
                  <HubSpotDealBadge dealId={deal.id} />
                </div>
                <InlineEditField
                  value={formatValue(deal.value)}
                  onSave={(value) => updateDeal('value', parseValue(value))}
                  displayClassName="text-3xl sm:text-5xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white"
                />
              </div>
              <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={deal.status}
                  onValueChange={(value: DealStatus) => updateDeal('status', value)}
                >
                  <SelectTrigger className={`w-auto ${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg h-6 px-2`}>
                    <SelectValue>
                      {STATUS_CONFIG[deal.status]?.label || deal.status}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {deal.status === 'archived' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={handleRestoreFromArchive}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore from Archive
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-lg border gap-1">
                      {getStageConfigForDeal(deal.stage, deal.pipelineId).label}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-popover min-w-[200px] max-h-[300px] overflow-y-auto">
                    <DropdownMenuLabel className="text-xs">Stage</DropdownMenuLabel>
                    {(() => {
                      const dealPipeline = deal.pipelineId ? pipelines.find(p => p.id === deal.pipelineId) : null;
                      const stagesForDeal = dealPipeline?.stages?.length ? dealPipeline.stages : dealStages;
                      return stagesForDeal.map((stage) => (
                        <DropdownMenuItem
                          key={stage.id}
                          onClick={() => updateDeal('stage', stage.id)}
                          className={cn("text-xs", deal.stage === stage.id && "bg-accent font-medium")}
                        >
                          {stage.label}
                        </DropdownMenuItem>
                      ));
                    })()}
                    {pipelines.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-xs">
                            <GitBranch className="h-3 w-3 mr-2" />
                            Move to Pipeline
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover min-w-[180px]">
                            {pipelines.map((pipeline) => (
                              <DropdownMenuSub key={pipeline.id}>
                                <DropdownMenuSubTrigger
                                  className={cn("text-xs", deal.pipelineId === pipeline.id && "bg-accent font-medium")}
                                >
                                  {pipeline.name}
                                  {deal.pipelineId === pipeline.id && (
                                    <span className="ml-auto text-[10px] text-muted-foreground">(current)</span>
                                  )}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="bg-popover min-w-[160px]">
                                  <DropdownMenuLabel className="text-xs">Select starting stage</DropdownMenuLabel>
                                  {(pipeline.stages?.length ? pipeline.stages : dealStages).map((stage) => (
                                    <DropdownMenuItem
                                      key={stage.id}
                                      className="text-xs"
                                      onClick={() => {
                                        updateDeal('pipelineId', pipeline.id);
                                        updateDeal('stage', stage.id);
                                        toast({
                                          title: 'Pipeline changed',
                                          description: `Moved to "${pipeline.name}" → ${stage.label}`,
                                        });
                                      }}
                                    >
                                      {stage.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DealUpdatesUnified
                  activities={activityLogs}
                  isLoadingActivities={isLoadingActivities}
                  timeAgoText={timeAgoData.text}
                  highlightClass={timeAgoData.highlightClass}
                  statusNotes={statusNotes}
                  onDeleteNote={deleteStatusNote}
                />
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-muted-foreground">Close:</span>
                  <input
                    type="date"
                    value={deal.closingDate || ''}
                    onChange={(e) => updateDeal('closingDate', e.target.value || null)}
                    className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors p-0 h-auto"
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-t border-border mt-4 pt-4">
                <div className="w-full sm:w-[93%] flex flex-col gap-1">
                  <div className="flex items-start gap-2">
                    <RichTextInlineEdit
                      value={deal.notes || ''}
                      onSave={(value) => {
                        const oldNotes = deal.notes || '';
                        // Update deal notes FIRST to prevent realtime refetch race condition
                        updateDeal('notes', value);
                        // Then save previous note to history (no await - fire and forget)
                        if (oldNotes && oldNotes.trim() && oldNotes !== '<p></p>' && value !== oldNotes) {
                          addStatusNote(oldNotes.trim());
                        }
                      }}
                      onExplicitSave={(value) => {
                        // Only check for NEW mentions (not ones already in the saved text)
                        const oldMentions = extractMentionsFromHtml(deal.notes || '');
                        const allMentions = extractMentionsFromHtml(value);
                        const oldIds = new Set(oldMentions.map(m => m.id));
                        const freshMentions = allMentions.filter(m => !oldIds.has(m.id));
                        if (freshMentions.length > 0) {
                          setMentionTaskUsers(freshMentions);
                          setMentionNoteContext(value);
                          setIsTaskDialogOpen(true);
                        }
                      }}
                      placeholder="Click to add status notes..."
                      displayClassName="text-lg text-foreground/90"
                      autoSave
                      autoSaveDelay={1500}
                      mentionUsers={mentionUsers}
                      bulletMode
                    />
                  </div>
                  {deal.notesUpdatedAt && (
                    <p className="text-xs text-muted-foreground/70 pl-6">
                      Last updated {format(new Date(deal.notesUpdatedAt), 'MMM d, yyyy')} at {format(new Date(deal.notesUpdatedAt), 'h:mm a')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {deal.manager && (
                    <span className="text-sm text-white">{deal.manager}</span>
                  )}
                  {!isSimplifiedDeal && companyFeatures.deal_memo_enabled && hasPageAccess('deal_memo') && (
                    <DealMemoDialog dealId={deal.id} companyName={deal.company} dealNarrative={deal.narrative} onGoToDataRoom={() => handleTabChange('data-room')} />
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 min-w-0 overflow-hidden">
            {/* Main Content */}
            <div className="flex flex-col gap-6 min-w-0 w-full">
              {/* Tab Navigation */}
              <Tabs value={dealInfoTab} onValueChange={(v) => handleTabChange(v as 'deal-info' | 'lenders' | 'deal-management' | 'deal-writeup' | 'data-room' | 'deal-space' | 'communication')}>
                <div className="flex items-center gap-2 min-w-0 w-full overflow-x-auto overflow-y-visible flex-nowrap scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                  
                  
                  <HintTooltip
                    hint="Use these tabs to navigate a deal: Deal Space for AI insights, Deal Information for key details, Lenders for tracking, Deal Management for tasks, Deal Write Up for the memo, Data Room for documents, and Emails for correspondence."
                    visible={isHintVisible('deal-tabs')}
                    onDismiss={() => dismissHint('deal-tabs')}
                    side="bottom"
                  >
                    <TabsList className="inline-flex h-8 items-center justify-start rounded-md bg-transparent p-0 text-muted-foreground overflow-x-auto min-w-0 flex-shrink scrollbar-none gap-0" style={{ scrollbarWidth: 'none' }}>
                    {hasDealSpaceAccess && !isSimplifiedDeal && (
                    <TabsTrigger value="deal-space" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      <Sparkles className="h-3.5 w-3.5" />
                      Deal Space
                      <BetaBadge featureKey="page_deal_space" />
                    </TabsTrigger>
                    )}
                    <TabsTrigger value="deal-info" className="whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">Deal Info</TabsTrigger>
                    {!isSimplifiedDeal && (
                    <TabsTrigger value="lenders" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      Lenders
                      {deal.lenders && deal.lenders.length > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                          {deal.lenders.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    )}
                    {!isSimplifiedDeal && hasDealManagementAccess && (
                    <TabsTrigger value="deal-management" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      Management
                      {infoRequestActionCount > 0 && (
                        <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                          {infoRequestActionCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    )}
                    {!isSimplifiedDeal && (
                    <TabsTrigger value="deal-writeup" className="whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">Write Up</TabsTrigger>
                    )}
                    {!isSimplifiedDeal && (
                    <TabsTrigger value="data-room" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      Data Room
                      {attachments.length > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                          {attachments.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    )}
                    <TabsTrigger value="activity-log" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      <History className="h-3.5 w-3.5" />
                      Activity
                    </TabsTrigger>
                    <TabsTrigger value="crm-search" className="gap-1.5 whitespace-nowrap flex-shrink-0 px-3 h-8 text-sm">
                      <Search className="h-3.5 w-3.5" />
                      CRM Search
                    </TabsTrigger>
                  </TabsList>
                  </HintTooltip>
                   <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                    <CreateTaskButton dealId={id!} dealName={deal?.company} />
                    {hasNaitivePipelineAccess && <EmailPromptCenterButton dealId={id!} dealName={deal?.company} />}
                    {!isSimplifiedDeal && companyFeatures.agreement_icon_visible && hasPageAccess('agreement_drafter') && (
                      <AgreementDrafterDialog dealId={deal.id} companyName={deal.company} companyShort={deal.company?.split(' ')[0]} />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative overflow-hidden h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]" title="Status Report">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => setShowStatusReportPreview(true)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          await exportStatusReportToWord(deal, configuredStages, configuredSubstages, outstandingItems);
                          toast({ title: "Word document exported", description: "Status report exported to Word document." });
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as Word
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative overflow-hidden h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]" title="Export">
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => {
                          exportDealToCSV(deal);
                          toast({ title: "CSV exported", description: "Deal data exported to CSV file." });
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          exportDealToPDF(deal);
                          toast({ title: "PDF exported", description: "Deal report exported to PDF." });
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          await exportDealToWord(deal);
                          toast({ title: "Word document exported", description: "Deal report exported to Word document." });
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export as Word
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <TabsContent value="deal-info" className={cn("mt-6 space-y-3", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-info-${tabDirection}`}>
                  {/* Milestones Card - hidden for naitive pipeline deals */}
                  {!isSimplifiedDeal && (
                  <Card>
                    <CardContent className="pt-2 pb-2">
                      <DealMilestones
                        milestones={dbMilestones}
                        onAdd={addMilestone}
                        onUpdate={updateMilestone}
                        onDelete={deleteMilestone}
                        onReorder={reorderMilestones}
                      />
                    </CardContent>
                  </Card>
                  )}

                  {/* Naitive pipeline stage milestones */}
                  {isNaitiveDeal && deal && (
                    <NaitiveStageMilestonesSection dealId={deal.id} stage={deal.stage} />
                  )}

                  <div className="flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setIsPanelReorderDialogOpen(true)}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Panels rendered in custom order - only visible panels */}
                  {visiblePanels.reduce((acc: React.ReactNode[], panelId, index) => {
                    // Pair panels together for 2-column layout
                    const nextPanelId = visiblePanels[index + 1];
                    
                    // Only process even indices to create pairs
                    if (index % 2 !== 0) return acc;
                    
                    const renderPanel = (id: DealPanelId) => {
                      switch (id) {
                        case 'ai-research':
                          return (
                            <Collapsible key={id} open={isResearchPanelOpen} onOpenChange={setIsResearchPanelOpen} className="h-full">
                              <Card className="h-full flex flex-col">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        <Search className="h-4 w-4" />
                                        AI Research
                                      </CardTitle>
                                      {isResearchPanelOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex-1 flex flex-col">
                                  <CardContent className="pt-0 flex-1">
                                    <DealResearchPanel
                                      dealId={deal.id}
                                      companyName={deal.company}
                                      companyUrl={deal.companyUrl}
                                      industry={deal.dealTypes?.[0]}
                                      dealValue={deal.value}
                                      lenders={deal.lenders?.map(l => ({ name: l.name })) || []}
                                    />
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          );
                        case 'ai-assistant':
                          return (
                            <Collapsible key={id} open={isAssistantPanelOpen} onOpenChange={setIsAssistantPanelOpen} className="h-full">
                              <Card className="h-full flex flex-col">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        <MessageSquare className="h-4 w-4" />
                                        AI Deal Assistant
                                      </CardTitle>
                                      {isAssistantPanelOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex-1 flex flex-col">
                                  <CardContent className="pt-0 flex-1">
                                    <DealAssistantPanel
                                      dealContext={{
                                        company: deal.company,
                                        value: deal.value,
                                        stage: deal.stage,
                                        status: deal.status,
                                        manager: deal.manager,
                                        lenders: deal.lenders?.map(l => ({ name: l.name, stage: l.stage, notes: l.notes })),
                                        milestones: dbMilestones?.map(m => ({ title: m.title, completed: m.completed, dueDate: m.dueDate })),
                                        notes: deal.notes,
                                      }}
                                    />
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          );
                        case 'ai-activity-summary':
                          return (
                            <Collapsible key={id} open={isActivitySummaryOpen} onOpenChange={setIsActivitySummaryOpen} className="h-full">
                              <Card className="h-full flex flex-col">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        AI Activity Summary
                                      </CardTitle>
                                      {isActivitySummaryOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex-1 flex flex-col">
                                  <CardContent className="pt-0 flex-1">
                                    <ActivitySummaryPanel
                                      dealInfo={{
                                        company: deal.company,
                                        value: deal.value,
                                        stage: deal.stage,
                                        status: deal.status,
                                      }}
                                      activities={activityLogs.map(log => ({
                                        type: log.activity_type,
                                        description: log.description,
                                        timestamp: format(new Date(log.created_at), 'MMM d, h:mm a'),
                                      }))}
                                      lenders={deal.lenders?.map(l => ({
                                        name: l.name,
                                        stage: l.stage,
                                        updatedAt: l.updatedAt,
                                      })) || []}
                                      milestones={dbMilestones?.map(m => ({
                                        title: m.title,
                                        completed: m.completed,
                                        dueDate: m.dueDate,
                                      })) || []}
                                    />
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          );
                        case 'ai-suggestions':
                          return (
                            <Collapsible key={id} open={isSuggestionsPanelOpen} onOpenChange={setIsSuggestionsPanelOpen} className="h-full">
                              <Card className="h-full flex flex-col">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        AI Smart Suggestions
                                      </CardTitle>
                                      {isSuggestionsPanelOpen ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex-1 flex flex-col">
                                  <CardContent className="pt-0 flex-1">
                                    <ContextualSuggestionsPanel
                                      deal={{
                                        id: deal.id,
                                        company: deal.company,
                                        stage: deal.stage,
                                        status: deal.status,
                                        updatedAt: deal.updatedAt,
                                        lenders: deal.lenders?.map(l => ({
                                          id: l.id,
                                          name: l.name,
                                          stage: l.stage,
                                          updatedAt: l.updatedAt,
                                          notes: l.notes,
                                        })),
                                        milestones: dbMilestones?.map(m => ({
                                          id: m.id,
                                          title: m.title,
                                          completed: m.completed,
                                          dueDate: m.dueDate,
                                        })),
                                        notes: deal.notes,
                                      }}
                                    />
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          );
                        case 'deal-information': {
                          const renderDealInfoField = (fieldId: DealInfoFieldId) => {
                            if (!isDealInfoFieldVisible(fieldId)) return null;
                            switch (fieldId) {
                              case 'narrative':
                                return (
                                  <div key={fieldId} className="space-y-1.5">
                                    <label className="text-sm text-muted-foreground">Narrative</label>
                                    <DebouncedTextarea
                                      value={deal.narrative || ''}
                                      onValueChange={(value) => updateDeal('narrative', value)}
                                      placeholder="Enter deal narrative..."
                                      className="w-full min-h-[80px] resize-none"
                                      debounceMs={800}
                                      showSaveIndicator
                                    />
                                  </div>
                                );
                              case 'dealManager':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Deal Manager</span>
                                    <Select value={deal.manager} onValueChange={(value) => updateDeal('manager', value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select manager" /></SelectTrigger>
                                      <SelectContent>
                                        {memberOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'dealOwner':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Deal Owner</span>
                                    <Select value={deal.dealOwner || ''} onValueChange={(value) => updateDeal('dealOwner', value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select owner" /></SelectTrigger>
                                      <SelectContent>
                                        {memberOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'type':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Type</span>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-8 text-sm font-normal overflow-hidden">
                                          {deal.dealTypes && deal.dealTypes.length > 0 ? (
                                            <span className="flex gap-1 overflow-hidden min-w-0">
                                              {deal.dealTypes.map(typeId => {
                                                const typeConfig = availableDealTypes.find(t => t.id === typeId);
                                                return typeConfig ? (
                                                  <Badge key={typeId} variant="secondary" className="text-xs shrink-0">{typeConfig.label}</Badge>
                                                ) : null;
                                              })}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">Select types</span>
                                          )}
                                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-56 p-2" align="start">
                                        <div className="space-y-1">
                                          {availableDealTypes.map((type) => {
                                            const isSelected = deal.dealTypes?.includes(type.id) || false;
                                            return (
                                              <button
                                                key={type.id}
                                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                                                onClick={() => {
                                                  const currentTypes = deal.dealTypes || [];
                                                  const newTypes = isSelected
                                                    ? currentTypes.filter(t => t !== type.id)
                                                    : [...currentTypes, type.id];
                                                  updateDeal('dealTypes', newTypes);
                                                }}
                                              >
                                                <Checkbox checked={isSelected} className="pointer-events-none" />
                                                {type.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                );
                              case 'engagement':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Engagement</span>
                                    <Select value={deal.engagementType} onValueChange={(value: EngagementType) => updateDeal('engagementType', value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, config]) => (
                                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'exclusivity':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Exclusivity</span>
                                    <Select value={deal.exclusivity || ''} onValueChange={(value: ExclusivityType) => updateDeal('exclusivity', value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(EXCLUSIVITY_CONFIG).map(([key, config]) => (
                                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'companyUrl':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Company URL</span>
                                    <DebouncedInput
                                      value={deal.companyUrl || ''}
                                      onChange={(value) => updateDeal('companyUrl', String(value))}
                                      placeholder="https://example.com"
                                      className="w-full h-8 text-sm"
                                    />
                                  </div>
                                );
                              case 'businessModel':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Business Model</span>
                                    <Select value={deal.businessModel || ''} onValueChange={(value) => updateDeal('businessModel', value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select industry..." /></SelectTrigger>
                                      <SelectContent>
                                        {INDUSTRY_OPTIONS.map((industry) => (
                                          <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'clientContact':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground text-sm">Client Contact</span>
                                    <div className="min-w-0">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                                            <TooltipTrigger asChild>
                                              <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start h-8 px-3 font-normal text-sm overflow-hidden">
                                                  <span className="truncate">
                                                    {deal.contact || <span className="text-muted-foreground italic">Add contact</span>}
                                                  </span>
                                                </Button>
                                              </PopoverTrigger>
                                            </TooltipTrigger>
                                            {deal.contact && deal.contactInfo && (
                                              <TooltipContent side="left" className="max-w-[200px]">
                                                <p className="font-medium">{deal.contact}</p>
                                                <p className="text-xs text-muted-foreground">{deal.contactInfo}</p>
                                              </TooltipContent>
                                            )}
                                            <PopoverContent className="w-72 p-4 bg-popover" align="start">
                                              <div className="space-y-4">
                                                <div className="space-y-2">
                                                  <label className="text-sm font-medium">Contact Name</label>
                                                  <DebouncedInput
                                                    value={deal.contact || ''}
                                                    onChange={(value) => updateDeal('contact', String(value))}
                                                    onSave={() => setContactPopoverOpen(false)}
                                                    placeholder="Enter contact name"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <label className="text-sm font-medium">Contact Info</label>
                                                  <DebouncedInput
                                                    value={deal.contactInfo || ''}
                                                    onChange={(value) => updateDeal('contactInfo', String(value))}
                                                    onSave={() => setContactPopoverOpen(false)}
                                                    placeholder="Email or phone number"
                                                  />
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                );
                              case 'referralSource':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Referral Source</span>
                                    <ReferralSourceInput
                                      value={deal.referredBy || null}
                                      onChange={(referrer) => updateDeal('referredBy', referrer)}
                                      className="[&_input]:h-8 [&_input]:text-sm"
                                    />
                                  </div>
                                );
                              case 'analyst':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Analyst</span>
                                    <Select value={deal.analyst || ''} onValueChange={(value: string) => updateDeal('analyst', value === '__none__' ? '' : value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select analyst..." /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">None</SelectItem>
                                        {members.map((member) => (
                                          <SelectItem key={member.id} value={member.display_name || member.user_id}>
                                            {member.display_name || 'Unknown'}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'sourcedVia':
                                return (
                                  <div key={fieldId} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                    <span className="text-muted-foreground text-sm">Sourced Via</span>
                                    <Select value={deal.sourcedVia || ''} onValueChange={(value: string) => updateDeal('sourcedVia', value === '__none__' ? '' : value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select source..." /></SelectTrigger>
                                      <SelectContent side="bottom" align="start">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {[
                                          'Email Campaign',
                                          'LinkedIn Campaign',
                                          'Inbound',
                                          'Paid',
                                          'Outsourced Sales Group',
                                          'Internal',
                                          'Event',
                                          'Channel Partner',
                                          'Referral - Bank',
                                          'Referral - Lender',
                                          'Referral - Service Provider',
                                          'Referral - Client',
                                          'Referral - Personal Connection',
                                        ].map((option) => (
                                          <SelectItem key={option} value={option}>{option}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              case 'hoursAndFees':
                                if (isSimplifiedDeal) return null;
                                return (
                                  <div key={fieldId}>
                                    <Separator className="my-4" />
                                    <div className="space-y-3">
                                      <h4 className="text-sm font-medium flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        Hours & Fees
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Hours */}
                                        <div className="space-y-3 min-w-0">
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Pre-Signing</span>
                                            <DebouncedInput type="number" step="0.25" value={deal.preSigningHours ?? ''} onChange={(value) => updateDeal('preSigningHours', Number(value) || 0)} placeholder="0" className="w-full h-8 text-sm" min={0} />
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Post-Signing</span>
                                            <DebouncedInput type="number" step="0.25" value={deal.postSigningHours ?? ''} onChange={(value) => updateDeal('postSigningHours', Number(value) || 0)} placeholder="0" className="w-full h-8 text-sm" min={0} />
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Total Hours</span>
                                            <span className="text-sm font-medium h-8 flex items-center">
                                              {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)).toLocaleString()}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Revenue / Hour</span>
                                            <span className="text-sm font-medium h-8 flex items-center">
                                              {(() => {
                                                const totalHours = (deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0);
                                                if (totalHours === 0) return '-';
                                                const revenuePerHour = (deal.totalFee ?? 0) / totalHours;
                                                return `$${revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                                              })()}
                                            </span>
                                          </div>
                                        </div>
                                        {/* Fees */}
                                        <div className="space-y-3 min-w-0">
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Retainer Fee</span>
                                            <div className="relative w-full">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                              <Input
                                                type="text"
                                                value={deal.retainerFee ? Math.round(deal.retainerFee).toLocaleString() : ''}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/,/g, '');
                                                  if (raw === '' || /^\d+$/.test(raw)) updateDeal('retainerFee', raw ? Number(raw) : 0);
                                                }}
                                                placeholder="0"
                                                className="pl-5 h-8 text-sm w-full"
                                              />
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Milestone Fee</span>
                                            <div className="relative w-full">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                              <Input
                                                type="text"
                                                value={deal.milestoneFee ? Math.round(deal.milestoneFee).toLocaleString() : ''}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/,/g, '');
                                                  if (raw === '' || /^\d+$/.test(raw)) updateDeal('milestoneFee', raw ? Number(raw) : 0);
                                                }}
                                                placeholder="0"
                                                className="pl-5 h-8 text-sm w-full"
                                              />
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Success Fee %</span>
                                            <div className="flex items-center gap-2">
                                              <div className="relative w-16 shrink-0">
                                                <Input
                                                  type="number"
                                                  value={deal.successFeePercent ?? ''}
                                                  onChange={(e) => updateDeal('successFeePercent', e.target.value ? Number(e.target.value) : 0)}
                                                  placeholder="0"
                                                  className="pr-6 h-8 text-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                  min={0}
                                                  max={100}
                                                  step={0.1}
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                                              </div>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                   <span className="text-sm text-muted-foreground whitespace-nowrap flex-1 text-right cursor-help">
                                                    <span className="font-medium text-foreground">{(() => {
                                                      const total = deal.totalFee ?? 0;
                                                      const milestone = deal.milestoneFee ?? 0;
                                                      const retainer = deal.retainerFee ?? 0;
                                                      const closing = Math.max(0, total - milestone - retainer);
                                                      if (closing >= 1_000_000) return `$${(closing / 1_000_000).toFixed(1)}M`;
                                                      if (closing >= 1_000) return `$${(closing / 1_000).toFixed(1)}K`;
                                                      return `$${Math.round(closing).toLocaleString()}`;
                                                    })()}</span>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="max-w-[200px] text-center">
                                                  <p className="text-xs">Amount due at closing of the facility, less fees already paid</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                                            <span className="text-muted-foreground text-sm">Total Fee</span>
                                            <div className="relative w-full">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                              <Input
                                                type="text"
                                                value={deal.totalFee ? Math.round(deal.totalFee).toLocaleString() : ''}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/,/g, '');
                                                  if (raw === '' || /^\d+$/.test(raw)) updateDeal('totalFee', raw ? Number(raw) : 0);
                                                }}
                                                placeholder="0"
                                                className="pl-5 h-8 text-sm w-full"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              default:
                                return null;
                            }
                          };

                          // Separate fields into full-width, left-column, and right-column based on config order
                          const orderedMainFields = dealInfoFieldOrder.filter(
                            fId => fId !== 'narrative' && fId !== 'hoursAndFees' && isDealInfoFieldVisible(fId)
                          );
                          const leftFields = orderedMainFields.filter(fId => {
                            const def = DEAL_INFO_FIELD_DEFINITIONS.find(d => d.id === fId);
                            return def?.column === 'left';
                          });
                          const rightFields = orderedMainFields.filter(fId => {
                            const def = DEAL_INFO_FIELD_DEFINITIONS.find(d => d.id === fId);
                            return def?.column === 'right';
                          });

                          return (
                            <Card key={id}>
                              <CardHeader className="flex flex-row items-center justify-between py-4">
                                <CardTitle className="text-lg">Deal Information</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {isDealInfoFieldVisible('narrative') && renderDealInfoField('narrative')}
                                
                                {(leftFields.length > 0 || rightFields.length > 0) && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3 min-w-0">
                                      {leftFields.map(fId => renderDealInfoField(fId))}
                                    </div>
                                    <div className="space-y-3 min-w-0">
                                      {rightFields.map(fId => renderDealInfoField(fId))}
                                    </div>
                                  </div>
                                )}
                                
                                {isDealInfoFieldVisible('hoursAndFees') && renderDealInfoField('hoursAndFees')}

                                {/* Pipeline-specific fields (e.g. FinServ Details).
                                    Driven by src/config/pipelineFieldSchemas.ts so the
                                    create-deal form and detail view stay in sync. */}
                                <PipelineSpecificFields
                                  deal={deal}
                                  onUpdate={(field, value) => updateDeal(field as any, value)}
                                />
                              </CardContent>
                            </Card>
                          );
                        }
                        case 'outstanding-items':
                          return (
                            <div key={id} className="space-y-6">
                              <OutstandingItems
                                items={outstandingItems}
                                lenderNames={deal.lenders?.filter(l => {
                                  const stageConfig = configuredStages.find(s => s.id === l.stage);
                                  return stageConfig?.group !== 'passed';
                                }).map(l => l.name) || []}
                                companyName={company?.name}
                                onAdd={addOutstandingItem}
                                onUpdate={updateOutstandingItem}
                                onDelete={deleteOutstandingItem}
                                onBulkAdd={bulkAddOutstandingItemsDb}
                                onReorder={reorderOutstandingItemsDb}
                                teamMembers={teamMembers}
                              />
                            </div>
                          );
                        default:
                          return null;
                      }
                    };

                    return [
                      ...acc,
                      <div key={`row-${index}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        {renderPanel(panelId)}
                        {nextPanelId && renderPanel(nextPanelId)}
                      </div>
                    ];
                  }, [])}

                  {/* Unified Timeline & Benchmarking */}
                  {isPanelVisible('activity-timeline') && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                    <Card className="lg:col-span-2">
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Activity Timeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <UnifiedTimeline 
                          events={(activityLogs || []).map(log => ({
                            id: log.id,
                            type: log.activity_type?.includes('lender') ? 'lender_update' as const 
                              : log.activity_type?.includes('stage') ? 'stage_change' as const
                              : log.activity_type?.includes('milestone') ? 'milestone' as const
                              : log.activity_type?.includes('attachment') || log.activity_type?.includes('upload') ? 'document' as const
                              : log.activity_type?.includes('note') ? 'note' as const
                              : log.activity_type?.includes('email') ? 'email' as const
                              : 'general' as const,
                            description: log.description,
                            timestamp: log.created_at,
                            actor: log.user_display_name || undefined,
                          }))}
                          maxHeight="400px"
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Benchmarks
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <DealBenchmarkPanel
                          currentDeal={{
                            id: deal.id,
                            stage: deal.stage,
                            status: deal.status,
                            value: deal.value,
                            createdAt: deal.createdAt,
                            updatedAt: deal.updatedAt,
                            lenderCount: deal.lenders?.length || 0,
                            milestoneProgress: dbMilestones.length === 0 ? 0 : Math.round((dbMilestones.filter(m => m.completed).length / dbMilestones.length) * 100),
                          }}
                          portfolioDeals={deals.map(d => ({
                            id: d.id,
                            stage: d.stage,
                            status: d.status,
                            value: d.value,
                            createdAt: d.createdAt,
                            updatedAt: d.updatedAt,
                            lenderCount: d.lenders?.length || 0,
                            milestoneProgress: 0,
                          }))}
                        />
                      </CardContent>
                    </Card>
                  </div>
                  )}


                </TabsContent>

                <TabsContent value="lenders" className={cn("mt-6", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`lenders-${tabDirection}`}>
              <div className="flex gap-6">
              <div className="w-[70%] space-y-6">
              {/* Lenders Card */}
                <Card className="max-h-[750px] flex flex-col">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">
                            Lenders
                          </CardTitle>
                          {deal.lenders && deal.lenders.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground">
                              ({deal.lenders.length})
                            </span>
                          )}
                        </div>
                      <LenderSearchInput
                        lenderNames={lenderNames}
                        existingLenderNames={existingLenderNames}
                        onAddLender={addLender}
                        isLoadingLenders={masterLendersLoading || masterLendersLoadingMore}
                      />
                      <LenderDirectoryDialog
                        existingLenderNames={existingLenderNames}
                        onAddLender={addLender}
                        onRemoveLender={removeLenderFromDeal}
                        dealLenders={(deal.lenders || []).map(l => ({ id: l.id, name: l.name }))}
                      />
                      <div className="flex items-center gap-2 ml-auto">
                      {deal.lenders && deal.lenders.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                              <Filter className="h-3.5 w-3.5" />
                              Stage
                              {(lenderGroupFilters.size > 0 || lenderStageFilters.size > 0) && (
                                <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] leading-none font-medium">
                                  {lenderGroupFilters.size + lenderStageFilters.size}
                                </span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <div className="space-y-1">
                              <button
                                onClick={() => { setLenderGroupFilters(new Set()); setLenderStageFilters(new Set()); }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors",
                                  lenderGroupFilters.size === 0 && lenderStageFilters.size === 0
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                              >
                                All
                              </button>
                              {stageGroups.map((group) => {
                                const groupStages = configuredStages.filter(s => s.group === group.id);
                                const count = deal.lenders?.filter(l => {
                                  const stage = configuredStages.find(s => s.id === l.stage);
                                  return stage?.group === group.id;
                                }).length || 0;
                                const isGroupActive = lenderGroupFilters.has(group.id);
                                return (
                                  <div key={group.id}>
                                    <button
                                      onClick={() => {
                                        setLenderGroupFilters(prev => {
                                          const next = new Set(prev);
                                          if (next.has(group.id)) {
                                            next.delete(group.id);
                                          } else {
                                            next.add(group.id);
                                          }
                                          return next;
                                        });
                                        // Clear individual stage filters for this group when toggling group
                                        setLenderStageFilters(prev => {
                                          const next = new Set(prev);
                                          groupStages.forEach(s => next.delete(s.id));
                                          return next;
                                        });
                                      }}
                                      className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors",
                                        isGroupActive
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <Checkbox checked={isGroupActive} className="h-3.5 w-3.5 pointer-events-none" />
                                      <span className={`h-2 w-2 rounded-full ${group.color}`} />
                                      {group.label}
                                      {count > 0 && <span className="ml-auto font-medium">{count}</span>}
                                    </button>
                                    {/* Individual stages within this group */}
                                    {groupStages.map(stage => {
                                      const stageCount = deal.lenders?.filter(l => l.stage === stage.id).length || 0;
                                      const isStageActive = lenderStageFilters.has(stage.id);
                                      return (
                                        <button
                                          key={stage.id}
                                          onClick={() => {
                                            setLenderStageFilters(prev => {
                                              const next = new Set(prev);
                                              if (next.has(stage.id)) {
                                                next.delete(stage.id);
                                              } else {
                                                next.add(stage.id);
                                              }
                                              return next;
                                            });
                                            // Clear group filter if selecting individual stages
                                            setLenderGroupFilters(prev => {
                                              const next = new Set(prev);
                                              next.delete(group.id);
                                              return next;
                                            });
                                          }}
                                          className={cn(
                                            "w-full flex items-center gap-2 pl-7 pr-2 py-1 text-[11px] rounded-md transition-colors",
                                            isStageActive
                                              ? "bg-accent/70 text-accent-foreground"
                                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                          )}
                                        >
                                          <Checkbox checked={isStageActive} className="h-3 w-3 pointer-events-none" />
                                          <span className="truncate">{stage.label}</span>
                                          {stageCount > 0 && <span className="ml-auto font-medium tabular-nums">{stageCount}</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                          {hasLenderMatchingAccess && (
                            <LenderSuggestionsPanel
                              dealId={id}
                              criteria={{
                                industry: savedMatchingCriteria.industry || dealWriteUpData.industries?.join(', ') || undefined,
                                dealValue: deal.value || undefined,
                                capitalAsk: dealWriteUpData.capitalAsk || undefined,
                                dealTypes: deal.dealTypes || dealWriteUpData.dealTypes || undefined,
                                geo: dealWriteUpData.location || undefined,
                                cashBurnOk: savedMatchingCriteria.cashBurnOk,
                                sponsorship: savedMatchingCriteria.sponsorship,
                              }}
                              existingLenderNames={deal.lenders?.map(l => l.name) || []}
                              onAddLender={addLender}
                            />
                          )}
                          <Select value={lenderSort} onValueChange={(v) => setLenderSort(v as 'none' | 'updated-desc' | 'updated-asc' | 'stage-furthest' | 'stage-slowest')}>
                            <SelectTrigger className="h-8 w-[200px] text-xs">
                              <ArrowDownUp className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                              <SelectValue placeholder="Sort By" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Sort</SelectItem>
                              <SelectItem value="updated-desc">Last Updated: Newest to Oldest</SelectItem>
                              <SelectItem value="updated-asc">Last Updated: Oldest to Newest</SelectItem>
                              <SelectItem value="stage-furthest">Stage: Furthest to Slowest</SelectItem>
                              <SelectItem value="stage-slowest">Stage: Slowest to Furthest</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setIsLendersKanbanOpen(true)}
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                    <CardContent className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'transparent transparent' }} onMouseEnter={(e) => { e.currentTarget.style.scrollbarColor = 'hsl(var(--border)) transparent'; }} onMouseLeave={(e) => { e.currentTarget.style.scrollbarColor = 'transparent transparent'; }}>
                  <div className="space-y-4">
                    {deal.lenders && deal.lenders.length > 0 && (
                      <>
                        {lenderGroupFilters.size === 0 && lenderStageFilters.size === 0 ? (
                          // Flat list when "All" is selected - with drag and drop
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleLenderDragEnd}
                          >
                            <SortableContext
                              items={filteredSortedLenders.map(l => l.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {filteredSortedLenders.map((lender, index) => {
                                const lenderOutstandingItems = outstandingItems.filter(
                                  item => Array.isArray(item.requestedBy) 
                                    ? item.requestedBy.includes(lender.name)
                                    : item.requestedBy === lender.name
                                );
                                const staleStatus = isLenderStale(lender);
                                const shouldAnimate = highlightStale && staleStatus.isStale;
                                return (
                                  <SortableLenderItem key={lender.id} lender={lender}>
                                    <div
                                      data-lender-id={lender.id}
                                      data-lender-stale={staleStatus.isStale ? 'true' : undefined}
                                      className={cn(
                                        'rounded-xl border border-blue-500/25 bg-gradient-to-br from-[hsl(220,30%,10%)] to-[hsl(260,15%,5%)] p-4 shadow-md hover:shadow-lg transition-all',
                                        staleStatus.isStale && staleStatus.isUrgent && 'border-destructive/40 shadow-[0_0_12px_2px_hsl(var(--destructive)/0.15)]',
                                        staleStatus.isStale && !staleStatus.isUrgent && 'border-warning/40 shadow-[0_0_12px_2px_hsl(var(--warning)/0.15)]',
                                        shouldAnimate && 'animate-pulse-highlight'
                                      )}>
                                      <div className="flex gap-3">
                                        <div className="flex-1 min-w-0">
                                      <div className="grid grid-cols-[160px_160px_140px_auto_1fr] items-center gap-3">
                                  <div className="flex items-center gap-1 group/lender -ml-1">
                                    {scoreConfig.enabled && lender.score != null && (
                                      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 h-4 shrink-0" style={getScoreStyles(lender.score, scoreConfig).badge}>
                                        {lender.score}
                                      </Badge>
                                    )}
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button className="opacity-0 group-hover/lender:opacity-100 transition-opacity text-muted-foreground hover:text-destructive -ml-0.5 shrink-0">
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove lender</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to remove {lender.name} from this deal?
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => removeLenderFromDeal(lender.id)}>Remove</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                    <div className="flex flex-col min-w-0">
                                      <button 
                                        className="font-medium truncate text-left hover:text-primary hover:underline cursor-pointer"
                                        onClick={() => setSelectedLenderName(lender.name)}
                                      >
                                        {lender.name}
                                      </button>
                                      {lender.trackingStatus !== 'passed' && (() => {
                                        const timeInfo = getLenderTimeInfo(lender.updatedAt);
                                        return timeInfo.text ? (
                                          <span className={`text-[10px] text-muted-foreground ${isPostSubmissionDealStage(deal?.stage) ? timeInfo.highlightClass : ''}`}>
                                            {timeInfo.text}
                                          </span>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                  <Select
                                    value={lender.stage}
                                    onOpenChange={(open) => setLenderDropdownOpen(open)}
                                    onValueChange={(value: LenderStage) => {
                                      const newStage = configuredStages.find(s => s.id === value);
                                      if (newStage?.group === 'passed') {
                                        const currentStageConfig = configuredStages.find(s => s.id === lender.stage);
                                        const isAlreadyPassed = currentStageConfig?.group === 'passed' && value === lender.stage;
                                        setPendingPassStageChange({ lenderId: lender.id, newStageId: value, isEditing: isAlreadyPassed });
                                        // Pre-populate existing reasons when editing
                                        if (isAlreadyPassed && lender.passReason) {
                                          const existingReasonLabels = lender.passReason.split(', ').map(r => r.trim());
                                          const existingReasonIds = existingReasonLabels
                                            .map(label => passReasons.find(pr => pr.label === label)?.id)
                                            .filter(Boolean) as string[];
                                          setSelectedPassReasons(existingReasonIds);
                                        } else {
                                          setSelectedPassReasons([]);
                                        }
                                        setPassReasonDialogOpen(true);
                                      } else {
                                        // Update local state optimistically
                                        setDeal(prev => {
                                          if (!prev) return prev;
                                          const updatedLenders = prev.lenders?.map(l => 
                                            l.id === lender.id ? { ...l, stage: value, passReason: undefined, updatedAt: new Date().toISOString() } : l
                                          );
                                          return { ...prev, lenders: updatedLenders };
                                        });
                                        
                                        // Persist to database
                                        const newGroup = newStage?.group || 'active';
                                        withSavingAsync(`lender-stage-${lender.id}`, async () => {
                                          await updateLenderInDb(lender.id, { 
                                            stage: value, 
                                            trackingStatus: newGroup,
                                            passReason: undefined 
                                          });
                                        });
                                        
                                        // Check if lender moved to "term-sheets" stage - prompt for milestone completion
                                        if (value === 'term-sheets') {
                                          checkTermSheetMilestone(lender.name);
                                        }
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-secondary border-0 justify-start">
                                      <SelectValue>
                                        <span className="flex items-center gap-1.5">
                                          {(() => {
                                            const g = configuredStages.find(s => s.id === lender.stage)?.group;
                                            return (g === 'passed' || g === 'excluded') ? (
                                              <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                            ) : null;
                                          })()}
                                          {formatRenderedLenderStage(lender.stage)}
                                        </span>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {configuredStages.map((stage) => {
                                        const isCurrentPassedStage = stage.group === 'passed' && stage.id === lender.stage && lender.passReason;
                                        return (
                                          <SelectItem key={stage.id} value={stage.id}>
                                            <span className="flex items-center gap-1.5">
                                              {(stage.group === 'passed' || stage.group === 'excluded') && (
                                                <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                              )}
                                              {stage.label}
                                              {isCurrentPassedStage && (
                                                <span
                                                  className="ml-1 text-muted-foreground hover:text-foreground"
                                                  title="Edit pass reasons"
                                                  onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    // Close select and open edit dialog
                                                    const trigger = (e.target as HTMLElement).closest('[data-radix-collection-item]');
                                                    if (trigger) {
                                                      // Programmatically close select by blurring
                                                      (document.activeElement as HTMLElement)?.blur();
                                                    }
                                                    setPendingPassStageChange({ lenderId: lender.id, newStageId: lender.stage, isEditing: true });
                                                    const existingReasonLabels = lender.passReason!.split(', ').map(r => r.trim());
                                                    const existingReasonIds = existingReasonLabels
                                                      .map(label => passReasons.find(pr => pr.label === label)?.id)
                                                      .filter(Boolean) as string[];
                                                    setSelectedPassReasons(existingReasonIds);
                                                    setTimeout(() => setPassReasonDialogOpen(true), 100);
                                                  }}
                                                >
                                                  <Pencil className="h-3 w-3" />
                                                </span>
                                              )}
                                            </span>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={lender.substage || '__none__'}
                                    onOpenChange={(open) => setLenderDropdownOpen(open)}
                                    onValueChange={(value: LenderSubstage) => {
                                      const newSubstage = value === '__none__' ? undefined : value;
                                      
                                      // Update local state optimistically
                                      setDeal(prev => {
                                        if (!prev) return prev;
                                        const updatedLenders = prev.lenders?.map(l => 
                                          l.id === lender.id ? { ...l, substage: newSubstage, updatedAt: new Date().toISOString() } : l
                                        );
                                        return { ...prev, lenders: updatedLenders };
                                      });
                                      
                                      // Persist to database
                                      withSavingAsync(`lender-substage-${lender.id}`, async () => {
                                        await updateLenderInDb(lender.id, { substage: newSubstage });
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-muted/50 border-0 justify-start">
                                      <SelectValue placeholder="Milestone">
                                        {lender.substage ? formatRenderedLenderMilestone(lender.substage) : 'Milestone'}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">None</SelectItem>
                                      {configuredSubstages.map((substage) => (
                                        <SelectItem key={substage.id} value={substage.id}>
                                          {substage.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {/* NDA & Marketing Materials Status Icons */}
                                   <div className="flex items-center gap-1">
                                    {(() => {
                                      const summary = getLenderSummary(lender.name);
                                      return (
                                        <>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className={cn(
                                                "p-1 rounded",
                                                summary.hasNda 
                                                  ? "text-primary" 
                                                  : "text-muted-foreground/50"
                                              )}>
                                                <FileSignature className="h-4 w-4" />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{summary.hasNda ? 'NDA on file' : 'No NDA'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className={cn(
                                                "p-1 rounded",
                                                summary.hasMarketingMaterials 
                                                  ? "text-primary" 
                                                  : "text-muted-foreground/50"
                                              )}>
                                                <Megaphone className="h-4 w-4" />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{summary.hasMarketingMaterials ? 'Marketing materials on file' : 'No marketing materials'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                {/* Lender History Warning Hint */}
                                {(() => {
                                  const warning = lenderWarningsMap?.get(lender.name);
                                  if (!warning || warning.isDismissed) return null;
                                  return (
                                    <LenderHistoryHint
                                      warning={warning}
                                      dealId={deal.id}
                                      onViewHistory={() => setHistoryDrawerLender(lender.name)}
                                      className="mt-2"
                                    />
                                  );
                                })()}
                                <RequestedItemsSummary
                                  items={lenderOutstandingItems}
                                  lenderName={lender.name}
                                  onViewAll={() => setRequestedItemsDrawerLender(lender.name)}
                                />
                                {/* Lender Notes */}
                                <div className="ml-2 mt-2 space-y-1">
                                  <div className="flex items-start gap-2">
                                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-1.5 flex-shrink-0" />
                                    {lender.notesUpdatedAt && (
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1.5">
                                        {format(new Date(lender.notesUpdatedAt), 'MM-dd')}
                                      </span>
                                    )}
                                    <LenderNotesField
                                      lenderId={lender.id}
                                      initialValue={lender.notes || ''}
                                      onSave={commitLenderNotes}
                                      isSaving={isSaving(`lender-notes-${lender.id}`)}
                                      showSuccess={savedNotesFlash.has(lender.id)}
                                      onFocusChange={handleNotesFocusChange}
                                      className="min-h-[48px] h-12"
                                      rows={2}
                                    />
                                    {/* Expand button - shows popover with full notes */}
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button
                                          className="text-muted-foreground hover:text-foreground mt-1.5"
                                          title="Expand notes"
                                        >
                                          <Maximize2 className="h-3.5 w-3.5" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent 
                                        className="w-80 p-3" 
                                        side="right" 
                                        align="start"
                                      >
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">{lender.name} Notes</span>
                                            {lender.notesUpdatedAt && (
                                              <span className="text-[10px] text-muted-foreground">
                                                Updated {format(new Date(lender.notesUpdatedAt), 'MMM d, yyyy')}
                                              </span>
                                            )}
                                          </div>
                                          <LenderNotesField
                                            lenderId={lender.id}
                                            initialValue={lender.notes || ''}
                                            onSave={commitLenderNotes}
                                            isSaving={isSaving(`lender-notes-${lender.id}`)}
                                            showSuccess={savedNotesFlash.has(lender.id)}
                                            onFocusChange={handleNotesFocusChange}
                                            className="min-h-[120px]"
                                            rows={6}
                                          />
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  {/* Notes History - Collapsible list */}
                                  {lender.notesHistory && lender.notesHistory.length > 0 && (
                                    <Collapsible 
                                      open={expandedLenderHistory.has(lender.id)}
                                      onOpenChange={(open) => {
                                        setExpandedLenderHistory(prev => {
                                          const next = new Set(prev);
                                          if (open) {
                                            next.add(lender.id);
                                          } else {
                                            next.delete(lender.id);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="ml-5"
                                    >
                                      <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                                        <History className="h-3 w-3" />
                                        <span>{lender.notesHistory.length} previous note{lender.notesHistory.length > 1 ? "s" : ""}</span>
                                        {expandedLenderHistory.has(lender.id) ? (
                                          <ChevronUp className="h-3 w-3" />
                                        ) : (
                                          <ChevronDown className="h-3 w-3" />
                                        )}
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-1 space-y-1.5">
                                        {lender.notesHistory.map((historyItem, idx) => (
                                          <div key={historyItem.id || idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded px-2 py-1.5 group/note relative">
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                                              {format(new Date(historyItem.updatedAt), "MM-dd HH:mm")}
                                            </span>
                                            <p className="text-foreground/80 pr-5">{historyItem.text}</p>
                                            {historyItem.id && (
                                              <button
                                                onClick={() => deleteLenderNoteHistory(historyItem.id!, lender.id)}
                                                className="absolute top-1.5 right-1.5 opacity-0 group-hover/note:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                                        </div>
                                        {/* Create Task Button - top right */}
                                        <div className="flex items-start shrink-0">
                                          <CreateLenderTaskButton
                                            dealId={deal.id}
                                            lenderId={lender.id}
                                            lenderName={lender.name}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </SortableLenderItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        ) : (
                          // Grouped list when a specific group is selected
                          stageGroups
                            .filter(group => lenderGroupFilters.has(group.id))
                            .map(group => {
                              const groupLenders = filteredSortedLenders.filter(l => {
                                const stage = configuredStages.find(s => s.id === l.stage);
                                return stage?.group === group.id;
                              }) || [];
                              
                              if (groupLenders.length === 0) return null;
                              
                              return (
                                <div key={group.id} className="space-y-3">
                                  <div className="flex items-center gap-2 pb-1 border-b border-border">
                                    <span className={`h-2.5 w-2.5 rounded-full ${group.color}`} />
                                    <span className="text-sm font-medium text-muted-foreground">
                                      {group.label} ({groupLenders.length})
                                    </span>
                                  </div>
                                  {groupLenders.map((lender, index) => {
                                    const lenderOutstandingItems = outstandingItems.filter(
                                      item => Array.isArray(item.requestedBy) 
                                        ? item.requestedBy.includes(lender.name)
                                        : item.requestedBy === lender.name
                                    );
                                    return (
                                      <div key={lender.id} className="rounded-xl border border-blue-500/25 bg-gradient-to-br from-[hsl(220,30%,10%)] to-[hsl(260,15%,5%)] p-4 shadow-md hover:shadow-lg transition-all">
                                        <div className="grid grid-cols-[160px_160px_140px_1fr] items-center gap-3">
                                          <div className="flex items-center gap-1 group/lender -ml-1">
                                            {scoreConfig.enabled && lender.score != null && (
                                              <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 h-4 shrink-0" style={getScoreStyles(lender.score, scoreConfig).badge}>
                                                {lender.score}
                                              </Badge>
                                            )}
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild>
                                                <button className="opacity-0 group-hover/lender:opacity-100 transition-opacity text-muted-foreground hover:text-destructive -ml-0.5 shrink-0">
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              </AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader>
                                                  <AlertDialogTitle>Remove lender</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                    Are you sure you want to remove {lender.name} from this deal?
                                                  </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => removeLenderFromDeal(lender.id)}>Remove</AlertDialogAction>
                                                </AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                            <div className="flex flex-col min-w-0">
                                              <button 
                                                className="font-medium truncate text-left hover:text-primary hover:underline cursor-pointer"
                                                onClick={() => setSelectedLenderName(lender.name)}
                                              >
                                                {lender.name}
                                              </button>
                                              {lender.trackingStatus !== 'passed' && (() => {
                                                const timeInfo = getLenderTimeInfo(lender.updatedAt);
                                                return timeInfo.text ? (
                                                  <span className={`text-[10px] text-muted-foreground ${isPostSubmissionDealStage(deal?.stage) ? timeInfo.highlightClass : ''}`}>
                                                    {timeInfo.text}
                                                  </span>
                                                ) : null;
                                              })()}
                                            </div>
                                          </div>
                                          <Select
                                            value={lender.stage}
                                            onOpenChange={(open) => setLenderDropdownOpen(open)}
                                            onValueChange={(value: LenderStage) => {
                                              const newStage = configuredStages.find(s => s.id === value);
                                              if (newStage?.group === 'passed') {
                                                const currentStageConfig = configuredStages.find(s => s.id === lender.stage);
                                                const isAlreadyPassed = currentStageConfig?.group === 'passed' && value === lender.stage;
                                                setPendingPassStageChange({ lenderId: lender.id, newStageId: value, isEditing: isAlreadyPassed });
                                                if (isAlreadyPassed && lender.passReason) {
                                                  const existingReasonLabels = lender.passReason.split(', ').map(r => r.trim());
                                                  const existingReasonIds = existingReasonLabels
                                                    .map(label => passReasons.find(pr => pr.label === label)?.id)
                                                    .filter(Boolean) as string[];
                                                  setSelectedPassReasons(existingReasonIds);
                                                } else {
                                                  setSelectedPassReasons([]);
                                                }
                                                setPassReasonDialogOpen(true);
                                              } else {
                                                // Update local state optimistically
                                                setDeal(prev => {
                                                  if (!prev) return prev;
                                                  const updatedLenders = prev.lenders?.map(l => 
                                                    l.id === lender.id ? { ...l, stage: value, passReason: undefined, updatedAt: new Date().toISOString() } : l
                                                  );
                                                  return { ...prev, lenders: updatedLenders };
                                                });
                                                
                                                // Persist to database
                                                const newGroup = newStage?.group || 'active';
                                                withSavingAsync(`lender-stage-${lender.id}`, async () => {
                                                  await updateLenderInDb(lender.id, { 
                                                    stage: value, 
                                                    trackingStatus: newGroup,
                                                    passReason: undefined 
                                                  });
                                                });
                                                
                                                // Check if lender moved to "term-sheets" stage - prompt for milestone completion
                                                if (value === 'term-sheets') {
                                                  checkTermSheetMilestone(lender.name);
                                                }
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-secondary border-0 justify-start">
                                              <SelectValue>
                                                <span className="flex items-center gap-1.5">
                                                  {(() => {
                                                    const g = configuredStages.find(s => s.id === lender.stage)?.group;
                                                    return (g === 'passed' || g === 'excluded') ? (
                                                      <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                                    ) : null;
                                                  })()}
                                                  {formatRenderedLenderStage(lender.stage)}
                                                </span>
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              {configuredStages.map((stage) => {
                                                const isCurrentPassedStage = stage.group === 'passed' && stage.id === lender.stage && lender.passReason;
                                                return (
                                                  <SelectItem key={stage.id} value={stage.id}>
                                                    <span className="flex items-center gap-1.5">
                                                      {(stage.group === 'passed' || stage.group === 'excluded') && (
                                                        <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                                      )}
                                                      {stage.label}
                                                      {isCurrentPassedStage && (
                                                        <span
                                                          className="ml-1 text-muted-foreground hover:text-foreground"
                                                          title="Edit pass reasons"
                                                          onPointerDown={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            (document.activeElement as HTMLElement)?.blur();
                                                            setPendingPassStageChange({ lenderId: lender.id, newStageId: lender.stage, isEditing: true });
                                                            const existingReasonLabels = lender.passReason!.split(', ').map(r => r.trim());
                                                            const existingReasonIds = existingReasonLabels
                                                              .map(label => passReasons.find(pr => pr.label === label)?.id)
                                                              .filter(Boolean) as string[];
                                                            setSelectedPassReasons(existingReasonIds);
                                                            setTimeout(() => setPassReasonDialogOpen(true), 100);
                                                          }}
                                                        >
                                                          <Pencil className="h-3 w-3" />
                                                        </span>
                                                      )}
                                                    </span>
                                                  </SelectItem>
                                                );
                                              })}
                                            </SelectContent>
                                          </Select>
                                          <Select
                                            value={lender.substage || '__none__'}
                                            onOpenChange={(open) => setLenderDropdownOpen(open)}
                                            onValueChange={(value: LenderSubstage) => {
                                              const newSubstage = value === '__none__' ? undefined : value;
                                              
                                              // Update local state optimistically
                                              setDeal(prev => {
                                                if (!prev) return prev;
                                                const updatedLenders = prev.lenders?.map(l => 
                                                  l.id === lender.id ? { ...l, substage: newSubstage, updatedAt: new Date().toISOString() } : l
                                                );
                                                return { ...prev, lenders: updatedLenders };
                                              });
                                              
                                              // Persist to database
                                              withSavingAsync(`lender-substage-${lender.id}`, async () => {
                                                await updateLenderInDb(lender.id, { substage: newSubstage });
                                              });
                                            }}
                                          >
                                            <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-muted/50 border-0 justify-start">
                                              <SelectValue placeholder="Milestone">
                                                {lender.substage ? formatRenderedLenderMilestone(lender.substage) : 'Milestone'}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">None</SelectItem>
                                              {configuredSubstages.map((substage) => (
                                                <SelectItem key={substage.id} value={substage.id}>
                                                  {substage.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        {/* Lender History Warning Hint (grouped view) */}
                                        {(() => {
                                          const warning = lenderWarningsMap?.get(lender.name);
                                          if (!warning || warning.isDismissed) return null;
                                          return (
                                            <LenderHistoryHint
                                              warning={warning}
                                              dealId={deal.id}
                                              onViewHistory={() => setHistoryDrawerLender(lender.name)}
                                              className="mt-2"
                                            />
                                          );
                                        })()}
                                        <RequestedItemsSummary
                                          items={lenderOutstandingItems}
                                          lenderName={lender.name}
                                          onViewAll={() => setRequestedItemsDrawerLender(lender.name)}
                                        />
                                        {/* Lender Notes */}
                                        <div className="ml-2 mt-2 space-y-1">
                                          <div className="flex items-start gap-2">
                                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-1.5 flex-shrink-0" />
                                            {lender.notesUpdatedAt && (
                                              <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1.5">
                                                {format(new Date(lender.notesUpdatedAt), 'MM-dd')}
                                              </span>
                                            )}
                                            <LenderNotesField
                                              lenderId={lender.id}
                                              initialValue={lender.notes || ''}
                                              onSave={commitLenderNotes}
                                              isSaving={isSaving(`lender-notes-${lender.id}`)}
                                              showSuccess={savedNotesFlash.has(lender.id)}
                                              onFocusChange={handleNotesFocusChange}
                                              className={cn(
                                                "py-1.5",
                                                expandedLenderNotes.has(lender.id) ? 'min-h-[100px]' : 'min-h-[32px] h-8',
                                              )}
                                              rows={expandedLenderNotes.has(lender.id) ? 4 : 1}
                                            />
                                            <button
                                              onClick={() => {
                                                setExpandedLenderNotes(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(lender.id)) {
                                                    next.delete(lender.id);
                                                  } else {
                                                    next.add(lender.id);
                                                  }
                                                  return next;
                                                });
                                              }}
                                              className="text-muted-foreground hover:text-foreground mt-1.5"
                                            >
                                              {expandedLenderNotes.has(lender.id) ? (
                                                <Minimize2 className="h-3.5 w-3.5" />
                                              ) : (
                                                <Maximize2 className="h-3.5 w-3.5" />
                                              )}
                                            </button>
                                          </div>
                                          {/* Notes History */}
                                          {lender.notesHistory && lender.notesHistory.length > 0 && (
                                            <div className="ml-5">
                                              <button
                                                onClick={() => {
                                                  setExpandedLenderHistory(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(lender.id)) {
                                                      next.delete(lender.id);
                                                    } else {
                                                      next.add(lender.id);
                                                    }
                                                    return next;
                                                  });
                                                }}
                                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                                              >
                                                <History className="h-3 w-3" />
                                                <span>{lender.notesHistory.length} previous note{lender.notesHistory.length > 1 ? 's' : ''}</span>
                                                {expandedLenderHistory.has(lender.id) ? (
                                                  <ChevronUp className="h-3 w-3" />
                                                ) : (
                                                  <ChevronDown className="h-3 w-3" />
                                                )}
                                              </button>
                                              {expandedLenderHistory.has(lender.id) && (
                                                <div className="mt-1 space-y-1 border-l-2 border-muted pl-2">
                                                  {lender.notesHistory.map((historyItem, idx) => (
                                                    <div key={historyItem.id || idx} className="text-xs group/note relative">
                                                      <span className="text-[10px] text-muted-foreground">
                                                        {format(new Date(historyItem.updatedAt), 'MM-dd')}
                                                      </span>
                                                      <p className="text-foreground/80 mt-0.5 pr-5">{historyItem.text}</p>
                                                      {historyItem.id && (
                                                        <button
                                                          onClick={() => deleteLenderNoteHistory(historyItem.id!, lender.id)}
                                                          className="absolute top-0 right-0 opacity-0 group-hover/note:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </button>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })
                        )}
                      </>
                    )}
                  </div>
                    </CardContent>
                  
                </Card>
              </div>

              <div className="w-[30%]">
                   {/* Activity Timeline */}
                    <Card className="h-full flex flex-col">
                      <CardHeader className="pb-3 flex-shrink-0">
                          <CardTitle className="text-lg">
                            Activity
                          </CardTitle>
                      </CardHeader>
                        <CardContent className="pt-0 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'transparent transparent' }} onMouseEnter={(e) => { e.currentTarget.style.scrollbarColor = 'hsl(var(--border)) transparent'; }} onMouseLeave={(e) => { e.currentTarget.style.scrollbarColor = 'transparent transparent'; }}>
                          <ActivityTimeline activities={activities} />
                        </CardContent>
                    </Card>
              </div>
              </div>
                </TabsContent>

                {hasDealManagementAccess && (
                <TabsContent value="deal-management" className={cn("mt-6 overflow-hidden", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-management-${tabDirection}`}>
                  <DealManagementTab dealId={id!} dealName={deal.company} dealValue={deal.value} dealStage={deal.stage} dealType={deal.dealTypes?.[0]} dealStatus={deal.status} lenderCount={deal.lenders?.length} />
                </TabsContent>
                )}

                <TabsContent value="deal-writeup" className={cn("mt-6 min-w-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-writeup-${tabDirection}`}>
                  <DealWriteUp
                    key={id}
                    dealId={id!}
                    data={dealWriteUpData}
                    onChange={setDealWriteUpData}
                    onSave={saveWriteupNow}
                    onCancel={() => setDealInfoTab('deal-info')}
                    isSaving={isSavingWriteup}
                    autoSaveStatus={autoSaveStatus}
                    markFieldEdited={markFieldEdited}
                    isFieldEdited={isFieldEdited}
                    editedCount={editedCount}
                    editedFieldKeys={editedFieldKeys}
                    resetAllEditFlags={resetAllEditFlags}
                  />
                </TabsContent>

                <TabsContent value="data-room" className={cn("mt-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`data-room-${tabDirection}`}>
                  <div
                    className="rounded-lg overflow-hidden mt-3 bg-background border border-[hsl(272,100%,80%,0.45)] shadow-[0_0_16px_hsl(272,100%,70%,0.12),0_8px_32px_hsl(0,0%,0%,0.5)]"
                    style={{ height: 'calc(100vh - 190px)' }}
                  >
                    <VdrShell dealId={id!} embedded />
                  </div>
                </TabsContent>

                <TabsContent value="activity-log" className={cn("mt-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`activity-log-${tabDirection}`}>
                  <div className="rounded-lg overflow-hidden mt-3 bg-card border border-border/30" style={{ height: 'calc(100vh - 190px)' }}>
                    <DealActivityLogTab dealId={id!} />
                  </div>
                </TabsContent>

                <TabsContent value="crm-search" className={cn("mt-3", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`crm-search-${tabDirection}`}>
                  <DealCrmSearch
                    dealId={id!}
                    dealCompany={deal?.company}
                    dealCrmCompanyId={(deal as any)?.crm_company_id ?? null}
                    dealContactEmail={(deal as any)?.contactEmail ?? null}
                  />
                </TabsContent>

                {hasDealSpaceAccess && (
                <TabsContent value="deal-space" className={cn("mt-6", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-space-${tabDirection}`}>
                  <DealSpaceTab dealId={id!} dealData={{
                    company: deal.company,
                    value: deal.value,
                    stage: deal.stage,
                    status: deal.status,
                    deal_type: deal.dealTypes?.[0],
                    notes: deal.notes,
                    narrative: deal.narrative,
                    lenders: deal.lenders?.map(l => ({ name: l.name, stage: l.stage })),
                    milestones: dbMilestones?.map(m => ({ title: m.title, completed: m.completed })),
                  }} />
                </TabsContent>
                )}


              </Tabs>
            </div>
          </div>
        </main>
      </div>

      {/* Lender Detail Dialog */}
      <Dialog open={!!selectedLenderName} onOpenChange={(open) => !open && setSelectedLenderName(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {selectedLenderName}
              <LenderFlagIndicator lenderName={selectedLenderName || ''} />
            </DialogTitle>
          </DialogHeader>
          {selectedLenderName && (() => {
            // Look up lender from the master lenders directory (database), with direct-fetch fallback
            const masterLender = masterLenders.find(ml => ml.name === selectedLenderName) || directFetchedLender;
            const lenderDetails = getLenderDetails(selectedLenderName);
            const lenderOutstandingItems = outstandingItems.filter(
              item => !item.deliveredToLenders.includes(selectedLenderName) && (Array.isArray(item.requestedBy) 
                ? item.requestedBy.includes(selectedLenderName)
                : item.requestedBy === selectedLenderName)
            );
            const lenderActivities = activities.filter(
              activity => activity.description?.includes(selectedLenderName) || 
                activity.metadata?.lenderName === selectedLenderName
            );
            const dealLender = deal?.lenders?.find(l => l.name === selectedLenderName);
            return (
              <Tabs defaultValue="this-deal" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="this-deal">This Deal</TabsTrigger>
                  <TabsTrigger value="comms">Comms Timeline</TabsTrigger>
                  <TabsTrigger value="about">About {selectedLenderName}</TabsTrigger>
                </TabsList>
                
                <ScrollArea className="h-[60vh]">
                <TabsContent value="this-deal" className="space-y-6 mt-4">
                  {/* Stage & Notes Editing */}
                  {dealLender && (
                    <>
                      {/* Stage Selector */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Stage</h4>
                        <Select
                          value={dealLender.stage}
                          onValueChange={(value) => {
                            const newStage = configuredStages.find(s => s.id === value);
                            if (newStage?.group === 'passed') {
                              setPendingPassStageChange({ lenderId: dealLender.id, newStageId: value, isEditing: false });
                              setSelectedPassReasons([]);
                              setPassReasonDialogOpen(true);
                            } else {
                              const newGroup = newStage?.group || 'active';
                              withSavingAsync(`lender-stage-${dealLender.id}`, async () => {
                                await updateLenderInDb(dealLender.id, { 
                                  stage: value, 
                                  trackingStatus: newGroup,
                                });
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {configuredStages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                       {scoreConfig.enabled && (
                       <div>
                        <h4 className="text-sm font-semibold mb-2">Score</h4>
                        <Select
                          value={dealLender.score != null ? String(dealLender.score) : ''}
                          onValueChange={(value) => {
                            const scoreVal = value === '' ? null : Number(value);
                            withSavingAsync(`lender-score-${dealLender.id}`, async () => {
                              await updateLenderInDb(dealLender.id, { score: scoreVal });
                            });
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="No score" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 — Most Interested</SelectItem>
                            <SelectItem value="2">2 — Moderate Interest</SelectItem>
                            <SelectItem value="3">3 — Least Interested</SelectItem>
                          </SelectContent>
                        </Select>
                       </div>
                       )}

                      {/* Lender Notes */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Notes</h4>
                        <InlineEditField
                          value={dealLender.notes || ''}
                          onSave={(value) => {
                            withSavingAsync(`lender-notes-${dealLender.id}`, async () => {
                              await updateLenderInDb(dealLender.id, { notes: value });
                            });
                          }}
                          type="textarea"
                          placeholder="Add lender notes..."
                        />
                      </div>
                    </>
                  )}

                  {/* Outstanding Items for this Lender */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">Requested Items</h4>
                      {lenderOutstandingItems.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setRequestedItemsDrawerLender(selectedLenderName)}
                        >
                          <ListChecks className="h-3 w-3" />
                          View All ({lenderOutstandingItems.length})
                        </Button>
                      )}
                    </div>
                    {lenderOutstandingItems.length > 0 ? (
                      <RequestedItemsSummary
                        items={lenderOutstandingItems}
                        lenderName={selectedLenderName!}
                        onViewAll={() => setRequestedItemsDrawerLender(selectedLenderName)}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No items requested by this lender</p>
                    )}
                  </div>

                  {/* Activity History for this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Activity History</h4>
                    {lenderActivities.length > 0 ? (
                      <ActivityTimeline activities={lenderActivities} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No activity recorded for this lender on this deal</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="comms" className="mt-4">
                  {deal && (
                    <LenderCommsTimeline
                      dealId={deal.id}
                      lenderName={selectedLenderName}
                      masterLenderId={masterLender?.id}
                    />
                  )}
                </TabsContent>

                <TabsContent value="about" className="space-y-6 mt-4">
                  {/* Internal Lender Notes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">Internal Notes</h4>
                      <LenderNotesPopover lenderName={selectedLenderName} masterLenderId={masterLender?.id} side="left">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                          <MessageSquare className="h-3 w-3" />
                          View / Add Notes
                        </Button>
                      </LenderNotesPopover>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">Internal only — not visible to lenders or borrowers</p>
                  </div>

                  {/* Contact Information - from lender directory */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
                    {masterLender?.contact_name ? (
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {masterLender.contact_name}{masterLender.contact_title ? `, ${masterLender.contact_title}` : ''}</p>
                        {masterLender.email && <p><span className="text-muted-foreground">Email:</span> {masterLender.email}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No contact information available</p>
                    )}
                  </div>

                  {/* Deal Preferences */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Deal Preferences</h4>
                    {lenderDetails?.preferences && lenderDetails.preferences.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {lenderDetails.preferences.map((pref, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">{pref}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No preferences listed</p>
                    )}
                  </div>

                  {/* All Deals with this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Deals with {selectedLenderName}</h4>
                    <div className="space-y-2">
                      {getLenderDeals(selectedLenderName).map((dealInfo) => (
                        <EditableLenderDealTile
                          key={dealInfo.dealId}
                          dealInfo={dealInfo}
                          configuredStages={configuredStages}
                          updateLenderInDb={updateLenderInDb}
                          trackingStatusConfig={getTrackingStatusConfig()}
                        />
                      ))}
                    </div>
                  </div>
                </TabsContent>
                </ScrollArea>
              </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Pass Reason Dialog */}
      <Dialog open={passReasonDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPassReasonDialogOpen(false);
          setPendingPassStageChange(null);
          setSelectedPassReasons([]);
          setPassReasonSearch('');
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {(() => {
                if (pendingPassStageChange?.isEditing) {
                  const stageName = configuredStages.find(s => s.id === pendingPassStageChange.newStageId)?.label || 'Passed';
                  return `Edit reasons for "${stageName}"`;
                }
                const stageName = pendingPassStageChange 
                  ? configuredStages.find(s => s.id === pendingPassStageChange.newStageId)?.label 
                  : null;
                return stageName && stageName.toLowerCase() !== 'passed'
                  ? `Why is this lender "${stageName}"?`
                  : 'Why is this lender being passed?';
              })()}
            </DialogTitle>
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
            <p className="text-sm text-muted-foreground mb-2">Select up to 3 reasons ({selectedPassReasons.length}/3)</p>
            <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-auto pr-1">
              {passReasons
                .filter((reason) => reason.label.toLowerCase().includes(passReasonSearch.toLowerCase()))
                .map((reason) => {
                  const isSelected = selectedPassReasons.includes(reason.id);
                  const isDisabled = !isSelected && selectedPassReasons.length >= 3;
                  return (
                    <Button
                      key={reason.id}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className="h-auto min-h-[2.5rem] py-2 px-3 text-xs leading-tight whitespace-normal text-left justify-start break-words"
                      disabled={isDisabled}
                      onClick={() => {
                        setSelectedPassReasons((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== reason.id)
                            : [...prev, reason.id]
                        );
                      }}
                    >
                      {reason.label}
                    </Button>
                  );
                })}
              {passReasons.length === 0 && (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">
                  No pass reasons configured. Add them in Settings.
                </p>
              )}
              {passReasons.length > 0 && passReasons.filter((r) => r.label.toLowerCase().includes(passReasonSearch.toLowerCase())).length === 0 && (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">
                  No pass reasons match your search
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPassReasonDialogOpen(false);
              setPendingPassStageChange(null);
              setSelectedPassReasons([]);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!pendingPassStageChange) return;

                const lenderId = pendingPassStageChange.lenderId;
                const stageId = pendingPassStageChange.newStageId as LenderStage;

                const reasonLabels = selectedPassReasons.length > 0
                  ? selectedPassReasons.map(id => passReasons.find(r => r.id === id)?.label || id)
                  : [];
                const passReasonStr = reasonLabels.join(', ');

                // Build auto-note based on stage label
                const stageName = configuredStages.find(s => s.id === stageId)?.label || 'Passed';
                const autoNote = reasonLabels.length > 0
                  ? `Lender passed due to ${reasonLabels.join(', ')}`
                  : '';

                // Optimistically update local state
                setDeal((prev) => {
                  if (!prev) return prev;
                  const updatedLenders = prev.lenders?.map((l) =>
                    l.id === lenderId
                      ? {
                          ...l,
                          stage: stageId,
                          trackingStatus: 'passed' as DealLender['trackingStatus'],
                          passReason: passReasonStr || undefined,
                          notes: autoNote || l.notes,
                          updatedAt: new Date().toISOString(),
                        }
                      : l
                  );
                  return { ...prev, lenders: updatedLenders };
                });

                // Persist to database
                withSavingAsync(`lender-stage-${lenderId}`, async () => {
                  await updateLenderInDb(lenderId, {
                    stage: stageId,
                    trackingStatus: 'passed',
                    passReason: passReasonStr || null,
                    ...(autoNote ? { notes: autoNote } : {}),
                  });
                });

                setPassReasonDialogOpen(false);
                setPendingPassStageChange(null);
                setSelectedPassReasons([]);
              }}
              disabled={selectedPassReasons.length === 0 && passReasons.length > 0}
            >
              {pendingPassStageChange?.isEditing ? 'Update Reasons' : 'Confirm Pass'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referrer Detail Dialog */}
      <Dialog open={!!selectedReferrer} onOpenChange={(open) => !open && setSelectedReferrer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedReferrer?.name}</DialogTitle>
          </DialogHeader>
          {selectedReferrer && (() => {
            const referrerDeals = getReferrerDeals(selectedReferrer.id);
            return (
              <div className="space-y-6 mt-4">
                {/* Contact Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
                  <div className="space-y-1 text-sm">
                    {selectedReferrer.company && (
                      <p><span className="text-muted-foreground">Company:</span> {selectedReferrer.company}</p>
                    )}
                    {selectedReferrer.email && (
                      <p><span className="text-muted-foreground">Email:</span> {selectedReferrer.email}</p>
                    )}
                    {selectedReferrer.phone && (
                      <p><span className="text-muted-foreground">Phone:</span> {selectedReferrer.phone}</p>
                    )}
                    {!selectedReferrer.company && !selectedReferrer.email && !selectedReferrer.phone && (
                      <p className="text-muted-foreground italic">No contact information available</p>
                    )}
                  </div>
                </div>

                {/* Deals Referred */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Deals Referred ({referrerDeals.length})</h4>
                  {referrerDeals.length > 0 ? (
                    <div className="space-y-2">
                      {referrerDeals.map((dealInfo) => (
                        <div key={dealInfo.dealId} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                          <div>
                            <p className="font-medium">{dealInfo.company}</p>
                            <p className="text-xs text-muted-foreground">{dealInfo.dealName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {STAGE_CONFIG[dealInfo.stage].label}
                            </Badge>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${STATUS_CONFIG[dealInfo.status].badgeColor} text-white`}
                            >
                              {STATUS_CONFIG[dealInfo.status].label}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No deals referred yet</p>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Lender History Warning Drawer */}
      <LenderHistoryDrawer
        open={!!historyDrawerLender}
        onOpenChange={(open) => { if (!open) setHistoryDrawerLender(null); }}
        warning={historyDrawerLender ? lenderWarningsMap?.get(historyDrawerLender) ?? null : null}
        currentDealContext={{
          industry: lenderHistoryDealContext?.industry,
          dealSize: lenderHistoryDealContext?.dealSize,
          geography: lenderHistoryDealContext?.geography,
        }}
      />

      {/* Requested Items Drawer */}
      <RequestedItemsPanel
        open={!!requestedItemsDrawerLender}
        onOpenChange={(open) => { if (!open) setRequestedItemsDrawerLender(null); }}
        items={requestedItemsDrawerLender ? outstandingItems.filter(
          item => Array.isArray(item.requestedBy)
            ? item.requestedBy.includes(requestedItemsDrawerLender)
            : item.requestedBy === requestedItemsDrawerLender
        ) : []}
        lenderName={requestedItemsDrawerLender || ''}
        onUpdateItem={updateOutstandingItem}
      />

      {/* Lenders Kanban Dialog */}
      <Dialog open={isLendersKanbanOpen} onOpenChange={setIsLendersKanbanOpen}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Lenders Kanban View</DialogTitle>
          </DialogHeader>
          {deal && deal.lenders && (
            <LendersKanban
              lenders={deal.lenders}
              dealId={deal.id}
              configuredStages={configuredStages}
              stageGroups={stageGroups}
              passReasons={passReasons}
              onUpdateLenderGroup={updateLenderGroup}
              onEditPassReasons={(lenderId) => {
                const lender = deal.lenders?.find(l => l.id === lenderId);
                if (lender) {
                  setPendingPassStageChange({ lenderId, newStageId: lender.stage, isEditing: true });
                  if (lender.passReason) {
                    const existingReasonLabels = lender.passReason.split(', ').map(r => r.trim());
                    const existingReasonIds = existingReasonLabels
                      .map(label => passReasons.find(pr => pr.label === label)?.id)
                      .filter(Boolean) as string[];
                    setSelectedPassReasons(existingReasonIds);
                  } else {
                    setSelectedPassReasons([]);
                  }
                  setPassReasonDialogOpen(true);
                }
              }}
              isSaving={isSaving}
              failedSaves={failedLenderSaves}
              onRetry={retryLenderSave}
              lenderMetrics={(() => {
                const metrics: Record<string, { activeDealCount: number; outstandingItemsCount: number; openTasksCount: number; contactName?: string; notesOutSince?: string }> = {};
                deal.lenders?.forEach(l => {
                  const key = l.name.toLowerCase().trim();
                  const masterLender = masterLenders.find(ml => ml.name.toLowerCase().trim() === key);
                  const lenderOutstanding = outstandingItems.filter(oi => !oi.completed && oi.requestedBy?.some(r => r.toLowerCase().trim() === key));
                  // Count active deals for this lender across all deals
                  let activeDealCount = 0;
                  deals.forEach(d => {
                    d.lenders?.forEach(dl => {
                      if (dl.name.toLowerCase().trim() === key && dl.trackingStatus !== 'passed' && dl.trackingStatus !== 'on-deck') {
                        activeDealCount++;
                      }
                    });
                  });
                  metrics[key] = {
                    activeDealCount,
                    outstandingItemsCount: lenderOutstanding.length,
                    openTasksCount: 0, // Tasks don't have lender association currently
                    contactName: masterLender?.contact_name || undefined,
                    notesOutSince: l.notesUpdatedAt ? new Date(l.notesUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
                  };
                });
                return metrics;
              })()}
              onCardClick={(lender) => {
                setSelectedLenderName(lender.name);
                setIsLendersKanbanOpen(false);
              }}
              showScore={scoreConfig.enabled}
              scoreConfig={scoreConfig}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Term Sheet Milestone Confirmation Dialog */}
      <AlertDialog open={termSheetMilestoneDialogOpen} onOpenChange={setTermSheetMilestoneDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Milestone Complete?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTermSheetMilestone?.lenderName} has been moved to "Term Sheets" stage. 
              Would you like to mark the "{pendingTermSheetMilestone?.milestoneTitle}" milestone as complete?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setTermSheetMilestoneDialogOpen(false);
              setPendingTermSheetMilestone(null);
            }}>
              No, Keep Incomplete
            </AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (pendingTermSheetMilestone) {
                await updateMilestoneInDb(pendingTermSheetMilestone.milestoneId, {
                  completed: true,
                  completedAt: new Date().toISOString(),
                });
                toast({
                  title: "Milestone completed",
                  description: `"${pendingTermSheetMilestone.milestoneTitle}" has been marked as complete.`,
                });
              }
              setTermSheetMilestoneDialogOpen(false);
              setPendingTermSheetMilestone(null);
            }}>
              Yes, Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Progress Overlay */}
      {showUploadProgress && uploadProgress.length > 0 && (
        <UploadProgressOverlay
          uploads={uploadProgress}
          onDismiss={() => {
            setShowUploadProgress(false);
            setUploadProgress([]);
          }}
        />
      )}

      {/* Panel Reorder Dialog */}
      <DealPanelReorderDialog
        open={isPanelReorderDialogOpen}
        onOpenChange={setIsPanelReorderDialogOpen}
        panelOrder={panelOrder}
        panelVisibility={panelVisibility}
        onReorder={reorderPanels}
        onToggleVisibility={togglePanelVisibility}
        onReset={resetToDefault}
      />

      {/* Checklist Link Dialog for file uploads */}
      <ChecklistLinkDialog
        open={!!pendingUpload}
        onOpenChange={(open) => {
          if (!open) handleChecklistDialogCancel();
        }}
        checklistItems={allChecklistItems}
        files={pendingUpload?.files || []}
        category={pendingUpload?.category || 'materials'}
        onConfirm={handleChecklistDialogConfirm}
        onCancel={handleChecklistDialogCancel}
      />

      {deal && (
        <StatusReportPreviewModal
          open={showStatusReportPreview}
          onOpenChange={setShowStatusReportPreview}
          deal={deal}
          configuredStages={configuredStages}
          configuredSubstages={configuredSubstages}
          outstandingItems={outstandingItems}
          onExport={(editableContent) => {
            exportStatusReportToPDF(deal, configuredStages, configuredSubstages, outstandingItems, editableContent);
            setShowStatusReportPreview(false);
            toast({ title: "PDF exported", description: "Status report exported to PDF." });
          }}
        />
      )}

      {/* Task creation prompt after mentioning someone */}
      <CreateTaskForMentionDialog
        open={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        mentionedUsers={mentionTaskUsers}
        dealId={id}
        dealName={deal?.company}
        noteContext={mentionNoteContext}
      />

      {/* Deal Command Palette (⌘K) */}
      {deal && (
        <DealCommandPalette
          isOpen={isCommandPaletteOpen}
          onOpenChange={setIsCommandPaletteOpen}
          onNavigateTab={handleTabChange}
          onAction={(action) => {
            switch (action) {
              case 'open-memo':
                // Trigger memo dialog - handled by existing button
                break;
              case 'ask-ai':
                handleTabChange('deal-space');
                break;
              case 'export-report':
                setShowStatusReportPreview(true);
                break;
              case 'add-lender':
                handleTabChange('lenders');
                break;
              case 'add-milestone':
                handleTabChange('deal-info');
                break;
              case 'ai-summarize':
              case 'ai-next-steps':
              case 'ai-risks':
                handleTabChange('deal-space');
                break;
            }
          }}
          dealName={deal.company}
          lenderCount={deal.lenders?.length || 0}
          milestoneCount={dbMilestones?.length || 0}
        />
      )}

      {/* Floating Deal AI Assistant with operations */}
      <FloatingDealAssistant
        dealId={deal.id}
        dealName={deal.company}
        dealValue={deal.value}
        dealStage={deal.stage}
        dealStatus={deal.status}
        dealManager={deal.manager}
        dealNotes={deal.notes}
      />

      {/* Floating left/right pipeline navigation arrows */}
      <DealDetailSideNavigation
        currentDealId={deal.id}
        pipelineId={deal.pipelineId}
        dealClass={deal.dealClass}
        companyId={company?.id}
      />
    </>
  );
}
