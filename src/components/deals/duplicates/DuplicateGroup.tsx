import { useState } from 'react';
import { DuplicateCluster } from '@/hooks/useDealDuplicates';
import { Deal, STATUS_CONFIG, STAGE_CONFIG } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Merge, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface DuplicateGroupProps {
  cluster: DuplicateCluster;
  onMerge: () => void;
}

export function DuplicateGroup({ cluster, onMerge }: DuplicateGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const navigate = useNavigate();

  const similarityPercent = Math.round(cluster.similarity * 100);

  return (
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
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onMerge();
              }}
            >
              <Merge className="h-3.5 w-3.5" />
              Merge
            </Button>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(cluster.deals.length, 3)}, 1fr)` }}>
              {cluster.deals.map(deal => (
                <DealComparisonCard key={deal.id} deal={deal} onNavigate={() => navigate(`/deals/${deal.id}`)} />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function DealComparisonCard({ deal, onNavigate }: { deal: Deal; onNavigate: () => void }) {
  const stageLabel = STAGE_CONFIG[deal.stage]?.label || deal.stage;
  const statusConfig = STATUS_CONFIG[deal.status];

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-sm text-foreground truncate">{deal.company || deal.name}</h4>
        <button onClick={onNavigate} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <Row label="Stage" value={stageLabel} />
        <Row label="Status" value={statusConfig?.label || deal.status} />
        <Row label="Value" value={deal.value ? `$${deal.value.toLocaleString()}` : '—'} />
        <Row label="Manager" value={deal.manager || '—'} />
        <Row label="Updated" value={format(new Date(deal.updatedAt), 'MMM d, yyyy')} />
        <Row label="Lenders" value={`${deal.lenders?.length || 0}`} />
      </div>
    </div>
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
