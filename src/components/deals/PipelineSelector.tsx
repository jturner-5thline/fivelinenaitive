import { useState } from 'react';
import { Plus, ChevronDown, Layers, GitBranch } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { toast } from 'sonner';

interface PipelineSelectorProps {
  iconOnly?: boolean;
}

export function PipelineSelector({ iconOnly = false }: PipelineSelectorProps = {}) {
  const { pipelines, activePipelineId, activePipeline, setActivePipelineId, createPipeline, isLoading } = usePipelineContext();
  const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0] || null;
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
      <DropdownMenu modal={false}>
        {iconOnly ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
                    aria-label="Pipeline"
                  >
                    <GitBranch className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {activePipeline?.name || (activePipeline?.isDefault ? 'Active Pipeline' : 'Pipeline')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
              <Layers className="h-4 w-4 shrink-0" />
              <span className="truncate">{activePipeline?.name || (activePipeline?.isDefault ? 'Active Pipeline' : 'Pipeline')}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" className="w-[200px]">
          {defaultPipeline && (
            <DropdownMenuItem
              onSelect={() => {
                setActivePipelineId(defaultPipeline.id);
              }}
              className={activePipelineId === defaultPipeline.id ? 'bg-accent' : ''}
            >
              <span className="truncate">{defaultPipeline.name || 'Active Pipeline'}</span>
              <span className="ml-auto text-xs text-muted-foreground">Default</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {pipelines.filter(p => !p.isDefault && p.name !== 'naitive Pipeline' && p.name !== 'FinServ Pipeline').map(pipeline => (
            <DropdownMenuItem
              key={pipeline.id}
              onSelect={() => setActivePipelineId(pipeline.id)}
              className={activePipelineId === pipeline.id ? 'bg-accent' : ''}
            >
              <span className="truncate">{pipeline.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { setNewName(''); setCreateOpen(true); }}>
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
