import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { VirtuosoGrid, Virtuoso } from 'react-virtuoso';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List, Loader2, Globe, Download, Upload, Zap, FileCheck, Megaphone, Database, Settings, Users, Columns, Table2, RefreshCw, History, Bell, ChevronDown } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { ImportLendersDialog } from '@/components/lenders/ImportLendersDialog';
import { DuplicateLendersDialog } from '@/components/lenders/DuplicateLendersDialog';
import { SideBySideMergeDialog } from '@/components/lenders/SideBySideMergeDialog';
import { NonBankLendersImportButton } from '@/components/lenders/NonBankLendersImportButton';
import { BankLendersImportButton } from '@/components/lenders/BankLendersImportButton';
import { LenderFiltersPanel, applyLenderFilters, emptyFilters, LenderFilters } from '@/components/lenders/LenderFilters';
import { LenderGridCard } from '@/components/lenders/LenderGridCard';
import { LenderListCard } from '@/components/lenders/LenderListCard';
import { LenderSpreadsheetView } from '@/components/lenders/LenderSpreadsheetView';
import { exportLendersToCsv, parseCsvToLenders, downloadCsv } from '@/utils/lenderCsv';
import { useMasterLenders, MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { LenderTileDisplaySettings } from '@/pages/LenderDatabaseConfig';
import { useLenderSyncRequests } from '@/hooks/useLenderSyncRequests';
import { useLenderSyncRealtimeNotifications } from '@/hooks/useLenderSyncRealtimeNotifications';
import { LenderSyncRequestsPanel } from '@/components/lenders/LenderSyncRequestsPanel';

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

interface LenderForm {
  id?: string;
  name: string;
  contactName: string;
  contactTitle: string;
  email: string;
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
  contactName: '',
  contactTitle: '',
  email: '',
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
      phone: '',
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
  const { deals } = useDealsContext();
  const { getLenderSummary, refetch: refetchAttachmentSummaries } = useLenderAttachmentsSummary();
  const { user } = useAuth();
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

  // Get pending sync requests count
  const { pendingCount: syncPendingCount, refetch: refetchSyncRequests } = useLenderSyncRequests();

  // Enable realtime notifications for new sync requests
  useLenderSyncRealtimeNotifications(refetchSyncRequests);

  // Debounce search query for server-side search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400); // Slightly longer debounce for server queries
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Use the hook with server-side search
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
    searchQuery: debouncedSearchQuery,
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

  const openLenderDetail = (lender: MasterLender) => {
    setSelectedLender(masterLenderToLenderInfo(lender));
    setIsDetailOpen(true);
  };

  // Filter lenders based on active deals filter and advanced filters
  // Note: text search is now handled server-side via the hook's searchQuery option
  const filteredLenders = useMemo(() => {
    // First apply advanced filters (client-side for complex logic)
    const advancedFiltered = applyLenderFilters(masterLenders, advancedFilters);
    
    // Then apply active deals filter only (search is server-side now)
    if (!showActiveDealsOnly) return advancedFiltered;
    
    return advancedFiltered.filter(lender => activeDealCounts[lender.name]);
  }, [masterLenders, advancedFilters, showActiveDealsOnly, activeDealCounts]);

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
        
        results.forEach(result => {
          if (result.status === 'fulfilled' && !result.value.error) {
            successCount++;
          } else {
            errorCount++;
          }
        });
      }

      if (errorCount === 0) {
        toast({
          title: 'Push to FLEx complete',
          description: `Successfully pushed ${successCount} lender${successCount !== 1 ? 's' : ''} to FLEx.`,
        });
      } else {
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

  const openAddDialog = () => {
    setEditingLenderId(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (lenderName: string) => {
    const lender = masterLenders.find(l => l.name === lenderName);
    if (lender) {
      setEditingLenderId(lender.id);
      setForm({
        id: lender.id,
        name: lender.name,
        contactName: lender.contact_name || '',
        contactTitle: lender.contact_title || '',
        email: lender.email || '',
        lenderType: lender.lender_type || '',
        loanTypes: lender.loan_types?.join(', ') || '',
        minDeal: lender.min_deal?.toString() || '',
        maxDeal: lender.max_deal?.toString() || '',
        industries: lender.industries?.join(', ') || '',
        geo: lender.geo || '',
        description: lender.deal_structure_notes || '',
      });
      setIsDialogOpen(true);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Lender name is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    const lenderData: MasterLenderInsert = {
      name: form.name.trim(),
      contact_name: form.contactName.trim() || null,
      contact_title: form.contactTitle.trim() || null,
      email: form.email.trim() || null,
      lender_type: form.lenderType.trim() || null,
      loan_types: form.loanTypes.split(',').map(p => p.trim()).filter(p => p) || null,
      min_deal: form.minDeal ? parseFloat(form.minDeal) : null,
      max_deal: form.maxDeal ? parseFloat(form.maxDeal) : null,
      industries: form.industries.split(',').map(p => p.trim()).filter(p => p) || null,
      geo: form.geo.trim() || null,
      deal_structure_notes: form.description.trim() || null,
    };

    try {
      if (editingLenderId) {
        // Check if name changed and new name already exists
        const existingLender = masterLenders.find(l => l.id === editingLenderId);
        if (existingLender && lenderData.name.toLowerCase() !== existingLender.name.toLowerCase() && 
            masterLenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
          toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
          return;
        }
        await updateMasterLender(editingLenderId, lenderData);
        toast({ title: 'Lender updated', description: `${lenderData.name} has been updated.` });
      } else {
        if (masterLenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
          toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
          return;
        }
        await addMasterLender(lenderData);
        toast({ title: 'Lender added', description: `${lenderData.name} has been added.` });
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
      email: data.email.trim() || null,
      lender_type: data.lenderType.trim() || null,
      loan_types: data.loanTypes.split(',').map(p => p.trim()).filter(p => p) || null,
      min_deal: data.minDeal ? parseFloat(data.minDeal) : null,
      max_deal: data.maxDeal ? parseFloat(data.maxDeal) : null,
      industries: data.industries.split(',').map(p => p.trim()).filter(p => p) || null,
      geo: data.geo.trim() || null,
      deal_structure_notes: data.lenderNotes?.trim() || null,
      min_revenue: data.minRevenue ? parseFloat(data.minRevenue) : null,
      ebitda_min: data.ebitdaMin ? parseFloat(data.ebitdaMin) : null,
      company_requirements: data.companyRequirements.trim() || null,
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
        <title>Lenders - nAItive</title>
        <meta name="description" content="Manage your lender directory" />
      </Helmet>

      {/* Hidden file input for quick uploads */}
      <input
        type="file"
        ref={quickUploadRef}
        onChange={handleQuickUploadChange}
        className="hidden"
      />

      <div className="bg-background">
        <DealsHeader />

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-2 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  <Building2 className="h-6 w-6 text-foreground" />
                  Lender Directory
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

                {/* Sync dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant={syncPendingCount > 0 ? "default" : "outline"} 
                      size="sm" 
                      className="gap-1 relative"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sync
                      {syncPendingCount > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-5 rounded-full text-xs px-1.5">
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
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/lenders/config')}>
                  <Settings className="h-4 w-4" />
                  Configuration
                </Button>
                <Button variant="gradient" onClick={openAddDialog} size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Lender
                </Button>
              </div>
            </div>

            <div className="space-y-4">
                {/* Flex Sync Requests Panel - show when toggled or has pending requests */}
                {(showSyncPanel || syncPendingCount > 0) && (
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
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, contact, email, or preferences..."
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
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {isLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                        <div className="flex gap-2">
                          <Skeleton className="h-8 w-8 rounded" />
                          <Skeleton className="h-8 w-8 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
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

                {!isLoading && loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Loading lenders...
                  </p>
                )}
                {!isLoading && !loadingMore && sortedLenders.length === 0 && masterLenders.length > 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No lenders match your search.
                  </p>
                )}
                {!isLoading && masterLenders.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No lenders in your database yet.</p>
                    <p className="text-sm mt-2">Import your master lender database or add lenders manually to get started.</p>
                  </div>
                )}
            </div>
          </div>
        </main>
      </div>

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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    placeholder="Primary contact"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactTitle">Contact Title</Label>
                  <Input
                    id="contactTitle"
                    value={form.contactTitle}
                    onChange={(e) => setForm({ ...form, contactTitle: e.target.value })}
                    placeholder="e.g., VP"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                />
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
        onOpenChange={setIsDetailOpen}
        onSave={handleInlineSave}
        onDelete={(lenderName) => {
          const lender = masterLenders.find(l => l.name === lenderName);
          if (lender) handleDelete(lender.id, lender.name);
        }}
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
        onOpenChange={setIsSideBySideMergeOpen}
        lenders={sortedLenders}
        onMergeLenders={async (keepId, mergeIds, mergedData) => { await mergeLenders(keepId, mergeIds, mergedData); }}
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
