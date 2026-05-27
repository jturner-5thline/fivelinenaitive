import { useState } from 'react';
import { Plus, Pencil, Trash2, Users, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useContactTypes, useCreateContactType, useUpdateContactType, useDeleteContactType, ContactType,
} from '@/hooks/useContactTypes';

interface Props { isAdmin?: boolean; }

export function ContactTypesSettings({ isAdmin = true }: Props) {
  const [open, setOpen] = useState(false);
  const { data: types = [], isLoading } = useContactTypes({ includeInactive: true });
  const createType = useCreateContactType();
  const updateType = useUpdateContactType();
  const deleteType = useDeleteContactType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContactType | null>(null);
  const [name, setName] = useState('');

  const openAdd = () => { setEditing(null); setName(''); setDialogOpen(true); };
  const openEdit = (t: ContactType) => { setEditing(t); setName(t.name); setDialogOpen(true); };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) {
      updateType.mutate({ id: editing.id, name: trimmed }, { onSuccess: () => setDialogOpen(false) });
    } else {
      const nextOrder = Math.max(0, ...types.map(t => t.sort_order)) + 10;
      createType.mutate({ name: trimmed, sort_order: nextOrder }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <>
      
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            
              <button className="flex items-center gap-2 text-left flex-1">
                
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" /> Contact Types
                  </CardTitle>
                  <CardDescription>Manage the contact type options shown in contact forms</CardDescription>
                </div>
              </button>
            
            {isAdmin && (
              <Button variant="gradient" size="sm" className="gap-1" onClick={(e) => { e.stopPropagation(); openAdd(); }}>
                <Plus className="h-4 w-4" /> Add Type
              </Button>
            )}
          </CardHeader>
          
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : types.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No contact types configured.</p>
              ) : (
                types.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${!t.is_active ? 'text-muted-foreground line-through' : ''}`}>{t.name}</span>
                      {t.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                      {!t.is_active && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Active</Label>
                          <Switch
                            checked={t.is_active}
                            onCheckedChange={(v) => updateType.mutate({ id: t.id, is_active: v })}
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the option from the dropdown. Contacts already assigned this type will keep their value. Consider deactivating instead.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteType.mutate(t.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          
        </Card>
      

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Contact Type' : 'Add Contact Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ct-name">Name *</Label>
            <Input
              id="ct-name" value={name} maxLength={64}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Investor"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="gradient" onClick={handleSubmit} disabled={!name.trim() || createType.isPending || updateType.isPending}>
              {editing ? 'Save Changes' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}