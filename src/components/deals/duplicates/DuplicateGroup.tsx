import { useState, useMemo } from 'react';
import { DuplicateCluster } from '@/hooks/useDealDuplicates';
import { Deal, STATUS_CONFIG, STAGE_CONFIG } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Merge, ExternalLink, Trash2, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { usePipelines } from '@/hooks/usePipelines';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface DuplicateGroupProps {
  cluster: DuplicateCluster;
  onMerge: () => void;
  onDealDeleted?: () => void;
  onNotDuplicate?: (cluster: DuplicateCluster) => Promise<void>;
}

export function DuplicateGroup({ cluster, onMerge, onDealDeleted, onNotDuplicate }: DuplicateGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showNotDupConfirm, setShowNotDupConfirm] = useState(false);
  const [isSuppressing, setIsSuppressing] = useState(false);
  const navigate = useNavigate();
  const { pipelines } = usePipelines();

  const pipelineMap = useMemo(() => {
    const map = new Map<string, string>();
    pipelines.forEach(p => map.set(p.id, p.name));
    return map;
  }, [pipelines]);

  const similarityPercent = Math.round(cluster.similarity * 100);

  const handleNotDuplicate = async () => {
    if (!onNotDuplicate) return;
    setIsSuppressing(true);
    try {
      await onNotDuplicate(cluster);
      toast.success('Marked as not a duplicate');
      setShowNotDupConfirm(false);
    } catch (err: any) {
      toast.error('Failed to suppress duplicate', { description: err.message });
    } finally {
      setIsSuppressing(false);
    }
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-foreground">{cluster.primaryName}</span>
                <Badge variant="secondary" className="text-xs">
                  {cluster.deals.length} deals
                </Badge>
                <Badge 
                  variant="outline" 
                  className="text-xs border-amber-500/30 text-amber-400 bg-amber-500/10"
                >
                  {similarityPercent}% match
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotDupConfirm(true);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Not a Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMerge();
                  }}
                >
                  <Merge className="h-3.5 w-3.5" />
                  Merge
                </Button>
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border px-4 py-3">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(cluster.deals.length, 3)}, 1fr)` }}>
                {cluster.deals.map(deal => (
                  <DealComparisonCard key={deal.id} deal={deal} pipelineMap={pipelineMap} onNavigate={() => navigate(`/deal/${deal.id}`)} onDealDeleted={onDealDeleted} />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog open={showNotDupConfirm} onOpenChange={setShowNotDupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Not a Duplicate?</AlertDialogTitle>
            <AlertDialogDescription>
              These deals are not the same deal and should no longer appear in the duplicate review list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSuppressing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNotDuplicate} disabled={isSuppressing}>
              {isSuppressing ? 'Saving…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DealComparisonCard({ deal, pipelineMap, onNavigate, onDealDeleted }: { deal: Deal; pipelineMap: Map<string, string>; onNavigate: () => void; onDealDeleted?: () => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const stageLabel = STAGE_CONFIG[deal.stage]?.label || deal.stage;
  const statusConfig = STATUS_CONFIG[deal.status as DealStatus];
  const pipelineName = deal.pipelineId ? pipelineMap.get(deal.pipelineId) || '—' : '—';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('deals').delete().eq('id', deal.id);
      if (error) throw error;
      toast.success(`"${deal.company || deal.name}" deleted`);
      onDealDeleted?.();
    } catch (err: any) {
      toast.error('Failed to delete deal', { description: err.message });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm text-foreground truncate">{deal.company || deal.name}</h4>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onNavigate} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <Row label="Pipeline" value={pipelineName} />
          <Row label="Stage" value={stageLabel} />
          <Row label="Status" value={statusConfig?.label || deal.status} />
          <Row label="Value" value={deal.value ? `$${deal.value.toLocaleString()}` : '—'} />
          <Row label="Manager" value={deal.manager || '—'} />
          <Row label="Updated" value={format(new Date(deal.updatedAt), 'MMM d, yyyy')} />
          <Row label="Lenders" value={`${deal.lenders?.length || 0}`} />
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "<span className="font-medium text-foreground">{deal.company || deal.name}</span>" and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="text-foreground/80 text-right truncate">{value}</span>
    </div>
  );
}
