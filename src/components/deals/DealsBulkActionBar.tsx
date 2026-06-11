import { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DealStatus, STATUS_CONFIG, MANAGERS } from '@/types/deal';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';

interface DealsBulkActionBarProps {
  selectedDealIds: Set<string>;
  onClearSelection: () => void;
  onComplete: () => void;
}

export function DealsBulkActionBar({ selectedDealIds, onClearSelection, onComplete }: DealsBulkActionBarProps) {
  const { pipelines } = usePipelineContext();
  const { stages: globalStages } = useDealStages();
  const { updateDeal } = useDealsContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const [bulkPipelineId, setBulkPipelineId] = useState<string>('');

  const selectedPipeline = pipelines.find(p => p.id === bulkPipelineId);
  const count = selectedDealIds.size;

  const applyBulkUpdate = async (updates: Record<string, unknown>, label: string) => {
    setIsUpdating(true);
    try {
      const promises = Array.from(selectedDealIds).map(id => updateDeal(id, updates as any));
      await Promise.all(promises);
      toast.success(`Updated ${label} for ${count} deal${count > 1 ? 's' : ''}`);
      onComplete();
    } catch {
      toast.error('Failed to update some deals');
    } finally {
      setIsUpdating(false);
    }
  };

  if (count === 0) return null;

  // Get stages for the pipeline selector
  const pipelineStages = selectedPipeline?.stages?.length ? selectedPipeline.stages : [];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-purple-500/40 px-4 py-3 shadow-2xl shadow-purple-500/20 backdrop-blur-xl"
      style={{ background: 'linear-gradient(135deg, hsl(240, 20%, 18%), hsl(260, 25%, 14%))' }}
    >
      <div className="flex items-center gap-2 border-r border-border pr-3">
        <span className="text-sm font-medium text-foreground">{count} selected</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClearSelection}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Status */}
      <Select
        onValueChange={(val) =>
          applyBulkUpdate({ status: val === '__no_status__' ? null : val }, 'status')
        }
        disabled={isUpdating}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__no_status__">No status</SelectItem>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <SelectItem key={key} value={key}>{config.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Manager */}
      <Select onValueChange={(val) => applyBulkUpdate({ manager: val }, 'manager')} disabled={isUpdating}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Manager" />
        </SelectTrigger>
        <SelectContent>
          {MANAGERS.map(m => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stage (global) */}
      <Select onValueChange={(val) => applyBulkUpdate({ stage: val }, 'stage')} disabled={isUpdating}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          {globalStages.map(s => (
            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Pipeline */}
      {pipelines.length > 0 && (
        <>
          <Select
            value={bulkPipelineId}
            onValueChange={(val) => {
              setBulkPipelineId(val);
            }}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.isDefault ? ' (Default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Pipeline Stage - only when pipeline selected */}
          {pipelineStages.length > 0 && (
            <Select
              onValueChange={(stageId) => {
                applyBulkUpdate({ pipelineId: bulkPipelineId, stage: stageId }, 'pipeline & stage');
                setBulkPipelineId('');
              }}
              disabled={isUpdating}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Pipeline Stage" />
              </SelectTrigger>
              <SelectContent>
                {pipelineStages.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${s.color}`} />
                      {s.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {isUpdating && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
