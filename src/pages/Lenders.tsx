import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List, Loader2, Globe, Download, Upload, Zap } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from '@/hooks/use-toast';
import { useLenders } from '@/contexts/LendersContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { LenderDetailDialog } from '@/components/lenders/LenderDetailDialog';
import { exportLendersToCsv, parseCsvToLenders, downloadCsv } from '@/utils/lenderCsv';

type SortOption = 'name-asc' | 'name-desc' | 'prefs-desc' | 'prefs-asc';
type ViewMode = 'list' | 'grid';

interface LenderInfo {
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
  name: string;
  contactName: string;
  email: string;
  phone: string;
  preferences: string;
  website: string;
  description: string;
}

const emptyForm: LenderForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  preferences: '',
  website: '',
  description: '',
};

export default function Lenders() {
  const { lenders, addLender, updateLender, deleteLender } = useLenders();
  const { deals } = useDealsContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLender, setEditingLender] = useState<string | null>(null);
  const [form, setForm] = useState<LenderForm>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveDealsOnly, setShowActiveDealsOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('lenders-view-mode');
    return (saved === 'grid' || saved === 'list') ? saved : 'list';
  });

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

  const openLenderDetail = (lender: LenderInfo) => {
    setSelectedLender(lender);
    setIsDetailOpen(true);
  };

  // Filter lenders based on search query and active deals filter
  const filteredLenders = lenders.filter(lender => {
    // Filter by active deals if enabled
    if (showActiveDealsOnly && !activeDealCounts[lender.name]) {
      return false;
    }
    
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      lender.name.toLowerCase().includes(query) ||
      lender.contact.name.toLowerCase().includes(query) ||
      lender.contact.email.toLowerCase().includes(query) ||
      lender.preferences.some(pref => pref.toLowerCase().includes(query))
    );
  });

  // Sort filtered lenders
  const sortedLenders = [...filteredLenders].sort((a, b) => {
    switch (sortOption) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'prefs-desc':
        return b.preferences.length - a.preferences.length;
      case 'prefs-asc':
        return a.preferences.length - b.preferences.length;
      default:
        return 0;
    }
  });

  const openAddDialog = () => {
    setEditingLender(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (lenderName: string) => {
    const lender = lenders.find(l => l.name === lenderName);
    if (lender) {
      setEditingLender(lenderName);
      setForm({
        name: lender.name,
        contactName: lender.contact.name,
        email: lender.contact.email,
        phone: lender.contact.phone,
        preferences: lender.preferences.join(', '),
        website: lender.website || '',
        description: lender.description || '',
      });
      setIsDialogOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Lender name is required', variant: 'destructive' });
      return;
    }

    const lenderData = {
      name: form.name.trim(),
      contact: {
        name: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
      preferences: form.preferences.split(',').map(p => p.trim()).filter(p => p),
      website: form.website.trim() || undefined,
      description: form.description.trim() || undefined,
    };

    if (editingLender) {
      // Check if name changed and new name already exists
      if (lenderData.name.toLowerCase() !== editingLender.toLowerCase() && 
          lenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
        toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
        return;
      }
      updateLender(editingLender, lenderData);
      toast({ title: 'Lender updated', description: `${lenderData.name} has been updated.` });
    } else {
      if (lenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
        toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
        return;
      }
      addLender(lenderData);
      toast({ title: 'Lender added', description: `${lenderData.name} has been added.` });
    }

    setIsDialogOpen(false);
    setForm(emptyForm);
    setEditingLender(null);
  };

  const handleDelete = (name: string) => {
    deleteLender(name);
    toast({ title: 'Lender deleted', description: `${name} has been removed.` });
  };

  const handleExport = () => {
    const csv = exportLendersToCsv(lenders);
    downloadCsv(csv, `lenders-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: 'Export complete', description: `Exported ${lenders.length} lenders to CSV.` });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedLenders = parseCsvToLenders(content);
        
        let added = 0;
        let skipped = 0;
        
        parsedLenders.forEach(row => {
          const exists = lenders.some(l => l.name.toLowerCase() === row.name.toLowerCase());
          if (!exists) {
            addLender({
              name: row.name,
              contact: {
                name: row.contactName,
                email: row.email,
                phone: row.phone,
              },
              preferences: row.preferences.split(';').map(p => p.trim()).filter(p => p),
              website: row.website || undefined,
              description: row.description || undefined,
            });
            added++;
          } else {
            skipped++;
          }
        });

        toast({ 
          title: 'Import complete', 
          description: `Added ${added} lenders${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}.` 
        });
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

  return (
    <>
      <Helmet>
        <title>Lenders - nAItive</title>
        <meta name="description" content="Manage your lender directory" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

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
                <Button variant="outline" onClick={handleExport} size="sm" className="gap-1">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <span>
                      <Upload className="h-4 w-4" />
                      Import
                    </span>
                  </Button>
                </label>
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
                      <SelectItem value="prefs-desc">Most Preferences</SelectItem>
                      <SelectItem value="prefs-asc">Fewest Preferences</SelectItem>
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

                {/* Results count */}
                {searchQuery && (
                  <p className="text-sm text-muted-foreground mb-3">
                    Found {sortedLenders.length} {sortedLenders.length === 1 ? 'lender' : 'lenders'}
                  </p>
                )}

                {/* List View */}
                {viewMode === 'list' && (
                  <div className="space-y-3">
                    {sortedLenders.map((lender) => (
                      <div
                        key={lender.name}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer transition-colors hover:bg-muted"
                        onClick={() => openLenderDetail(lender)}
                      >
                        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-2xl">{lender.name}</p>
                            {activeDealCounts[lender.name] > 0 && (
                              <Badge variant="default" className="text-xs">
                                {activeDealCounts[lender.name]} active
                              </Badge>
                            )}
                          </div>
                          {lender.contact.name && (
                            <p className="text-sm text-muted-foreground truncate">
                              {lender.contact.name} • {lender.contact.email}
                            </p>
                          )}
                          {lender.preferences.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {lender.preferences.slice(0, 3).map((pref, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {pref}
                                </Badge>
                              ))}
                              {lender.preferences.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{lender.preferences.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
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
                                <AlertDialogAction onClick={() => handleDelete(lender.name)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Grid View */}
                {viewMode === 'grid' && (
                  <div className="grid grid-cols-3 gap-4">
                    {sortedLenders.map((lender) => (
                      <div
                        key={lender.name}
                        className="aspect-square bg-muted/50 rounded-lg p-4 flex flex-col transition-transform duration-200 hover:scale-105 cursor-pointer"
                        onClick={() => openLenderDetail(lender)}
                      >
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                                <AlertDialogAction onClick={() => handleDelete(lender.name)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                          <p className="font-medium text-xl line-clamp-2">{lender.name}</p>
                          {activeDealCounts[lender.name] > 0 && (
                            <Badge variant="default" className="text-xs mt-1">
                              {activeDealCounts[lender.name]} active
                            </Badge>
                          )}
                          {lender.contact.name && (
                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">
                              {lender.contact.name}
                            </p>
                          )}
                        </div>
                        {lender.preferences.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-center mt-2">
                            {lender.preferences.slice(0, 2).map((pref, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {pref}
                              </Badge>
                            ))}
                            {lender.preferences.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{lender.preferences.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {sortedLenders.length === 0 && lenders.length > 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No lenders match your search.
                  </p>
                )}
                {lenders.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No lenders configured. Add one to get started.
                  </p>
                )}
            </div>
          </div>
        </main>
      </div>

      {/* Add/Edit Lender Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLender ? 'Edit Lender' : 'Add Lender'}</DialogTitle>
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
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Primary contact name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 555-0100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="website"
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://lender.com"
                    className="pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.website.trim() || !form.name.trim() || isLoadingSummary}
                  onClick={() => fetchLenderSummary(form.name, form.website)}
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Auto-fill Description'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Add a URL to auto-generate a lender description</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the lender..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferences">Deal Preferences</Label>
              <Input
                id="preferences"
                value={form.preferences}
                onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                placeholder="Comma-separated (e.g., $5M-$25M, SaaS, Tech)"
              />
              <p className="text-xs text-muted-foreground">Separate multiple preferences with commas</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit}>
              {editingLender ? 'Save Changes' : 'Add Lender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LenderDetailDialog
        lender={selectedLender}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </>
  );
}
