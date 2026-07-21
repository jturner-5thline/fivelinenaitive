import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { VirtuosoGrid, Virtuoso } from 'react-virtuoso';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List, Loader2, Globe, Download, Upload, Zap, FileCheck, Megaphone, Database, Settings, Users, Columns, Table2, RefreshCw, History, Bell, ChevronDown, FolderPlus, FileX, BarChart3, Copy, Layers, GitMerge } from 'lucide-react';
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
import { formatCurrencyInput } from '@/utils/formatLenderCurrency';
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
import { RelationshipOwnersPicker } from '@/components/lenders/RelationshipOwnersPicker';
import { LenderSyncRequestsPanel } from '@/components/lenders/LenderSyncRequestsPanel';
import { useCanSeeFlexSync } from '@/hooks/useCanSeeFlexSync';
import { LenderAnalyticsDialog } from '@/components/lenders/LenderAnalyticsDialog';
import { useOriginAnimation } from '@/hooks/useOriginAnimation';
import { detectDuplicateLenders } from '@/lib/lenderDuplicates';
import { LenderContactPicker } from '@/components/lenders/LenderContactPicker';
import { MultiSelectChips } from '@/components/lenders/MultiSelectChips';
import { INDUSTRY_OPTIONS } from '@/constants/industries';
import { LOAN_TYPE_OPTIONS } from '@/constants/loanTypes';
import { COMPANY_REQUIREMENT_OPTIONS } from '@/constants/companyRequirements';
import { GEO_OPTIONS } from '@/constants/geoOptions';

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
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  address?: string | null;
  phoneMain?: string | null;
}

interface LenderFormContact {
  contact_id?: string | null;
  name: string;
  title: string;
  email: string;
  phone: string;
  geography: string;
  isPrimary: boolean;
}

