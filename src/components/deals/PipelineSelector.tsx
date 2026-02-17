import { useState } from 'react';
import { Plus, ChevronDown, Layers, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { toast } from 'sonner';

export function PipelineSelector() {
  const { pipelines, activePipelineId, activePipeline, setActivePipelineId, createPipeline, deletePipeline, isLoading } = usePipelineContext();
  const { stages: currentStages } = useDealStages();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (isLoading && pipelines.length === 0) return null;

  if (pipelines.length === 0) {
    return (
      <>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Layers className="h-4 w-4" />
          Create Pipeline
        </Button>
        <CreatePipelineDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={async (name) => {
            setIsCreating(true);
            const pipeline = await createPipeline(name, currentStages, true);
            setIsCreating(false);
            if (pipeline) {
              toast.success(`Pipeline "${name}" created`);
              setActivePipelineId(pipeline.id);
            }
          }}
          isCreating={isCreating}
          newName={newName}
          setNewName={setNewName}
        />
      </>
    );
  }

  const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0];
  const displayName = activePipeline?.name || defaultPipeline?.name || 'Pipeline';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deletePipeline(deleteTarget.id);
      toast.success(`Pipeline "${deleteTarget.name}" deleted. Deals moved to default pipeline.`);
      // Switch to default pipeline after deletion
      const newDefault = pipelines.find(p => p.isDefault && p.id !== deleteTarget.id) || pipelines.find(p => p.id !== deleteTarget.id);
      if (newDefault) {
        setActivePipelineId(newDefault.id);
      }
    } catch {
      toast.error('Failed to delete pipeline');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <DropdownMenu modal={false} open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="truncate">{displayName}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          {pipelines.map(pipeline => {
            const isActive = activePipelineId === pipeline.id;
            const isDefault = pipeline.isDefault;
            const canDelete = pipelines.length > 1;

            return (
              <DropdownMenuItem
                key={pipeline.id}
                className={`flex items-center justify-between group ${isActive ? 'bg-accent' : ''}`}
                onSelect={(e) => {
                  e.preventDefault();
                  setActivePipelineId(pipeline.id);
                  setDropdownOpen(false);
                }}
              >
                <span className="truncate mr-2">{pipeline.name}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {isDefault && (
                    <span className="text-xs text-muted-foreground">Default</span>
                  )}
                  {canDelete && !isDefault && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeleteTarget({ id: pipeline.id, name: pipeline.name });
                        setDropdownOpen(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault();
            setNewName('');
            setCreateOpen(true);
            setDropdownOpen(false);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Pipeline
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreatePipelineDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (name) => {
          setIsCreating(true);
          const isFirst = pipelines.length === 0;
          const pipeline = await createPipeline(name, currentStages, isFirst);
          setIsCreating(false);
          if (pipeline) {
            toast.success(`Pipeline "${name}" created`);
            setActivePipelineId(pipeline.id);
            setCreateOpen(false);
          }
        }}
        isCreating={isCreating}
        newName={newName}
        setNewName={setNewName}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              All deals in this pipeline will be moved to the default pipeline. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Pipeline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreatePipelineDialog({ open, onOpenChange, onSubmit, isCreating, newName, setNewName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
  isCreating: boolean;
  newName: string;
  setNewName: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle>Create Pipeline</DialogTitle>
          <DialogDescription>
            The pipeline will use your current deal stages. You can customize them later in settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          await onSubmit(newName.trim());
        }}>
          <div className="py-4">
            <Input
              placeholder="Pipeline name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="gradient" disabled={isCreating || !newName.trim()}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
