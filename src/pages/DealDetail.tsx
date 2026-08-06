import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useParams, Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, User, FileText, Clock, Undo2, Building2, Plus, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Paperclip, File, Trash2, Upload, Download, Save, MessageSquare, Maximize2, Minimize2, History, LayoutGrid, AlertCircle, Search, Loader2, Flag, Archive, RotateCcw, Check, UserPlus, ArrowRight, CheckCircle, Send, FileSignature, Megaphone, Mail, Settings2, Folder, Pencil, ArrowDownUp, Filter, TrendingUp, CalendarIcon, GitBranch, ListChecks, Video, Activity } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { HubSpotDealBadge } from '@/components/integrations/hubspot/HubSpotDealBadge';
import { LenderFlagIndicator, LenderNotesPopover } from '@/components/lenders/LenderNotesPopover';
import { LenderCommsTimeline } from '@/components/lenders/LenderCommsTimeline';
import { DealLenderContactPicker } from '@/components/deal/DealLenderContactPicker';
import { LenderHistoryHint } from '@/components/deal/LenderHistoryHint';
import { useRequestStatusChange } from '@/components/deal/StatusChangeGate';
import { StaleStatusNudge } from '@/components/deal/StaleStatusNudge';
import { LenderNotesField } from '@/components/deal/LenderNotesField';
import { LenderNoteTimestamp } from '@/components/deal/LenderNoteTimestamp';
import { LenderHistoryDrawer } from '@/components/deal/LenderHistoryDrawer';
import { AddHoursButton } from '@/components/deal/DealHoursEntriesEditor';
import { useLenderHistoryWarnings } from '@/hooks/useLenderHistoryWarning';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { useCompanyFeesVisibility, formatComputedTotal } from '@/hooks/useCompanyFeesVisibility';
import { computeTotalFee } from '@/lib/fees';
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
import { NaitiveDealInformation } from '@/components/naitive-pipeline/NaitiveDealInformation';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, format } from 'date-fns';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { FlagNoteDialog } from '@/components/deals/FlagNoteDialog';
import { useDealAttachments, DealAttachmentCategory, DEAL_ATTACHMENT_CATEGORIES, UploadProgress } from '@/hooks/useDealAttachments';
import { UploadProgressOverlay } from '@/components/deal/UploadProgressOverlay';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { FlexVisibilityBadge } from '@/components/deal/FlexVisibilityBadge';
import { useDealMilestones } from '@/hooks/useDealMilestones';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NaitiveDatePicker } from '@/components/ui/naitive-date-picker';
import { Textarea } from '@/components/ui/textarea';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { PipelineSpecificFields, PipelineFieldRow, PipelineFullFieldRow } from '@/components/deal/PipelineSpecificFields';
import { Checkbox } from '@/components/ui/checkbox';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRecordDealOpened } from '@/hooks/useRecentDeals';
import { usePrimaryDealContact } from '@/hooks/usePrimaryDealContact';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { resolveDealClientContact } from '@/lib/dealClientContact';
import { DealClientContactField } from '@/components/deal/DealClientContactField';
import { DealAffiliatedContactsField } from '@/components/deal/DealAffiliatedContactsField';
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
import { ReferralSourceContactInput } from '@/components/ui/referral-source-contact-input';
import { CreateTaskForMentionDialog, extractMentionsFromHtml, MentionedUser } from '@/components/deals/CreateTaskForMentionDialog';
import { OutstandingItems } from '@/components/deal/OutstandingItems';
import { CalendarPanel } from '@/components/pipeline/memo/CalendarPanel';
import { FinServProjectsCard } from '@/components/deal/FinServProjectsCard';
import { useFinservProjects } from '@/hooks/useFinservProjects';
import { FinServMrrField } from '@/components/deal/FinServMrrField';
import { FlexInfoNotificationsPanel } from '@/components/deal/FlexInfoNotificationsPanel';
import { useFlexInfoNotifications } from '@/hooks/useFlexInfoNotifications';
import { useOutstandingItems, OutstandingItem } from '@/hooks/useOutstandingItems';
import { useLenderAttachmentsSummary } from '@/hooks/useLenderAttachmentsSummary';
const loadLendersKanban = lazyRetry(() => import('@/components/deal/LendersKanban').then(m => ({ default: m.LendersKanban })));
const LendersKanban = lazy(loadLendersKanban);
import { getLenderStatusTheme } from '@/components/deal/lenderStatusTheme';
import { LenderSuggestionsPanel } from '@/components/deal/LenderSuggestionsPanel';
import { AiRecommendedLendersSection } from '@/components/deal/AiRecommendedLendersSection';
import { DealDataUpdateBanner } from '@/components/deal/DealDataUpdateBanner';
import { useFeatureAccess, usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDemoCapabilities } from '@/hooks/useDemoCapabilities';
import { LenderSearchInput } from '@/components/deal/LenderSearchInput';
import { lazyRetry } from '@/lib/lazyRetry';
const loadLenderDirectoryDialog = lazyRetry(() =>
  import('@/components/deal/LenderDirectoryDialog').then(m => ({
    default: m.LenderDirectoryDialog,
  })),
);
const LenderDirectoryDialog = lazy(loadLenderDirectoryDialog);
import { RequestedItemsSummary } from '@/components/deal/RequestedItemsSummary';
import { RequestedItemsPanel } from '@/components/deal/RequestedItemsPanel';
import { DealWriteUp, DealWriteUpData, DealDataForWriteUp, getEmptyDealWriteUpData } from '@/components/deal/DealWriteUp';
import { DealActivityTab } from '@/components/deal/DealActivityTab';
import { DealTasksPanel } from '@/components/deal/DealTasksPanel';
import { InfoRequestsPanel } from '@/components/deal/InfoRequestsPanel';
const loadDealManagementTab = lazyRetry(() => import('@/components/deal/DealManagementTab').then(m => ({ default: m.DealManagementTab })));
const DealManagementTab = lazy(loadDealManagementTab);
import { CreateTaskButton } from '@/components/deal/CreateTaskButton';
import { CreateLenderTaskButton } from '@/components/deal/CreateLenderTaskButton';
import { LenderFollowUpPopover } from '@/components/deal/LenderFollowUpPopover';
import { LogLenderActivityPopover } from '@/components/deal/LogLenderActivityPopover';
import { DealWeeklyHoursChart } from '@/components/deal/DealWeeklyHoursChart';
import { SortableAttachmentTile } from '@/components/deal/SortableAttachmentTile';
import { DroppableAttachmentFolder } from '@/components/deal/DroppableAttachmentFolder';
import { AttachmentDragOverlay } from '@/components/deal/AttachmentDragOverlay';

import { DataRoomBulkActions } from '@/components/deal/DataRoomBulkActions';
import { useDealWriteup } from '@/hooks/useDealWriteup';
import { useDealMatchingCriteria } from '@/hooks/useDealMatchingCriteria';
const DealResearchPanel = lazy(lazyRetry(() => import('@/components/deal/DealResearchPanel').then(m => ({ default: m.DealResearchPanel }))));
import { DealPulseDashboard } from '@/components/deal/DealPulseDashboard';
import { ProactiveAlertBar } from '@/components/deal/ProactiveAlertBar';
const DealCommandPalette = lazy(lazyRetry(() => import('@/components/deal/DealCommandPalette').then(m => ({ default: m.DealCommandPalette }))));
const UnifiedTimeline = lazy(lazyRetry(() => import('@/components/deal/UnifiedTimeline').then(m => ({ default: m.UnifiedTimeline }))));
import { DealFlagLog } from '@/components/deal/DealFlagLog';
const DealBenchmarkPanel = lazy(lazyRetry(() => import('@/components/deal/DealBenchmarkPanel').then(m => ({ default: m.DealBenchmarkPanel }))));
const DealAssistantPanel = lazy(lazyRetry(() => import('@/components/deal/DealAssistantPanel').then(m => ({ default: m.DealAssistantPanel }))));
import { ActivitySummaryPanel } from '@/components/deal/ActivitySummaryPanel';
import { ContextualSuggestionsPanel } from '@/components/deal/ContextualSuggestionsPanel';
const DealEmailsTab = lazy(lazyRetry(() => import('@/components/deal/DealEmailsTab').then(m => ({ default: m.DealEmailsTab }))));
const FloatingDealAssistant = lazy(lazyRetry(() => import('@/components/deals/FloatingDealAssistant').then(m => ({ default: m.FloatingDealAssistant }))));
import { DealDetailSideNavigation } from '@/components/deal/DealDetailSideNavigation';

const loadDealSpaceTab = lazyRetry(() => import('@/components/deal/DealSpaceTab').then(m => ({ default: m.DealSpaceTab })));
const DealSpaceTab = lazy(loadDealSpaceTab);
const DealPanelReorderDialog = lazy(lazyRetry(() => import('@/components/deal/DealPanelReorderDialog').then(m => ({ default: m.DealPanelReorderDialog }))));
const DealMemoDialog = lazy(lazyRetry(() => import('@/components/deal/DealMemoDialog').then(m => ({ default: m.DealMemoDialog }))));
const AgreementDrafterDialog = lazy(lazyRetry(() => import('@/components/agreement/AgreementDrafterDialog').then(m => ({ default: m.AgreementDrafterDialog }))));
import { EmailPromptCenterButton } from '@/components/deal/EmailPromptCenter';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { DataRoomChecklistPanel } from '@/components/deal/DataRoomChecklistPanel';
const loadDataRoomV2 = lazyRetry(() => import('@/components/deal/DataRoomV2').then(m => ({ default: m.DataRoomV2 })));
const DataRoomV2 = lazy(loadDataRoomV2);
import { VdrErrorBoundary } from '@/components/vdr/VdrErrorBoundary';
const loadVdrShell = lazyRetry(() => import('@/components/vdr/VdrShell').then(m => ({ default: m.VdrShell })));
const VdrShell = lazy(loadVdrShell);
const loadDealActivityLogTab = lazyRetry(() => import('@/components/deal/DealActivityLogTab').then(m => ({ default: m.DealActivityLogTab })));
const DealActivityLogTab = lazy(loadDealActivityLogTab);
const loadDealCommunicationsTab = lazyRetry(() => import('@/components/deal/DealCommunicationsTab').then(m => ({ default: m.DealCommunicationsTab })));
const DealCommunicationsTab = lazy(loadDealCommunicationsTab);
import DealCrmSearch from '@/components/deals/DealCrmSearch';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';
import { ClaapRecordingsPanel } from '@/components/deal/ClaapRecordingsPanel';
const ClaapMeetingsTab = lazy(lazyRetry(() => import('@/components/deal/ClaapMeetingsTab').then(m => ({ default: m.ClaapMeetingsTab }))));
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
import { useDealSourcedViaOptions } from '@/hooks/useDealSourcedViaOptions';
import { SaveIndicator, GlobalSaveBar } from '@/components/ui/save-indicator';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { applyDefaultChecklistToOutstandingItems } from '@/utils/applyDefaultChecklist';
import { useChecklistPhaseControls } from '@/hooks/useChecklistPhaseControls';
import { getDealInactiveReason, inactiveReasonLabel } from '@/utils/dealLifecycle';
import { exportDealToCSV, exportDealToPDF, exportDealToWord, exportStatusReportToPDF, exportStatusReportToWord, buildStatusReportPdfFile } from '@/utils/dealExport';
import type { StatusReportEditableContent } from '@/utils/dealExport';
import { StatusReportPreviewModal } from '@/components/deal/StatusReportPreviewModal';
import { LenderPipelineSnapshot } from '@/components/deal/LenderPipelineSnapshot';
import { LenderRowBoundary } from '@/components/deal/LenderRowBoundary';
import { DraftAndSendDialog, type DraftAndSendInitial } from '@/components/deal/DraftAndSendDialog';
import { StatusEmailFlowPicker, type StatusEmailFlowSelection } from '@/components/deal/StatusEmailFlowPicker';
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from '@/utils/currencyFormat';
import { useAdminRole } from '@/hooks/useAdminRole';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { buildStatusTimeline, formatFullTimestamp, formatShortDate, getPrimaryStatusDate } from '@/utils/lenderStatusDate';
import { Label } from '@/components/ui/label';
import { useLenderLabelResolver } from '@/hooks/useLenderLabelResolver';
import { syncFinServValuePatch, warnIfFinServValueMismatch } from '@/lib/finservValue';

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
            <SelectContent className="">
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