const emptyContact = (isPrimary = false): LenderFormContact => ({
  contact_id: null, name: '', title: '', email: '', phone: '', geography: '', isPrimary,
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
  tier: string;
  relationshipOwners: string;
  website: string;
  linkedinUrl: string;
  phoneMain: string;
  address: string;
  minRevenue: string;
  ebitdaMin: string;
  companyRequirements: string;
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
  tier: '',
  relationshipOwners: '',
  website: '',
  linkedinUrl: '',
  phoneMain: '',
  address: '',
  minRevenue: '',
  ebitdaMin: '',
  companyRequirements: '',
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
    // "preferences" is only used for the "Additional Preferences" section in
    // the detail dialog. We intentionally exclude industries / loan_types /
    // geo here because those are already rendered under "Lending Criteria" —
    // duplicating them caused the same chip list to appear in both sections
    // (Bug 2 sub-bug). When the funding source record carries no extra preference
    // fields the section renders its empty-state CTA instead.
    preferences: [] as string[],
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
    websiteUrl: lender.website,
    linkedinUrl: lender.linkedin_url,
    address: lender.address,
    phoneMain: lender.phone,
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
  const { company, members: companyMembers } = useCompany();
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
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('lenders-view-mode');
    return (saved === 'grid' || saved === 'list' || saved === 'spreadsheet') ? saved : 'list';
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const analyticsOrigin = useOriginAnimation();
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
    // First-page payload kept small so the directory becomes interactive almost
    // immediately. The hook continues streaming the remainder in the background
    // (eagerAll) without blocking the shell or initial rows.
    pageSize: 100,
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

  // Detect potential duplicate funding sources within the current tenant's
  // master lender list. The detector is O(n^2) over bucketed names — at 6k+
  // rows it's expensive enough that we only compute it when the user has
  // actually requested duplicate info (filter toggle or the dialog) AND only
  // after the background stream of pages has settled. Otherwise we keep a
  // stable empty index so the heavy filter/sort memos downstream don't
  // invalidate on every streamed page.
  const EMPTY_DUPLICATE_INDEX = useMemo(
    () => ({ groups: [] as Array<{ groupId: string; memberIds: string[] }>, byLenderId: {} as Record<string, { groupId: string; count: number }> }),
    [],
  );
  const [duplicateIndex, setDuplicateIndex] = useState(EMPTY_DUPLICATE_INDEX);
  // Fingerprint of the (id, name) pairs that actually drive duplicate
  // detection. Refetches and unrelated state changes routinely produce a new
  // `masterLenders` array reference even when no name/id changed; depending
  // on that reference caused the detector (and every downstream memo) to
  // re-run constantly and stall the page. Comparing a tiny string instead
  // keeps the effect quiet unless the inputs really changed.
  const duplicateInputFingerprint = useMemo(() => {
    if (!masterLenders.length) return '';
    // Inputs are already ordered by name from the loader; a simple join is
    // stable and cheap (~tens of KB at 6k rows).
    let s = '';
    for (const l of masterLenders) s += l.id + '|' + (l.name || '') + '\n';
    return s;
  }, [masterLenders]);

  useEffect(() => {
    // Wait for the background stream of pages to settle so the detector
    // doesn't re-run on every batch while the directory is loading.
    if (loadingMore) return;
    if (!duplicateInputFingerprint) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const next = detectDuplicateLenders(masterLenders.map((l) => ({ id: l.id, name: l.name })));
      if (cancelled) return;
      setDuplicateIndex(next);
    };
    // Debounce briefly so back-to-back state changes coalesce, then run on
    // an idle frame so chips populate without blocking interaction.
    const debounce = setTimeout(() => {
      const idle = (window as any).requestIdleCallback as
        | undefined
        | ((cb: () => void, opts?: { timeout: number }) => number);
      if (idle) {
        const id = idle(run, { timeout: 1500 });
        // store on a closure-visible handle for cleanup
        (run as any)._idleId = id;
      } else {
        (run as any)._idleId = setTimeout(run, 0);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      const id = (run as any)._idleId;
      if (id != null) {
        (window as any).cancelIdleCallback?.(id);
        clearTimeout(id);
      }
    };
    // Intentionally depend on the fingerprint, not on `masterLenders` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, duplicateInputFingerprint]);

  // Per-lender list of sibling names in the same duplicate cluster (excluding
  // self), used to power the popover when the user clicks the "X possible
  // dups" chip on a card.
  const duplicateSiblingsByLenderId = useMemo(() => {
    const out: Record<string, { id: string; name: string }[]> = {};
    if (!duplicateIndex.groups.length) return out;
    const nameById = new Map(masterLenders.map((l) => [l.id, l.name]));
    for (const group of duplicateIndex.groups) {
      for (const id of group.memberIds) {
        out[id] = group.memberIds
          .filter((other) => other !== id)
          .map((other) => ({ id: other, name: nameById.get(other) || 'Unknown' }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return out;
  }, [duplicateIndex, masterLenders]);

  const openLenderSiblingDetailStable = useCallback(
    (lenderId: string) => {
      const match = masterLenders.find((l) => l.id === lenderId);
      if (match) openLenderDetail(match);
    },
    [masterLenders],
  );

  // Build a per-lender deal-history index used by the search:
  // deal names, pass reasons, and lender notes from all deals where this funding source appears.
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

  // AI-driven filter: when the Copilot answers a funding source query, it can dispatch
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

  // Deep-link support: open the lender detail dialog when ?lender=<id>
  // is present in the URL (e.g. when navigated to from a deal's lender
  // popup). Clears the param once the dialog is opened so refreshing or
  // closing the dialog doesn't trap the user.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const lenderParam = searchParams.get('lender');
    if (!lenderParam || !masterLenders.length) return;
    const match =
      masterLenders.find((l) => l.id === lenderParam) ||
      masterLenders.find(
        (l) => l.name.toLowerCase().trim() === lenderParam.toLowerCase().trim(),
      );
    if (match) {
      openLenderDetail(match);
      const next = new URLSearchParams(searchParams);
      next.delete('lender');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, masterLenders]);

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

    if (showDuplicatesOnly) {
      list = list.filter((lender) => duplicateIndex.byLenderId[lender.id]);
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
  }, [masterLenders, advancedFilters, showActiveDealsOnly, showDuplicatesOnly, duplicateIndex, activeDealCounts, debouncedSearchQuery, lenderDealIndex, lenderAuxIndex, aiFilter]);

  // Sort filtered lenders - memoized to prevent re-sorting on every render
  const sortedLenders = useMemo(() => {
    // When the duplicates filter is on, group clusters together regardless of
    // the currently selected sort option so they're visually adjacent.
    if (showDuplicatesOnly) {
      return [...filteredLenders].sort((a, b) => {
        const ga = duplicateIndex.byLenderId[a.id]?.groupId || '';
        const gb = duplicateIndex.byLenderId[b.id]?.groupId || '';
        if (ga !== gb) return ga.localeCompare(gb);
        return a.name.localeCompare(b.name);
      });
    }
    // We already fetch lenders ordered by name asc, so avoid expensive sorts when possible.
    let base: typeof filteredLenders;
    if (sortOption === 'name-asc') base = filteredLenders;
    else if (sortOption === 'name-desc') base = [...filteredLenders].reverse();
    else {
      base = [...filteredLenders].sort((a, b) => {
        switch (sortOption) {
          case 'deals-desc':
            return (activeDealCounts[b.name] || 0) - (activeDealCounts[a.name] || 0);
          case 'deals-asc':
            return (activeDealCounts[a.name] || 0) - (activeDealCounts[b.name] || 0);
          default:
            return 0;
        }
      });
    }

    // Search ranking: when a query is active, surface name-matches first,
    // then everything else. Within each bucket we preserve the order chosen
    // by `sortOption` above so "Most Active Deals" / Z-A still apply.
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return base;

    const rank = (l: typeof base[number]) => {
      const name = (l.name || '').toLowerCase();
      if (name === q) return 0;             // exact
      if (name.startsWith(q)) return 1;     // prefix
      if (name.includes(q)) return 2;       // substring of name
      return 3;                              // matched elsewhere (email, notes, etc.)
    };
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [filteredLenders, sortOption, activeDealCounts, showDuplicatesOnly, duplicateIndex, debouncedSearchQuery]);

  // When the Duplicates filter is active, organize the visible lenders into
  // clusters so the user can review and merge each group as a unit. Each
  // group lists every member that survived the current filters (search,
  // advanced filters, etc.) so empty groups are dropped.
  const duplicateGroupsView = useMemo(() => {
    if (!showDuplicatesOnly) return [] as Array<{ groupId: string; lenders: typeof sortedLenders }>;
    const byGroup = new Map<string, typeof sortedLenders>();
    for (const lender of sortedLenders) {
      const gid = duplicateIndex.byLenderId[lender.id]?.groupId;
      if (!gid) continue;
      const arr = byGroup.get(gid) ?? [];
      arr.push(lender);
      byGroup.set(gid, arr);
    }
    return Array.from(byGroup.entries())
      .filter(([, members]) => members.length >= 2)
      .map(([groupId, lenders]) => ({ groupId, lenders }))
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
  }, [showDuplicatesOnly, sortedLenders, duplicateIndex]);

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

  // Open the side-by-side merge dialog with a specific duplicate cluster
  // preselected. Used by the grouped Duplicates view so users can jump from
  // a cluster straight into the merge experience.
  const openMergeForGroup = useCallback((memberIds: string[]) => {
    if (memberIds.length < 2) return;
    setSelectedLenderIds(new Set(memberIds));
    setIsSideBySideMergeOpen(true);
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
    const base = !dealSearchQuery.trim()
      ? deals
      : deals.filter(d => {
          const q = dealSearchQuery.toLowerCase();
          return d.name.toLowerCase().includes(q) || d.company.toLowerCase().includes(q);
        });
    // Flag duplicates so the picker can disambiguate identically-named deals
    // (this is what caused the "added lenders don't show up" confusion — two
    // Worthy deals rendered identically and the user picked the wrong one).
    const companyCounts = new Map<string, number>();
    base.forEach(d => {
      const key = (d.company || d.name || '').toLowerCase();
      companyCounts.set(key, (companyCounts.get(key) || 0) + 1);
    });
    return base.slice(0, 30).map(d => ({
      deal: d,
      isDuplicate: (companyCounts.get((d.company || d.name || '').toLowerCase()) || 0) > 1,
    }));
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
    let failedCount = 0;

    for (const name of selectedNames) {
      if (existingNames.has(name.toLowerCase())) {
        skippedCount++;
        continue;
      }
      const result = await addLenderToDeal(dealId, { name });
      if (result) addedCount++;
      else failedCount++;
    }

    const dealName = targetDeal?.company || targetDeal?.name || 'deal';
    const descParts: string[] = [];
    if (skippedCount > 0) descParts.push(`${skippedCount} already on the deal`);
    if (failedCount > 0) descParts.push(`${failedCount} failed to add`);
    if (addedCount > 0) {
      toast({
        title: `Added ${addedCount} lender${addedCount !== 1 ? 's' : ''} to ${dealName}`,
        description: descParts.length ? descParts.join(' · ') : undefined,
        variant: failedCount > 0 ? 'destructive' : undefined,
      });
    } else if (failedCount > 0) {
      toast({
        title: 'Failed to add funding sources',
        description: `${failedCount} could not be added to ${dealName}.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'No funding sources added',
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
      tier: form.tier ? `T${form.tier}` : null,
      relationship_owners: form.relationshipOwners.trim() || null,
      website: form.website.trim() || null,
      linkedin_url: form.linkedinUrl.trim() || null,
      phone: form.phoneMain.trim() || null,
      address: form.address.trim() || null,
      min_revenue: form.minRevenue ? parseFloat(form.minRevenue) : null,
      ebitda_min: form.ebitdaMin ? parseFloat(form.ebitdaMin) : null,
      company_requirements: form.companyRequirements.trim() || null,
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
        const resolved = await Promise.all(
          form.contacts
            .filter(c => c.name.trim())
            .map(async (c) => {
              let contactId = c.contact_id ?? null;
              // No CRM link yet → create a fresh contact row so we link instead of dup later
              if (!contactId) {
                const trimmedName = c.name.trim();
                const [firstName, ...rest] = trimmedName.split(' ');
                const lastName = rest.join(' ').trim() || null;
                const { data: created, error: createErr } = await supabase
                  .from('contacts')
                  .insert({
                    first_name: firstName || null,
                    last_name: lastName,
                    email: c.email.trim() || null,
                    job_title: c.title.trim() || null,
                    phone_work: c.phone.trim() || null,
                  })
                  .select('id')
                  .single();
                if (createErr) {
                  console.warn('[Lenders] could not create CRM contact, saving lender contact without link', createErr);
                } else {
                  contactId = created?.id ?? null;
                }
              }
              return {
                lender_id: lenderId!,
                contact_id: contactId,
                name: c.name.trim(),
                title: c.title.trim() || null,
                email: c.email.trim() || null,
                phone: c.phone.trim() || null,
                geography: c.geography?.trim() || null,
                is_primary: c.isPrimary,
              };
            })
        );
        if (resolved.length > 0) {
          await supabase.from('lender_contacts').insert(resolved);
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
      website: data.websiteUrl?.trim() || null,
      linkedin_url: data.linkedinUrl?.trim() || null,
      address: data.address?.trim() || null,
      phone: data.phoneMain?.trim() || null,
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

  const handleExport = async () => {
    // The directory streams in pages (100 at a time) so `masterLenders` may
    // only contain the first page(s) if the user clicks Export before the
    // background load finishes. Fetch the full list directly from the
    // database to guarantee a complete export.
    toast({ title: 'Preparing export…', description: 'Fetching all funding sources.' });
    let allRows: MasterLender[] = [];
    try {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('master_lenders')
          .select('*')
          .order('name', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data as MasterLender[] | null) ?? [];
        allRows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
    } catch (err) {
      console.error('Full lender export failed, falling back to loaded rows', err);
      allRows = masterLenders;
    }
    const exportData = allRows.map(l => ({
      name: l.name,
      contact: { name: l.contact_name || '', email: l.email || '', phone: '' },
      preferences: [...(l.loan_types || []), ...(l.industries || [])],
      website: l.lender_one_pager_url,
      description: l.deal_structure_notes,
    }));
    const csv = exportLendersToCsv(exportData);
    downloadCsv(csv, `lenders-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: 'Export complete', description: `Exported ${allRows.length.toLocaleString()} funding sources to CSV.` });
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
        <meta name="description" content="Manage your funding source directory" />
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
        so Directory and Deals can never drift apart on canvas tone,
        header chrome, or padding rhythm.
      */}
      <WorkspacePage contentClassName="space-y-6">
            <div className="lg-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <h1 className="text-base font-semibold flex items-center gap-2 text-foreground tracking-tight">
                  <Building2 className="h-4 w-4 text-foreground/80" />
                  Directory
                  <BetaBadge featureKey="page_lenders" />
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">Manage your funding source directory</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Import dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="lg-pill gap-1">
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
                    <Button variant="outline" size="sm" className="lg-pill gap-1">
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
                      className="lg-pill gap-1 relative"
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
                <Button variant="outline" size="sm" className="lg-pill gap-1" onClick={() => navigate('/lenders/config')}>
                  <Settings className="h-4 w-4" />
                  Configuration
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="lg-pill gap-1"
                  onClick={(e) => { analyticsOrigin.capture(e); setIsAnalyticsOpen(true); }}
                >
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </Button>
                <Button
                  onClick={openAddDialog}
                  size="sm"
                  className="lg-cta gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Funding Source
                </Button>
              </div>
            </div>

            <div className="lg-shell px-4 py-4 space-y-4">
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
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="lg-input h-10 pl-9 pr-24"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {searchQuery && searchQuery !== debouncedSearchQuery && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Searching" />
                          )}
                          {debouncedSearchQuery && (
                            <span
                              className="hidden sm:inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
                              title={`${sortedLenders.length.toLocaleString()} of ${masterLenders.length.toLocaleString()} lenders match`}
                            >
                              {sortedLenders.length.toLocaleString()} / {masterLenders.length.toLocaleString()}
                            </span>
                          )}
                          {searchQuery && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setSearchQuery('')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Type sectors, products, deal names, geographies, or decision reasons to find matching lenders across profiles and deal history.
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-2 whitespace-nowrap h-10 ${showActiveDealsOnly ? 'lg-cta' : 'lg-pill'}`}
                    onClick={() => setShowActiveDealsOnly(!showActiveDealsOnly)}
                  >
                    <Zap className="h-4 w-4" />
                    Active Deals
                    {showActiveDealsOnly && (
                      <X className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-2 whitespace-nowrap h-10 ${showDuplicatesOnly ? 'lg-cta' : 'lg-pill'}`}
                        onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                      >
                        <Copy className="h-4 w-4" />
                        {showDuplicatesOnly
                          ? `Duplicates (${duplicateIndex.groups.length} group${duplicateIndex.groups.length === 1 ? '' : 's'})`
                          : 'Duplicates'}
                        {!showDuplicatesOnly && duplicateIndex.groups.length > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                            {duplicateIndex.groups.length}
                          </Badge>
                        )}
                        {showDuplicatesOnly && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      Show only funding sources that look like duplicates of another entry (exact, near-match suffix, or substring). Use the Merge button above to clean them up.
                    </TooltipContent>
                  </Tooltip>
                  <Select value={sortOption} onValueChange={(value: SortOption) => setSortOption(value)}>
                    <SelectTrigger className="lg-input h-10 w-full sm:w-[180px]">
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
                  <div className="lg-segmented">
                    <Button
                      variant="ghost"
                      size="icon"
                      data-active={viewMode === 'list'}
                      onClick={() => handleViewModeChange('list')}
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-active={viewMode === 'grid'}
                      onClick={() => handleViewModeChange('grid')}
                      title="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-active={viewMode === 'spreadsheet'}
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
                              filteredDealsForPicker.map(({ deal, isDuplicate }) => {
                                const createdLabel = deal.createdAt
                                  ? new Date(deal.createdAt).toLocaleDateString()
                                  : null;
                                return (
                                  <button
                                    key={deal.id}
                                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5"
                                    onClick={() => handleAddSelectedToDeal(deal.id)}
                                    disabled={isAddingToDeal}
                                  >
                                    <span className="font-medium truncate flex items-center gap-1.5">
                                      {deal.company || deal.name}
                                      {isDuplicate && (
                                        <span className="inline-flex items-center px-1 py-0 rounded-sm text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                          Duplicate
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {deal.name}
                                      {isDuplicate && createdLabel && ` · created ${createdLabel}`}
                                      {isDuplicate && ` · id ${deal.id.slice(0, 8)}`}
                                    </span>
                                  </button>
                                );
                              })
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

                {/* Grouped Duplicates View */}
                {!isLoading && showDuplicatesOnly && viewMode !== 'spreadsheet' && duplicateGroupsView.length > 0 && (
                  <div className="space-y-4" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                    {duplicateGroupsView.map(({ groupId, lenders: groupLenders }) => {
                      const ids = groupLenders.map((l) => l.id);
                      const displayName = groupLenders[0]?.name || groupId;
                      return (
                        <div
                          key={groupId}
                          className="rounded-lg border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => openMergeForGroup(ids)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate">
                                {displayName}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                · {groupLenders.length} possible duplicates
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
                              <GitMerge className="h-3.5 w-3.5" />
                              Merge group
                            </span>
                          </button>
                          <div className="p-3 space-y-2">
                            {groupLenders.map((lender) => (
                              <div key={lender.id} data-lender-row={lender.id}>
                                <LenderListCard
                                  lender={lender}
                                  activeDealCount={activeDealCounts[lender.name] || 0}
                                  duplicateCount={duplicateIndex.byLenderId[lender.id]?.count || 0}
                                  duplicateSiblings={duplicateSiblingsByLenderId[lender.id]}
                                  onOpenSiblingDetail={openLenderSiblingDetailStable}
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
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* List View */}
                {/* List View - Virtualized */}
                {!isLoading && !showDuplicatesOnly && viewMode === 'list' && sortedLenders.length > 0 && (
                  <Virtuoso
                    style={{ height: 'calc(100vh - 280px)' }}
                    totalCount={sortedLenders.length}
                    endReached={() => loadMore()}
                    computeItemKey={(index) => sortedLenders[index]?.id ?? index}
                    increaseViewportBy={{ top: 600, bottom: 600 }}
                    itemContent={(index) => {
                      const lender = sortedLenders[index];
                      return (
                        <div className="pb-3" data-lender-row={lender.id}>
                          <LenderListCard
                            lender={lender}
                            activeDealCount={activeDealCounts[lender.name] || 0}
                            duplicateCount={duplicateIndex.byLenderId[lender.id]?.count || 0}
                            duplicateSiblings={duplicateSiblingsByLenderId[lender.id]}
                            onOpenSiblingDetail={openLenderSiblingDetailStable}
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
                {!isLoading && !showDuplicatesOnly && viewMode === 'grid' && sortedLenders.length > 0 && (
                  <VirtuosoGrid
                    style={{ height: 'calc(100vh - 280px)' }}
                    totalCount={sortedLenders.length}
                    endReached={() => loadMore()}
                    computeItemKey={(index) => sortedLenders[index]?.id ?? index}
                    increaseViewportBy={{ top: 600, bottom: 600 }}
                    listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                    itemContent={(index) => {
                      const lender = sortedLenders[index];
                      return (
                        <LenderGridCard
                          lender={lender}
                          activeDealCount={activeDealCounts[lender.name] || 0}
                          duplicateCount={duplicateIndex.byLenderId[lender.id]?.count || 0}
                          duplicateSiblings={duplicateSiblingsByLenderId[lender.id]}
                          onOpenSiblingDetail={openLenderSiblingDetailStable}
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
                {/*
                  When the first page is in and a search/filter currently hides
                  every matching lender BUT the background loader is still
                  streaming the remainder, don't show a blocking "Loading
                  lenders" hero — keep the shell quiet and render skeletons
                  inside the table area instead. A tiny inline progress chip
                  signals the background work.
                */}
                {!isLoading && loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading more lenders in the background
                      {totalCount ? ` (${masterLenders.length.toLocaleString()} / ${totalCount.toLocaleString()})` : ''}
                    </div>
                    <LendersListSkeleton viewMode={viewMode === 'spreadsheet' ? 'list' : viewMode} />
                  </>
                )}
                {!isLoading && !loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                      <FileX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">No funding sources found</h3>
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
                    <h3 className="text-lg font-medium text-foreground">No funding sources yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Import your master lender database or add lenders manually to get started.
                    </p>
                    <Button onClick={openAddDialog} size="sm" className="gap-1 mt-4">
                      <Plus className="h-4 w-4" />
                      Add Funding Source
                    </Button>
                  </div>
                )}
            </div>
      </WorkspacePage>

      {/* Add/Edit Funding Source Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg w-[calc(100dvw-2rem)] sm:w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle>{editingLenderId ? 'Edit Funding Source' : 'Add Funding Source'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-4 -mr-2">
            <div className="space-y-4">
              {/* Name + Tier */}
              <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="name">Funding Source Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter lender name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tier">Tier</Label>
                  <Select
                    value={form.tier || 'none'}
                    onValueChange={(value) => setForm({ ...form, tier: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger id="tier" className="w-[100px]">
                      <SelectValue placeholder="Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="1">T1</SelectItem>
                      <SelectItem value="2">T2</SelectItem>
                      <SelectItem value="3">T3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* About / Notes */}
              <div className="space-y-2">
                <Label htmlFor="description">About / Notes</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Additional notes about the funding source..."
                  rows={3}
                />
              </div>

              {/* Funding Source Type */}
              <div className="space-y-2">
                <Label htmlFor="lenderType">Funding Source Type</Label>
                <Input
                  id="lenderType"
                  value={form.lenderType}
                  onChange={(e) => setForm({ ...form, lenderType: e.target.value })}
                  placeholder="e.g., Bank, Credit Fund"
                />
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
                    <LenderContactPicker
                      value={{
                        contact_id: contact.contact_id ?? null,
                        name: contact.name,
                        title: contact.title,
                        email: contact.email,
                        phone: contact.phone,
                        geography: contact.geography,
                      }}
                      onChange={(next) => setForm(prev => ({
                        ...prev,
                        contacts: prev.contacts.map((c, i) => i === idx ? {
                          ...c,
                          contact_id: next.contact_id,
                          name: next.name,
                          title: next.title,
                          email: next.email,
                          phone: next.phone,
                          geography: next.geography ?? '',
                        } : c),
                      }))}
                    />
                  </div>
                ))}
              </div>

              {/* Relationship Owner(s) */}
              <div className="space-y-2">
                <Label htmlFor="relationshipOwners">Relationship Owner(s)</Label>
                <RelationshipOwnersPicker
                  value={form.relationshipOwners}
                  onChange={(next) => setForm({ ...form, relationshipOwners: next })}
                  members={companyMembers}
                  currentUserEmail={user?.email ?? null}
                />
              </div>

              <Separator />
              {/* Business Info */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Business Info</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-xs text-muted-foreground">Website</Label>
                    <Input
                      id="website"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedinUrl" className="text-xs text-muted-foreground">LinkedIn</Label>
                    <Input
                      id="linkedinUrl"
                      value={form.linkedinUrl}
                      onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                      placeholder="https://linkedin.com/company/..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phoneMain" className="text-xs text-muted-foreground">Phone</Label>
                    <Input
                      id="phoneMain"
                      value={form.phoneMain}
                      onChange={(e) => setForm({ ...form, phoneMain: e.target.value })}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-xs text-muted-foreground">Address</Label>
                    <Input
                      id="address"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="City, State"
                    />
                  </div>
                </div>
              </div>

              <Separator />
              {/* Lending Criteria */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Lending Criteria</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minDeal" className="text-xs text-muted-foreground">Min Deal Size ($)</Label>
                    <Input
                      id="minDeal"
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(form.minDeal)}
                      onChange={(e) => setForm({ ...form, minDeal: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="e.g., $1,000,000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxDeal" className="text-xs text-muted-foreground">Max Deal Size ($)</Label>
                    <Input
                      id="maxDeal"
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(form.maxDeal)}
                      onChange={(e) => setForm({ ...form, maxDeal: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="e.g., $25,000,000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Geographic Preference</Label>
                  <MultiSelectChips
                    value={form.geo}
                    onChange={(next) => setForm({ ...form, geo: next })}
                    options={GEO_OPTIONS}
                    placeholder="Select regions"
                    searchPlaceholder="Search regions..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Industries</Label>
                  <MultiSelectChips
                    value={form.industries}
                    onChange={(next) => setForm({ ...form, industries: next })}
                    options={INDUSTRY_OPTIONS}
                    placeholder="Select industries"
                    searchPlaceholder="Search industries..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Loan Types</Label>
                  <MultiSelectChips
                    value={form.loanTypes}
                    onChange={(next) => setForm({ ...form, loanTypes: next })}
                    options={LOAN_TYPE_OPTIONS}
                    placeholder="Select loan types"
                    searchPlaceholder="Search loan types..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minRevenue" className="text-xs text-muted-foreground">Min Revenue ($)</Label>
                    <Input
                      id="minRevenue"
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(form.minRevenue)}
                      onChange={(e) => setForm({ ...form, minRevenue: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="e.g., $5,000,000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ebitdaMin" className="text-xs text-muted-foreground">Min EBITDA ($)</Label>
                    <Input
                      id="ebitdaMin"
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(form.ebitdaMin)}
                      onChange={(e) => setForm({ ...form, ebitdaMin: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="e.g., $1,000,000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Company Requirements</Label>
                  <MultiSelectChips
                    value={form.companyRequirements}
                    onChange={(next) => setForm({ ...form, companyRequirements: next })}
                    options={COMPANY_REQUIREMENT_OPTIONS}
                    placeholder="Select requirements"
                    searchPlaceholder="Search requirements..."
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingLenderId ? 'Save Changes' : 'Add Funding Source'}
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

      <LenderAnalyticsDialog
        open={isAnalyticsOpen}
        onOpenChange={(v) => { setIsAnalyticsOpen(v); if (!v) setTimeout(() => analyticsOrigin.reset(), 280); }}
        lenders={filteredLenders}
        totalLenderCount={masterLenders.length}
        filtersSummary={[
          debouncedSearchQuery.trim() ? `Search: "${debouncedSearchQuery.trim()}"` : null,
          showActiveDealsOnly ? 'Active deals only' : null,
          aiFilter?.names.size ? 'AI filter active' : null,
          advancedFilters && Object.keys(advancedFilters as any).length ? 'Advanced filters' : null,
        ].filter(Boolean).join(' · ') || undefined}
        originStyle={analyticsOrigin.contentStyle}
        originClassName={analyticsOrigin.contentClassName}
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
