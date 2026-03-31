import { Deal, STAGE_CONFIG, STATUS_CONFIG } from '@/types/deal';
import { DuplicateCluster } from '@/hooks/useDealDuplicates';
import { DuplicateGroup } from './DuplicateGroup';
import { SearchX } from 'lucide-react';

interface DuplicatesViewProps {
  clusters: DuplicateCluster[];
  onMerge: (cluster: DuplicateCluster) => void;
  onDealDeleted?: () => void;
}

export function DuplicatesView({ clusters, onMerge, onDealDeleted }: DuplicatesViewProps) {
  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted/50 p-4 mb-4">
          <SearchX className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-foreground">No duplicate deals found</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          All deals in the current view have unique names. Try broadening your filters or switching pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Found {clusters.length} group{clusters.length !== 1 ? 's' : ''} of potential duplicates
      </p>
      {clusters.map(cluster => (
        <DuplicateGroup key={cluster.id} cluster={cluster} onMerge={() => onMerge(cluster)} onDealDeleted={onDealDeleted} />
      ))}
    </div>
  );
}