const renderLenderStatusDate = (lender: DealLender) => {
  const statusDate = getPrimaryStatusDate(lender);
  if (!statusDate.iso) return null;

  const prefix = statusDate.approximate ? '~' : '';
  const shortDate = formatShortDate(statusDate.iso);
  if (!shortDate) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground w-fit cursor-default">
          <span>{statusDate.label}</span>
          <span aria-hidden>•</span>
          <span>{`${prefix}${shortDate}`}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-1">
          <div>{formatFullTimestamp(statusDate.iso)}</div>
          {statusDate.approximate && <div className="text-muted-foreground">approximate</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
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
  // When rendered inside the deal overlay modal, suppress app-shell chrome
  // (DealsHeader/sidebar trigger/brand) so the modal body stays clean and
  // the modal's own scroll container is the only scroll region.
  const isEmbedded = searchParams.get('embedded') === '1';
  const feesVisibility = useCompanyFeesVisibility();

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
  const isEmbeddedEarly = searchParams.get('embedded') === '1';
  // Every fresh open of the Deal Details popup must land on Deal Info by
  // default. Only an explicit `?tab=` deep-link in the URL may override
  // that. We intentionally do NOT persist the previously-selected tab
  // across popup opens or across sibling-deal navigation — each open is
  // a clean start on Deal Info.
  const EMBEDDED_TAB_KEY = 'naitive:deal-overlay-active-tab';
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem(EMBEDDED_TAB_KEY); } catch {}
  }
  const initialTab = (isEmbeddedEarly ? null : searchParams.get('tab')) as
    | 'deal-info' | 'lenders' | 'deal-management' | 'deal-writeup' | 'data-room' | 'deal-space' | 'communication' | null;
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
  const { is5thLineUser } = useFeatureAccess('deal_status_stage_mirror');
  // Human-in-the-loop sync between Deal Status (on-hold) and Deal Stage (on-hold).
  // Restricted to 5th Line tenant only. The mirrored update only happens after
  // explicit user confirmation, and is marked as user-confirmed in the audit log.
  const [pendingMirror, setPendingMirror] = useState<null | { direction: 'status->stage' | 'stage->status' }>(null);
  const { hasPageAccess } = usePageAccessFlags();
  const hasDealSpaceAccess = hasPageAccess('deal_space');
  const hasDealManagementAccess = hasPageAccess('deal_management');
  const { canPushFlex: demoCanPushFlex } = useDemoCapabilities();
  const canPushToFlex = hasPageAccess('flex_push') && demoCanPushFlex;
  const { formatCurrencyValue, preferences } = usePreferences();
  const { getDealById, updateDeal: updateDealInDb, addLenderToDeal, updateLender: updateLenderInDb, deleteLender: deleteLenderInDb, deleteLenderNoteHistory, deleteDeal, deals, isLoading: isDealsLoading, refreshDeals } = useDealsContext();
  const isDemoAccount = useIsDemoAccount();
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
  const requestStatusChange = useRequestStatusChange();
  const { scoreConfig } = useLenderScoreConfig();
  const teamMembers = useTeamMembers();
  const mentionUsers = useMemo(() => teamMembers, [teamMembers]);
  const [mentionTaskUsers, setMentionTaskUsers] = useState<MentionedUser[]>([]);
  const [mentionNoteContext, setMentionNoteContext] = useState('');
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [showStatusReportPreview, setShowStatusReportPreview] = useState(false);
  /** Holds the generated PDF + flow-picker state while the user chooses
   *  between replying into an existing thread or starting a new email. */
  const [statusEmailFlow, setStatusEmailFlow] = useState<
    | {
        content: StatusReportEditableContent;
        attachment: File;
        greetingHtml: string;
        defaultSubject: string;
        defaultRecipients: string[];
        contactDisplayName: string;
      }
    | null
  >(null);
  /** Once the picker resolves, this drives `DraftAndSendDialog`. */
  const [statusEmailDraftInitial, setStatusEmailDraftInitial] =
    useState<DraftAndSendInitial | null>(null);
  const { profile } = useProfile();

  // Allow other deal-scoped components (e.g. the Deal Space Ask AI tab) to
  // open the Status Report Preview modal via a window event. This avoids
  // prop-drilling through DealSpaceTab → DealSpaceAskAITab.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ dealId?: string }>).detail;
      if (!detail?.dealId || detail.dealId === id) {
        setShowStatusReportPreview(true);
      }
    };
    window.addEventListener('naitive:open-status-report', handler as EventListener);
    return () => window.removeEventListener('naitive:open-status-report', handler as EventListener);
  }, [id]);

  // Prefetch every tab's chunk on idle after DealDetail mounts. Tab switches
  // then render from the in-memory module cache instead of blocking on a
  // network round-trip for the JS bundle. Fire-and-forget; individual chunk
  // failures fall back to the on-click lazyRetry path.
  useEffect(() => {
    const prefetch = () => {
      void loadLendersKanban();
      void loadDealManagementTab();
      void loadDealSpaceTab();
      void loadDataRoomV2();
      void loadVdrShell();
      void loadDealActivityLogTab();
      void loadDealCommunicationsTab();
      void loadLenderDirectoryDialog();
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => {
        try { w.cancelIdleCallback?.(handle); } catch { /* ignore */ }
      };
    }
    const t = window.setTimeout(prefetch, 1200);
    return () => window.clearTimeout(t);
  }, []);
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

  // Primary contact linked via contact_deals (role='primary'). When
  // present, this drives the Client Contact display in place of the
  // legacy free-text `deal.contact` field. Falls back to the free-text
  // field for tenants that haven't migrated to contact links yet.
  const { data: primaryDealContact } = usePrimaryDealContact(id || null);
  const resolvedClientContact = useMemo(
    () => deal ? resolveDealClientContact(deal, primaryDealContact) : null,
    [deal, primaryDealContact],
  );

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
        // Defensive dedupe: collapse rows that share the same id or the same
        // natural key (master_lender_id || lower(name)) so a single funding
        // source can never render twice on a deal.
        const seenIds = new Set<string>();
        const seenKeys = new Set<string>();
        const uniqueRows = dbLenders.filter((r: any) => {
          if (seenIds.has(r.id)) return false;
          seenIds.add(r.id);
          const key = r.master_lender_id
            ? `ml:${r.master_lender_id}`
            : r.name
              ? `name:${String(r.name).trim().toLowerCase()}`
              : null;
          if (key) {
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
          }
          return true;
        });
        const dealLenders: DealLender[] = uniqueRows.map((l: any) => ({
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
          createdAt: l.created_at,
          submittedAt: l.submitted_at ?? null,
          approvedAt: l.approved_at ?? null,
          passedAt: l.passed_at ?? null,
          declinedAt: l.declined_at ?? null,
          excludedAt: l.excluded_at ?? null,
          onHoldAt: l.on_hold_at ?? null,
          onDeckAt: l.on_deck_at ?? null,
          lastStatusChangeAt: l.last_status_change_at ?? null,
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
          engagementType: (dbDeal.engagement_type || 'advisory') as EngagementType,
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
          mrrMode: ((dbDeal as any).mrr_mode === 'calculated' ? 'calculated' : 'manual') as 'manual' | 'calculated',
          oneTimeRevenue: (dbDeal as any).one_time_revenue ?? null,
          projectedCloseDate: (dbDeal as any).projected_close_date || null,
          contractStartDate: (dbDeal as any).contract_start_date || null,
          contractEndDate: (dbDeal as any).contract_end_date || null,
          // ── Naitive sales-pipeline extras ──
          icpCategory: (dbDeal as any).icp_category || undefined,
          ownedBy: (dbDeal as any).owned_by || undefined,
          contactTitle: (dbDeal as any).contact_title || undefined,
          nextStep: (dbDeal as any).next_step || undefined,
          nextStepDate: (dbDeal as any).next_step_date || undefined,
          prospectType: (dbDeal as any).prospect_type || undefined,
          outcome: (dbDeal as any).outcome || undefined,
          painPointsConfirmed: (dbDeal as any).pain_points_confirmed || undefined,
          objectionsRaised: (dbDeal as any).objections_raised || undefined,
          competitorsMentioned: (dbDeal as any).competitors_mentioned || undefined,
          keySignal: (dbDeal as any).key_signal || undefined,
          productGapFlagged: (dbDeal as any).product_gap_flagged || undefined,
          dmPresent: (dbDeal as any).dm_present || undefined,
          ...(((dbDeal as any).dm_name) ? { dmName: (dbDeal as any).dm_name } as any : {}),
          whyNotMovingForward: (dbDeal as any).why_not_moving_forward || undefined,
        };

        warnIfFinServValueMismatch(mapped, 'DealDetail.fallback-load');
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

        // Final dedupe: collapse by id and by natural key (master_lender_id || lower(name))
        // to guarantee a single funding source never renders twice, even if local
        // optimistic state and a realtime refetch raced.
        if (mergedLenders && mergedLenders.length > 1) {
          const seenIds = new Set<string>();
          const seenKeys = new Set<string>();
          mergedLenders = mergedLenders.filter((l) => {
            if (!l) return false;
            if (seenIds.has(l.id)) return false;
            seenIds.add(l.id);
            const key = l.name ? `name:${l.name.trim().toLowerCase()}` : null;
            if (key) {
              if (seenKeys.has(key)) return false;
              seenKeys.add(key);
            }
            return true;
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
          // Hours are written through the AddHours dialog which triggers
          // refreshDeals(); always take the DB value so new entries show up
          // without needing a manual reload.
        };
      });
    }
  }, [contextDeal]);
  
  // Determine if this is a naitive pipeline deal
  const isNaitiveDeal = deal?.dealClass === 'naitive';
  const isFinServDeal = deal?.dealClass === 'finserv';
  // FinServ deals use same simplified detail view as naitive deals
  const isSimplifiedDeal = isNaitiveDeal || isFinServDeal;

  // Projects pipeline (currently Blount Capital only) is a fully siloed
  // pipeline: only Deal Info + Data Room tabs are visible/functional, no
  // outstanding items widget, no dollar value, and pipeline moves are
  // blocked in both directions.
  const dealPipelineName = (deal?.pipelineName || '').trim().toLowerCase();
  const isProjectsDeal = dealPipelineName === 'projects';

  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  
  // Memoize existing lender names to pass to the search component
  const existingLenderNames = useMemo(() => 
    deal?.lenders?.map(l => l.name) || [], 
    [deal?.lenders]
  );
  const [lenderSort, setLenderSort] = useState<'none' | 'updated-desc' | 'updated-asc' | 'stage-furthest' | 'stage-slowest' | 'submitted-desc' | 'status-changed-desc'>('none');
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
      case 'submitted-desc':
        return lenders.sort((a, b) => {
          const aT = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const bT = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return bT - aT;
        });
      case 'status-changed-desc':
        return lenders.sort((a, b) => {
          const aT = a.lastStatusChangeAt ? new Date(a.lastStatusChangeAt).getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const bT = b.lastStatusChangeAt ? new Date(b.lastStatusChangeAt).getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return bT - aT;
        });
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
  const [lenderDialogTab, setLenderDialogTab] = useState<'overview' | 'workflow' | 'funding-source'>('overview');
  const [lenderWorkflowFilter, setLenderWorkflowFilter] = useState<'all' | 'requested' | 'completed'>('all');
  useEffect(() => {
    if (selectedLenderName) {
      setLenderDialogTab('overview');
      setLenderWorkflowFilter('all');
    }
  }, [selectedLenderName]);

  // Allow nested components (e.g. Ask AI tab markdown links) to open the
  // funding-source modal without prop-drilling.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setSelectedLenderName(detail.name);
    };
    window.addEventListener('naitive:open-lender', handler as EventListener);
    return () => window.removeEventListener('naitive:open-lender', handler as EventListener);
  }, []);

  // When a funding source popup opens, if the funding source isn't in the cached masterLenders list yet
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

  // Projects deals only expose Deal Info + Data Room. If the persisted/URL
  // tab is anything else, snap back to Deal Info so the modal never renders
  // an empty pane after a hidden tab is auto-selected.
  useEffect(() => {
    if (!isProjectsDeal) return;
    if (dealInfoTab !== 'deal-info' && dealInfoTab !== 'data-room') {
      setDealInfoTab('deal-info');
    }
  }, [isProjectsDeal, dealInfoTab]);
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
    // Persist active tab to URL so refresh / shared links land on the
    // same panel (especially Deal Space, which is access-gated and
    // would otherwise fall back to Deal Info on reload).
    //
    // EMBEDDED MODE: the overlay renders this component inside a
    // synthetic <Routes> with a fake pathname (`/deals/__overlay/<id>`)
    // that does not exist in the real router. Calling setSearchParams
    // here would navigate the parent URL to that fake pathname and
    // produce a 404. Skip URL sync entirely when embedded — tabs are
    // pure local state inside the popup.
    if (!isEmbedded) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', newTab);
          return next;
        },
        { replace: true },
      );
    }
    // Embedded mode: intentionally do NOT persist the tab choice — the
    // next open of the Deal Details popup (including prev/next sibling
    // navigation) always starts on Deal Info.
  }, [setSearchParams, isEmbedded]);

  // When access flags finish loading after mount, reconcile the active
  // tab with the URL `?tab=` param. The initial useState ran before
  // `hasDealSpaceAccess` resolved, so a refresh on `?tab=deal-space`
  // would otherwise be stuck on Deal Info even after access is granted.
  useEffect(() => {
    // In embedded (overlay) mode the local dealInfoTab is the source of
    // truth — the parent URL's `?tab=` param belongs to whatever page is
    // hosting the overlay and must not override the user's tab clicks.
    // Without this guard, every tab click was instantly reverted back to
    // the parent URL's tab value (typically 'deal-info'), breaking all
    // tab navigation inside the deal popup.
    if (isEmbedded) return;
    const urlTab = searchParams.get('tab');
    if (!urlTab) return;
    if (urlTab === dealInfoTab) return;
    if (urlTab === 'deal-space' && !hasDealSpaceAccess) return;
    const allowed = [...DEAL_TABS, 'activity-log'];
    if (!allowed.includes(urlTab)) return;
    prevTabRef.current = urlTab as typeof dealInfoTab;
    setDealInfoTab(urlTab as typeof dealInfoTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDealSpaceAccess, searchParams, isEmbedded]);

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
  const { options: sourcedViaOptions } = useDealSourcedViaOptions();
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
  const { items: outstandingItems, addItem: addOutstandingItemDb, updateItem: updateOutstandingItemDb, deleteItem: deleteOutstandingItemDb, bulkAddItems: bulkAddOutstandingItemsDb, reorderItems: reorderOutstandingItemsDb, refreshItems: refreshOutstandingItems } = useOutstandingItems(id);

  // FinServ Projects — only loaded for FinServ deals. The DB trigger keeps
  // deals.one_time_revenue = SUM(projects.value); we mirror that locally
  // so the Deal Information card reflects edits immediately without refetch.
  const {
    projects: finservProjects,
    total: finservProjectsTotal,
    loading: finservProjectsLoading,
    addProject: addFinservProject,
    updateProject: updateFinservProject,
    deleteProject: deleteFinservProject,
  } = useFinservProjects(
    isFinServDeal ? id : undefined,
    (total) => setDeal((prev) => (prev ? { ...prev, oneTimeRevenue: total } : prev)),
  );

  // Phase-aware checklist controls (Add Phase 2/3 + retroactive archive banner)
  const checklistPhaseControls = useChecklistPhaseControls(
    id,
    company?.id,
    user?.id,
    deal?.createdAt as string | undefined,
    deal?.dealTypes,
    refreshOutstandingItems,
  );

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

  // Helper to check if a funding source is stale based on preferences
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
  // Live text filter driven by the funding-source search input in the
  // Funding Sources card header. Typing narrows the visible list to
  // matching sources already attached to the deal.
  const [lenderSearchQuery, setLenderSearchQuery] = useState('');

  // Apply individual stage filters + typed search to sorted lenders
  const filteredSortedLenders = useMemo(() => {
    let out = sortedLenders;
    if (lenderStageFilters.size > 0) {
      out = out.filter(l => lenderStageFilters.has(l.stage));
    }
    const q = lenderSearchQuery.trim().toLowerCase();
    if (q.length > 0) {
      out = out.filter(l => (l.name || '').toLowerCase().includes(q));
    }
    return out;
  }, [sortedLenders, lenderStageFilters, lenderSearchQuery]);

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
  const [otherPassReasonText, setOtherPassReasonText] = useState('');
  const [passReasonNote, setPassReasonNote] = useState('');
  const hydratePassReasonSelection = useCallback((passReason: string) => {
    const otherReason = passReasons.find(r => r.label.toLowerCase() === 'other');
    const labels = passReason.split(', ').map(r => r.trim()).filter(Boolean);
    const ids: string[] = [];
    let otherText = '';
    labels.forEach(label => {
      const lower = label.toLowerCase();
      if (lower.startsWith('other:') && otherReason) {
        if (!ids.includes(otherReason.id)) ids.push(otherReason.id);
        otherText = label.slice(label.indexOf(':') + 1).trim();
      } else {
        const match = passReasons.find(pr => pr.label === label)?.id;
        if (match) ids.push(match);
      }
    });
    setSelectedPassReasons(ids);
    setOtherPassReasonText(otherText);
  }, [passReasons]);

  // Required status note dialog on stage changes (non-passed)
  const [pendingStageNoteChange, setPendingStageNoteChange] = useState<{
    lenderId: string;
    lenderName: string;
    fromLabel: string;
    toLabel: string;
    apply: (statusNote: string) => void;
  } | null>(null);
  const [pendingStageNoteText, setPendingStageNoteText] = useState('');

  useEffect(() => {
    setPendingStageNoteText('');
  }, [pendingStageNoteChange?.lenderId, pendingStageNoteChange?.toLabel]);
  
  // Term Sheet milestone confirmation dialog state
  const [termSheetMilestoneDialogOpen, setTermSheetMilestoneDialogOpen] = useState(false);
  const [pendingTermSheetMilestone, setPendingTermSheetMilestone] = useState<{
    milestoneId: string;
    milestoneTitle: string;
    lenderName: string;
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(deleteAction);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPermanentDeleteOpen, setIsPermanentDeleteOpen] = useState(false);
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
      // Clear the action param from URL — but skip in embedded mode for
      // the same reason as handleTabChange above (synthetic pathname).
      if (!isEmbedded) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('action');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [deleteAction, searchParams, setSearchParams, isEmbedded]);

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
      navigate(isFinServDeal ? '/finserv' : isNaitiveDeal ? '/naitive-pipeline' : '/deals');
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
      
      const serverError = (data as any)?.error || (data as any)?.details;
      if (error || serverError) throw new Error(serverError || (error as any)?.message || 'Failed to push to FLEx');
      
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
        
        // Re-add the funding source to the database
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
    const createdActivity: ActivityItem[] = deal?.createdAt
      ? [{
          id: `deal-created-${deal.id}`,
          type: 'deal_created' as ActivityItem['type'],
          description: `Deal created`,
          user: (deal as any).createdByName || 'System',
          timestamp: deal.createdAt,
        }]
      : [];
    // Avoid duplicate if a deal_created log already exists in DB
    const hasDbCreated = dbActivities.some(a => a.type === ('deal_created' as ActivityItem['type']));
    return [...localActivities, ...dbActivities, ...(hasDbCreated ? [] : createdActivity)].sort((a, b) =>
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

  const addLenderWithStage = useCallback(async (lenderName: string, stageId: string) => {
    if (!deal || !lenderName.trim()) return;
    const newLender = await addLenderToDeal(deal.id, {
      name: lenderName.trim(),
      stage: stageId || preferences.defaultLenderStage,
      trackingStatus: 'active',
    });
    if (newLender) {
      setDeal(prev => {
        if (!prev) return prev;
        setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
        return { ...prev, lenders: [...(prev.lenders || []), newLender], updatedAt: new Date().toISOString() };
      });
      logActivity('lender_added', `Added lender ${lenderName} (AI recommended)`, { lender_name: lenderName, source: 'ai_recommendation' });
      toast({ title: '✓ Added', description: `${lenderName} added to the deal.` });
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

    // Require a status note on all non-passed stage changes.
    // 'passed' already collects a reason via its own dialog and generates autoNote.
    if (newGroup !== 'passed' && lender) {
      setPendingStageNoteChange({
        lenderId,
        lenderName: lender.name,
        fromLabel: oldStage?.label || lender.stage || '—',
        toLabel: targetStage?.label || newGroup,
        apply: (statusNote: string) => {
          const notesToSave = statusNote.trim();
          withSavingAsync(`lender-stage-${lenderId}`, async () => {
            try {
              await updateLenderInDb(lenderId, {
                ...(targetStage ? { stage: targetStage.id } : {}),
                trackingStatus: newGroup,
                passReason: null,
                notes: notesToSave,
              });
            } catch (err) {
              setFailedLenderSaves(prev => new Set(prev).add(lenderId));
              throw err;
            }
          });
          logActivity('lender_stage_change', `${lender.name} stage changed`, {
            lender_id: lender.id,
            lender_name: lender.name,
            from: oldStage?.label || lender.stage,
            to: targetStage?.label || newGroup,
            status_note: notesToSave,
          });
          setDeal(prev => {
            if (!prev) return prev;
            const updatedLenders = prev.lenders?.map(l =>
              l.id === lenderId
                ? { ...l, ...(targetStage ? { stage: targetStage.id as any } : {}), trackingStatus: newGroup, passReason: undefined, notes: notesToSave, updatedAt: new Date().toISOString() }
                : l,
            );
            return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
          });
          toast({
            title: 'Stage updated',
            description: `${lender.name} moved to ${targetStage?.label || newGroup}`,
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
        },
      });
      return;
    }

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

  /**
   * Move a lender to a *specific* stage (not just "first stage in group").
   * Used by the Lenders Kanban which groups columns by stage. We derive the
   * tracking-status group from the target stage so the existing group-based
   * UI and filters stay in sync.
   */
  const updateLenderStageDirect = useCallback((lenderId: string, newStageId: string, passReason?: string) => {
    const targetStage = configuredStages.find(s => s.id === newStageId);
    if (!targetStage) return;
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    const oldStage = lender?.stage ? configuredStages.find(s => s.id === lender.stage) : undefined;
    const newGroup = targetStage.group as StageGroup;

    if (lender) {
      setLastLenderChange({
        lenderId,
        previousStage: lender.stage,
        previousTrackingStatus: lender.trackingStatus || 'active',
        previousPassReason: lender.passReason,
        lenderName: lender.name,
      });
    }

    setFailedLenderSaves(prev => {
      const next = new Set(prev);
      next.delete(lenderId);
      return next;
    });

    const autoNote = newGroup === 'passed' && passReason
      ? `Lender passed due to ${passReason}`
      : undefined;

    // No-op if stage hasn't actually changed
    if (lender && lender.stage === newStageId) return;

    // Require a status note on non-passed stage transitions
    if (newGroup !== 'passed' && lender) {
      setPendingStageNoteChange({
        lenderId,
        lenderName: lender.name,
        fromLabel: oldStage?.label || lender.stage || '—',
        toLabel: targetStage.label,
        apply: (statusNote: string) => {
          const notesToSave = statusNote.trim();
          withSavingAsync(`lender-stage-${lenderId}`, async () => {
            try {
              await updateLenderInDb(lenderId, {
                stage: targetStage.id,
                trackingStatus: newGroup,
                passReason: null,
                notes: notesToSave,
              });
            } catch (err) {
              setFailedLenderSaves(prev => new Set(prev).add(lenderId));
              throw err;
            }
          });
          logActivity('lender_stage_change', `${lender.name} stage changed`, {
            lender_id: lender.id,
            lender_name: lender.name,
            from: oldStage?.label || lender.stage,
            to: targetStage.label,
            status_note: notesToSave,
          });
          setDeal(prev => {
            if (!prev) return prev;
            const updatedLenders = prev.lenders?.map(l =>
              l.id === lenderId
                ? { ...l, stage: targetStage.id as any, trackingStatus: newGroup, passReason: undefined, notes: notesToSave, updatedAt: new Date().toISOString() }
                : l,
            );
            return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
          });
          toast({
            title: 'Stage updated',
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
        },
      });
      return;
    }

    withSavingAsync(`lender-stage-${lenderId}`, async () => {
      try {
        await updateLenderInDb(lenderId, {
          stage: targetStage.id,
          trackingStatus: newGroup,
          passReason: newGroup === 'passed' ? (passReason || null) : null,
          ...(autoNote ? { notes: autoNote } : {}),
        });
      } catch (err) {
        setFailedLenderSaves(prev => new Set(prev).add(lenderId));
        throw err;
      }
    });

    if (lender) {
      logActivity('lender_stage_change', `${lender.name} stage changed`, {
        lender_id: lender.id,
        lender_name: lender.name,
        from: oldStage?.label || lender.stage,
        to: targetStage.label,
      });
    }

    setDeal(prev => {
      if (!prev) return prev;
      const updatedLenders = prev.lenders?.map(l =>
        l.id === lenderId
          ? { ...l, stage: targetStage.id as any, trackingStatus: newGroup, passReason: newGroup === 'passed' ? passReason : undefined, updatedAt: new Date().toISOString() }
          : l,
      );
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });

    if (lender && newGroup !== 'passed') {
      toast({
        title: 'Stage updated',
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

  // Prefer the status-note timestamp so the header's "X Min. Ago" reflects
  // when the note was last edited, not the deal's generic updated_at.
  const timeAgoData = deal
    ? getTimeAgoData(deal.notesUpdatedAt || deal.updatedAt)
    : { text: '', highlightClass: '' };

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

  // Defensive fallbacks: when AI updates the stage/status to a value that
  // isn't in the standard config map (e.g. a naitive-pipeline stage), or
  // during a brief mid-refetch state, these lookups can return undefined
  // and crash the page on `.badgeColor` / `.label` access.
  const stageConfig = STAGE_CONFIG[deal.stage] ?? { label: String(deal.stage ?? 'Unknown'), color: 'bg-muted' };
  const statusConfig = STATUS_CONFIG[deal.status as DealStatus] ?? { label: String(deal.status ?? 'Unknown'), dotColor: 'bg-muted', badgeColor: 'bg-muted' };

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
  const ACTIVITY_LOG_FIELDS: (keyof Deal)[] = ['status', 'stage', 'value', 'manager', 'dealOwner', 'engagementType', 'exclusivity', 'dealTypes', 'mrr' as keyof Deal];
  
  const updateDeal = (field: keyof Deal, value: string | number | string[] | boolean | Referrer | null | undefined) => {
    setDeal(prev => {
      if (!prev) return prev;
      // Save current state to history before updating
      setEditHistory(history => [...history, { deal: prev, field, timestamp: new Date() }]);
      const syncedPatch = syncFinServValuePatch({ [field]: value } as Partial<Deal>, prev);
      const updated = { ...prev, ...syncedPatch, updatedAt: new Date().toISOString() };

      // Total Fee is a Postgres generated column:
      //   total_fee = value * success_fee_percent / 100
      // Recompute locally via the shared helper so the UI stays in sync
      // until the next refetch.
      if (field === 'successFeePercent' || field === 'value') {
        const dealValue = field === 'value' ? (value as number | undefined) : prev.value;
        const successPercent = field === 'successFeePercent' ? (value as number | undefined) : prev.successFeePercent;
        updated.totalFee = computeTotalFee(dealValue, successPercent);
      }

      // FinServ deals derive their displayed pipeline-card amount and the
      // dashboard's per-stage Value / Weighted Value totals from
      // `deal.value`. Mirror MRR + One-Time Revenue into `value` locally so
      // the modal, card, and dashboard all reflect the edit instantly —
      // the same mirror is applied in useDealsDatabase.updateDeal so the
      // database row stays in sync.
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
        } else if (field === 'mrr') {
          const oldNum = Number(oldValue ?? 0) || 0;
          const newNum = Number(value ?? 0) || 0;
          const delta = newNum - oldNum;
          const deltaPct = oldNum !== 0 ? (delta / oldNum) * 100 : null;
          const isExpansion = delta > 0;
          const isContraction = delta < 0;
          const activityType = isExpansion
            ? 'mrr_expansion'
            : isContraction
              ? 'mrr_contraction'
              : 'deal_updated';
          const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
          const label = isExpansion ? 'Expansion' : isContraction ? 'Contraction' : 'MRR updated';
          const description = isExpansion || isContraction
            ? `MRR ${label}: ${fmt(oldNum)} → ${fmt(newNum)} (${delta > 0 ? '+' : ''}${fmt(delta)}${deltaPct !== null ? `, ${delta > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : ''})`
            : `MRR updated`;
          logActivity(activityType, description, {
            field: 'mrr',
            oldValue: String(oldNum),
            newValue: String(newNum),
            delta,
            deltaPct,
            changeType: isExpansion ? 'expansion' : isContraction ? 'contraction' : 'unchanged',
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
        const patch: Partial<Deal> = syncFinServValuePatch({ [field]: value } as Partial<Deal>, prev);
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
      <div
        key={deal.id}
        className={cn(
          "deal-carousel-viewport",
          isEmbedded && "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        )}
      >

      {/* Archive Deal Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Deal?</AlertDialogTitle>
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
              </div>
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

      {/* FinServ permanent delete confirmation */}
      <AlertDialog open={isPermanentDeleteOpen} onOpenChange={setIsPermanentDeleteOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently delete this deal?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to permanently delete{' '}
                <strong className="text-foreground">{deal.company}</strong>. This will
                also remove its projects, outstanding items, and any other
                related records.
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async () => {
                await handleDeleteDeal();
                setIsPermanentDeleteOpen(false);
              }}
              disabled={isDeleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? 'Deleting…' : 'Delete Deal'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 5th Line only — Status/Stage On Hold mirror confirmation */}
      <AlertDialog open={!!pendingMirror} onOpenChange={(open) => { if (!open) setPendingMirror(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMirror?.direction === 'status->stage'
                ? 'Also move Deal Stage to Deal Paused / On Hold?'
                : 'Also move Deal Status to On Hold?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You changed{' '}
              {pendingMirror?.direction === 'status->stage' ? 'Deal Status to On Hold' : 'Deal Stage to Deal Paused / On Hold'}.
              Would you like to keep the matching field in sync? This will update the second field only after you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingMirror(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!pendingMirror || !deal) { setPendingMirror(null); return; }
              if (pendingMirror.direction === 'status->stage') {
                updateDeal('stage', 'on-hold');
                logActivity('deal_updated', 'Deal Stage mirrored to On Hold (user confirmed)', {
                  field: 'stage',
                  newValue: 'on-hold',
                  system_assisted: true,
                  user_confirmed: true,
                  mirrored_from: 'status',
                });
              } else {
                // Mirror path: route through the gate so the note
                // requirement still applies when status is changed
                // programmatically from a stage mirror confirmation.
                void requestStatusChange({
                  dealId: deal.id,
                  dealName: deal.company,
                  currentStatus: deal.status,
                  nextStatus: 'on-hold',
                });
                logActivity('deal_updated', 'Deal Status mirrored to On Hold (user confirmed)', {
                  field: 'status',
                  newValue: 'on-hold',
                  system_assisted: true,
                  user_confirmed: true,
                  mirrored_from: 'stage',
                });
              }
              setPendingMirror(null);
            }}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={cn(
        "bg-transparent relative",
        isEmbedded && "flex-1 flex flex-col min-h-0 w-full overflow-hidden"
      )}>
        <GlobalSaveBar isAnySaving={isAnySaving} />

        <main
          className={
            isEmbedded
              // Inside the deal pop-up: <main> is a non-scrolling flex
              // column shell. The middle TabsContent region is the only
              // scroll owner, and the bottom tab rail is a frozen footer
              // that always remains flush with the modal's bottom edge.
              ? "container mx-auto w-full max-w-[1680px] 2xl:max-w-[1760px] px-4 sm:px-6 lg:px-10 xl:px-12 pt-1 pb-0 flex-1 min-h-0 flex flex-col overflow-hidden"
              : "container mx-auto max-w-7xl px-4 py-1 sm:px-6 lg:px-8 overflow-x-hidden"
          }
        >
          {/* Back button, alerts, and undo - side by side. Hidden in
              embedded (overlay) mode — the modal provides its own close
              affordance and we don't want a duplicate route header. */}
          {!isEmbedded && (
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

            {/* Proactive Alert Bar - inline (debt-pipeline only) */}
            {!isSimplifiedDeal && (
              <ProactiveAlertBar 
                deal={deal}
                checklistTotal={allChecklistItems.length}
                checklistComplete={0}
                outstandingItemsCount={outstandingItems.filter(i => !i.received && !i.approved).length}
                infoRequestCount={infoRequestActionCount}
                onNavigate={handleTabChange}
              />
            )}

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {deal?.id && (
                <FlexVisibilityBadge dealId={deal.id} stage={deal.stage} />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archive deal</TooltipContent>
              </Tooltip>
              {isFinServDeal && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setIsPermanentDeleteOpen(true)}
                      aria-label="Delete deal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete deal permanently</TooltipContent>
                </Tooltip>
              )}
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
          )}

          {/* Deal Pulse Dashboard - hidden per user request */}

          {/* Tabs + scroll owner opened ABOVE the Header Card so the
              header card lives inside the scrollable region and scrolls
              away with the body. Only the TabsList footer (sibling, below)
              stays frozen at the modal's bottom edge. */}
          <Tabs
            value={dealInfoTab}
            onValueChange={(v) => handleTabChange(v as 'deal-info' | 'lenders' | 'deal-management' | 'deal-writeup' | 'data-room' | 'deal-space' | 'communication')}
            className={isEmbedded ? "flex-1 min-h-0 flex flex-col" : undefined}
          >
            <div
              className={cn(
                isEmbedded && "relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-6 deal-popup-scroll"
              )}
              tabIndex={isEmbedded ? 0 : undefined}
              data-deal-modal-scroll-region={isEmbedded ? 'true' : undefined}
            >

          {/* Header Card */}
          <Card className="w-full mt-4 mb-6 border-[hsl(272,100%,80%,0.45)] shadow-[0_0_16px_hsl(272,100%,70%,0.12),0_8px_32px_hsl(0,0%,0%,0.5)]">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <InlineEditField
                    value={deal.company}
                    onSave={(value) => updateDeal('company', value)}
                    // Responsive fluid typography via clamp() so long deal
                    // names scale down gracefully and wrap rather than
                    // truncating aggressively across desktop/laptop widths.
                    displayClassName="font-semibold leading-tight bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white break-words"
                    displayStyle={{ fontSize: 'clamp(1.5rem, 3.2vw, 3rem)' }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={activeFlagCount > 0 ? `${activeFlagCount} flag${activeFlagCount > 1 ? 's' : ''} for discussion` : 'Flag for discussion'}
                        className={`h-10 w-10 relative ${activeFlagCount > 0 ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                        onClick={() => setIsFlagDialogOpen(true)}
                      >
                        <Flag className={`h-5 w-5 ${activeFlagCount > 0 ? 'fill-current' : ''}`} />
                        {activeFlagCount > 1 && (
                          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                            {activeFlagCount}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {activeFlagCount > 0 ? `${activeFlagCount} flag${activeFlagCount > 1 ? 's' : ''} for discussion` : 'Flag for discussion'}
                    </TooltipContent>
                  </Tooltip>
                  <FlagNoteDialog
                    dealId={deal.id}
                    dealName={deal.company}
                    isOpen={isFlagDialogOpen}
                    onClose={() => setIsFlagDialogOpen(false)}
                    onFlagCountChange={setActiveFlagCount}
                  />
                </div>
                {!isSimplifiedDeal && !isProjectsDeal && (
                  <InlineEditField
                    value={formatValue(deal.value)}
                    // Edit mode shows the raw USD amount with thousands
                    // separators (e.g. "25,000,000"); display mode keeps
                    // the abbreviated $XX.00MM / $XX.00K format.
                    editValue={formatWithCommas(deal.value)}
                    sanitizeInput={(next) => next.replace(/[^0-9.,]/g, '')}
                    onSave={(value) => {
                      const parsed = parseCurrencyInput(value);
                      updateDeal('value', parsed ?? 0);
                    }}
                    // Right-align the Deal Size in the header. `sm:ml-auto`
                    // pushes the field flush right on sm+; `text-right`
                    // right-aligns the value within its inline input.
                    className="sm:ml-auto sm:justify-end shrink-0"
                    displayClassName="text-right font-semibold leading-tight bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white whitespace-nowrap"
                    displayStyle={{ fontSize: 'clamp(1.5rem, 3.2vw, 3rem)' }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={deal.status}
                  onValueChange={(value: DealStatus) => {
                    // Route through the global StatusChangeGate so the
                    // user is forced to enter a fresh status note before
                    // the status (and notes_updated_at) are persisted.
                    void requestStatusChange({
                      dealId: deal.id,
                      dealName: deal.company,
                      currentStatus: deal.status,
                      nextStatus: value,
                    }).then((committed) => {
                      if (
                        committed &&
                        is5thLineUser &&
                        value === 'on-hold' &&
                        deal.stage !== 'on-hold'
                      ) {
                        setPendingMirror({ direction: 'status->stage' });
                      }
                    });
                  }}
                >
                  <SelectTrigger className={`w-auto ${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg h-6 px-2`}>
                    <SelectValue>
                      {STATUS_CONFIG[deal.status as DealStatus]?.label || deal.status}
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
                          onClick={() => {
                            updateDeal('stage', stage.id);
                            if (is5thLineUser && stage.id === 'on-hold' && deal.status !== 'on-hold') {
                              setPendingMirror({ direction: 'stage->status' });
                            }
                          }}
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
                            {pipelines
                              .filter((pipeline) => {
                                // Projects pipeline is fully siloed: no moves in or out.
                                const pipeIsProjects = (pipeline.name || '').trim().toLowerCase() === 'projects';
                                if (isProjectsDeal) return pipeIsProjects; // only itself
                                return !pipeIsProjects; // hide Projects target for non-Projects deals
                              })
                              .map((pipeline) => (
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
                {!isSimplifiedDeal && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-muted-foreground">Close:</span>
                    <NaitiveDatePicker
                      value={deal.closingDate || null}
                      onChange={(v) => updateDeal('closingDate', v)}
                      size="sm"
                      placeholder="Set close date"
                      buttonClassName="border-none bg-transparent hover:bg-muted/40 px-1"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-t border-border mt-4 pt-4">
                <div className="relative w-full sm:w-[93%] flex flex-col gap-1">
                  <div className="relative flex items-start gap-2">
                    <StaleStatusNudge
                      deal={deal}
                      onSave={(value) => {
                        const oldNotes = deal.notes || '';
                        updateDeal('notes', value);
                        if (oldNotes && oldNotes.trim() && oldNotes !== '<p></p>' && value !== oldNotes) {
                          addStatusNote(oldNotes.trim());
                        }
                      }}
                    />
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
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {deal.manager && (
                    <span className="text-sm text-white">{deal.manager}</span>
                  )}
                  {!isSimplifiedDeal && companyFeatures.deal_memo_enabled && hasPageAccess('deal_memo') && (
                    <Suspense fallback={null}>
                      <DealMemoDialog dealId={deal.id} companyName={deal.company} dealNarrative={deal.narrative} onGoToDataRoom={() => handleTabChange('data-room')} />
                    </Suspense>
                  )}
                  {/* Right-aligned action cluster — sits beneath Deal Memo within the header card. */}
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <CreateTaskButton dealId={id!} dealName={deal?.company} />
                    {hasNaitivePipelineAccess && <EmailPromptCenterButton dealId={id!} dealName={deal?.company} />}
                    {!isSimplifiedDeal && companyFeatures.agreement_icon_visible && hasPageAccess('agreement_drafter') && (
                      <Suspense fallback={null}>
                        <AgreementDrafterDialog dealId={deal.id} companyName={deal.company} companyShort={deal.company?.split(' ')[0]} />
                      </Suspense>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Status Report"
                          onClick={() => setShowStatusReportPreview(true)}
                          className="relative overflow-hidden h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Status Report</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Export" className="relative overflow-hidden h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]">
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Export</TooltipContent>
                      </Tooltip>
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
              </div>
            </CardHeader>
          </Card>

          {/* Main Content Grid */}
          <div className={cn(
            "flex flex-col gap-6 min-w-0",
            !isEmbedded && "overflow-hidden",
            isEmbedded && "flex-1 min-h-0"
          )}>
            {/* Main Content */}
            <div className={cn(
              "flex flex-col gap-6 min-w-0 w-full",
              isEmbedded ? "flex-1 min-h-0 pb-0" : "pb-24"
            )}>
              {/* Tab Navigation */}
              {/* Tabs and scroll wrapper are opened above the Header Card
                  so the header scrolls with the body. Only the TabsList
                  footer below remains a frozen sibling. */}

                <TabsContent value="deal-info" className={cn("mt-0 space-y-3", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-info-${tabDirection}`}>
                  {/* Naitive pipeline deals get a fully Naitive-specific layout —
                      no debt panels (research, AI assistant, outstanding items,
                      activity timeline, benchmarks). */}
                  {isNaitiveDeal ? (
                    <div className="space-y-6">
                      <NaitiveStageMilestonesSection dealId={deal.id} stage={deal.stage} />
                      <NaitiveDealInformation
                        deal={deal}
                        onUpdate={(field, value) => updateDeal(field as any, value as any)}
                      />
                    </div>
                  ) : (
                  <>
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

                  <div className="flex justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Reorder panels"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => setIsPanelReorderDialogOpen(true)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Reorder panels</TooltipContent>
                    </Tooltip>
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
                                    <Suspense fallback={null}>
                                    <DealResearchPanel
                                      dealId={deal.id}
                                      companyName={deal.company}
                                      companyUrl={deal.companyUrl}
                                      industry={deal.dealTypes?.[0]}
                                      dealValue={deal.value}
                                      lenders={deal.lenders?.map(l => ({ name: l.name })) || []}
                                    />
                                    </Suspense>
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
                                    <Suspense fallback={null}>
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
                                    </Suspense>
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
                          // Naitive pipeline deals use a Naitive-specific schema —
                          // do not render the debt-pipeline field set.
                          if (isNaitiveDeal) {
                            return (
                              <NaitiveDealInformation
                                key={id}
                                deal={deal}
                                onUpdate={(field, value) => updateDeal(field as any, value as any)}
                              />
                            );
                          }
                          const renderDealInfoField = (fieldId: DealInfoFieldId) => {
                            if (!isDealInfoFieldVisible(fieldId)) return null;
                            // Hide select fields for FinServ deals (pipeline-specific suppression).
                            if (isFinServDeal && (
                              fieldId === 'dealManager' ||
                              fieldId === 'type' ||
                              fieldId === 'engagement' ||
                              fieldId === 'exclusivity' ||
                              fieldId === 'analyst'
                            )) return null;
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                              case 'affiliatedContacts':
                                return <DealAffiliatedContactsField key={fieldId} dealId={deal.id} />;
                              case 'companyUrl':
                                return (
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                              case 'clientContact': {
                                return (
                                  <DealClientContactField
                                    key={fieldId}
                                    deal={deal}
                                    linkedContact={primaryDealContact}
                                    contactPopoverOpen={contactPopoverOpen}
                                    onContactPopoverOpenChange={setContactPopoverOpen}
                                    onUpdateField={(field, value) => updateDeal(field, value)}
                                  />
                                );
                              }
                              case 'referralSource':
                                return (
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
                                    <span className="text-muted-foreground text-sm">Referral Source</span>
                                    <ReferralSourceContactInput
                                      value={
                                        deal.referralSourceContactId
                                          ? { id: deal.referralSourceContactId, name: deal.referredBy?.name }
                                          : deal.referredBy?.name
                                            ? { id: deal.referredBy.name, name: deal.referredBy.name }
                                            : null
                                      }
                                      onChange={(sel) => {
                                        if (!sel) {
                                          updateDeal('referralSourceContactId' as any, null as any);
                                          updateDeal('referredBy' as any, null as any);
                                          return;
                                        }
                                        if (sel.kind === 'contact') {
                                          updateDeal('referralSourceContactId' as any, sel.id as any);
                                          updateDeal('referredBy' as any, { name: sel.name, email: sel.email || '' } as any);
                                        } else {
                                          updateDeal('referralSourceContactId' as any, null as any);
                                          updateDeal('referredBy' as any, { name: sel.name, email: sel.email || '' } as any);
                                        }
                                      }}
                                      className="[&_input]:h-8 [&_input]:text-sm"
                                    />
                                  </div>
                                );
                              case 'analyst':
                                return (
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                  <div key={fieldId} className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
                                    <span className="text-muted-foreground text-sm">Sourced Via</span>
                                    <Select value={deal.sourcedVia || ''} onValueChange={(value: string) => updateDeal('sourcedVia', value === '__none__' ? '' : value)}>
                                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Select source..." /></SelectTrigger>
                                      <SelectContent side="bottom" align="start">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {Array.from(new Set([...(deal.sourcedVia ? [deal.sourcedVia] : []), ...sourcedViaOptions])).map((option) => (
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
                                    <div
                                      className="space-y-3 rounded-xl border border-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                      style={{ background: 'rgba(18, 24, 38, 0.82)' }}
                                    >
                                      <h4
                                        className="text-[13px] font-medium flex items-center gap-2 tracking-[0.01em]"
                                        style={{ color: 'rgba(148, 163, 184, 0.88)' }}
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                        Hours & Fees
                                        <DealWeeklyHoursChart dealId={deal.id} />
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Hours */}
                                        <div className="space-y-3 min-w-0">
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
                                            <span className="text-muted-foreground text-sm">Pre-Signing</span>
                                            <div className="flex items-center gap-2 h-8">
                                              <span className="text-sm font-medium tabular-nums flex-1">
                                                {(deal.preSigningHours ?? 0).toLocaleString()}
                                              </span>
                                              <AddHoursButton
                                                dealId={deal.id}
                                                phase="pre_signing"
                                                iconOnly
                                                onChanged={() => { void refreshDeals?.(); }}
                                              />
                                            </div>
                                          </div>
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
                                            <span className="text-muted-foreground text-sm">Post-Signing</span>
                                            <div className="flex items-center gap-2 h-8">
                                              <span className="text-sm font-medium tabular-nums flex-1">
                                                {(deal.postSigningHours ?? 0).toLocaleString()}
                                              </span>
                                              <AddHoursButton
                                                dealId={deal.id}
                                                phase="post_signing"
                                                iconOnly
                                                onChanged={() => { void refreshDeals?.(); }}
                                              />
                                            </div>
                                          </div>
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
                                            <span className="text-muted-foreground text-sm">Total Hours</span>
                                            <span className="text-sm font-medium h-8 flex items-center tabular-nums">
                                              {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)).toLocaleString()}
                                            </span>
                                          </div>
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                          {feesVisibility.retainerEnabled && (
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-retainer">
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
                                          )}
                                          {feesVisibility.milestoneEnabled && (
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-milestone">
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
                                          )}
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
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
                                          <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-total">
                                            <span className="text-muted-foreground text-sm">Total Fee</span>
                                            <div className="relative w-full">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                              <Input
                                                type="text"
                                                value={
                                                  feesVisibility.totalFeeComputedOnly
                                                    ? (() => {
                                                        const c = formatComputedTotal(
                                                          (deal as any).value ?? null,
                                                          deal.successFeePercent ?? null,
                                                        );
                                                        return c === '—' ? '' : c.replace(/^\$/, '');
                                                      })()
                                                    : (deal.totalFee ? Math.round(deal.totalFee).toLocaleString() : '')
                                                }
                                                readOnly
                                                title={
                                                  feesVisibility.totalFeeComputedOnly
                                                    ? 'Computed: deal size × success fee %'
                                                    : 'Auto-calculated: Retainer + Milestone + Deal Size × Success Fee %'
                                                }
                                                placeholder="0"
                                                className="pl-5 h-8 text-sm w-full bg-muted/40 cursor-not-allowed"
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
                            fId => fId !== 'narrative' && fId !== 'hoursAndFees' && isDealInfoFieldVisible(fId) && !(
                              isFinServDeal && (
                                fId === 'dealManager' ||
                                fId === 'type' ||
                                fId === 'engagement' ||
                                fId === 'exclusivity' ||
                                fId === 'analyst'
                              )
                            )
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
                            <Card
                              key={id}
                              className="rounded-2xl border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                              style={{ background: 'rgba(20, 26, 40, 0.74)' }}
                            >
                              <CardHeader className="flex flex-row items-center justify-between py-4">
                                <CardTitle
                                  className="text-[15px] font-semibold tracking-[0.01em]"
                                  style={{ color: 'rgba(226, 232, 240, 0.92)' }}
                                >
                                  Deal Information
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {isDealInfoFieldVisible('narrative') && renderDealInfoField('narrative')}

                                {isFinServDeal ? (
                                  // FinServ-only: render shared + pipeline fields
                                  // in a single dense 2-column grid so rows pack
                                  // tightly with no orphan gaps between shared
                                  // fields and the FinServ-specific block.
                                  <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                                      {renderDealInfoField('dealOwner')}
                                      <PipelineFieldRow deal={deal} fieldKey="opportunityType" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                      {renderDealInfoField('companyUrl')}
                                      <PipelineFieldRow deal={deal} fieldKey="feeType" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                      {renderDealInfoField('businessModel')}
                                      {renderDealInfoField('sourcedVia')}
                                      {renderDealInfoField('clientContact')}
                                      {renderDealInfoField('referralSource')}
                                      <div className={`min-w-0 ${(deal.mrrMode ?? 'manual') === 'calculated' ? 'md:col-span-2' : ''}`}>
                                        <FinServMrrField
                                          dealId={deal.id}
                                          mrr={deal.mrr}
                                          mode={deal.mrrMode ?? 'manual'}
                                          onMrrCommit={(v) => updateDeal('mrr', v)}
                                          onModeChange={(m) => updateDeal('mrrMode' as any, m)}
                                          onCalculatedTotal={(t) =>
                                            setDeal((prev) =>
                                              prev && (prev.mrrMode ?? 'manual') === 'calculated'
                                                ? { ...prev, mrr: t }
                                                : prev,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1 md:grid md:grid-cols-[minmax(5rem,6.5rem)_minmax(0,1fr)] md:items-center md:gap-2 min-w-0">
                                        <span className="text-muted-foreground text-sm break-words">One-Time Revenue</span>
                                        <div
                                          className="min-w-0 w-full h-8 px-2 text-sm rounded-md border border-input bg-muted/40 text-foreground flex items-center justify-between"
                                          title="Calculated from Projects"
                                        >
                                          <span className="tabular-nums">
                                            {(deal.oneTimeRevenue ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                                          </span>
                                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-2">from projects</span>
                                        </div>
                                      </div>
                                      <PipelineFieldRow deal={deal} fieldKey="contractStartDate" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                      <PipelineFieldRow deal={deal} fieldKey="projectedCloseDate" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                      <PipelineFieldRow deal={deal} fieldKey="contractEndDate" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                      <PipelineFieldRow deal={deal} fieldKey="onHold" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                    </div>
                                    <PipelineFullFieldRow deal={deal} fieldKey="servicesOffered" onUpdate={(f, v) => updateDeal(f as any, v)} />
                                  </>
                                ) : (
                                  <>
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

                                    {/* Tasks — moved from the Management tab.
                                        Renders below Hours & Fees when visible,
                                        otherwise below the deal information items. */}
                                    <div className="mt-4 h-[420px]">
                                      <DealTasksPanel dealId={deal.id} />
                                    </div>

                                    {/* Pipeline-specific fields. Driven by
                                        src/config/pipelineFieldSchemas.ts so the
                                        create-deal form and detail view stay in
                                        sync. */}
                                    <PipelineSpecificFields
                                      deal={deal}
                                      onUpdate={(field, value) => updateDeal(field as any, value)}
                                    />
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          );
                        }
                        case 'outstanding-items':
                          // Outstanding Items is a debt-pipeline concept —
                          // skip it entirely for Naitive and Projects pipeline deals.
                          if (isNaitiveDeal || isProjectsDeal) return null;
                          {
                          // computed below; isolated block to keep variable scoped
                          }
                          return (
                            <div key={id} className="h-full flex flex-col gap-4">
                              <div className="shrink-0">
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
                                readOnly={(() => {
                                  const pname = deal.pipelineId
                                    ? pipelines.find(p => p.id === deal.pipelineId)?.name
                                    : null;
                                  return getDealInactiveReason(deal, pname) !== null;
                                })()}
                                readOnlyReason={(() => {
                                  const pname = deal.pipelineId
                                    ? pipelines.find(p => p.id === deal.pipelineId)?.name
                                    : null;
                                  const r = getDealInactiveReason(deal, pname);
                                  return r ? inactiveReasonLabel(r) : undefined;
                                })()}
                                onApplyDefaultChecklist={async () => {
                                  if (!company?.id || !user?.id || !deal?.id) return;
                                  const r = await applyDefaultChecklistToOutstandingItems(
                                    deal.id,
                                    deal.dealTypes || [],
                                    company.id,
                                    user.id,
                                  );
                                  await refreshOutstandingItems();
                                  await checklistPhaseControls.refresh();
                                  if (r.inserted > 0) {
                                    toast({
                                      title: 'Checklist applied',
                                      description: `Added ${r.inserted} item${r.inserted !== 1 ? 's' : ''} from ${r.sourceLabel}.`,
                                    });
                                  } else {
                                    toast({
                                      title: 'Nothing to add',
                                      description: r.source === 'none'
                                        ? 'No checklist is configured in Settings → Deals → Data Room Checklists.'
                                        : 'All checklist items already exist on this deal.',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                phaseControls={checklistPhaseControls}
                              />
                              </div>
                              {isFinServDeal && (
                                <div className="shrink-0">
                                  <FinServProjectsCard
                                    projects={finservProjects}
                                    total={finservProjectsTotal}
                                    loading={finservProjectsLoading}
                                    onAdd={addFinservProject}
                                    onUpdate={updateFinservProject}
                                    onDelete={deleteFinservProject}
                                  />
                                </div>
                              )}
                              {/* Calendar panel is hidden on FinServ deal detail by request */}
                              {!isFinServDeal && (
                                <Card className="overflow-hidden flex-1 flex flex-col min-h-[280px]">
                                  <div className="flex-1 flex flex-col">
                                    <CalendarPanel deal={deal} />
                                  </div>
                                </Card>
                              )}
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

                  {/* Activity Timeline + Benchmarks: permanently retired from
                      the Deal Info tab. Do not re-introduce. */}


                  </>
                  )}
                </TabsContent>

                <TabsContent value="lenders" className={cn("mt-6", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`lenders-${tabDirection}`}>
              <div className="w-full min-h-0 space-y-6">
              <DealDataUpdateBanner dealId={id} />
              {/* Lenders Card */}
                 <Card className="flex flex-col min-h-0">
                   <CardHeader className="pb-3 pt-3">
                       <div className="flex items-center gap-2 flex-wrap">
                         <div className="flex-1 min-w-[160px] max-w-[260px]">
                           <LenderSearchInput
                             lenderNames={lenderNames}
                             existingLenderNames={existingLenderNames}
                             onAddLender={addLender}
                             isLoadingLenders={masterLendersLoading || masterLendersLoadingMore}
                             onQueryChange={setLenderSearchQuery}
                           />
                         </div>
                         <div className="shrink-0">
                          <Suspense fallback={null}>
                          <LenderDirectoryDialog
                        existingLenderNames={existingLenderNames}
                        onAddLender={addLender}
                        onRemoveLender={removeLenderFromDeal}
                        dealLenders={(deal.lenders || []).map(l => ({ id: l.id, name: l.name }))}
                        aiSearchSlot={
                          hasLenderMatchingAccess && hasNaitivePipelineAccess ? (
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
                          ) : null
                        }
                      />
                          </Suspense>
                        </div>
                      <div className="flex items-center gap-1.5 ml-auto min-w-0">
                      {deal.lenders && deal.lenders.length > 0 && (
                        <div className="min-w-0">
                        <ToggleGroup
                          type="multiple"
                          value={Array.from(lenderGroupFilters)}
                          onValueChange={(vals) => {
                            setLenderGroupFilters(new Set(vals as StageGroup[]));
                            // Clear individual stage filters whenever group chips change to keep semantics simple
                            setLenderStageFilters(new Set());
                          }}
                          className="flex flex-nowrap items-center gap-0.5"
                        >
                          {(() => {
                            const groupOrder = ['active', 'on-deck', 'on-hold', 'passed', 'excluded'];
                            const groupLabels: Record<string, string> = {
                              'excluded': 'Excluded',
                              'active': 'Active',
                              'on-hold': 'On Hold',
                              'on-deck': 'On Deck',
                              'passed': 'Passed',
                            };
                            const byId = new Map(stageGroups.map(g => [g.id, g]));
                            return groupOrder.map(id => {
                              const group = byId.get(id);
                              const label = group?.label || groupLabels[id];
                              const count = deal.lenders?.filter(l => {
                                const stage = configuredStages.find(s => s.id === l.stage);
                                return stage?.group === id;
                              }).length || 0;
                              const theme = getLenderStatusTheme(id);
                              const isActive = lenderGroupFilters.has(id as StageGroup);
                              return (
                                <ToggleGroupItem
                                  key={id}
                                  value={id}
                                  size="sm"
                                  variant="outline"
                                  aria-label={`Filter by ${label}`}
                                  className={cn(
                                    'h-7 px-2.5 text-xs whitespace-nowrap shrink-0 rounded-md border transition-colors duration-150 inline-flex items-center gap-1.5',
                                    isActive ? theme.tabActive : cn(theme.tabIdle, theme.tabHover),
                                  )}
                                >
                                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', theme.dot)} />
                                  <span>{label}</span>
                                  {count > 0 && (
                                    <span
                                      className={cn(
                                        'ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.05rem] px-1 rounded-full text-[10px] font-medium tabular-nums leading-none transition-colors',
                                        isActive ? theme.countActive : theme.countIdle,
                                      )}
                                    >
                                      {count}
                                    </span>
                                  )}
                                </ToggleGroupItem>
                              );
                            });
                          })()}
                        </ToggleGroup>
                        </div>
                      )}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2 h-8"
                                aria-label="Activity"
                                title="Activity"
                              >
                                <Activity className="h-4 w-4" />
                                Activity
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              side="bottom"
                              sideOffset={6}
                              collisionPadding={8}
                              className="w-[460px] max-w-[95vw] max-h-[min(85vh,720px)] overflow-y-auto p-3 bg-background border border-border shadow-xl"
                            >
                              <div className="text-sm font-semibold mb-2">Activity</div>
                              <ActivityTimeline activities={activities} />
                            </PopoverContent>
                          </Popover>
                          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/10 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Sort lenders"
                                title="Sort lenders"
                              >
                                <ArrowDownUp className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onSelect={() => setLenderSort('none')}>No Sort</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('updated-desc')}>Last Updated: Newest to Oldest</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('updated-asc')}>Last Updated: Oldest to Newest</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('stage-furthest')}>Stage: Furthest to Slowest</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('stage-slowest')}>Stage: Slowest to Furthest</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('submitted-desc')}>Most recently submitted</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('updated-desc')}>Most recently updated</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setLenderSort('status-changed-desc')}>Most recently changed status</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setIsLendersKanbanOpen(true)}
                            aria-label="View"
                            title="View"
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </Button>
                          </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                    <CardContent className="flex-1 min-h-0">
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
                                // Defensive: a single malformed deal_lender record (e.g. missing
                                // name / id after a partial write) must not crash the entire
                                // Funding Sources section. Skip non-objects outright, and wrap
                                // the row render in an error boundary so downstream field
                                // access can throw without blanking the list.
                                if (!lender || typeof lender !== 'object') {
                                  // eslint-disable-next-line no-console
                                  console.warn('[FundingSources] skipping non-object deal_lender at index', index, lender);
                                  return null;
                                }
                                const safeName = typeof lender.name === 'string' ? lender.name : '';
                                const lenderOutstandingItems = outstandingItems.filter(
                                  item => Array.isArray(item.requestedBy)
                                    ? item.requestedBy.includes(safeName)
                                    : item.requestedBy === safeName
                                );
                                const staleStatus = (() => {
                                  try { return isLenderStale(lender); }
                                  catch (e) {
                                    // eslint-disable-next-line no-console
                                    console.error('[FundingSources] isLenderStale threw for', lender?.id, e);
                                    return { isStale: false, isUrgent: false } as ReturnType<typeof isLenderStale>;
                                  }
                                })();
                                const shouldAnimate = highlightStale && staleStatus.isStale;
                                const rowKey = lender.id || `lender-idx-${index}`;
                                return (
                                  <LenderRowBoundary key={rowKey} lenderId={lender.id} lenderName={lender.name}>
                                  <SortableLenderItem key={lender.id} lender={lender}>
                                    <div
                                      data-lender-id={lender.id}
                                      data-lender-stale={staleStatus.isStale ? 'true' : undefined}
                                      className={cn(
                                         'relative rounded-xl border border-blue-500/25 bg-gradient-to-br from-[hsl(220,30%,10%)] to-[hsl(260,15%,5%)] p-4 shadow-md hover:shadow-lg transition-all',
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
                                        <LenderNoteTimestamp
                                          updatedAt={lender.notesUpdatedAt}
                                          additionalDates={[
                                            lender.lastStatusChangeAt,
                                            lender.updatedAt,
                                            lender.submittedAt,
                                            lender.onDeckAt,
                                            lender.onHoldAt,
                                            lender.approvedAt,
                                            lender.passedAt,
                                            lender.declinedAt,
                                            lender.excludedAt,
                                          ]}
                                        />
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
                                          hydratePassReasonSelection(lender.passReason || '');
                                        } else {
                                          setSelectedPassReasons([]); setOtherPassReasonText("");
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
                                                    hydratePassReasonSelection(lender.passReason! || '');
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
                                {/* Funding Source Notes */}
                                <div className="ml-2 mt-2 space-y-1">
                                  <div className="flex items-start gap-2">
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
                                        <div className="flex items-start gap-1 shrink-0">
                                          <LenderFollowUpPopover
                                            dealId={deal.id}
                                            dealName={deal.name}
                                            company={deal.company}
                                            dealLenderId={lender.id}
                                            lenderName={lender.name}
                                            lenderStage={configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
                                            lenderNotes={lender.notes}
                                            lenderUpdatedAt={lender.updatedAt}
                                            onSent={() => refreshDeals?.()}
                                          />
                                          <LogLenderActivityPopover
                                            dealId={deal.id}
                                            dealLenderId={lender.id}
                                            lenderName={lender.name}
                                            currentNotes={lender.notes}
                                            onLogged={() => refreshDeals?.()}
                                          />
                                          <CreateLenderTaskButton
                                            dealId={deal.id}
                                            lenderId={lender.id}
                                            lenderName={lender.name}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </SortableLenderItem>
                                  </LenderRowBoundary>
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
                                    if (!lender || typeof lender !== 'object') {
                                      // eslint-disable-next-line no-console
                                      console.warn('[FundingSources] skipping non-object deal_lender in group', group?.id, 'at index', index, lender);
                                      return null;
                                    }
                                    const safeName = typeof lender.name === 'string' ? lender.name : '';
                                    const lenderOutstandingItems = outstandingItems.filter(
                                      item => Array.isArray(item.requestedBy)
                                        ? item.requestedBy.includes(safeName)
                                        : item.requestedBy === safeName
                                    );
                                    const rowKey = lender.id || `${group?.id ?? 'grp'}-idx-${index}`;
                                    return (
                                       <LenderRowBoundary key={rowKey} lenderId={lender.id} lenderName={lender.name}>
                                       <div key={lender.id} className="relative rounded-xl border border-blue-500/25 bg-gradient-to-br from-[hsl(220,30%,10%)] to-[hsl(260,15%,5%)] p-4 shadow-md hover:shadow-lg transition-all">
                                         <div className="absolute right-3 top-3 flex items-center gap-1 z-10">
                                           <LenderFollowUpPopover
                                             dealId={deal.id}
                                             dealName={deal.name}
                                             company={deal.company}
                                             dealLenderId={lender.id}
                                             lenderName={lender.name}
                                             lenderStage={configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
                                             lenderNotes={lender.notes}
                                             lenderUpdatedAt={lender.updatedAt}
                                             onSent={() => refreshDeals?.()}
                                           />
                                           <LogLenderActivityPopover
                                             dealId={deal.id}
                                             dealLenderId={lender.id}
                                             lenderName={lender.name}
                                             currentNotes={lender.notes}
                                             onLogged={() => refreshDeals?.()}
                                           />
                                           <CreateLenderTaskButton
                                             dealId={deal.id}
                                             lenderId={lender.id}
                                             lenderName={lender.name}
                                           />
                                         </div>
                                         <div className="grid grid-cols-[160px_160px_140px_1fr] items-center gap-3 pr-16">
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
                                               <LenderNoteTimestamp
                                                 updatedAt={lender.notesUpdatedAt}
                                                 additionalDates={[
                                                   lender.lastStatusChangeAt,
                                                   lender.updatedAt,
                                                   lender.submittedAt,
                                                   lender.onDeckAt,
                                                   lender.onHoldAt,
                                                   lender.approvedAt,
                                                   lender.passedAt,
                                                   lender.declinedAt,
                                                   lender.excludedAt,
                                                 ]}
                                               />
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
                                                  hydratePassReasonSelection(lender.passReason || '');
                                                } else {
                                                  setSelectedPassReasons([]); setOtherPassReasonText("");
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
                                                            hydratePassReasonSelection(lender.passReason! || '');
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
                                        {/* Funding Source Notes */}
                                        <div className="ml-2 mt-2 space-y-1">
                                          <div className="flex items-start gap-2">
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
                                       </LenderRowBoundary>
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

                </TabsContent>

                {hasDealManagementAccess && (
                <TabsContent value="deal-management" className={cn("mt-6 overflow-hidden", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-management-${tabDirection}`}>
                  <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
                    <DealManagementTab dealId={id!} dealName={deal.company} dealValue={deal.value} dealStage={deal.stage} dealType={deal.dealTypes?.[0]} dealStatus={deal.status} lenderCount={deal.lenders?.length} />
                  </Suspense>
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

                <TabsContent value="data-room" className={cn("mt-6 min-w-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`data-room-${tabDirection}`}>
                  <Card className="w-full max-w-full overflow-hidden p-0 border-[hsl(272,100%,80%,0.45)] shadow-[0_0_16px_hsl(272,100%,70%,0.12),0_8px_32px_hsl(0,0%,0%,0.5)]" style={{ height: 'calc(100vh - 190px)' }}>
                    <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading data room…</div>}>
                      <VdrErrorBoundary>
                        <VdrShell dealId={id!} embedded />
                      </VdrErrorBoundary>
                    </Suspense>
                  </Card>
                </TabsContent>

                <TabsContent value="activity-log" className={cn("mt-6 min-w-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`activity-log-${tabDirection}`}>
                  <Card className="w-full max-w-full overflow-hidden p-0" style={{ height: 'calc(100vh - 190px)' }}>
                    <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading activity…</div>}>
                      <DealActivityLogTab dealId={id!} />
                    </Suspense>
                  </Card>
                </TabsContent>

                <TabsContent value="communications" className={cn("mt-6 min-w-0", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`communications-${tabDirection}`}>
                  <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading communications…</div>}>
                    <DealCommunicationsTab dealId={id!} />
                  </Suspense>
                </TabsContent>

                <TabsContent value="crm-search" className={cn("mt-3", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`crm-search-${tabDirection}`}>
                  <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
                    <DealCrmSearch
                      dealId={id!}
                      dealCompany={deal?.company}
                      dealCrmCompanyId={(deal as any)?.crm_company_id ?? null}
                      dealContactEmail={(deal as any)?.contactEmail ?? null}
                    />
                  </Suspense>
                </TabsContent>

                {hasDealSpaceAccess && (
                <TabsContent value="deal-space" className={cn("mt-6", tabDirection === 'right' && "animate-slide-in-from-right", tabDirection === 'left' && "animate-slide-in-from-left")} key={`deal-space-${tabDirection}`}>
                  <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
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
                  </Suspense>
                </TabsContent>
                )}

                </div>{/* close Main Content div */}
              </div>{/* close Main Content Grid div */}
            </div>{/* close scroll wrapper div */}

                {/* Floating tab rail — pinned to the bottom of the modal
                    shell. In the embedded overlay we use mt-auto + sticky
                    bottom-0 so the rail always sits flush against the
                    modal's bottom edge regardless of tab content length,
                    and stays pinned there while the inner content scrolls.
                    On the standalone /deal/:id route it falls back to a
                    viewport-fixed bar. */}
                <div className={cn(
                  "z-40 shrink-0 pointer-events-none flex justify-start px-0",
                  isEmbedded
                    ? "mt-auto pt-0 pb-0 bg-gradient-to-t from-background/80 via-background/70 to-transparent backdrop-blur-sm"
                    : "fixed bottom-0 inset-x-0"
                )}>
                  <HintTooltip
                    hint="Use these tabs to navigate a deal: Deal Space for AI insights, Deal Information for key details, Lenders for tracking, Deal Management for tasks, Deal Write Up for the memo, Data Room for documents, and Emails for correspondence."
                    visible={isHintVisible('deal-tabs')}
                    onDismiss={() => dismissHint('deal-tabs')}
                    side="top"
                  >
                    <TabsList
                      className="pointer-events-auto inline-flex h-auto items-center justify-start rounded-sm bg-gradient-to-b from-slate-800/95 to-slate-950 backdrop-blur-xl p-0 gap-0 border border-white/10 border-l-0 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.07)] max-w-full overflow-x-visible overflow-y-visible scrollbar-none [&>button+button]:border-l [&>button+button]:border-white/10"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {hasDealSpaceAccess && !isSimplifiedDeal && !isProjectsDeal && (
                        <TabsTrigger
                          value="deal-space"
                          className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Deal Space
                        </TabsTrigger>
                      )}
                      <TabsTrigger
                        value="deal-info"
                        className="relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                      >
                        Deal Info
                      </TabsTrigger>
                      {!isSimplifiedDeal && !isProjectsDeal && (
                        <TabsTrigger
                          value="lenders"
                          className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                        >
                          Funding Sources
                          {deal.lenders && deal.lenders.length > 0 && (
                            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                              {deal.lenders.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      )}
                      {!isSimplifiedDeal && hasDealManagementAccess && !isProjectsDeal && (
                        <TabsTrigger
                          value="deal-management"
                          className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                        >
                          Management
                          {infoRequestActionCount > 0 && (
                            <Badge variant="destructive" className="h-[18px] min-w-[18px] px-1 text-[11px] leading-none rounded-full justify-center">
                              {infoRequestActionCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                      )}
                      {!isSimplifiedDeal && !isProjectsDeal && (
                        <TabsTrigger
                          value="deal-writeup"
                          className="relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                        >
                          Write Up
                        </TabsTrigger>
                      )}
                      {(!isSimplifiedDeal || isFinServDeal) && (
                        <TabsTrigger
                          value="data-room"
                          className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                        >
                          Data Room
                          {attachments.length > 0 && (
                            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                              {attachments.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      )}
                      {!isProjectsDeal && (
                      <TabsTrigger
                        value="activity-log"
                        className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                      >
                        <History className="h-3.5 w-3.5" />
                        Activity
                      </TabsTrigger>
                      )}
                      {!isProjectsDeal && (
                      <TabsTrigger
                        value="communications"
                        className="gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Communications
                      </TabsTrigger>
                      )}
                    </TabsList>
                  </HintTooltip>
                </div>

          </Tabs>
        </main>
      </div>

      {/* Lender Detail Dialog */}
      {/* Required status note dialog on funding-source stage changes */}
      <Dialog
        open={!!pendingStageNoteChange}
        onOpenChange={(open) => {
          if (!open) setPendingStageNoteChange(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a status note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Moving <span className="text-foreground font-medium">{pendingStageNoteChange?.lenderName}</span>{' '}
              from <span className="text-foreground">{pendingStageNoteChange?.fromLabel}</span>{' '}
              to <span className="text-foreground">{pendingStageNoteChange?.toLabel}</span>. A status note is required.
            </p>
            <Textarea
              value={pendingStageNoteText}
              onChange={(e) => setPendingStageNoteText(e.target.value)}
              placeholder="What changed? (context, next steps, etc.)"
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingStageNoteChange(null)}>
              Cancel
            </Button>
            <Button
              disabled={!pendingStageNoteText.trim()}
              onClick={() => {
                const change = pendingStageNoteChange;
                if (!change || !pendingStageNoteText.trim()) return;
                change.apply(pendingStageNoteText);
                setPendingStageNoteChange(null);
              }}
            >
              Save & update stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLenderName} onOpenChange={(open) => !open && setSelectedLenderName(null)}>
        <DialogContent className="max-w-3xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-7 pt-5 pb-4 border-b border-border/60 bg-muted/10 relative">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight pr-40">
              {(() => {
                const ml = masterLenders.find(
                  (m) => m.name.toLowerCase().trim() === (selectedLenderName || '').toLowerCase().trim(),
                );
                const target = ml?.id
                  ? `/lenders?lender=${encodeURIComponent(ml.id)}`
                  : `/lenders?lender=${encodeURIComponent(selectedLenderName || '')}`;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLenderName(null);
                      navigate(target);
                    }}
                    className="text-left hover:underline underline-offset-2 decoration-dotted"
                    title="Open in Funding Sources"
                  >
                    {selectedLenderName}
                  </button>
                );
              })()}
              <LenderFlagIndicator lenderName={selectedLenderName || ''} />
            </DialogTitle>
            {(() => {
              const hdrLender = deal?.lenders?.find((l) => l.name === selectedLenderName);
              if (!deal || !hdrLender || !selectedLenderName) return null;
              return (
                <div className="mt-2.5 flex items-center gap-2">
                  <CreateLenderTaskButton
                    dealId={deal.id}
                    lenderId={hdrLender.id}
                    lenderName={selectedLenderName}
                    variant="labeled"
                    className="w-auto px-2.5"
                  />
                </div>
              );
            })()}
            {(() => {
              const lenderList = deal?.lenders || [];
              const idx = lenderList.findIndex(l => l.name === selectedLenderName);
              if (lenderList.length < 2 || idx < 0) return null;
              const goPrev = () => {
                const prev = lenderList[(idx - 1 + lenderList.length) % lenderList.length];
                if (prev) setSelectedLenderName(prev.name);
              };
              const goNext = () => {
                const next = lenderList[(idx + 1) % lenderList.length];
                if (next) setSelectedLenderName(next.name);
              };
              return (
                <div className="absolute right-14 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Previous funding source"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {idx + 1}/{lenderList.length}
                  </span>
                  <button
                    type="button"
                    onClick={goNext}
                    className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Next funding source"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                </div>
              );
            })()}
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
            const lenderAllRequestedItems = outstandingItems.filter(item =>
              Array.isArray(item.requestedBy)
                ? item.requestedBy.includes(selectedLenderName)
                : item.requestedBy === selectedLenderName,
            );
            const lenderCompletedItems = lenderAllRequestedItems.filter(item =>
              item.deliveredToLenders.includes(selectedLenderName),
            );
            const currentStage = configuredStages.find(s => s.id === dealLender?.stage);
            return (
              <Tabs
                value={lenderDialogTab}
                onValueChange={(v) => setLenderDialogTab(v as any)}
                className="w-full flex flex-row flex-1 min-h-0"
              >
                <div className="shrink-0 w-40 border-r border-border/60 bg-muted/15 px-2.5 py-4">
                  <TabsList className="flex flex-col h-auto w-full bg-transparent p-0 gap-0.5">
                    <TabsTrigger
                      value="overview"
                      className="w-full justify-start text-xs h-9 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="workflow"
                      className="w-full justify-start text-xs h-9 px-3 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Workflow
                      {(lenderOutstandingItems.length + lenderActivities.length) > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] ml-auto">
                          {lenderOutstandingItems.length + lenderActivities.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="funding-source"
                      className="w-full justify-start text-xs h-9 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Funding Source
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1 min-h-0 min-w-0">
                  <div className="px-7 py-6">

                {/* ─────────── OVERVIEW ─────────── */}
                <TabsContent value="overview" className="m-0 focus-visible:outline-none">
                  {dealLender ? (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      {/* Left: editable decision fields (~60%) */}
                      <div className="md:col-span-3 min-w-0 space-y-5">
                        {/* Stage — visually prominent */}
                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Stage
                          </Label>
                          <Select
                            value={dealLender.stage}
                            onValueChange={(value) => {
                              const newStage = configuredStages.find(s => s.id === value);
                              if (newStage?.group === 'passed') {
                                setPendingPassStageChange({ lenderId: dealLender.id, newStageId: value, isEditing: false });
                                setSelectedPassReasons([]); setOtherPassReasonText("");
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
                            <SelectTrigger className="h-10 mt-2 w-full min-w-0 bg-background text-sm font-medium [&>span]:truncate [&>span]:whitespace-nowrap">
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
                          {currentStage?.group && (
                            <p className="mt-2 text-[10px] capitalize text-muted-foreground/80">
                              Group · {currentStage.group}
                            </p>
                          )}
                        </div>

                        {/* Score (secondary) */}
                        {scoreConfig.enabled && (
                          <div className="min-w-0">
                            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Score
                            </Label>
                            <Select
                              value={dealLender.score != null ? String(dealLender.score) : ''}
                              onValueChange={(value) => {
                                const scoreVal = value === '' ? null : Number(value);
                                withSavingAsync(`lender-score-${dealLender.id}`, async () => {
                                  await updateLenderInDb(dealLender.id, { score: scoreVal });
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 mt-2 w-full min-w-0 bg-background [&>span]:truncate [&>span]:whitespace-nowrap">
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

                        {/* Preferred contact for this deal */}
                        <DealLenderContactPicker
                          dealLenderId={dealLender.id}
                          masterLenderId={masterLender?.id ?? null}
                          directoryDefault={{
                            name: masterLender?.contact_name ?? null,
                            title: masterLender?.contact_title ?? null,
                            email: masterLender?.email ?? null,
                          }}
                        />

                        {/* Notes — larger */}
                        <div className="min-w-0">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Notes
                          </Label>
                          <div className="mt-2 min-h-[140px] rounded-lg border border-border/70 bg-background p-2 text-sm leading-relaxed">
                            <InlineEditField
                              value={dealLender.notes || ''}
                              onSave={(value) => {
                                withSavingAsync(`lender-notes-${dealLender.id}`, async () => {
                                  await updateLenderInDb(dealLender.id, { notes: value });
                                });
                              }}
                              type="textarea"
                              placeholder="Add notes specific to this funding source on this deal…"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right: status history + meta (~40%) */}
                      <div className="md:col-span-2 min-w-0 space-y-4">
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Status History
                            </Label>
                            <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                              Read-only
                            </Badge>
                          </div>
                          {(() => {
                            const timeline = buildStatusTimeline(dealLender);
                            if (timeline.length === 0) {
                              return <p className="text-xs text-muted-foreground italic">No recorded transitions</p>;
                            }
                            return (
                              <div className="space-y-2.5">
                                {timeline.map((event, index) => (
                                  <div key={`${event.kind}-${event.iso}-${index}`} className="flex gap-2.5">
                                    <div className="flex flex-col items-center pt-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                                      {index < timeline.length - 1 && <span className="mt-1 h-6 w-px bg-border" />}
                                    </div>
                                    <div className="min-w-0 pb-0.5">
                                      <div className="text-xs font-medium leading-tight">{event.label}</div>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-[10px] text-muted-foreground cursor-default">
                                            {event.approximate ? '~' : ''}{formatShortDate(event.iso)}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <div className="space-y-1">
                                            <div>{formatFullTimestamp(event.iso)}</div>
                                            {event.approximate && <div className="text-muted-foreground">approximate</div>}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Quick meta */}
                        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Open requests</span>
                            <span className="font-medium">{lenderOutstandingItems.length}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Completed</span>
                            <span className="font-medium">{lenderCompletedItems.length}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Activity events</span>
                            <span className="font-medium">{lenderActivities.length}</span>
                          </div>
                          {deal && (
                            <div className="pt-2">
                              <CreateLenderTaskButton
                                dealId={deal.id}
                                lenderId={dealLender.id}
                                lenderName={selectedLenderName}
                                variant="labeled"
                              />
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-full mt-1.5 text-xs justify-start"
                            onClick={() => setLenderDialogTab('workflow')}
                          >
                            <ArrowRight className="h-3 w-3 mr-1.5" />
                            Open Workflow
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      This funding source isn't linked to the deal yet.
                    </p>
                  )}
                </TabsContent>

                {/* ─────────── WORKFLOW ─────────── */}
                <TabsContent value="workflow" className="m-0 focus-visible:outline-none">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <ToggleGroup
                      type="single"
                      value={lenderWorkflowFilter}
                      onValueChange={(v) => v && setLenderWorkflowFilter(v as any)}
                      className="bg-muted/40 rounded-md p-0.5"
                    >
                      <ToggleGroupItem value="all" className="h-7 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
                        All Activity
                      </ToggleGroupItem>
                      <ToggleGroupItem value="requested" className="h-7 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm gap-1.5">
                        Requested Items
                        {lenderOutstandingItems.length > 0 && (
                          <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                            {lenderOutstandingItems.length}
                          </Badge>
                        )}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="completed" className="h-7 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm gap-1.5">
                        Completed
                        {lenderCompletedItems.length > 0 && (
                          <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                            {lenderCompletedItems.length}
                          </Badge>
                        )}
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {lenderAllRequestedItems.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setRequestedItemsDrawerLender(selectedLenderName)}
                      >
                        <ListChecks className="h-3 w-3" />
                        Open full list
                      </Button>
                    )}
                  </div>

                  <div className="space-y-6">
                    {(lenderWorkflowFilter === 'all' || lenderWorkflowFilter === 'requested') && (
                      <section>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {lenderWorkflowFilter === 'requested' ? 'All Requested Items' : 'Open Requested Items'}
                          </h4>
                        </div>
                        {(() => {
                          const items = lenderWorkflowFilter === 'requested'
                            ? lenderAllRequestedItems
                            : lenderOutstandingItems;
                          return items.length > 0 ? (
                            <RequestedItemsSummary
                              items={items}
                              lenderName={selectedLenderName!}
                              onViewAll={() => setRequestedItemsDrawerLender(selectedLenderName)}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              No items requested by this funding source
                            </p>
                          );
                        })()}
                      </section>
                    )}

                    {lenderWorkflowFilter === 'completed' && (
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Delivered to this funding source
                        </h4>
                        {lenderCompletedItems.length > 0 ? (
                          <RequestedItemsSummary
                            items={lenderCompletedItems}
                            lenderName={selectedLenderName!}
                            onViewAll={() => setRequestedItemsDrawerLender(selectedLenderName)}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            Nothing has been marked delivered to this funding source yet
                          </p>
                        )}
                      </section>
                    )}

                    {lenderWorkflowFilter === 'all' && (
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Activity &amp; Communications
                        </h4>
                        {lenderActivities.length > 0 ? (
                          <ActivityTimeline activities={lenderActivities} />
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            No activity recorded for this funding source on this deal
                          </p>
                        )}
                        {deal && (
                          <div className="mt-5 pt-5 border-t border-border/60">
                            <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Comms timeline
                            </h5>
                            <LenderCommsTimeline
                              dealId={deal.id}
                              lenderName={selectedLenderName}
                              masterLenderId={masterLender?.id}
                            />
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </TabsContent>

                {/* ─────────── FUNDING SOURCE ─────────── */}
                <TabsContent value="funding-source" className="m-0 focus-visible:outline-none divide-y divide-border/50 [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
                  {/* About the funding source */}
                  <section className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        About {selectedLenderName}
                      </h4>
                      <LenderNotesPopover lenderName={selectedLenderName} masterLenderId={masterLender?.id} side="left">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Internal notes
                        </Button>
                      </LenderNotesPopover>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                      Directory record · not specific to this deal. Internal notes are not visible to lenders or borrowers.
                    </p>
                  </section>

                  {/* Available contacts */}
                  <section className="min-w-0">
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Available Contacts
                    </h4>
                    {masterLender?.contact_name ? (
                      <div className="rounded-lg border border-border/60 bg-muted/10 p-3.5 space-y-1 text-sm">
                        <p className="font-medium">
                          {masterLender.contact_name}
                          {masterLender.contact_title ? <span className="font-normal text-muted-foreground">, {masterLender.contact_title}</span> : null}
                        </p>
                        {masterLender.email && (
                          <p className="text-xs text-muted-foreground">{masterLender.email}</p>
                        )}
                        <p className="pt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">Directory default contact</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No contact information available</p>
                    )}
                    {dealLender && (
                      <div className="mt-3 min-w-0">
                        <DealLenderContactPicker
                          dealLenderId={dealLender.id}
                          masterLenderId={masterLender?.id ?? null}
                          directoryDefault={{
                            name: masterLender?.contact_name ?? null,
                            title: masterLender?.contact_title ?? null,
                            email: masterLender?.email ?? null,
                          }}
                        />
                      </div>
                    )}
                  </section>

                  {/* Deal preferences */}
                  <section className="min-w-0">
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Deal Preferences
                    </h4>
                    {lenderDetails?.preferences && lenderDetails.preferences.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {lenderDetails.preferences.map((pref, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">{pref}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No preferences listed</p>
                    )}
                  </section>

                  {/* Other deals with this lender */}
                  <section className="min-w-0">
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Other Deals with {selectedLenderName}
                    </h4>
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
                  </section>
                </TabsContent>

                  </div>
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
          setSelectedPassReasons([]); setOtherPassReasonText("");
          setPassReasonSearch('');
          setOtherPassReasonText('');
          setPassReasonNote('');
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
                  ? `Why is this funding source "${stageName}"?`
                  : 'Why is this funding source being passed?';
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
                        if (isSelected && reason.label.toLowerCase() === 'other') {
                          setOtherPassReasonText('');
                        }
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
            {(() => {
              const otherReason = passReasons.find(r => r.label.toLowerCase() === 'other');
              const otherSelected = !!otherReason && selectedPassReasons.includes(otherReason.id);
              if (!otherSelected) return null;
              return (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Please specify (required)
                  </label>
                  <Input
                    autoFocus
                    placeholder="Enter custom reason..."
                    value={otherPassReasonText}
                    onChange={(e) => setOtherPassReasonText(e.target.value)}
                  />
                </div>
              );
            })()}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-muted-foreground">
                Additional notes (optional)
              </label>
              <Textarea
                rows={3}
                placeholder="Add any additional context — this is saved to the funding source notes on this deal."
                value={passReasonNote}
                onChange={(e) => setPassReasonNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPassReasonDialogOpen(false);
              setPendingPassStageChange(null);
              setSelectedPassReasons([]); setOtherPassReasonText("");
              setOtherPassReasonText('');
              setPassReasonNote('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!pendingPassStageChange) return;

                const lenderId = pendingPassStageChange.lenderId;
                const stageId = pendingPassStageChange.newStageId as LenderStage;

                const reasonLabels = selectedPassReasons.length > 0
                  ? selectedPassReasons.map(id => {
                      const label = passReasons.find(r => r.id === id)?.label || id;
                      if (label.toLowerCase() === 'other' && otherPassReasonText.trim()) {
                        return `Other: ${otherPassReasonText.trim()}`;
                      }
                      return label;
                    })
                  : [];
                const passReasonStr = reasonLabels.join(', ');

                // Build auto-note based on stage label
                const stageName = configuredStages.find(s => s.id === stageId)?.label || 'Passed';
                const freeText = passReasonNote.trim();
                const reasonNote = reasonLabels.length > 0
                  ? `Lender passed due to ${reasonLabels.join(', ')}`
                  : '';
                const autoNote = [reasonNote, freeText].filter(Boolean).join(' — ');

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
                setSelectedPassReasons([]); setOtherPassReasonText("");
                setOtherPassReasonText('');
                setPassReasonNote('');
              }}
              disabled={(() => {
                if (selectedPassReasons.length === 0 && passReasons.length > 0) return true;
                const otherReason = passReasons.find(r => r.label.toLowerCase() === 'other');
                if (otherReason && selectedPassReasons.includes(otherReason.id) && !otherPassReasonText.trim()) return true;
                return false;
              })()}
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
                              {STAGE_CONFIG[dealInfo.stage]?.label ?? String(dealInfo.stage ?? '')}
                            </Badge>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${STATUS_CONFIG[dealInfo.status]?.badgeColor ?? 'bg-muted'} text-white`}
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
        <DialogContent
          className="max-w-[90vw] w-full max-h-[90vh] overflow-auto border-white/10 bg-gradient-to-b from-card/95 via-card/90 to-background/95 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)]"
          style={{
            backgroundImage:
              "radial-gradient(900px 320px at 12% -10%, hsl(var(--primary) / 0.12), transparent 60%), radial-gradient(700px 280px at 88% 110%, hsl(var(--primary) / 0.08), transparent 60%), linear-gradient(to bottom, hsl(var(--card) / 0.96), hsl(var(--background) / 0.96))",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
              Lenders · By Stage
            </DialogTitle>
          </DialogHeader>
          {deal && deal.lenders && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading lenders…</div>}>
            <LendersKanban
              lenders={deal.lenders}
              dealId={deal.id}
              dealName={deal.name}
              dealCompany={deal.company}
              onFollowUpSent={() => refreshDeals?.()}
              configuredStages={configuredStages}
              stageGroups={stageGroups}
              passReasons={passReasons}
              onUpdateLenderGroup={updateLenderGroup}
              onUpdateLenderStage={updateLenderStageDirect}
              onEditPassReasons={(lenderId) => {
                const lender = deal.lenders?.find(l => l.id === lenderId);
                if (lender) {
                  setPendingPassStageChange({ lenderId, newStageId: lender.stage, isEditing: true });
                  if (lender.passReason) {
                    hydratePassReasonSelection(lender.passReason || '');
                  } else {
                    setSelectedPassReasons([]); setOtherPassReasonText("");
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
                  // Defensive: skip records missing a usable name — building
                  // metrics for a null/undefined name previously threw and
                  // crashed the entire Funding Sources section.
                  if (!l || typeof l.name !== 'string' || !l.name.trim()) {
                    // eslint-disable-next-line no-console
                    console.warn('[FundingSources] skipping deal_lender with missing name for metrics', l?.id);
                    return;
                  }
                  const key = l.name.toLowerCase().trim();
                  const masterLender = masterLenders.find(ml => typeof ml?.name === 'string' && ml.name.toLowerCase().trim() === key);
                  const lenderOutstanding = outstandingItems.filter(oi => !oi.completed && oi.requestedBy?.some(r => typeof r === 'string' && r.toLowerCase().trim() === key));
                  // Count active deals for this funding source across all deals
                  let activeDealCount = 0;
                  deals.forEach(d => {
                    d.lenders?.forEach(dl => {
                      if (dl && typeof dl.name === 'string' && dl.name.toLowerCase().trim() === key && dl.trackingStatus !== 'passed' && dl.trackingStatus !== 'on-deck') {
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
            </Suspense>
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
      <Suspense fallback={null}>
      <DealPanelReorderDialog
        open={isPanelReorderDialogOpen}
        onOpenChange={setIsPanelReorderDialogOpen}
        panelOrder={panelOrder}
        panelVisibility={panelVisibility}
        onReorder={reorderPanels}
        onToggleVisibility={togglePanelVisibility}
        onReset={resetToDefault}
      />
      </Suspense>

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
          onUpdateLender={async (lenderId, updates) => {
            await updateLenderInDb(lenderId, updates);
            setDeal(prev => prev ? {
              ...prev,
              lenders: prev.lenders?.map(l => l.id === lenderId
                ? { ...l, ...updates, updatedAt: new Date().toISOString() }
                : l),
            } : prev);
          }}
          onExport={(editableContent) => {
            // 1. Build the Status Report PDF and attach it to the outgoing draft.
            //    Generation runs synchronously (jsPDF) — wrap in try/catch so a
            //    failed PDF never opens a broken composer.
            try {
              const pdfFile = buildStatusReportPdfFile(
                deal,
                configuredStages,
                configuredSubstages,
                outstandingItems,
                editableContent,
              );
              const rawContact = (resolvedClientContact?.name || deal.contact || '').trim();
              const contactDisplayName = rawContact.split(/\s+/)[0] || '';
              // Salutation must be its OWN paragraph, then a blank line,
              // then the body sentence. The composer's signature insertion
              // appends another blank line + the signature block below.
              const salutation = contactDisplayName
                ? `Hey ${contactDisplayName},`
                : 'Hey there,';
              const bodyLine =
                'See attached. See the current status report for your review.';
              const greetingHtml = `<p>${salutation}</p><p><br/></p><p>${bodyLine}</p>`;
              const contactEmail =
                resolvedClientContact?.email ||
                (deal as any).contact_email ||
                deal.contactEmail ||
                null;
              setStatusEmailFlow({
                content: editableContent,
                attachment: pdfFile,
                greetingHtml,
                defaultSubject: `${deal.company} Status Update`,
                defaultRecipients: contactEmail ? [contactEmail] : [],
                contactDisplayName,
              });
              setShowStatusReportPreview(false);
            } catch (err) {
              console.error('Failed to generate status report PDF', err);
              toast({
                title: 'Could not generate status report',
                description:
                  err instanceof Error
                    ? err.message
                    : 'The PDF attachment failed to build. Please try again.',
                variant: 'destructive',
              });
            }
          }}
        />
      )}

      {/* Step 1: thread vs new-email picker (after PDF is generated). */}
      {deal && statusEmailFlow && !statusEmailDraftInitial && (
        <StatusEmailFlowPicker
          open
          onOpenChange={(o) => { if (!o) setStatusEmailFlow(null); }}
          dealId={deal.id}
          dealName={deal.company}
          defaultSubject={statusEmailFlow.defaultSubject}
          defaultRecipients={statusEmailFlow.defaultRecipients}
          bodyPreview={
            statusEmailFlow.contactDisplayName
              ? `Hey ${statusEmailFlow.contactDisplayName}, — See attached. See the current status report for your review.`
              : 'Hey there, — See attached. See the current status report for your review.'
          }
          attachmentName={statusEmailFlow.attachment.name}
          onContinue={(sel: StatusEmailFlowSelection) => {
            setStatusEmailDraftInitial({
              subject: sel.subject,
              bodyHtml: statusEmailFlow.greetingHtml,
              to: sel.to,
              dealId: deal.id,
              attachments: [statusEmailFlow.attachment],
              initialThreadId: sel.threadId,
            });
          }}
        />
      )}

      {/* Step 2: editable composer with attachment + signature. */}
      {deal && statusEmailDraftInitial && (
        <DraftAndSendDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setStatusEmailDraftInitial(null);
              setStatusEmailFlow(null);
            }
          }}
          contextLabel="Status Update"
          initial={statusEmailDraftInitial}
          onSent={() => {
            setStatusEmailDraftInitial(null);
            setStatusEmailFlow(null);
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Floating Deal AI Assistant with operations */}
      {!isEmbedded && (
        <Suspense fallback={null}>
        <FloatingDealAssistant
          dealId={deal.id}
          dealName={deal.company}
          dealValue={deal.value}
          dealStage={deal.stage}
          dealStatus={deal.status}
          dealManager={deal.manager}
          dealNotes={deal.notes}
        />
        </Suspense>
      )}

      {/* Floating left/right pipeline navigation arrows */}
      </div>
      <DealDetailSideNavigation
        currentDealId={deal.id}
        pipelineId={deal.pipelineId}
        dealClass={deal.dealClass}
        companyId={company?.id}
      />
    </>
  );
}
