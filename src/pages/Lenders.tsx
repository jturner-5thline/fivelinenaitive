import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { VirtuosoGrid, Virtuoso } from 'react-virtuoso';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List, Loader2, Globe, Download, Upload, Zap, FileCheck, Megaphone, Database, Settings, Users, Columns, Table2, RefreshCw, History, Bell, ChevronDown, FolderPlus, FileX } from 'lucide-react';
import { WorkspacePage } from '@/components/layout/WorkspacePage';
import { BetaBadge } from '@/components/ui/beta-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenderAttachmentsSummary } from '@/hooks/useLenderAttachmentsSummary';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { ImportLendersDialog } from '@/components/lenders/ImportLendersDialog';
import { DuplicateLendersDialog } from '@/components/lenders/DuplicateLendersDialog';
import { SideBySideMergeDialog } from '@/components/lenders/SideBySideMergeDialog';
import { NonBankLendersImportButton } from '@/components/lenders/NonBankLendersImportButton';
import { BankLendersImportButton } from '@/components/lenders/BankLendersImportButton';
import { LenderFiltersPanel, applyLenderFilters, emptyFilters, LenderFilters } from '@/components/lenders/LenderFilters';
import { LendersListSkeleton } from '@/components/lenders/LenderCardSkeleton';
import { LenderGridCard } from '@/components/lenders/LenderGridCard';
import { LenderListCard } from '@/components/lenders/LenderListCard';
import { LenderSpreadsheetView } from '@/components/lenders/LenderSpreadsheetView';
import { exportLendersToCsv, parseCsvToLenders, downloadCsv } from '@/utils/lenderCsv';
import { extractFlexSyncErrorPayload } from '@/utils/flexSyncError';
import { useMasterLenders, MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { LenderTileDisplaySettings } from '@/pages/LenderDatabaseConfig';
import { useLenderSyncRequests } from '@/hooks/useLenderSyncRequests';
import { useLenderSyncRealtimeNotifications } from '@/hooks/useLenderSyncRealtimeNotifications';
import { LenderSyncRequestsPanel } from '@/components/lenders/LenderSyncRequestsPanel';
import { useCanSeeFlexSync } from '@/hooks/useCanSeeFlexSync';

const TILE_DISPLAY_STORAGE_KEY = 'lender-tile-display-settings';

const DEFAULT_TILE_DISPLAY_SETTINGS: LenderTileDisplaySettings = {
  showLenderType: true,
  showDealRange: true,
  showIndustries: true,
  showContactName: false,
  showGeography: false,
  showLoanTypes: false,
  showNdaStatus: true,
  showMarketingStatus: true,
  showActiveDealCount: true,
  maxIndustriesToShow: 2,
};

type SortOption = 'name-asc' | 'name-desc' | 'deals-desc' | 'deals-asc';
type ViewMode = 'list' | 'grid' | 'spreadsheet';

// Adapter type for legacy LenderDetailDialog
interface LenderInfo {
  id?: string;
  name: string;
  contact: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  preferences: string[];
  website?: string;
  description?: string;
  lenderType?: string;
  minDeal?: number | null;
  maxDeal?: number | null;
  geo?: string | null;
  industries?: string[] | null;
  loanTypes?: string[] | null;
  minRevenue?: number | null;
  ebitdaMin?: number | null;
  companyRequirements?: string | null;
  upfrontChecklist?: string | null;
  postTermSheetChecklist?: string | null;
  b2bB2c?: string | null;
  lenderNotes?: string | null;
  tier?: string | null;
  relationshipOwners?: string | null;
}

interface LenderFormContact {
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

const emptyContact = (isPrimary = false): LenderFormContact => ({
  name: '', title: '', email: '', phone: '', isPrimary,
});

interface LenderForm {
  id?: string;
  name: string;
  contacts: LenderFormContact[];
  lenderType: string;
  loanTypes: string;
  minDeal: string;
  maxDeal: string;
  industries: string;
  geo: string;
  description: string;
}

const emptyForm: LenderForm = {
  name: '',
  contacts: [emptyContact(true)],
  lenderType: '',
  loanTypes: '',
  minDeal: '',
  maxDeal: '',
  industries: '',
  geo: '',
  description: '',
};

// Helper to convert MasterLender to LenderInfo for dialog compatibility
function masterLenderToLenderInfo(lender: MasterLender): LenderInfo {
  return {
    id: lender.id,
    name: lender.name,
    contact: {
      name: lender.contact_name || '',
      title: lender.contact_title || '',
      email: lender.email || '',
      phone: lender.contact_phone || '',
    },
    preferences: [
      ...(lender.loan_types || []),
      ...(lender.industries || []),
      lender.geo,
    ].filter(Boolean) as string[],
    website: lender.lender_one_pager_url || undefined,
    description: lender.company_requirements || undefined,
    lenderType: lender.lender_type || undefined,
    minDeal: lender.min_deal,
    maxDeal: lender.max_deal,
    geo: lender.geo,
    industries: lender.industries,
    loanTypes: lender.loan_types,
    minRevenue: lender.min_revenue,
    ebitdaMin: lender.ebitda_min,
    companyRequirements: lender.company_requirements,
    upfrontChecklist: lender.upfront_checklist,
    postTermSheetChecklist: lender.post_term_sheet_checklist,
    b2bB2c: lender.b2b_b2c,
    lenderNotes: lender.deal_structure_notes,
    tier: lender.tier,
    relationshipOwners: lender.relationship_owners,
  };
}

// Helper to format currency
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

export default function Lenders() {
  const navigate = useNavigate();
  const { deals, addLenderToDeal } = useDealsContext();
  const { getLenderSummary, refetch: refetchAttachmentSummaries } = useLenderAttachmentsSummary();
  const { user } = useAuth();
  const { company } = useCompany();
  const quickUploadRef = useRef<HTMLInputElement>(null);
  const [quickUploadTarget, setQuickUploadTarget] = useState<{ lenderName: string; category: 'nda' | 'marketing_materials' } | null>(null);
  const [isQuickUploading, setIsQuickUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLenderId, setEditingLenderId] = useState<string | null>(null);
  const [form, setForm] = useState<LenderForm>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showActiveDealsOnly, setShowActiveDealsOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('lenders-view-mode');
    return (saved === 'grid' || saved === 'list' || saved === 'spreadsheet') ? saved : 'list';
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDuplicatesDialogOpen, setIsDuplicatesDialogOpen] = useState(false);
  const [isSideBySideMergeOpen, setIsSideBySideMergeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<LenderFilters>(emptyFilters);
  const [tileDisplaySettings, setTileDisplaySettings] = useState<LenderTileDisplaySettings>(DEFAULT_TILE_DISPLAY_SETTINGS);
  const [isSyncingToFlex, setIsSyncingToFlex] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showBankImportConfirm, setShowBankImportConfirm] = useState(false);
  const [showNonBankImportConfirm, setShowNonBankImportConfirm] = useState(false);
  const [selectedLenderIds, setSelectedLenderIds] = useState<Set<string>>(new Set());
  const [isPushingSelectedToFlex, setIsPushingSelectedToFlex] = useState(false);

  // FLEx sync features only for ppina@5thline.co and 5th Line admins
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const { canSeeFlexSync } = useCanSeeFlexSync();

  // Get pending sync requests count (only for authorized users)
  const { pendingCount: syncPendingCount, refetch: refetchSyncRequests } = useLenderSyncRequests();

  // Enable realtime notifications for new sync requests (only for authorized users)
  useLenderSyncRealtimeNotifications(canSeeFlexSync ? refetchSyncRequests : () => {});

  // Debounce search query for server-side search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150); // Real-time client-side search
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Load all lenders client-side; we run a rich multi-field search locally.
  const {
    lenders: masterLenders,
    loading: isLoading,
    loadingMore,
    hasMore,
    totalCount,
    loadMore,
    addLender: addMasterLender,
    updateLender: updateMasterLender,
    deleteLender: deleteMasterLender,
    importLenders,
    mergeLenders,
    fetchLenders: refetchMasterLenders,
  } = useMasterLenders({
    // This page needs the full lender list available for reliable cross-referencing
    // against deal activity (e.g., "Active Deals" filter).
    mode: 'all',
    eagerAll: true,
    pageSize: 1000,
    orderBy: { column: 'name', ascending: true },
    // No server-side searchQuery — we filter on the client across many fields.
  });

  // Load tile display settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem(TILE_DISPLAY_STORAGE_KEY);
    if (savedSettings) {
      setTileDisplaySettings(JSON.parse(savedSettings));
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('lenders-view-mode', mode);
  };
  const [selectedLender, setSelectedLender] = useState<LenderInfo | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailEditMode, setIsDetailEditMode] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const fetchLenderSummary = useCallback(async (lenderName: string, websiteUrl: string) => {
    if (!websiteUrl.trim() || !lenderName.trim()) return;
    
    setIsLoadingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('lender-summary', {
        body: { lenderName, websiteUrl },
      });

      if (error) {
        console.error('Error fetching summary:', error);
        toast({ 
          title: 'Could not generate summary', 
          description: 'Please try again or add the description manually.',
          variant: 'destructive' 
        });
        return;
      }

      if (data?.summary) {
        setForm(prev => ({ ...prev, description: data.summary }));
        toast({ title: 'Summary generated', description: 'Lender description has been auto-filled.' });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({ 
        title: 'Could not generate summary', 
        description: 'Please try again or add the description manually.',
        variant: 'destructive' 
      });
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  // Calculate active deals count for each lender
  // Count lenders that are NOT passed, on-deck, or on-hold (i.e., only 'active' tracking status)
  // Use normalized name matching to handle case differences between deal lenders and master lenders
  const activeDealCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const normalizedCounts: Record<string, number> = {};
    
    // Inactive statuses to exclude
    const inactiveStatuses = ['passed', 'on-deck', 'on-hold'];
    
    deals.forEach(deal => {
      deal.lenders?.forEach(lender => {
        // Only count if lender is actively being worked (not passed, on-deck, or on-hold)
        if (!inactiveStatuses.includes(lender.trackingStatus)) {
          const normalizedName = lender.name.toLowerCase().trim();
          normalizedCounts[normalizedName] = (normalizedCounts[normalizedName] || 0) + 1;
        }
      });
    });
    
    // Map master lender names to their counts using normalized matching
    masterLenders.forEach(ml => {
      const normalizedMasterName = ml.name.toLowerCase().trim();
      if (normalizedCounts[normalizedMasterName]) {
        counts[ml.name] = normalizedCounts[normalizedMasterName];
      }
    });
    
    return counts;
  }, [deals, masterLenders]);

  // Build a per-lender deal-history index used by the search:
  // deal names, pass reasons, and lender notes from all deals where this lender appears.
  const lenderDealIndex = useMemo(() => {
    const idx: Record<string, string> = {};
    deals.forEach((deal) => {
      deal.lenders?.forEach((dl) => {
        const key = dl.name.toLowerCase().trim();
        const parts = [
          deal.company || '',
          dl.passReason || '',
          dl.notes || '',
          dl.savedNotes || '',
          dl.stage || '',
          dl.trackingStatus || '',
        ];
        idx[key] = (idx[key] ? idx[key] + ' ' : '') + parts.join(' ');
      });
    });
    return idx;
  }, [deals]);

  // Auxiliary search index: every contact and free-text note for each master lender,
  // keyed by master_lender id. Loaded once so the search bar can match across
  // contact name/email/title/phone/geography/notes and lender notes/tags.
  const [lenderAuxIndex, setLenderAuxIndex] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [contactsRes, notesRes] = await Promise.all([
          supabase
            .from('lender_contacts')
            .select('lender_id, name, email, title, phone, geography, notes'),
          supabase
            .from('lender_notes')
            .select('master_lender_id, body, tags'),
        ]);
        if (cancelled) return;
        const idx: Record<string, string> = {};
        for (const c of (contactsRes.data || []) as any[]) {
          if (!c?.lender_id) continue;
          const parts = [c.name, c.email, c.title, c.phone, c.geography, c.notes]
            .filter(Boolean).join(' ');
          idx[c.lender_id] = (idx[c.lender_id] ? idx[c.lender_id] + ' ' : '') + parts;
        }
        for (const n of (notesRes.data || []) as any[]) {
          if (!n?.master_lender_id) continue;
          const parts = [n.body, ...(Array.isArray(n.tags) ? n.tags : [])]
            .filter(Boolean).join(' ');
          idx[n.master_lender_id] = (idx[n.master_lender_id] ? idx[n.master_lender_id] + ' ' : '') + parts;
        }
        setLenderAuxIndex(idx);
      } catch (e) {
        console.warn('[Lenders] failed to build aux search index', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // AI-driven filter: when the Copilot answers a lender query, it can dispatch
  // a 'naitive:lender-filter' event with a list of matching lender names.
  const [aiFilter, setAiFilter] = useState<{ query: string; names: Set<string> } | null>(null);
  useEffect(() => {
    const onFilter = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const names: string[] = Array.isArray(detail.names) ? detail.names : [];
      const query: string = typeof detail.query === 'string' ? detail.query : '';
      if (!names.length) {
        setAiFilter(null);
        return;
      }
      setAiFilter({ query, names: new Set(names.map((n) => n.toLowerCase().trim())) });
    };
    const onClear = () => setAiFilter(null);
    window.addEventListener('naitive:lender-filter', onFilter as EventListener);
    window.addEventListener('naitive:lender-filter-clear', onClear);
    return () => {
      window.removeEventListener('naitive:lender-filter', onFilter as EventListener);
      window.removeEventListener('naitive:lender-filter-clear', onClear);
    };
  }, []);

  const openLenderDetail = (lender: MasterLender, editMode = false) => {
    setSelectedLender(masterLenderToLenderInfo(lender));
    setIsDetailEditMode(editMode);
    setIsDetailOpen(true);
  };

  // Filter lenders: advanced filters → AI filter → active-deals → text search.
  // Text search runs client-side across many fields (real-time substring match).
  const filteredLenders = useMemo(() => {
    let list = applyLenderFilters(masterLenders, advancedFilters);

    if (aiFilter && aiFilter.names.size) {
      list = list.filter((l) => aiFilter.names.has(l.name.toLowerCase().trim()));
    }

    if (showActiveDealsOnly) {
      list = list.filter((lender) => activeDealCounts[lender.name]);
    }

    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return list;

    const matches = (val: unknown): boolean => {
      if (val == null) return false;
      if (Array.isArray(val)) return val.some((v) => matches(v));
      if (typeof val === 'number') return String(val).includes(q);
      if (typeof val === 'string') return val.toLowerCase().includes(q);
      return false;
    };

    return list.filter((l) => {
      const dealHistory = lenderDealIndex[l.name.toLowerCase().trim()] || '';
      const dealSize = `${l.min_deal ?? ''} ${l.max_deal ?? ''} ${formatCurrency(l.min_deal)} ${formatCurrency(l.max_deal)}`;
      const aux = lenderAuxIndex[l.id] || '';
      return (
        matches(l.name) ||
        matches(l.contact_name) ||
        matches(l.email) ||
        matches(l.contact_title) ||
        matches(l.contact_phone) ||
        matches(l.geo) ||
        matches(l.lender_type) ||
        matches(l.tier) ||
        matches(l.industries) ||
        matches(l.industries_to_avoid) ||
        matches(l.loan_types) ||
        matches(l.deal_structure_notes) ||
        matches(l.company_requirements) ||
        matches(l.upfront_checklist) ||
        matches(l.post_term_sheet_checklist) ||
        matches(l.sub_debt) ||
        matches(l.cash_burn) ||
        matches(l.sponsorship) ||
        matches(l.b2b_b2c) ||
        matches(l.refinancing) ||
        matches(l.relationship_owners) ||
        matches(l.referral_lender) ||
        matches(dealSize) ||
        matches(dealHistory) ||
        matches(aux)
      );
    });
  }, [masterLenders, advancedFilters, showActiveDealsOnly, activeDealCounts, debouncedSearchQuery, lenderDealIndex, lenderAuxIndex, aiFilter]);

  // Sort filtered lenders - memoized to prevent re-sorting on every render
  const sortedLenders = useMemo(() => {
    // We already fetch lenders ordered by name asc, so avoid expensive sorts when possible.
    if (sortOption === 'name-asc') return filteredLenders;
    if (sortOption === 'name-desc') return [...filteredLenders].reverse();

    return [...filteredLenders].sort((a, b) => {
      switch (sortOption) {
        case 'deals-desc':
          return (activeDealCounts[b.name] || 0) - (activeDealCounts[a.name] || 0);
        case 'deals-asc':
          return (activeDealCounts[a.name] || 0) - (activeDealCounts[b.name] || 0);
        default:
          return 0;
      }
    });
  }, [filteredLenders, sortOption, activeDealCounts]);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleQuickUploadStable = useCallback((lenderName: string, category: 'nda' | 'marketing_materials') => {
    handleQuickUpload(lenderName, category);
  }, [user]);

  const handleDeleteStable = useCallback((id: string, name: string) => {
    handleDelete(id, name);
  }, [deleteMasterLender]);

  const openEditDialogStable = useCallback((lenderName: string) => {
    openEditDialog(lenderName);
  }, [masterLenders]);

  const openLenderDetailStable = useCallback((lender: MasterLender) => {
    openLenderDetail(lender);
  }, []);

  // Selection handlers
  const toggleLenderSelection = useCallback((lenderId: string) => {
    setSelectedLenderIds(prev => {
      const next = new Set(prev);
      if (next.has(lenderId)) {
        next.delete(lenderId);
      } else {
        next.add(lenderId);
      }
      return next;
    });
  }, []);

  const selectAllLenders = useCallback(() => {
    setSelectedLenderIds(new Set(sortedLenders.map(l => l.id)));
  }, [sortedLenders]);

  const clearSelection = useCallback(() => {
    setSelectedLenderIds(new Set());
  }, []);

  const handlePushSelectedToFlex = useCallback(async () => {
    if (selectedLenderIds.size === 0) return;
    
    setIsPushingSelectedToFlex(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const selectedIds = Array.from(selectedLenderIds);
      
      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < selectedIds.length; i += batchSize) {
        const batch = selectedIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(id => 
            supabase.functions.invoke('sync-lender-to-flex', {
              body: { lender_id: id },
            })
          )
        );
        
        const notRegisteredLenders: string[] = [];
        
        results.forEach((result) => {
          if (result.status !== 'fulfilled') {
            errorCount++;
            return;
          }

          const { data, error } = result.value;
          const payload = extractFlexSyncErrorPayload({ data, error });

          if (payload?.code === 'LENDER_NOT_REGISTERED' && payload.lender_name) {
            notRegisteredLenders.push(payload.lender_name);
          }

          // The backend may return 200 even for expected business cases (e.g., not registered),
          // so use the response body when available.
          const successFlag = (data as any)?.success;
          const isSuccess = !error && (typeof successFlag === 'boolean' ? successFlag : true);

          if (isSuccess) {
            successCount++;
          } else {
            errorCount++;
          }
        });
        
        // Show specific message for not registered lenders
        if (notRegisteredLenders.length > 0) {
          toast({
            title: 'Some lenders not registered in FLEx',
            description: `${notRegisteredLenders.slice(0, 3).join(', ')}${notRegisteredLenders.length > 3 ? ` and ${notRegisteredLenders.length - 3} more` : ''} need to register in FLEx first.`,
            variant: 'destructive',
          });
        }
      }

      if (errorCount === 0) {
        toast({
          title: 'Push to FLEx complete',
          description: `Successfully pushed ${successCount} lender${successCount !== 1 ? 's' : ''} to FLEx.`,
        });
      } else if (successCount > 0) {
        toast({
          title: 'Push to FLEx completed with errors',
          description: `Pushed ${successCount} lender${successCount !== 1 ? 's' : ''}, ${errorCount} failed.`,
          variant: 'destructive',
        });
      }

      clearSelection();
      refetchMasterLenders();
    } catch (error) {
      console.error('Error pushing lenders to FLEx:', error);
      toast({
        title: 'Push to FLEx failed',
        description: 'An error occurred while pushing lenders to FLEx.',
        variant: 'destructive',
      });
    } finally {
      setIsPushingSelectedToFlex(false);
    }
  }, [selectedLenderIds, clearSelection, refetchMasterLenders]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedLenderIds.size === 0) return;
    
    const selectedIds = Array.from(selectedLenderIds);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      const success = await deleteMasterLender(id);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (errorCount === 0) {
      toast({
        title: 'Lenders deleted',
        description: `Successfully deleted ${successCount} lender${successCount !== 1 ? 's' : ''}.`,
      });
    } else {
      toast({
        title: 'Delete completed with errors',
        description: `Deleted ${successCount} lender${successCount !== 1 ? 's' : ''}, ${errorCount} failed.`,
        variant: 'destructive',
      });
    }

    clearSelection();
  }, [selectedLenderIds, deleteMasterLender, clearSelection]);

  const handleBulkExport = useCallback(() => {
    if (selectedLenderIds.size === 0) return;

    const selectedLenders = masterLenders.filter(l => selectedLenderIds.has(l.id));
    const exportData = selectedLenders.map(l => ({
      name: l.name,
      contact: { name: l.contact_name || '', email: l.email || '', phone: '' },
      preferences: [...(l.loan_types || []), ...(l.industries || [])],
      website: l.lender_one_pager_url,
      description: l.deal_structure_notes,
    }));
    const csv = exportLendersToCsv(exportData);
    downloadCsv(csv, `lenders-export-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ 
      title: 'Export complete', 
      description: `Exported ${selectedLenders.length} lender${selectedLenders.length !== 1 ? 's' : ''} to CSV.` 
    });
  }, [selectedLenderIds, masterLenders]);

  // Add to Deal state
  const [addToDealOpen, setAddToDealOpen] = useState(false);
  const [dealSearchQuery, setDealSearchQuery] = useState('');
  const [isAddingToDeal, setIsAddingToDeal] = useState(false);

  const filteredDealsForPicker = useMemo(() => {
    if (!dealSearchQuery.trim()) return deals.slice(0, 20);
    const q = dealSearchQuery.toLowerCase();
    return deals.filter(d => 
      d.name.toLowerCase().includes(q) || d.company.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [deals, dealSearchQuery]);

  const handleAddSelectedToDeal = useCallback(async (dealId: string) => {
    if (selectedLenderIds.size === 0) return;
    setIsAddingToDeal(true);

    const selectedNames = masterLenders
      .filter(l => selectedLenderIds.has(l.id))
      .map(l => l.name);

    // Get existing lenders on the deal to avoid duplicates
    const targetDeal = deals.find(d => d.id === dealId);
    const existingNames = new Set((targetDeal?.lenders || []).map(l => l.name.toLowerCase()));

    let addedCount = 0;
    let skippedCount = 0;

    for (const name of selectedNames) {
      if (existingNames.has(name.toLowerCase())) {
        skippedCount++;
        continue;
      }
      await addLenderToDeal(dealId, { name });
      addedCount++;
    }

    const dealName = targetDeal?.company || targetDeal?.name || 'deal';
    if (addedCount > 0) {
      toast({
        title: `Added ${addedCount} lender${addedCount !== 1 ? 's' : ''} to ${dealName}`,
        description: skippedCount > 0 ? `${skippedCount} already on the deal.` : undefined,
      });
    } else {
      toast({
        title: 'No lenders added',
        description: 'All selected lenders are already on this deal.',
      });
    }

    setAddToDealOpen(false);
    setDealSearchQuery('');
    clearSelection();
    setIsAddingToDeal(false);
  }, [selectedLenderIds, masterLenders, deals, addLenderToDeal, clearSelection]);

  const openAddDialog = () => {
    setEditingLenderId(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (lenderName: string) => {
    const lender = masterLenders.find(l => l.name === lenderName);
    if (lender) {
      // Open the detail dialog in edit mode
      openLenderDetail(lender, true);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Lender name is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    const primaryContact = form.contacts.find(c => c.isPrimary) || form.contacts[0];
    const lenderData: MasterLenderInsert = {
      name: form.name.trim(),
      contact_name: primaryContact?.name.trim() || null,
      contact_title: primaryContact?.title.trim() || null,
      email: primaryContact?.email.trim() || null,
      contact_phone: primaryContact?.phone.trim() || null,
      lender_type: form.lenderType.trim() || null,
      loan_types: form.loanTypes.split(',').map(p => p.trim()).filter(p => p) || null,
      min_deal: form.minDeal ? parseFloat(form.minDeal) : null,
      max_deal: form.maxDeal ? parseFloat(form.maxDeal) : null,
      industries: form.industries.split(',').map(p => p.trim()).filter(p => p) || null,
      geo: form.geo.trim() || null,
      deal_structure_notes: form.description.trim() || null,
    };

    try {
      let lenderId = editingLenderId;

      if (editingLenderId) {
        const existingLender = masterLenders.find(l => l.id === editingLenderId);
        if (existingLender && lenderData.name.toLowerCase() !== existingLender.name.toLowerCase() && 
            masterLenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
          toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
          return;
        }
        await updateMasterLender(editingLenderId, lenderData);
        // Delete old contacts and re-insert
        await supabase.from('lender_contacts').delete().eq('lender_id', editingLenderId);
        toast({ title: 'Lender updated', description: `${lenderData.name} has been updated.` });
      } else {
        if (masterLenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
          toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
          return;
        }
        const newLender = await addMasterLender(lenderData);
        lenderId = newLender?.id ?? null;
        toast({ title: 'Lender added', description: `${lenderData.name} has been added.` });
      }

      // Insert contacts into lender_contacts
      if (lenderId) {
        const contactsToInsert = form.contacts
          .filter(c => c.name.trim())
          .map(c => ({
            lender_id: lenderId!,
            name: c.name.trim(),
            title: c.title.trim() || null,
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
            is_primary: c.isPrimary,
          }));
        if (contactsToInsert.length > 0) {
          await supabase.from('lender_contacts').insert(contactsToInsert);
        }
      }

      setIsDialogOpen(false);
      setForm(emptyForm);
      setEditingLenderId(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save lender', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    await deleteMasterLender(id);
    toast({ title: 'Lender deleted', description: `${name} has been removed.` });
  };

  const handleInlineSave = async (lenderId: string, data: LenderEditData) => {
    const lenderData: MasterLenderInsert = {
      name: data.name.trim(),
      contact_name: data.contactName.trim() || null,
      contact_phone: data.contactPhone?.trim() || null,
      email: data.email.trim() || null,
      lender_type: data.lenderType.trim() || null,
      loan_types: data.loanTypes.split(',').map(p => p.trim()).filter(p => p) || null,
      min_deal: data.minDeal ? parseFloat(data.minDeal) : null,
      max_deal: data.maxDeal ? parseFloat(data.maxDeal) : null,
      industries: data.industries.split(',').map(p => p.trim()).filter(p => p) || null,
      geo: data.geo.trim() || null,
      company_requirements: data.description?.trim() || null,
      deal_structure_notes: data.lenderNotes?.trim() || null,
      min_revenue: data.minRevenue ? parseFloat(data.minRevenue) : null,
      ebitda_min: data.ebitdaMin ? parseFloat(data.ebitdaMin) : null,
      tier: data.tier ? `T${data.tier}` : null,
      relationship_owners: data.relationshipOwners?.trim() || null,
    };

    // Check if name changed and new name already exists
    const existingLender = masterLenders.find(l => l.id === lenderId);
    if (existingLender && lenderData.name.toLowerCase() !== existingLender.name.toLowerCase() && 
        masterLenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
      toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
      throw new Error('Duplicate lender name');
    }

    await updateMasterLender(lenderId, lenderData);
    
    // Update the selected lender to reflect changes immediately
    setSelectedLender(masterLenderToLenderInfo({
      ...existingLender!,
      ...lenderData,
      id: lenderId,
      user_id: existingLender!.user_id,
      created_at: existingLender!.created_at,
      updated_at: new Date().toISOString(),
    } as MasterLender));
    
    toast({ title: 'Lender updated', description: `${lenderData.name} has been updated.` });
  };

  const handleExport = () => {
    // Convert master lenders to the export format
    const exportData = masterLenders.map(l => ({
      name: l.name,
      contact: { name: l.contact_name || '', email: l.email || '', phone: '' },
      preferences: [...(l.loan_types || []), ...(l.industries || [])],
      website: l.lender_one_pager_url,
      description: l.deal_structure_notes,
    }));
    const csv = exportLendersToCsv(exportData);
    downloadCsv(csv, `lenders-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: 'Export complete', description: `Exported ${masterLenders.length} lenders to CSV.` });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsedLenders = parseCsvToLenders(content);
        
        const lendersToImport: MasterLenderInsert[] = [];
        let skipped = 0;
        
        parsedLenders.forEach(row => {
          const exists = masterLenders.some(l => l.name.toLowerCase() === row.name.toLowerCase());
          if (!exists) {
            lendersToImport.push({
              name: row.name,
              contact_name: row.contactName || null,
              email: row.email || null,
              loan_types: row.preferences?.split(';').map(p => p.trim()).filter(p => p) || null,
              lender_one_pager_url: row.website || null,
              deal_structure_notes: row.description || null,
            });
          } else {
            skipped++;
          }
        });

        if (lendersToImport.length > 0) {
          const result = await importLenders(lendersToImport);
          toast({ 
            title: 'Import complete', 
            description: `Added ${result.success} lenders${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}.` 
          });
        } else {
          toast({ 
            title: 'Import skipped', 
            description: `All ${skipped} lenders already exist.` 
          });
        }
      } catch (error) {
        toast({ 
          title: 'Import failed', 
          description: error instanceof Error ? error.message : 'Failed to parse CSV file',
          variant: 'destructive' 
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleQuickUpload = (lenderName: string, category: 'nda' | 'marketing_materials') => {
    if (!user) {
      toast({ title: 'Please log in', description: 'You need to be logged in to upload files.', variant: 'destructive' });
      return;
    }
    setQuickUploadTarget({ lenderName, category });
    setTimeout(() => quickUploadRef.current?.click(), 0);
  };

  const handleQuickUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quickUploadTarget || !user) return;

    setIsQuickUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${quickUploadTarget.lenderName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('lender-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('lender_attachments')
        .insert({
          user_id: user.id,
          company_id: company?.id,
          lender_name: quickUploadTarget.lenderName,
          name: file.name,
          file_path: filePath,
          content_type: file.type,
          size_bytes: file.size,
          category: quickUploadTarget.category,
        });

      if (dbError) throw dbError;

      toast({ 
        title: 'File uploaded', 
        description: `${quickUploadTarget.category === 'nda' ? 'NDA' : 'Marketing materials'} uploaded for ${quickUploadTarget.lenderName}.` 
      });
      refetchAttachmentSummaries();
    } catch (error) {
      console.error('Quick upload error:', error);
      toast({ title: 'Upload failed', description: 'Could not upload the file.', variant: 'destructive' });
    } finally {
      setIsQuickUploading(false);
      setQuickUploadTarget(null);
      if (quickUploadRef.current) quickUploadRef.current.value = '';
    }
  };

  const handleSyncToFlex = async () => {
    setIsSyncingToFlex(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast({ 
          title: 'Authentication required', 
          description: 'Please log in to sync lenders to FLEx.', 
          variant: 'destructive' 
        });
        return;
      }

      const response = await supabase.functions.invoke('sync-lenders-to-flex', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to sync lenders');
      }

      const result = response.data;
      toast({ 
        title: 'Sync complete', 
        description: `Successfully synced ${result.synced} lenders to FLEx.`,
      });
    } catch (error) {
      console.error('Flex sync error:', error);
      toast({ 
        title: 'Sync failed', 
        description: error instanceof Error ? error.message : 'Could not sync lenders to FLEx.',
        variant: 'destructive' 
      });
    } finally {
      setIsSyncingToFlex(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Lenders - naitive</title>
        <meta name="description" content="Manage your lender directory" />
      </Helmet>

      {/* Hidden file input for quick uploads */}
      <input
        type="file"
        ref={quickUploadRef}
        onChange={handleQuickUploadChange}
        className="hidden"
      />

      {/*
        Page surface — routed through the shared `<WorkspacePage>` primitive
        so Lender Directory and Deals can never drift apart on canvas tone,
        header chrome, or padding rhythm.
      */}
      <WorkspacePage contentClassName="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
                  <Building2 className="h-6 w-6 text-foreground" />
                  Lender Directory
                  <BetaBadge featureKey="page_lenders" />
                </h1>
                <p className="text-muted-foreground">Manage your lender directory</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Import dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Upload className="h-4 w-4" />
                      Import
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                        className="hidden"
                      />
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import
                      </DropdownMenuItem>
                    </label>
                    <DropdownMenuItem onClick={handleExport}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)}>
                      <Database className="h-4 w-4 mr-2" />
                      Import Master Database
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowBankImportConfirm(true)}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Import Banks
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowNonBankImportConfirm(true)}>
                      <Users className="h-4 w-4 mr-2" />
                      Import Non-Banks
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Merge dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Columns className="h-4 w-4" />
                      Merge
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={() => setIsSideBySideMergeOpen(true)}>
                      <Columns className="h-4 w-4 mr-2" />
                      {advancedFilters.tiers.length > 0 
                        ? `Merge ${advancedFilters.tiers.join(', ')} (${sortedLenders.length})`
                        : 'Merge Side-by-Side'
                      }
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsDuplicatesDialogOpen(true)}>
                      <Users className="h-4 w-4 mr-2" />
                      Quick Merge
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Sync dropdown - only for ppina and 5th Line admins */}
                {canSeeFlexSync && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline"
                      size="sm" 
                      className="gap-1 relative bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/20 text-foreground/80 hover:text-foreground shadow-none transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sync
                      {syncPendingCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full text-xs px-1.5 bg-white/10 text-foreground border-0">
                          {syncPendingCount}
                        </Badge>
                      )}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={() => setShowSyncPanel(!showSyncPanel)}>
                      <Bell className="h-4 w-4 mr-2" />
                      Sync Requests
                      {syncPendingCount > 0 && (
                        <Badge variant="destructive" className="ml-2 h-5 min-w-5 rounded-full text-xs px-1.5">
                          {syncPendingCount}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleSyncToFlex}
                      disabled={isSyncingToFlex || masterLenders.length === 0}
                    >
                      {isSyncingToFlex ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      {isSyncingToFlex ? 'Syncing...' : 'Sync to FLEx'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/lenders/sync-history')}>
                      <History className="h-4 w-4 mr-2" />
                      Sync History
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/lenders/config')}>
                  <Settings className="h-4 w-4" />
                  Configuration
                </Button>
                <Button
                  onClick={openAddDialog}
                  size="sm"
                  className="gap-1 bg-white/[0.08] hover:bg-white/[0.12] border border-white/15 hover:border-white/25 text-foreground shadow-none transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Lender
                </Button>
              </div>
            </div>

            <div className="space-y-4">
                {/* Flex Sync Requests Panel - show when toggled or has pending requests */}
                {canSeeFlexSync && (showSyncPanel || syncPendingCount > 0) && (
                  <LenderSyncRequestsPanel onLenderApproved={refetchMasterLenders} />
                )}
                
                {/* Advanced Filters Panel */}
                <LenderFiltersPanel
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                  lenders={masterLenders}
                />
                {/* Search and Sort Controls */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search name, contacts, email, geo, type, loan types, industries, notes, pass reasons, deals…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 pr-9"
                        />
                        {searchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => setSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Type sectors, products, deal names, geographies, or decision reasons to find matching lenders across profiles and deal history.
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant={showActiveDealsOnly ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2 whitespace-nowrap"
                    onClick={() => setShowActiveDealsOnly(!showActiveDealsOnly)}
                  >
                    <Zap className="h-4 w-4" />
                    Active Deals
                    {showActiveDealsOnly && (
                      <X className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                  <Select value={sortOption} onValueChange={(value: SortOption) => setSortOption(value)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      <SelectItem value="deals-desc">Most Active Deals</SelectItem>
                      <SelectItem value="deals-asc">Fewest Active Deals</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex border rounded-md">
                    <Button
                      variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-10 w-10 rounded-r-none"
                      onClick={() => handleViewModeChange('list')}
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-10 w-10 rounded-none border-l border-r"
                      onClick={() => handleViewModeChange('grid')}
                      title="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'spreadsheet' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-10 w-10 rounded-l-none"
                      onClick={() => handleViewModeChange('spreadsheet')}
                      title="Spreadsheet view"
                    >
                      <Table2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* AI-driven filter banner */}
                {aiFilter && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">
                        Showing AI-filtered results
                        {aiFilter.query ? <> for: <span className="font-medium">{aiFilter.query}</span></> : null}
                        <span className="ml-2 text-muted-foreground">({aiFilter.names.size} lender{aiFilter.names.size === 1 ? '' : 's'})</span>
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setAiFilter(null)} className="gap-1">
                      <X className="h-3.5 w-3.5" />
                      Clear filter
                    </Button>
                  </div>
                )}

                {/* Bulk Selection Action Bar */}
                {selectedLenderIds.size > 0 && (
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedLenderIds.size === sortedLenders.length && sortedLenders.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selectAllLenders();
                          } else {
                            clearSelection();
                          }
                        }}
                      />
                      <span className="text-sm font-medium">
                        {selectedLenderIds.size} lender{selectedLenderIds.size !== 1 ? 's' : ''} selected
                      </span>
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Add to Deal */}
                      <Popover open={addToDealOpen} onOpenChange={(open) => { setAddToDealOpen(open); if (!open) setDealSearchQuery(''); }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <FolderPlus className="h-4 w-4" />
                            Add to Deal
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="end" sideOffset={4}>
                          <div className="p-2 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Search deals..."
                                value={dealSearchQuery}
                                onChange={(e) => setDealSearchQuery(e.target.value)}
                                className="h-8 pl-8 text-sm"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-auto p-1">
                            {filteredDealsForPicker.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-4">No deals found</p>
                            ) : (
                              filteredDealsForPicker.map(deal => (
                                <button
                                  key={deal.id}
                                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5"
                                  onClick={() => handleAddSelectedToDeal(deal.id)}
                                  disabled={isAddingToDeal}
                                >
                                  <span className="font-medium truncate">{deal.company || deal.name}</span>
                                  <span className="text-xs text-muted-foreground truncate">{deal.name}</span>
                                </button>
                              ))
                            )}
                          </div>
                          {isAddingToDeal && (
                            <div className="flex items-center justify-center gap-2 p-2 border-t border-border">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span className="text-xs text-muted-foreground">Adding lenders...</span>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      {selectedLenderIds.size >= 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsSideBySideMergeOpen(true)}
                          className="gap-2"
                        >
                          <Columns className="h-4 w-4" />
                          Merge
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkExport}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {selectedLenderIds.size} lender{selectedLenderIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the selected lenders from your database. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkDelete}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      {canSeeFlexSync && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handlePushSelectedToFlex}
                        disabled={isPushingSelectedToFlex}
                        className="gap-2"
                      >
                        {isPushingSelectedToFlex ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Push to FLEx
                      </Button>
                      )}
                    </div>
                  </div>
                )}

                {/*
                  Loading State — mirrors the Deals page pattern: tile-shaped
                  skeletons that share the `.deal-glass` surface so the page
                  keeps the same depth/contrast hierarchy while data loads.
                */}
                {isLoading && (
                  <LendersListSkeleton viewMode={viewMode === 'spreadsheet' ? 'list' : viewMode} />
                )}

                {/* List View */}
                {/* List View - Virtualized */}
                {!isLoading && viewMode === 'list' && sortedLenders.length > 0 && (
                  <Virtuoso
                    style={{ height: 'calc(100vh - 280px)' }}
                    totalCount={sortedLenders.length}
                    endReached={() => loadMore()}
                    itemContent={(index) => {
                      const lender = sortedLenders[index];
                      return (
                        <div className="pb-3">
                          <LenderListCard
                            key={lender.id}
                            lender={lender}
                            activeDealCount={activeDealCounts[lender.name] || 0}
                            summary={getLenderSummary(lender.name)}
                            isQuickUploading={isQuickUploading}
                            quickUploadLenderName={quickUploadTarget?.lenderName || null}
                            isSelected={selectedLenderIds.has(lender.id)}
                            onToggleSelect={toggleLenderSelection}
                            onOpenDetail={openLenderDetailStable}
                            onEdit={openEditDialogStable}
                            onDelete={handleDeleteStable}
                            onQuickUpload={handleQuickUploadStable}
                          />
                        </div>
                      );
                    }}
                    components={{
                      Footer: () => (
                        <div className="py-4 text-center text-sm text-muted-foreground border-t border-border/50 mt-2">
                          {loadingMore ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading more lenders... ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                            </span>
                          ) : hasMore ? (
                            <span className="inline-flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Scroll to load more ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Showing all {sortedLenders.length.toLocaleString()} lenders
                            </span>
                          )}
                        </div>
                      ),
                    }}
                  />
                )}

                {/* Grid View - Virtualized */}
                {!isLoading && viewMode === 'grid' && sortedLenders.length > 0 && (
                  <VirtuosoGrid
                    style={{ height: 'calc(100vh - 280px)' }}
                    totalCount={sortedLenders.length}
                    endReached={() => loadMore()}
                    listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                    itemContent={(index) => {
                      const lender = sortedLenders[index];
                      return (
                        <LenderGridCard
                          key={lender.id}
                          lender={lender}
                          activeDealCount={activeDealCounts[lender.name] || 0}
                          tileDisplaySettings={tileDisplaySettings}
                          summary={getLenderSummary(lender.name)}
                          isQuickUploading={isQuickUploading}
                          quickUploadLenderName={quickUploadTarget?.lenderName || null}
                          isSelected={selectedLenderIds.has(lender.id)}
                          onToggleSelect={toggleLenderSelection}
                          onOpenDetail={openLenderDetailStable}
                          onEdit={openEditDialogStable}
                          onDelete={handleDeleteStable}
                          onQuickUpload={handleQuickUploadStable}
                        />
                      );
                    }}
                    components={{
                      Footer: () => (
                        <div className="col-span-full py-4 text-center text-sm text-muted-foreground border-t border-border/50 mt-2">
                          {loadingMore ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading more lenders... ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                            </span>
                          ) : hasMore ? (
                            <span className="inline-flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Scroll to load more ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Showing all {sortedLenders.length.toLocaleString()} lenders
                            </span>
                          )}
                        </div>
                      ),
                    }}
                  />
                )}

                {/* Spreadsheet View */}
                {!isLoading && viewMode === 'spreadsheet' && sortedLenders.length > 0 && (
                  <LenderSpreadsheetView
                    lenders={sortedLenders}
                    activeDealCounts={activeDealCounts}
                    loadingMore={loadingMore}
                    hasMore={hasMore}
                    totalCount={totalCount}
                    onLoadMore={loadMore}
                    onRowClick={openLenderDetailStable}
                    selectedIds={selectedLenderIds}
                    onToggleSelect={toggleLenderSelection}
                    onSelectAll={selectAllLenders}
                    onClearSelection={clearSelection}
                  />
                )}

                {/*
                  Empty / no-results states — same surface, border, and text
                  contrast components as the Deals page "No deals found" view
                  (muted-circle icon + heading + muted subtext).
                */}
                {!isLoading && loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">Loading lenders</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Fetching your lender directory…
                    </p>
                  </div>
                )}
                {!isLoading && !loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                      <FileX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">No lenders found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try adjusting your filters or clearing your search to see more lenders.
                    </p>
                  </div>
                )}
                {!isLoading && masterLenders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">No lenders yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Import your master lender database or add lenders manually to get started.
                    </p>
                    <Button onClick={openAddDialog} size="sm" className="gap-1 mt-4">
                      <Plus className="h-4 w-4" />
                      Add Lender
                    </Button>
                  </div>
                )}
            </div>
      </WorkspacePage>

      {/* Add/Edit Lender Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg w-[calc(100dvw-2rem)] sm:w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle>{editingLenderId ? 'Edit Lender' : 'Add Lender'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Lender Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter lender name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lenderType">Lender Type</Label>
                  <Input
                    id="lenderType"
                    value={form.lenderType}
                    onChange={(e) => setForm({ ...form, lenderType: e.target.value })}
                    placeholder="e.g., Bank, Credit Fund"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="geo">Geography</Label>
                  <Input
                    id="geo"
                    value={form.geo}
                    onChange={(e) => setForm({ ...form, geo: e.target.value })}
                    placeholder="e.g., US, Global"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minDeal">Min Deal Size</Label>
                  <Input
                    id="minDeal"
                    type="number"
                    value={form.minDeal}
                    onChange={(e) => setForm({ ...form, minDeal: e.target.value })}
                    placeholder="e.g., 1000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDeal">Max Deal Size</Label>
                  <Input
                    id="maxDeal"
                    type="number"
                    value={form.maxDeal}
                    onChange={(e) => setForm({ ...form, maxDeal: e.target.value })}
                    placeholder="e.g., 25000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanTypes">Loan Types</Label>
                <Input
                  id="loanTypes"
                  value={form.loanTypes}
                  onChange={(e) => setForm({ ...form, loanTypes: e.target.value })}
                  placeholder="Comma-separated (e.g., Term Loan, Revolver)"
                />
                <p className="text-xs text-muted-foreground">Separate multiple types with commas</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="industries">Industries</Label>
                <Input
                  id="industries"
                  value={form.industries}
                  onChange={(e) => setForm({ ...form, industries: e.target.value })}
                  placeholder="Comma-separated (e.g., SaaS, Healthcare)"
                />
                <p className="text-xs text-muted-foreground">Separate multiple industries with commas</p>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Contacts</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setForm(prev => ({
                      ...prev,
                      contacts: [...prev.contacts, emptyContact(false)],
                    }))}
                  >
                    <Plus className="h-3 w-3" /> Add Contact
                  </Button>
                </div>
                {form.contacts.map((contact, idx) => (
                  <div key={idx} className="space-y-2 p-3 rounded-lg border bg-muted/30 relative">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="radio"
                          name="primaryContact"
                          checked={contact.isPrimary}
                          onChange={() => setForm(prev => ({
                            ...prev,
                            contacts: prev.contacts.map((c, i) => ({ ...c, isPrimary: i === idx })),
                          }))}
                          className="accent-primary"
                        />
                        {contact.isPrimary ? (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">Primary</Badge>
                        ) : (
                          <span className="text-muted-foreground">Set as primary</span>
                        )}
                      </label>
                      {form.contacts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setForm(prev => {
                            const next = prev.contacts.filter((_, i) => i !== idx);
                            // If removed was primary, promote first
                            if (contact.isPrimary && next.length > 0) next[0].isPrimary = true;
                            return { ...prev, contacts: next };
                          })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Name"
                        value={contact.name}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          contacts: prev.contacts.map((c, i) => i === idx ? { ...c, name: e.target.value } : c),
                        }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Title (e.g., VP)"
                        value={contact.title}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          contacts: prev.contacts.map((c, i) => i === idx ? { ...c, title: e.target.value } : c),
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Email"
                        type="email"
                        value={contact.email}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          contacts: prev.contacts.map((c, i) => i === idx ? { ...c, email: e.target.value } : c),
                        }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Phone (optional)"
                        value={contact.phone}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          contacts: prev.contacts.map((c, i) => i === idx ? { ...c, phone: e.target.value } : c),
                        }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Notes / Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Additional notes about the lender..."
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingLenderId ? 'Save Changes' : 'Add Lender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LenderDetailDialog
        lender={selectedLender}
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setIsDetailEditMode(false);
        }}
        onSave={handleInlineSave}
        onDelete={(lenderName) => {
          const lender = masterLenders.find(l => l.name === lenderName);
          if (lender) handleDelete(lender.id, lender.name);
        }}
        initialEditMode={isDetailEditMode}
      />

      <ImportLendersDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImport={importLenders}
      />

      <DuplicateLendersDialog
        open={isDuplicatesDialogOpen}
        onOpenChange={setIsDuplicatesDialogOpen}
        lenders={masterLenders}
        onMergeLenders={async (keepId, mergeIds, mergedData) => { await mergeLenders(keepId, mergeIds, mergedData); }}
        onDeleteLender={async (id) => { await deleteMasterLender(id); }}
      />

      <SideBySideMergeDialog
        open={isSideBySideMergeOpen}
        onOpenChange={(open) => {
          setIsSideBySideMergeOpen(open);
          if (!open) {
            clearSelection();
          }
        }}
        lenders={sortedLenders}
        onMergeLenders={async (keepId, mergeIds, mergedData) => { await mergeLenders(keepId, mergeIds, mergedData); }}
        selectedLenderIds={selectedLenderIds.size >= 2 ? Array.from(selectedLenderIds) : undefined}
      />

      {/* Bank/Non-Bank Import Dialogs (controlled by dropdown) */}
      <BankLendersImportButton
        onImport={importLenders}
        open={showBankImportConfirm}
        onOpenChange={setShowBankImportConfirm}
        showTrigger={false}
      />
      <NonBankLendersImportButton
        onImportComplete={() => window.location.reload()}
        open={showNonBankImportConfirm}
        onOpenChange={setShowNonBankImportConfirm}
        showTrigger={false}
      />
    </>
  );
}
