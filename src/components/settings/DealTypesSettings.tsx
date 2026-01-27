import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Tag, ChevronDown, Save, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from '@/hooks/use-toast';

interface DealType {
  id: string;
  label: string;
}

const DEFAULT_DEAL_TYPES: DealType[] = [
  { id: 'venture-debt', label: 'Venture Debt' },
  { id: 'asset-based-lending', label: 'Asset-Based Lending' },
  { id: 'revenue-based-financing', label: 'Revenue-Based Financing' },
  { id: 'mezzanine', label: 'Mezzanine' },
  { id: 'term-loan', label: 'Term Loan' },
  { id: 'line-of-credit', label: 'Line of Credit' },
  { id: 'equipment-financing', label: 'Equipment Financing' },
  { id: 'factoring', label: 'Factoring' },
];

interface DealTypesSettingsProps {
  isAdmin?: boolean;
}

export function DealTypesSettings({ isAdmin = true }: DealTypesSettingsProps) {
  // Load from localStorage
  const [dealTypes, setDealTypes] = useState<DealType[]>(() => {
    const saved = localStorage.getItem('dealTypes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_DEAL_TYPES;
      }
    }
    return DEFAULT_DEAL_TYPES;
  });
  
  const [savedDealTypes, setSavedDealTypes] = useState<DealType[]>(() => {
    const saved = localStorage.getItem('dealTypes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_DEAL_TYPES;
      }
    }
    return DEFAULT_DEAL_TYPES;
  });

  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('settings-deal-types-open');
    return saved !== null ? saved === 'true' : false;
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasUnsavedChanges = JSON.stringify(dealTypes) !== JSON.stringify(savedDealTypes);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('settings-deal-types-open', String(open));
  };

  const openAddDialog = () => {
    setEditingId(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (id: string) => {
    const dealType = dealTypes.find(dt => dt.id === id);
    if (dealType) {
      setEditingId(id);
      setLabel(dealType.label);
      setIsDialogOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Deal type name is required', variant: 'destructive' });
      return;
    }

    if (editingId) {
      setDealTypes(dealTypes.map(dt => dt.id === editingId ? { ...dt, label: label.trim() } : dt));
    } else {
      const existingId = label.trim().toLowerCase().replace(/\s+/g, '-');
      if (dealTypes.some(dt => dt.id === existingId)) {
        toast({ title: 'Error', description: 'A deal type with this name already exists', variant: 'destructive' });
        return;
      }
      setDealTypes([...dealTypes, { id: existingId, label: label.trim() }]);
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setDealTypes(dealTypes.filter(dt => dt.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('dealTypes', JSON.stringify(dealTypes));
      setSavedDealTypes(dealTypes);
      toast({ title: 'Deal types saved', description: 'Your changes have been saved successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save deal types', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDealTypes(savedDealTypes);
  };

  const SaveBar = () => {
    if (!hasUnsavedChanges && !isSaving) return null;
    
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground">
          {isSaving ? 'Saving changes...' : 'You have unsaved changes'}
        </p>
        <div className="flex items-center gap-2">
          {!isSaving && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            variant="gradient"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left flex-1">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Deal Types
                  </CardTitle>
                  <CardDescription>Manage the available deal type options</CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            {isAdmin && (
              <Button variant="gradient" onClick={(e) => { e.stopPropagation(); openAddDialog(); }} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Add Type
              </Button>
            )}
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Top Save Bar */}
              <SaveBar />
              
              <div className="space-y-2">
                {dealTypes.map((dealType) => (
                  <div
                    key={dealType.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <span className="font-medium">{dealType.label}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(dealType.id)}
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
                              <AlertDialogTitle>Delete "{dealType.label}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the deal type from available options. Deals using this type will retain their current value.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(dealType.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                ))}
                {dealTypes.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No deal types configured. Add one to get started.
                  </p>
                )}
              </div>
              
              {/* Bottom Save Bar */}
              <SaveBar />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Deal Type' : 'Add Deal Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dealTypeLabel">Deal Type Name *</Label>
              <Input
                id="dealTypeLabel"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Growth Capital"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit}>
              {editingId ? 'Save Changes' : 'Add Deal Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
