import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, Building2, Search, X, ArrowUpDown, LayoutGrid, List } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

type SortOption = 'name-asc' | 'name-desc' | 'prefs-desc' | 'prefs-asc';
type ViewMode = 'list' | 'grid';

interface LenderForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  preferences: string;
}

const emptyForm: LenderForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  preferences: '',
};

export default function Lenders() {
  const { lenders, addLender, updateLender, deleteLender } = useLenders();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLender, setEditingLender] = useState<string | null>(null);
  const [form, setForm] = useState<LenderForm>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Filter lenders based on search query
  const filteredLenders = lenders.filter(lender => {
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
    };

    if (editingLender) {
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
                <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <Building2 className="h-6 w-6" />
                  Lender Directory
                </h1>
                <p className="text-muted-foreground">Manage your lender directory</p>
              </div>
              <Button variant="gradient" onClick={openAddDialog} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Add Lender
              </Button>
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
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-10 w-10 rounded-l-none"
                      onClick={() => setViewMode('grid')}
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
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{lender.name}</p>
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
                        <div className="flex items-center gap-1 ml-4">
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
                      >
                        <div className="flex justify-end gap-1">
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
                          <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="font-medium text-sm line-clamp-2">{lender.name}</p>
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
                disabled={!!editingLender}
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
    </>
  );
}
