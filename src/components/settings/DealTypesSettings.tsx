import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag, ChevronDown } from 'lucide-react';
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
import { useDealTypes } from '@/contexts/DealTypesContext';

export function DealTypesSettings() {
  const { dealTypes, addDealType, updateDealType, deleteDealType } = useDealTypes();
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');

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
      updateDealType(editingId, { label: label.trim() });
      toast({ title: 'Deal type updated' });
    } else {
      const existingId = label.trim().toLowerCase().replace(/\s+/g, '-');
      if (dealTypes.some(dt => dt.id === existingId)) {
        toast({ title: 'Error', description: 'A deal type with this name already exists', variant: 'destructive' });
        return;
      }
      addDealType({ label: label.trim() });
      toast({ title: 'Deal type added' });
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    deleteDealType(id);
    toast({ title: 'Deal type deleted' });
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
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
            <Button variant="gradient" onClick={(e) => { e.stopPropagation(); openAddDialog(); }} size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              Add Type
            </Button>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="space-y-2">
                {dealTypes.map((dealType) => (
                  <div
                    key={dealType.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <span className="font-medium">{dealType.label}</span>
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
                  </div>
                ))}
                {dealTypes.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No deal types configured. Add one to get started.
                  </p>
                )}
              </div>
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
