import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { useLenderStages, StageOption } from '@/contexts/LenderStagesContext';

export function LenderStagesSettings() {
  const { stages, addStage, updateStage, deleteStage } = useLenderStages();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<StageOption | null>(null);
  const [label, setLabel] = useState('');

  const openAddDialog = () => {
    setEditingStage(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (stage: StageOption) => {
    setEditingStage(stage);
    setLabel(stage.label);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Stage name is required', variant: 'destructive' });
      return;
    }

    if (editingStage) {
      updateStage(editingStage.id, { label: label.trim() });
      toast({ title: 'Stage updated', description: `${label.trim()} has been updated.` });
    } else {
      const exists = stages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
      if (exists) {
        toast({ title: 'Error', description: 'A stage with this name already exists', variant: 'destructive' });
        return;
      }
      addStage({ label: label.trim() });
      toast({ title: 'Stage added', description: `${label.trim()} has been added.` });
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingStage(null);
  };

  const handleDelete = (stage: StageOption) => {
    deleteStage(stage.id);
    toast({ title: 'Stage deleted', description: `${stage.label} has been removed.` });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Lender Stages
            </CardTitle>
            <CardDescription>Configure the stages for tracking lender progress</CardDescription>
          </div>
          <Button onClick={openAddDialog} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add Stage
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <p className="font-medium">{stage.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(stage)}
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
                        <AlertDialogTitle>Delete "{stage.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the stage from available options. Existing deals using this stage won't be affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(stage)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
            {stages.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No stages configured. Add one to get started.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStage ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stageName">Stage Name *</Label>
              <Input
                id="stageName"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter stage name"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingStage ? 'Save Changes' : 'Add Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
