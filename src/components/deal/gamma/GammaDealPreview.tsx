import { Badge } from '@/components/ui/badge';
import { Building2, DollarSign, Users, Target, FileText } from 'lucide-react';
import { formatDealType } from '@/utils/dealTypeLabels';

interface DealData {
  company: string;
  value?: number;
  stage?: string;
  status?: string;
  deal_type?: string;
  notes?: string;
  narrative?: string;
  lenders?: Array<{ name: string; stage: string }>;
  milestones?: Array<{ title: string; completed: boolean }>;
}

interface GammaDealPreviewProps {
  dealData: DealData;
}

export function GammaDealPreview({ dealData }: GammaDealPreviewProps) {
  const completedMilestones = dealData.milestones?.filter(m => m.completed).length || 0;
  const totalMilestones = dealData.milestones?.length || 0;

  return (
    <div className="rounded-xl border bg-card/50 p-4 space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Content Source</p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{dealData.company}</span>
        </div>

        {dealData.value && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">${(dealData.value / 1_000_000).toFixed(2)}M</span>
          </div>
        )}

        {dealData.lenders && dealData.lenders.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{dealData.lenders.length} lenders</span>
          </div>
        )}

        {totalMilestones > 0 && (
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{completedMilestones}/{totalMilestones} milestones</span>
          </div>
        )}

        {dealData.narrative && (
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Narrative included</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {dealData.stage && <Badge variant="secondary" className="text-[10px]">{dealData.stage}</Badge>}
        {dealData.status && <Badge variant="outline" className="text-[10px]">{dealData.status}</Badge>}
        {dealData.deal_type && <Badge variant="outline" className="text-[10px]">{formatDealType(dealData.deal_type)}</Badge>}
      </div>
    </div>
  );
}
