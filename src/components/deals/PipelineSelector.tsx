import { useState } from 'react';
import { Plus, ChevronDown, Layers } from 'lucide-react';
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
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { toast } from 'sonner';

export function PipelineSelector() {
  const { pipelines, activePipelineId, activePipeline, setActivePipelineId, createPipeline, isLoading } = usePipelineContext();
  const { stages: currentStages } = useDealStages();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Don't render if no pipelines exist yet and still loading
  if (isLoading && pipelines.length === 0) return null;

  // If no pipelines exist, show a create button
  if (pipelines.length === 0) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setCreateOpen(true)}
        >
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="truncate">{activePipeline?.name || 'Active Pipeline'}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          <DropdownMenuItem
            onClick={() => setActivePipelineId(null)}
            className={!activePipelineId ? 'bg-accent' : ''}
          >
            Active Pipeline
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {pipelines.map(pipeline => (
            <DropdownMenuItem
              key={pipeline.id}
              onClick={() => setActivePipelineId(pipeline.id)}
              className={activePipelineId === pipeline.id ? 'bg-accent' : ''}
            >
              <span className="truncate">{pipeline.name}</span>
              {pipeline.isDefault && (
                <span className="ml-auto text-xs text-muted-foreground">Default</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setNewName(''); setCreateOpen(true); }}>
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
