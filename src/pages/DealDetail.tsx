import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, User, FileText, Clock, Undo2, Building2, Plus, X, ChevronDown, ChevronUp, ChevronRight, Paperclip, File, Trash2, Upload, Download, Save, MessageSquare, Maximize2, Minimize2, History, LayoutGrid, AlertCircle, Search, Loader2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLenderItem } from '@/components/deal/SortableLenderItem';
import { DealMilestones } from '@/components/deals/DealMilestones';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, format } from 'date-fns';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { useDealAttachments, DealAttachmentCategory, DEAL_ATTACHMENT_CATEGORIES } from '@/hooks/useDealAttachments';
import { useDealMilestones } from '@/hooks/useDealMilestones';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useDealsContext } from '@/contexts/DealsContext';
import { Deal, DealStatus, DealStage, EngagementType, ExclusivityType, LenderStatus, LenderStage, LenderSubstage, LenderTrackingStatus, DealLender, DealMilestone, Referrer, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG, MANAGERS, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG, LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';
import { useLenders } from '@/contexts/LendersContext';
import { useLenderStages, STAGE_GROUPS, StageGroup } from '@/contexts/LenderStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ActivityTimeline, ActivityItem, activityLogToItem } from '@/components/deals/ActivityTimeline';
import { useActivityLog } from '@/hooks/useActivityLog';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { OutstandingItems, OutstandingItem } from '@/components/deal/OutstandingItems';
import { LendersKanban } from '@/components/deal/LendersKanban';
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
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { exportDealToCSV, exportDealToPDF, exportDealToWord, exportStatusReportToPDF, exportStatusReportToWord } from '@/utils/dealExport';

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

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const highlightStale = searchParams.get('highlight') === 'stale';
  const { getLenderNames, getLenderDetails } = useLenders();
  const { stages: configuredStages, substages: configuredSubstages, passReasons } = useLenderStages();
  const { dealTypes: availableDealTypes } = useDealTypes();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { getDealById, updateDeal: updateDealInDb, addLenderToDeal, updateLender: updateLenderInDb, deleteLender: deleteLenderInDb, deals } = useDealsContext();
  const { activities: activityLogs, logActivity } = useActivityLog(id);
  const { statusNotes, addStatusNote, deleteStatusNote, isLoading: isLoadingStatusNotes } = useStatusNotes(id);
  const { milestones: dbMilestones, addMilestone: addMilestoneToDb, updateMilestone: updateMilestoneInDb, deleteMilestone: deleteMilestoneFromDb, reorderMilestones } = useDealMilestones(id);
  const lenderNames = getLenderNames();
  
  // Get deal from context
  const contextDeal = getDealById(id || '');
  const [deal, setDeal] = useState<Deal | undefined>(contextDeal);
  
  // Update local deal state when context deal changes, but preserve local edits
  useEffect(() => {
    if (contextDeal) {
      setDeal(prev => {
        if (!prev) return contextDeal;
        
        // Preserve lender order from local state while merging updated data from context
        let mergedLenders = prev.lenders;
        if (prev.lenders && contextDeal.lenders) {
          // Create a map of context lenders for quick lookup
          const contextLenderMap = new Map(contextDeal.lenders.map(l => [l.id, l]));
          // Keep local order, update with context data, filter out deleted lenders
          mergedLenders = prev.lenders
            .filter(l => contextLenderMap.has(l.id))
            .map(localLender => {
              const contextLender = contextLenderMap.get(localLender.id);
              // Merge context data but preserve local notes that may be in edit
              return contextLender ? {
                ...contextLender,
                notes: localLender.notes, // Preserve local notes during editing
                notesHistory: contextLender.notesHistory, // Use context history (persisted)
              } : localLender;
            });
          // Add any new lenders from context that aren't in local state
          contextDeal.lenders.forEach(cl => {
            if (!prev.lenders?.find(l => l.id === cl.id)) {
              mergedLenders = [...(mergedLenders || []), cl];
            }
          });
        }
        
        // Merge context changes with local state, preserving local edits for fee fields
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
  
  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  const [lenderSearchQuery, setLenderSearchQuery] = useState('');
  const [isLenderDropdownOpen, setIsLenderDropdownOpen] = useState(false);
  const [isStatusHistoryExpanded, setIsStatusHistoryExpanded] = useState(false);
  const [selectedLenderName, setSelectedLenderName] = useState<string | null>(null);
  const [removedLenders, setRemovedLenders] = useState<{ lender: DealLender; timestamp: string; id: string }[]>([]);
  const [outstandingItems, setOutstandingItems] = useState<OutstandingItem[]>([]);
  const [expandedLenderNotes, setExpandedLenderNotes] = useState<Set<string>>(new Set());
  const [expandedLenderHistory, setExpandedLenderHistory] = useState<Set<string>>(new Set());
  const [selectedReferrer, setSelectedReferrer] = useState<Referrer | null>(null);
  const [isLendersKanbanOpen, setIsLendersKanbanOpen] = useState(false);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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
    if (!lender.updatedAt || lender.trackingStatus !== 'active') return { isStale: false, isUrgent: false };
    const daysSinceUpdate = differenceInDays(new Date(), new Date(lender.updatedAt));
    const isUrgent = daysSinceUpdate >= preferences.lenderUpdateRedDays;
    const isStale = daysSinceUpdate >= preferences.lenderUpdateYellowDays;
    return { isStale, isUrgent };
  }, [preferences.lenderUpdateYellowDays, preferences.lenderUpdateRedDays]);

  // View preferences - load from localStorage
  const savedViewPrefs = useMemo(() => {
    const saved = localStorage.getItem('dealDetailViewPrefs');
    return saved ? JSON.parse(saved) : null;
  }, []);
  
  const [isLendersExpanded, setIsLendersExpanded] = useState<boolean>(
    savedViewPrefs?.isLendersExpanded ?? true
  );
  const [lenderGroupFilter, setLenderGroupFilter] = useState<StageGroup | 'all'>(
    savedViewPrefs?.lenderGroupFilter ?? 'all'
  );
  const [attachmentFilter, setAttachmentFilter] = useState<'all' | 'term-sheets' | 'credit-file' | 'reports'>(
    savedViewPrefs?.attachmentFilter ?? 'all'
  );
  
  // Track if view has been modified from saved state
  const [viewModified, setViewModified] = useState(false);
  
  // Check if current view differs from saved preferences
  useEffect(() => {
    const currentPrefs = {
      isLendersExpanded,
      lenderGroupFilter,
      attachmentFilter,
    };
    const savedPrefs = savedViewPrefs || {
      isLendersExpanded: true,
      lenderGroupFilter: 'all',
      attachmentFilter: 'all',
    };
    
    const hasChanged = 
      currentPrefs.isLendersExpanded !== savedPrefs.isLendersExpanded ||
      currentPrefs.lenderGroupFilter !== savedPrefs.lenderGroupFilter ||
      currentPrefs.attachmentFilter !== savedPrefs.attachmentFilter;
    
    setViewModified(hasChanged);
  }, [isLendersExpanded, lenderGroupFilter, attachmentFilter, savedViewPrefs]);
  
  const saveViewPreferences = useCallback(() => {
    const prefs = {
      isLendersExpanded,
      lenderGroupFilter,
      attachmentFilter,
    };
    localStorage.setItem('dealDetailViewPrefs', JSON.stringify(prefs));
    setViewModified(false);
    toast({
      title: "View saved",
      description: "Your view preferences have been saved as the default.",
    });
  }, [isLendersExpanded, lenderGroupFilter, attachmentFilter]);
  
  // Pass reason dialog state
  const [passReasonDialogOpen, setPassReasonDialogOpen] = useState(false);
  const [pendingPassStageChange, setPendingPassStageChange] = useState<{
    lenderId: string;
    newStageId: string;
  } | null>(null);
  const [selectedPassReason, setSelectedPassReason] = useState<string | null>(null);
  const [passReasonSearch, setPassReasonSearch] = useState('');
  
  // Deal attachments
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<DealAttachmentCategory>('credit-file');
  const { 
    attachments, 
    isLoading: isLoadingAttachments, 
    uploadMultipleAttachments, 
    deleteAttachment,
    formatFileSize 
  } = useDealAttachments(id || null);
  
  const filteredAttachments = attachmentFilter === 'all' 
    ? attachments 
    : attachments.filter(a => a.category === attachmentFilter);

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
      onUndo: () => {
        // Restore the lender
        setDeal(prev => {
          if (!prev) return prev;
          return { ...prev, lenders: [...(prev.lenders || []), item.lender], updatedAt: new Date().toISOString() };
        });
        // Remove from removed lenders list
        setRemovedLenders(prev => prev.filter(r => r.id !== item.id));
        toast({
          title: "Lender restored",
          description: `${item.lender.name} has been restored to the deal.`,
        });
      },
    }));
    return [...localActivities, ...dbActivities].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activityLogs, removedLenders]);

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
      stage: 'reviewing-drl',
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
  }, [deal, addLenderToDeal, logActivity]);

  const updateLenderNotes = useCallback((lenderId: string, notes: string, committed: Record<string, string>) => {
    const committedNote = committed[lenderId]?.trim() || '';
    
    setDeal(prev => {
      if (!prev) return prev;
      const updatedLenders = prev.lenders?.map(l => {
        if (l.id !== lenderId) return l;
        
        const currentNote = l.notes?.trim() || '';
        
        // If there's a committed note and user starts typing something different, log it to history
        if (committedNote && notes.trim() !== committedNote && currentNote === committedNote) {
          const newHistory = [...(l.notesHistory || [])];
          newHistory.unshift({
            text: committedNote,
            updatedAt: new Date().toISOString(),
          });
          // Clear the committed note since it's now in history
          setCommittedNotes(prev => {
            const next = { ...prev };
            delete next[lenderId];
            return next;
          });
          return { ...l, notes, notesHistory: newHistory };
        }
        
        return { ...l, notes };
      });
      return { ...prev, lenders: updatedLenders };
    });
  }, []);

  // Track the last committed note for each lender to detect when user starts editing again
  const [committedNotes, setCommittedNotes] = useState<Record<string, string>>({});
  
  // Track which lender just had notes saved for visual feedback
  const [savedNotesFlash, setSavedNotesFlash] = useState<Set<string>>(new Set());

  const commitLenderNotes = useCallback((lenderId: string) => {
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    const currentNote = lender?.notes?.trim() || '';
    
    // Don't save empty notes
    if (!currentNote) return;
    
    // Store this as the committed note
    setCommittedNotes(prev => ({ ...prev, [lenderId]: currentNote }));
    
    // Trigger visual feedback
    setSavedNotesFlash(prev => new Set(prev).add(lenderId));
    setTimeout(() => {
      setSavedNotesFlash(prev => {
        const next = new Set(prev);
        next.delete(lenderId);
        return next;
      });
    }, 1500);
    
    // Persist to database
    updateLenderInDb(lenderId, { notes: currentNote });
    
    toast({
      title: "Note saved",
      description: "Your note has been saved successfully.",
    });
  }, [deal?.lenders, updateLenderInDb]);

  const updateLenderGroup = useCallback((lenderId: string, newGroup: StageGroup, passReason?: string) => {
    // Find the first stage in the target group
    const targetStage = configuredStages.find(s => s.group === newGroup);
    if (!targetStage) return;
    
    // Get lender name for activity log
    const lender = deal?.lenders?.find(l => l.id === lenderId);
    const oldStage = lender?.stage ? configuredStages.find(s => s.id === lender.stage) : undefined;
    
    // Persist to database
    updateLenderInDb(lenderId, { 
      stage: targetStage.id, 
      passReason: newGroup === 'passed' ? passReason : undefined 
    });
    
    // Log activity
    if (lender) {
      logActivity('lender_stage_change', `${lender.name} stage changed`, {
        lender_name: lender.name,
        from: oldStage?.label || lender.stage,
        to: targetStage.label,
      });
    }
    
    setDeal(prev => {
      if (!prev) return prev;
      const updatedLenders = prev.lenders?.map(l => 
        l.id === lenderId 
          ? { ...l, stage: targetStage.id as any, passReason: newGroup === 'passed' ? passReason : undefined, updatedAt: new Date().toISOString() } 
          : l
      );
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });
  }, [configuredStages, updateLenderInDb, deal?.lenders, logActivity]);

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

  const deleteMilestone = useCallback(async (id: string) => {
    const success = await deleteMilestoneFromDb(id);
    if (success) {
      toast({
        title: "Milestone deleted",
      });
    }
  }, [deleteMilestoneFromDb]);

  const addOutstandingItem = useCallback((text: string, requestedBy: string[]) => {
    const newItem: OutstandingItem = {
      id: `oi${Date.now()}`,
      text,
      completed: false,
      received: false,
      approved: false,
      deliveredToLenders: [],
      createdAt: new Date().toISOString(),
      requestedBy,
    };
    setOutstandingItems(prev => [...prev, newItem]);
    toast({
      title: "Item added",
    });
  }, []);

  const updateOutstandingItem = useCallback((id: string, updates: Partial<OutstandingItem>) => {
    setOutstandingItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updatedItem = { ...item, ...updates };
        // Set completedAt when both received and approved become true
        const wasCompleted = item.received && item.approved;
        const isNowCompleted = updatedItem.received && updatedItem.approved;
        if (!wasCompleted && isNowCompleted) {
          updatedItem.completedAt = new Date().toISOString();
        } else if (wasCompleted && !isNowCompleted) {
          updatedItem.completedAt = undefined;
        }
        return updatedItem;
      })
    );
  }, []);

  const deleteOutstandingItem = useCallback((id: string) => {
    setOutstandingItems(prev => prev.filter(item => item.id !== id));
    toast({
      title: "Item removed",
    });
  }, []);

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

  if (!deal) {
    return (
      <div className="min-h-screen bg-background">
        <DealsHeader />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] mb-4">Deal Not Found</h1>
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

  // Format number with commas for display in inputs
  const formatWithCommas = (value: number | undefined): string => {
    if (!value) return '';
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Parse currency string (with commas) to number
  const parseCurrencyInput = (valueStr: string): number | undefined => {
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    if (!cleaned) return undefined;
    return parseFloat(cleaned);
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

  const updateDeal = (field: keyof Deal, value: string | number | string[] | undefined) => {
    setDeal(prev => {
      if (!prev) return prev;
      // Save current state to history before updating
      setEditHistory(history => [...history, { deal: prev, field, timestamp: new Date() }]);
      let updated = { ...prev, [field]: value, updatedAt: new Date().toISOString() };
      
      // Auto-calculate total fee when success fee percent or deal value changes
      if (field === 'successFeePercent' || field === 'value') {
        const dealValue = field === 'value' ? (value as number) : prev.value;
        const successPercent = field === 'successFeePercent' ? (value as number | undefined) : prev.successFeePercent;
        if (dealValue && successPercent) {
          updated.totalFee = (successPercent / 100) * dealValue;
        }
      }
      
      // Log activity for significant changes
      const oldValue = prev[field];
      if (field === 'status' || field === 'stage') {
        logActivity(
          field === 'status' ? 'status_change' : 'stage_change',
          `${field.charAt(0).toUpperCase() + field.slice(1)} changed`,
          { from: String(oldValue), to: String(value) }
        );
      } else if (field === 'value') {
        logActivity('value_updated', `Deal value updated to ${value}`, { value: String(value) });
      } else {
        logActivity('deal_updated', `${field.charAt(0).toUpperCase() + field.slice(1)} updated`, { field });
      }
      
      // Persist to database
      updateDealInDb(prev.id, { [field]: value } as Partial<Deal>);
      
      toast({
        title: "Deal updated",
        description: `${field.charAt(0).toUpperCase() + field.slice(1)} has been updated.`,
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
        <title>{deal.name} - nAItive</title>
        <meta name="description" content={`Deal details for ${deal.name} with ${deal.company}`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          {/* Back button and Undo */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Pipeline
              </Link>
            </Button>
            <div className="flex items-center gap-2">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Status Report
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  <DropdownMenuItem onClick={() => {
                    exportStatusReportToPDF(deal, configuredStages, configuredSubstages, outstandingItems);
                    toast({ title: "PDF exported", description: "Status report exported to PDF." });
                  }}>
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
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
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

          {/* Stale Lenders Notification */}
          {staleLendersInfo && !isDealNotificationDismissed && (
            <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex flex-col flex-1">
                <span className="text-sm font-medium text-destructive">
                  Lenders need update
                </span>
                <span className="text-xs text-destructive/70">
                  {staleLendersInfo.count} lender{staleLendersInfo.count !== 1 ? 's' : ''} haven't been updated in {staleLendersInfo.maxDays}+ days
                </span>
              </div>
              <button
                onClick={handleDismissNotification}
                className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-destructive/20 transition-colors"
                title="Dismiss for 24 hours"
              >
                <X className="h-4 w-4 text-destructive" />
              </button>
            </div>
          )}

          {/* Header Card */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
                <InlineEditField
                  value={deal.company}
                  onSave={(value) => updateDeal('company', value)}
                  displayClassName="text-5xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]"
                />
                <InlineEditField
                  value={formatValue(deal.value)}
                  onSave={(value) => updateDeal('value', parseValue(value))}
                  displayClassName="text-5xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]"
                />
              </div>
              
              <div className="flex items-center gap-2 mt-4">
                <Select
                  value={deal.status}
                  onValueChange={(value: DealStatus) => updateDeal('status', value)}
                >
                  <SelectTrigger className={`w-auto ${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg h-6 px-2`}>
                    <SelectValue />
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
                <Select
                  value={deal.stage}
                  onValueChange={(value: DealStage) => updateDeal('stage', value)}
                >
                  <SelectTrigger className="w-auto text-xs rounded-lg h-6 px-2 border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-start justify-between gap-4 border-t border-border mt-4 pt-4">
                <div className="w-[60%] flex items-start gap-2 pl-4">
                  <span className="text-lg text-foreground/90 mt-0.5">•</span>
                  <InlineEditField
                    value={deal.notes || ''}
                    onSave={async (value) => {
                      // Save previous note to history before updating
                      if (deal.notes && deal.notes.trim()) {
                        await addStatusNote(deal.notes.trim());
                      }
                      updateDeal('notes', value);
                    }}
                    type="textarea"
                    placeholder="Click to add status notes..."
                    displayClassName="text-lg text-foreground/90"
                  />
                </div>
                <div className={`flex items-center gap-2 text-sm text-muted-foreground shrink-0 ${timeAgoData.highlightClass}`}>
                  <Clock className="h-4 w-4" />
                  <span>{timeAgoData.text}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Milestones */}
              <DealMilestones
                milestones={dbMilestones}
                onAdd={addMilestone}
                onUpdate={updateMilestone}
                onDelete={deleteMilestone}
                onReorder={reorderMilestones}
              />
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* Left Column - Notes & Actions */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {statusNotes.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Status History
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setIsStatusHistoryExpanded(!isStatusHistoryExpanded)}
                    >
                      {isStatusHistoryExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Show ({statusNotes.length})
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  {isStatusHistoryExpanded && (
                    <CardContent className="space-y-3 pt-0">
                      {statusNotes.map((item) => (
                        <div key={item.id} className="text-sm p-3 bg-muted/50 rounded-lg group relative">
                          <p className="text-muted-foreground pr-6">{item.note}</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {format(new Date(item.created_at), 'MMM d, yyyy')} at {format(new Date(item.created_at), 'h:mm a')}
                          </p>
                          <button
                            onClick={() => deleteStatusNote(item.id)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Outstanding Items */}
              <OutstandingItems
                items={outstandingItems}
                lenderNames={deal.lenders?.map(l => l.name) || []}
                onAdd={addOutstandingItem}
                onUpdate={updateOutstandingItem}
                onDelete={deleteOutstandingItem}
              />

              {/* Lenders Card */}
              <Collapsible open={isLendersExpanded} onOpenChange={setIsLendersExpanded}>
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 hover:text-primary transition-colors">
                          {isLendersExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <CardTitle className="text-lg">
                            Lenders
                          </CardTitle>
                          {deal.lenders && deal.lenders.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground">
                              ({deal.lenders.length})
                            </span>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      {deal.lenders && deal.lenders.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLenderGroupFilter('all')}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              lenderGroupFilter === 'all'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            All
                          </button>
                          {STAGE_GROUPS.map(group => {
                            const count = deal.lenders?.filter(l => {
                              const stage = configuredStages.find(s => s.id === l.stage);
                              return stage?.group === group.id;
                            }).length || 0;
                            return (
                              <button
                                key={group.id}
                                onClick={() => setLenderGroupFilter(group.id)}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${
                                  lenderGroupFilter === group.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${group.color}`} />
                                {group.label}
                                {count > 0 && <span className="font-medium">({count})</span>}
                              </button>
                            );
                          })}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setIsLendersKanbanOpen(true)}
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                  <div className="space-y-4">
                    {deal.lenders && deal.lenders.length > 0 && (
                      <>
                        {lenderGroupFilter === 'all' ? (
                          // Flat list when "All" is selected - with drag and drop
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleLenderDragEnd}
                          >
                            <SortableContext
                              items={deal.lenders.map(l => l.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {deal.lenders.map((lender, index) => {
                                const lenderOutstandingItems = outstandingItems.filter(
                                  item => Array.isArray(item.requestedBy) 
                                    ? item.requestedBy.includes(lender.name)
                                    : item.requestedBy === lender.name
                                );
                                const staleStatus = isLenderStale(lender);
                                const shouldHighlight = highlightStale && staleStatus.isStale;
                                return (
                                  <SortableLenderItem key={lender.id} lender={lender}>
                                    <div className={cn(
                                      index > 0 ? 'pt-3 border-t border-border' : '',
                                      'pl-6',
                                      shouldHighlight && staleStatus.isUrgent && 'bg-destructive/10 -ml-2 pl-8 pr-2 py-2 rounded-lg border border-destructive/20',
                                      shouldHighlight && !staleStatus.isUrgent && 'bg-warning/10 -ml-2 pl-8 pr-2 py-2 rounded-lg border border-warning/20'
                                    )}>
                                      <div className="grid grid-cols-[140px_160px_140px_1fr] items-center gap-3">
                                  <div className="flex flex-col">
                                    <button 
                                      className="font-medium truncate text-left hover:text-primary hover:underline cursor-pointer"
                                      onClick={() => setSelectedLenderName(lender.name)}
                                    >
                                      {lender.name}
                                    </button>
                                    {(() => {
                                      const timeInfo = getLenderTimeInfo(lender.updatedAt);
                                      return timeInfo.text ? (
                                        <span className={`text-[10px] text-muted-foreground ${timeInfo.highlightClass}`}>
                                          {timeInfo.text}
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                  <Select
                                    value={lender.stage}
                                    onValueChange={(value: LenderStage) => {
                                      const newStage = configuredStages.find(s => s.id === value);
                                      if (newStage?.group === 'passed') {
                                        setPendingPassStageChange({ lenderId: lender.id, newStageId: value });
                                        setSelectedPassReason(null);
                                        setPassReasonDialogOpen(true);
                                      } else {
                                        const updatedLenders = deal.lenders?.map(l => 
                                          l.id === lender.id ? { ...l, stage: value, passReason: undefined, updatedAt: new Date().toISOString() } : l
                                        );
                                        updateDeal('lenders', updatedLenders as any);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-secondary border-0 justify-start">
                                      <SelectValue>
                                        {configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {configuredStages.map((stage) => (
                                        <SelectItem key={stage.id} value={stage.id}>
                                          {stage.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={lender.substage || '__none__'}
                                    onValueChange={(value: LenderSubstage) => {
                                      const updatedLenders = deal.lenders?.map(l => 
                                        l.id === lender.id ? { ...l, substage: value === '__none__' ? undefined : value, updatedAt: new Date().toISOString() } : l
                                      );
                                      updateDeal('lenders', updatedLenders as any);
                                    }}
                                  >
                                    <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-muted/50 border-0 justify-start">
                                      <SelectValue placeholder="Milestone">
                                        {lender.substage ? (configuredSubstages.find(s => s.id === lender.substage)?.label || lender.substage) : 'Milestone'}
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
                                  <div className="flex justify-end">
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Are you sure you want to delete {lender.name}?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will remove the lender from this deal. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => {
                                              const removedLender = lender;
                                              const updatedLenders = deal.lenders?.filter(l => l.id !== lender.id);
                                              setDeal(prev => {
                                                if (!prev) return prev;
                                                setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
                                                return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
                                              });
                                              setRemovedLenders(prev => [...prev, {
                                                lender: removedLender,
                                                timestamp: new Date().toISOString(),
                                                id: `removed-${Date.now()}`,
                                              }]);
                                              toast({
                                                title: "Lender removed",
                                                description: `${lender.name} has been removed from the deal.`,
                                              });
                                            }}
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                                {lenderOutstandingItems.length > 0 && (
                                  <div className="ml-2 mt-2 space-y-1">
                                    {lenderOutstandingItems.map((item) => (
                                      <div 
                                        key={item.id} 
                                        className="flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l-2 border-muted"
                                      >
                                        <span className={item.deliveredToLenders.includes(lender.name) ? "line-through" : ""}>
                                          {item.text}
                                        </span>
                                        {item.deliveredToLenders.includes(lender.name) ? (
                                          <span className="text-emerald-600 text-[10px] font-medium">Delivered</span>
                                        ) : item.approved ? (
                                          <span className="text-emerald-600 text-[10px] font-medium">Approved</span>
                                        ) : item.received ? (
                                          <span className="text-blue-600 text-[10px] font-medium">Received</span>
                                        ) : (
                                          <span className="text-amber-600 text-[10px] font-medium">Pending</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Lender Notes */}
                                <div className="ml-2 mt-2 space-y-1">
                                  <div className="flex items-start gap-2">
                                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-1.5 flex-shrink-0" />
                                    {lender.notesUpdatedAt && (
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1.5">
                                        {format(new Date(lender.notesUpdatedAt), 'MM-dd')}
                                      </span>
                                    )}
                                    <div className="flex-1">
                                      <Textarea
                                        placeholder="Add notes... (Press Enter to save)"
                                        value={lender.notes || ''}
                                        onChange={(e) => updateLenderNotes(lender.id, e.target.value, committedNotes)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            commitLenderNotes(lender.id);
                                          }
                                        }}
                                        className={cn(
                                          "text-xs resize-none py-1.5 transition-all",
                                          expandedLenderNotes.has(lender.id) ? 'min-h-[100px]' : 'min-h-[32px] h-8',
                                          savedNotesFlash.has(lender.id) && 'ring-2 ring-success border-success'
                                        )}
                                        rows={expandedLenderNotes.has(lender.id) ? 4 : 1}
                                      />
                                    </div>
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
                                          <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                                              {format(new Date(historyItem.updatedAt), "MM-dd HH:mm")}
                                            </span>
                                            <p className="text-foreground/80">{historyItem.text}</p>
                                          </div>
                                        ))}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                                    </div>
                                  </SortableLenderItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        ) : (
                          // Grouped list when a specific group is selected
                          STAGE_GROUPS
                            .filter(group => lenderGroupFilter === group.id)
                            .map(group => {
                              const groupLenders = deal.lenders?.filter(l => {
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
                                      <div key={lender.id} className={`${index > 0 ? 'pt-3' : ''}`}>
                                        <div className="grid grid-cols-[140px_160px_140px_1fr] items-center gap-3">
                                          <div className="flex flex-col">
                                            <button 
                                              className="font-medium truncate text-left hover:text-primary hover:underline cursor-pointer"
                                              onClick={() => setSelectedLenderName(lender.name)}
                                            >
                                              {lender.name}
                                            </button>
                                            {(() => {
                                              const timeInfo = getLenderTimeInfo(lender.updatedAt);
                                              return timeInfo.text ? (
                                                <span className={`text-[10px] text-muted-foreground ${timeInfo.highlightClass}`}>
                                                  {timeInfo.text}
                                                </span>
                                              ) : null;
                                            })()}
                                          </div>
                                          <Select
                                            value={lender.stage}
                                            onValueChange={(value: LenderStage) => {
                                              const newStage = configuredStages.find(s => s.id === value);
                                              if (newStage?.group === 'passed') {
                                                setPendingPassStageChange({ lenderId: lender.id, newStageId: value });
                                                setSelectedPassReason(null);
                                                setPassReasonDialogOpen(true);
                                              } else {
                                                const updatedLenders = deal.lenders?.map(l => 
                                                  l.id === lender.id ? { ...l, stage: value, passReason: undefined, updatedAt: new Date().toISOString() } : l
                                                );
                                                updateDeal('lenders', updatedLenders as any);
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-secondary border-0 justify-start">
                                              <SelectValue>
                                                {configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              {configuredStages.map((stage) => (
                                                <SelectItem key={stage.id} value={stage.id}>
                                                  {stage.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <Select
                                            value={lender.substage || '__none__'}
                                            onValueChange={(value: LenderSubstage) => {
                                              const updatedLenders = deal.lenders?.map(l => 
                                                l.id === lender.id ? { ...l, substage: value === '__none__' ? undefined : value, updatedAt: new Date().toISOString() } : l
                                              );
                                              updateDeal('lenders', updatedLenders as any);
                                            }}
                                          >
                                            <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-muted/50 border-0 justify-start">
                                              <SelectValue placeholder="Milestone">
                                                {lender.substage ? (configuredSubstages.find(s => s.id === lender.substage)?.label || lender.substage) : 'Milestone'}
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
                                          <div className="flex justify-end">
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                >
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader>
                                                  <AlertDialogTitle>Are you sure you want to delete {lender.name}?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                    This will remove the lender from this deal. This action cannot be undone.
                                                  </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction
                                                    onClick={() => {
                                                      const removedLender = lender;
                                                      const updatedLenders = deal.lenders?.filter(l => l.id !== lender.id);
                                                      setDeal(prev => {
                                                        if (!prev) return prev;
                                                        setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
                                                        return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
                                                      });
                                                      setRemovedLenders(prev => [...prev, {
                                                        lender: removedLender,
                                                        timestamp: new Date().toISOString(),
                                                        id: `removed-${Date.now()}`,
                                                      }]);
                                                      toast({
                                                        title: "Lender removed",
                                                        description: `${lender.name} has been removed from the deal.`,
                                                      });
                                                    }}
                                                  >
                                                    Delete
                                                  </AlertDialogAction>
                                                </AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                          </div>
                                        </div>
                                        {lenderOutstandingItems.length > 0 && (
                                          <div className="ml-2 mt-2 space-y-1">
                                            {lenderOutstandingItems.map((item) => (
                                              <div 
                                                key={item.id} 
                                                className="flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l-2 border-muted"
                                              >
                                                <span className={item.deliveredToLenders.includes(lender.name) ? "line-through" : ""}>
                                                  {item.text}
                                                </span>
                                                {item.deliveredToLenders.includes(lender.name) ? (
                                                  <span className="text-emerald-600 text-[10px] font-medium">Delivered</span>
                                                ) : item.approved ? (
                                                  <span className="text-emerald-600 text-[10px] font-medium">Approved</span>
                                                ) : item.received ? (
                                                  <span className="text-blue-600 text-[10px] font-medium">Received</span>
                                                ) : (
                                                  <span className="text-amber-600 text-[10px] font-medium">Pending</span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* Lender Notes */}
                                        <div className="ml-2 mt-2 space-y-1">
                                          <div className="flex items-start gap-2">
                                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-1.5 flex-shrink-0" />
                                            {lender.notesUpdatedAt && (
                                              <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1.5">
                                                {format(new Date(lender.notesUpdatedAt), 'MM-dd')}
                                              </span>
                                            )}
                                            <div className="flex-1">
                                              <Textarea
                                                placeholder="Add notes... (Press Enter to save)"
                                                value={lender.notes || ''}
                                                onChange={(e) => updateLenderNotes(lender.id, e.target.value, committedNotes)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    commitLenderNotes(lender.id);
                                                  }
                                                }}
                                                className={cn(
                                                  "text-xs resize-none py-1.5 transition-all",
                                                  expandedLenderNotes.has(lender.id) ? 'min-h-[100px]' : 'min-h-[32px] h-8',
                                                  savedNotesFlash.has(lender.id) && 'ring-2 ring-success border-success'
                                                )}
                                                rows={expandedLenderNotes.has(lender.id) ? 4 : 1}
                                              />
                                            </div>
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
                                                    <div key={idx} className="text-xs">
                                                      <span className="text-[10px] text-muted-foreground">
                                                        {format(new Date(historyItem.updatedAt), 'MM-dd')}
                                                      </span>
                                                      <p className="text-foreground/80 mt-0.5">{historyItem.text}</p>
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
                    <div className={`${deal.lenders && deal.lenders.length > 0 ? 'pt-4 border-t border-border' : ''}`}>
                      <Popover open={isLenderDropdownOpen} onOpenChange={setIsLenderDropdownOpen}>
                        <PopoverTrigger asChild>
                          <div className="w-1/2">
                            <Input
                              placeholder="Type to add a lender..."
                              value={lenderSearchQuery}
                              onChange={(e) => {
                                setLenderSearchQuery(e.target.value);
                                setIsLenderDropdownOpen(true);
                              }}
                              onFocus={() => {
                                setIsLenderDropdownOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && lenderSearchQuery.trim()) {
                                  const availableLenders = lenderNames.filter(
                                    name => !deal.lenders?.some(l => l.name === name) &&
                                    name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                                  );
                                  if (availableLenders.length > 0) {
                                    addLender(availableLenders[0]);
                                  } else {
                                    addLender(lenderSearchQuery);
                                  }
                                  setLenderSearchQuery('');
                                  setIsLenderDropdownOpen(false);
                                }
                                if (e.key === 'Escape') {
                                  setIsLenderDropdownOpen(false);
                                }
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[var(--radix-popover-trigger-width)] p-0 max-h-48 overflow-auto" 
                          align="start"
                          sideOffset={4}
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          {lenderNames.filter(
                            name => !deal.lenders?.some(l => l.name === name) &&
                            name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                          ).map((lenderName) => (
                            <button
                              key={lenderName}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                              onClick={() => {
                                addLender(lenderName);
                                setLenderSearchQuery('');
                                setIsLenderDropdownOpen(false);
                              }}
                            >
                              {lenderName}
                            </button>
                          ))}
                          {lenderNames.filter(
                            name => !deal.lenders?.some(l => l.name === name) &&
                            name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                          ).length === 0 && lenderSearchQuery.trim() && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                              onClick={() => {
                                addLender(lenderSearchQuery);
                                setLenderSearchQuery('');
                                setIsLenderDropdownOpen(false);
                              }}
                            >
                              Add "{lenderSearchQuery}" as new lender
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Right Column - Deal Info & Activity */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Narrative</label>
                    <Textarea
                      value={deal.narrative || ''}
                      onChange={(e) => updateDeal('narrative', e.target.value)}
                      placeholder="Enter deal narrative..."
                      className="w-full min-h-[80px] resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Deal Manager</span>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={deal.manager}
                        onValueChange={(value) => updateDeal('manager', value)}
                      >
                        <SelectTrigger className="w-auto h-auto p-0 border-0 font-medium bg-transparent hover:bg-muted/50 rounded px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MANAGERS.map((manager) => (
                            <SelectItem key={manager} value={manager}>
                              {manager}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Engagement Type</span>
                    <Select
                      value={deal.engagementType}
                      onValueChange={(value: EngagementType) => updateDeal('engagementType', value)}
                    >
                      <SelectTrigger className="w-auto h-auto p-0 border-0 font-medium bg-transparent hover:bg-muted/50 rounded px-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Exclusivity</span>
                    <Select
                      value={deal.exclusivity || ''}
                      onValueChange={(value: ExclusivityType) => updateDeal('exclusivity', value)}
                    >
                      <SelectTrigger className="w-auto h-auto p-0 border-0 font-medium bg-transparent hover:bg-muted/50 rounded px-1">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EXCLUSIVITY_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground pt-1">Deal Type</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-auto p-0 px-1 font-medium hover:bg-muted/50 rounded max-w-[200px] justify-end"
                        >
                          {deal.dealTypes && deal.dealTypes.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-end">
                              {deal.dealTypes.map(typeId => {
                                const dealType = availableDealTypes.find(dt => dt.id === typeId);
                                return dealType ? (
                                  <Badge key={typeId} variant="secondary" className="text-xs">
                                    {dealType.label}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-sm">Select types</span>
                          )}
                          <ChevronDown className="h-3 w-3 ml-1 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0 bg-popover z-50" align="end">
                        <div className="max-h-[300px] overflow-auto p-1">
                          {availableDealTypes.map((dealType) => {
                            const isSelected = deal.dealTypes?.includes(dealType.id) || false;
                            return (
                              <div
                                key={dealType.id}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                                  isSelected && 'bg-accent/50'
                                )}
                                onClick={() => {
                                  const currentTypes = deal.dealTypes || [];
                                  const newTypes = isSelected
                                    ? currentTypes.filter(t => t !== dealType.id)
                                    : [...currentTypes, dealType.id];
                                  updateDeal('dealTypes', newTypes);
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  className="pointer-events-none"
                                />
                                <span className="flex-1">{dealType.label}</span>
                              </div>
                            );
                          })}
                          {availableDealTypes.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No deal types configured. Add them in Settings.
                            </p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Fee</span>
                    <span className="font-medium text-purple-600">
                      ${formatWithCommas(deal.totalFee)}
                    </span>
                  </div>
                  
                  {/* Fee Breakdown Section */}
                  <Collapsible className="pl-4 border-l-2 border-border/30">
                    <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 rounded px-1 py-1 -mx-1">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                        <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
                        Fee Breakdown
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Retainer</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={formatWithCommas(deal.retainerFee)}
                            onChange={(e) => {
                              const value = parseCurrencyInput(e.target.value);
                              setDeal(prev => prev ? { ...prev, retainerFee: value } : prev);
                            }}
                            onBlur={(e) => {
                              const value = parseCurrencyInput(e.target.value);
                              updateDealInDb(deal.id, { retainerFee: value });
                            }}
                            placeholder="0"
                            className="w-24 h-7 text-right text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Milestone</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={formatWithCommas(deal.milestoneFee)}
                            onChange={(e) => {
                              const value = parseCurrencyInput(e.target.value);
                              setDeal(prev => prev ? { ...prev, milestoneFee: value } : prev);
                            }}
                            onBlur={(e) => {
                              const value = parseCurrencyInput(e.target.value);
                              updateDealInDb(deal.id, { milestoneFee: value });
                            }}
                            placeholder="0"
                            className="w-24 h-7 text-right text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Success Fee</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={deal.successFeePercent ?? ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseFloat(e.target.value) : undefined;
                              setDeal(prev => {
                                if (!prev) return prev;
                                const totalFee = prev.value && value ? (value / 100) * prev.value : prev.totalFee;
                                return { ...prev, successFeePercent: value, totalFee };
                              });
                            }}
                            onBlur={(e) => {
                              const value = e.target.value ? parseFloat(e.target.value) : undefined;
                              const totalFee = deal.value && value ? (value / 100) * deal.value : deal.totalFee;
                              updateDealInDb(deal.id, { successFeePercent: value, totalFee });
                            }}
                            placeholder="0"
                            className="w-16 h-7 text-right text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Referred by</span>
                    <Input
                      value={deal.referredBy?.name || ''}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setDeal(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            referredBy: newName
                              ? { id: prev.referredBy?.id || `ref-${Date.now()}`, name: newName }
                              : undefined,
                            updatedAt: new Date().toISOString(),
                          };
                        });
                      }}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim();
                        const ref = name
                          ? {
                              id: deal.referredBy?.id || `ref-${name.toLowerCase().replace(/\s+/g, '-')}`,
                              name,
                            }
                          : undefined;

                        // Normalize trimmed value in local state
                        setDeal(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            referredBy: ref,
                            updatedAt: new Date().toISOString(),
                          };
                        });

                        // Persist to database on blur
                        if (deal.id) {
                          updateDealInDb(deal.id, { referredBy: ref } as any);
                        }
                      }}
                      placeholder="Enter referral source..."
                      className="flex-1 max-w-[180px] h-8 text-right"
                    />
                  </div>
                  
                  {/* Hours Section */}
                  <Collapsible className="pt-3 border-t border-border/50">
                    <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 rounded px-1 py-1 -mx-1">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
                        Hours
                      </span>
                      <div className="text-right">
                        <span className="font-medium text-sm bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                          {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)).toFixed(1)}h
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)) > 0 
                            ? `$${((deal.totalFee || 0) / ((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0))).toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr`
                            : '-'
                          }
                        </p>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Pre-Signing</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={deal.preSigningHours ?? ''}
                          onChange={(e) => updateDeal('preSigningHours', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="0"
                          className="w-20 h-8 text-right"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Post-Signing</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={deal.postSigningHours ?? ''}
                          onChange={(e) => updateDeal('postSigningHours', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="0"
                          className="w-20 h-8 text-right"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>

              {/* Company Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Company
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Company URL</label>
                    <Input
                      value={deal.companyUrl || ''}
                      onChange={(e) => updateDeal('companyUrl', e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Business Model</label>
                    <Input
                      value={deal.businessModel || ''}
                      onChange={(e) => updateDeal('businessModel', e.target.value)}
                      placeholder="Enter business model..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Contact Name & Information</label>
                    <Textarea
                      value={deal.contactInfo || ''}
                      onChange={(e) => updateDeal('contactInfo', e.target.value)}
                      placeholder="Enter contact details..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Attachments & Documents */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Attachments
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={uploadCategory} 
                        onValueChange={(v) => setUploadCategory(v as DealAttachmentCategory)}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEAL_ATTACHMENT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoadingAttachments}
                      >
                        {isLoadingAttachments ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Upload
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            await uploadMultipleAttachments(files, uploadCategory);
                          }
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                  {/* Filter tabs */}
                  <div className="flex gap-1 mt-3">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'term-sheets', label: 'Term Sheets' },
                      { value: 'credit-file', label: 'Credit File' },
                      { value: 'reports', label: 'Reports' },
                    ].map((filter) => (
                      <Button
                        key={filter.value}
                        variant={attachmentFilter === filter.value ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAttachmentFilter(filter.value as typeof attachmentFilter)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {isLoadingAttachments ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredAttachments.length > 0 ? (
                    <div className="space-y-2">
                      {filteredAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group hover:bg-muted transition-colors"
                        >
                          <a 
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          >
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate hover:underline">{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(attachment.size_bytes)} • {new Date(attachment.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </a>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                if (attachment.url) {
                                  window.open(attachment.url, '_blank');
                                }
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => deleteAttachment(attachment)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No attachments {attachmentFilter !== 'all' ? 'in this category' : 'yet'}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Collapsible defaultOpen>
                <Card>
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger className="flex items-center justify-between w-full group">
                      <CardTitle className="text-lg">
                        Activity
                      </CardTitle>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <ActivityTimeline activities={activities} />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </main>
      </div>

      {/* Lender Detail Dialog */}
      <Dialog open={!!selectedLenderName} onOpenChange={(open) => !open && setSelectedLenderName(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedLenderName}</DialogTitle>
          </DialogHeader>
          {selectedLenderName && (() => {
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
            return (
              <Tabs defaultValue="this-deal" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="this-deal">This Deal</TabsTrigger>
                  <TabsTrigger value="about">About {selectedLenderName}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="this-deal" className="space-y-6 mt-4">
                  {/* Outstanding Items for this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Requested Items</h4>
                    {lenderOutstandingItems.length > 0 ? (
                      <div className="space-y-2">
                        {lenderOutstandingItems.map((item) => (
                          <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg text-sm"
                          >
                            <Checkbox
                              checked={false}
                              onCheckedChange={(checked) => {
                                if (checked && selectedLenderName) {
                                  updateOutstandingItem(item.id, {
                                    deliveredToLenders: [...item.deliveredToLenders, selectedLenderName]
                                  });
                                }
                              }}
                            />
                            <span className="flex-1">{item.text}</span>
                            {item.approved ? (
                              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">Approved</Badge>
                            ) : item.received ? (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">Received</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Requested</Badge>
                            )}
                          </div>
                        ))}
                      </div>
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
                
                <TabsContent value="about" className="space-y-6 mt-4">
                  {/* Contact Information */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
                    {lenderDetails?.contact.name ? (
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {lenderDetails.contact.name}</p>
                        <p><span className="text-muted-foreground">Email:</span> {lenderDetails.contact.email}</p>
                        <p><span className="text-muted-foreground">Phone:</span> {lenderDetails.contact.phone}</p>
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
                        <div key={dealInfo.dealId} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                          <div>
                            <p className="font-medium">{dealInfo.company}</p>
                            <p className="text-xs text-muted-foreground">{dealInfo.dealName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {dealInfo.lenderInfo && (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  {LENDER_STATUS_CONFIG[dealInfo.lenderInfo.status].label}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {LENDER_TRACKING_STATUS_CONFIG[dealInfo.lenderInfo.trackingStatus].label}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
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
          setSelectedPassReason(null);
          setPassReasonSearch('');
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Why is this lender being passed?</DialogTitle>
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
            <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-auto pr-1">
              {passReasons
                .filter((reason) => reason.label.toLowerCase().includes(passReasonSearch.toLowerCase()))
                .map((reason) => (
                <Button
                  key={reason.id}
                  type="button"
                  variant={selectedPassReason === reason.id ? "default" : "outline"}
                  className="h-auto min-h-[2.5rem] py-2 px-3 text-xs leading-tight whitespace-normal text-left justify-start break-words"
                  onClick={() => setSelectedPassReason(reason.id)}
                >
                  {reason.label}
                </Button>
              ))}
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
              setSelectedPassReason(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (pendingPassStageChange && deal) {
                  const updatedLenders = deal.lenders?.map(l => 
                    l.id === pendingPassStageChange.lenderId 
                      ? { ...l, stage: pendingPassStageChange.newStageId as LenderStage, passReason: selectedPassReason || undefined, updatedAt: new Date().toISOString() } 
                      : l
                  );
                  updateDeal('lenders', updatedLenders as any);
                  setPassReasonDialogOpen(false);
                  setPendingPassStageChange(null);
                  setSelectedPassReason(null);
                }
              }}
              disabled={!selectedPassReason && passReasons.length > 0}
            >
              Confirm Pass
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

      {/* Lenders Kanban Dialog */}
      <Dialog open={isLendersKanbanOpen} onOpenChange={setIsLendersKanbanOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Lenders Kanban View</DialogTitle>
          </DialogHeader>
          {deal && deal.lenders && (
            <LendersKanban
              lenders={deal.lenders}
              configuredStages={configuredStages}
              passReasons={passReasons}
              onUpdateLenderGroup={updateLenderGroup}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
