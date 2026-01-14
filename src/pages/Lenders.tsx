import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List, Loader2, Globe, Download, Upload, Zap, FileCheck, Megaphone, Database, Settings, Users } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
import { LenderDetailDialog } from '@/components/lenders/LenderDetailDialog';
import { ImportLendersDialog } from '@/components/lenders/ImportLendersDialog';
import { DuplicateLendersDialog } from '@/components/lenders/DuplicateLendersDialog';
import { exportLendersToCsv, parseCsvToLenders, downloadCsv } from '@/utils/lenderCsv';
import { useMasterLenders, MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';

type SortOption = 'name-asc' | 'name-desc' | 'deals-desc' | 'deals-asc';
type ViewMode = 'list' | 'grid';

// Adapter type for legacy LenderDetailDialog
interface LenderInfo {
  id?: string;
  name: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  preferences: string[];
  website?: string;
  description?: string;
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
      email: lender.email || '',
      phone: '',
    },
    preferences: [
      ...(lender.loan_types || []),
      ...(lender.industries || []),
      lender.geo,
    ].filter(Boolean) as string[],
    website: lender.lender_one_pager_url || undefined,
    description: lender.deal_structure_notes || lender.company_requirements || undefined,
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
  const { 
    lenders: masterLenders, 
    loading: isLoading, 
    addLender: addMasterLender, 
    updateLender: updateMasterLender, 
    deleteLender: deleteMasterLender,
    importLenders,
    mergeLenders,
  } = useMasterLenders();
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
  const [showActiveDealsOnly, setShowActiveDealsOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('lenders-view-mode');
    return (saved === 'grid' || saved === 'list') ? saved : 'list';
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDuplicatesDialogOpen, setIsDuplicatesDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
  const activeDealCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    deals.forEach(deal => {
      deal.lenders?.forEach(lender => {
        if (lender.trackingStatus === 'active') {
          counts[lender.name] = (counts[lender.name] || 0) + 1;
        }
      });
    });
    return counts;
  }, [deals]);

  const openLenderDetail = (lender: MasterLender) => {
    setSelectedLender(masterLenderToLenderInfo(lender));
    setIsDetailOpen(true);
  };

  // Filter lenders based on search query and active deals filter
  const filteredLenders = masterLenders.filter(lender => {
    // Filter by active deals if enabled
    if (showActiveDealsOnly && !activeDealCounts[lender.name]) {
      return false;
    }
    
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      lender.name.toLowerCase().includes(query) ||
      (lender.contact_name?.toLowerCase().includes(query) ?? false) ||
      (lender.email?.toLowerCase().includes(query) ?? false) ||
      (lender.lender_type?.toLowerCase().includes(query) ?? false) ||
      (lender.industries?.some(ind => ind.toLowerCase().includes(query)) ?? false) ||
      (lender.loan_types?.some(lt => lt.toLowerCase().includes(query)) ?? false) ||
      (lender.geo?.toLowerCase().includes(query) ?? false)
    );
  });

  // Sort filtered lenders
  const sortedLenders = [...filteredLenders].sort((a, b) => {
    switch (sortOption) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'deals-desc':
        return (activeDealCounts[b.name] || 0) - (activeDealCounts[a.name] || 0);
      case 'deals-asc':
        return (activeDealCounts[a.name] || 0) - (activeDealCounts[b.name] || 0);
      default:
        return 0;
    }
  });

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

      <div className="min-h-screen bg-background">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                        className="hidden"
                      />
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import to Directory
                      </DropdownMenuItem>
                    </label>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)}>
                      <Database className="h-4 w-4 mr-2" />
                      Import Master Database
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setIsDuplicatesDialogOpen(true)}>
                  <Users className="h-4 w-4" />
                  Find Duplicates
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/lenders/config')}>
                  <Settings className="h-4 w-4" />
                  Configuration
                </Button>
                <Button variant="outline" onClick={handleExport} size="sm" className="gap-1">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button variant="gradient" onClick={openAddDialog} size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Lender
                </Button>
              </div>
            </div>

            <div>
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
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-10 w-10 rounded-l-none"
                      onClick={() => handleViewModeChange('grid')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

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
                {!isLoading && viewMode === 'list' && (
                  <div className="space-y-3">
                    {sortedLenders.map((lender) => {
                      // Build preferences-like array from lender data
                      const displayTags = [
                        lender.lender_type,
                        ...(lender.loan_types || []),
                        ...(lender.industries || []),
                        lender.geo,
                      ].filter(Boolean) as string[];
                      
                      // Format deal size range
                      const dealSizeRange = (lender.min_deal || lender.max_deal) 
                        ? `${formatCurrency(lender.min_deal)} - ${formatCurrency(lender.max_deal)}`
                        : null;
                      
                      return (
                        <div
                          key={lender.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer transition-colors hover:bg-muted"
                          onClick={() => openLenderDetail(lender)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-2xl">{lender.name}</p>
                              {(() => {
                                const summary = getLenderSummary(lender.name);
                                return (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center">
                                          <Checkbox
                                            checked={summary.hasNda}
                                            disabled
                                            className="h-4 w-4 data-[state=checked]:bg-success data-[state=checked]:border-success"
                                          />
                                          <span className="ml-1 text-xs text-muted-foreground">NDA</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {summary.hasNda ? 'NDA on file' : 'No NDA attached'}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center">
                                          <Checkbox
                                            checked={summary.hasMarketingMaterials}
                                            disabled
                                            className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                          />
                                          <span className="ml-1 text-xs text-muted-foreground">Marketing</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {summary.hasMarketingMaterials ? 'Marketing materials on file' : 'No marketing materials attached'}
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                );
                              })()}
                              {activeDealCounts[lender.name] > 0 && (
                                <Badge variant="default" className="text-xs">
                                  {activeDealCounts[lender.name]} active
                                </Badge>
                              )}
                            </div>
                            {/* Contact and deal size info */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                              {lender.contact_name && (
                                <span>{lender.contact_name}{lender.contact_title && ` (${lender.contact_title})`}</span>
                              )}
                              {lender.email && <span>{lender.email}</span>}
                              {dealSizeRange && (
                                <span className="font-medium text-foreground">Deal Size: {dealSizeRange}</span>
                              )}
                              {lender.min_revenue && (
                                <span>Min Revenue: {formatCurrency(lender.min_revenue)}</span>
                              )}
                              {lender.geo && <span>📍 {lender.geo}</span>}
                            </div>
                            {displayTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {displayTags.slice(0, 5).map((tag, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {displayTags.length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{displayTags.length - 5} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={isQuickUploading && quickUploadTarget?.lenderName === lender.name}
                                >
                                  {isQuickUploading && quickUploadTarget?.lenderName === lender.name ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleQuickUpload(lender.name, 'nda')}>
                                  <FileCheck className="h-4 w-4 mr-2" />
                                  Upload NDA
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleQuickUpload(lender.name, 'marketing_materials')}>
                                  <Megaphone className="h-4 w-4 mr-2" />
                                  Upload Marketing Materials
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(lender.name)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {lender.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the lender from the available options. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(lender.id, lender.name)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Grid View */}
                {!isLoading && viewMode === 'grid' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {sortedLenders.map((lender) => {
                      const displayTags = [
                        lender.lender_type,
                        ...(lender.loan_types?.slice(0, 1) || []),
                      ].filter(Boolean) as string[];
                      
                      // Format deal size range for grid view
                      const dealSizeRange = (lender.min_deal || lender.max_deal) 
                        ? `${formatCurrency(lender.min_deal)} - ${formatCurrency(lender.max_deal)}`
                        : null;
                      
                      return (
                        <div
                          key={lender.id}
                          className="relative aspect-square bg-muted/50 rounded-lg p-3 flex flex-col transition-transform duration-200 hover:scale-105 cursor-pointer"
                          onClick={() => openLenderDetail(lender)}
                        >
                          {/* Active deal count - top left corner */}
                          {activeDealCounts[lender.name] > 0 && (
                            <Badge variant="default" className="absolute top-0 left-0 text-xs rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none">
                              {activeDealCounts[lender.name]} active
                            </Badge>
                          )}
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={isQuickUploading && quickUploadTarget?.lenderName === lender.name}
                                >
                                  {isQuickUploading && quickUploadTarget?.lenderName === lender.name ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleQuickUpload(lender.name, 'nda')}>
                                  <FileCheck className="h-4 w-4 mr-2" />
                                  Upload NDA
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleQuickUpload(lender.name, 'marketing_materials')}>
                                  <Megaphone className="h-4 w-4 mr-2" />
                                  Upload Marketing Materials
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditDialog(lender.name)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {lender.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the lender from the available options. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(lender.id, lender.name)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <div className="flex-1 flex flex-col justify-center items-center text-center">
                            <p className="font-medium text-xl line-clamp-2">{lender.name}</p>
                            <div className="flex items-center gap-3 mt-2">
                              {(() => {
                                const summary = getLenderSummary(lender.name);
                                return (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center">
                                          <Checkbox
                                            checked={summary.hasNda}
                                            disabled
                                            className="h-3.5 w-3.5 data-[state=checked]:bg-success data-[state=checked]:border-success"
                                          />
                                          <span className="ml-1 text-xs text-muted-foreground">NDA</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {summary.hasNda ? 'NDA on file' : 'No NDA attached'}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center">
                                          <Checkbox
                                            checked={summary.hasMarketingMaterials}
                                            disabled
                                            className="h-3.5 w-3.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                          />
                                          <span className="ml-1 text-xs text-muted-foreground">Marketing</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {summary.hasMarketingMaterials ? 'Marketing materials on file' : 'No marketing materials attached'}
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                );
                              })()}
                            </div>
                            {lender.contact_name && (
                              <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">
                                {lender.contact_name}
                              </p>
                            )}
                            {dealSizeRange && (
                              <p className="text-xs font-medium text-foreground mt-1">
                                {dealSizeRange}
                              </p>
                            )}
                          </div>
                          {displayTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 justify-center mt-2">
                              {displayTags.slice(0, 2).map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {displayTags.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{displayTags.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isLoading && sortedLenders.length === 0 && masterLenders.length > 0 && (
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLenderId ? 'Edit Lender' : 'Add Lender'}</DialogTitle>
          </DialogHeader>
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
        onEdit={openEditDialog}
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
        onMergeLenders={async (keepId, mergeIds, mergedData) => {
          await mergeLenders(keepId, mergeIds, mergedData);
        }}
        onDeleteLender={async (id) => {
          await deleteMasterLender(id);
        }}
      />
    </>
  );
}
