import { ExternalLink, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDealActivityStats } from '@/hooks/useDealActivityStats';
import { useFlexLenderEngagement } from '@/hooks/useFlexLenderEngagement';

interface EngagementSummaryCardProps {
  dealId: string;
}

interface StatItemProps {
  label: string;
  value: number;
  isLoading?: boolean;
  highlight?: boolean;
  lenders?: { lenderName: string; lenderEmail?: string; count: number }[];
  popoverTitle?: string;
}

function StatItem({ label, value, isLoading, highlight, lenders, popoverTitle }: StatItemProps) {
  const content = (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded-md transition-colors ${lenders ? 'cursor-pointer hover:bg-muted/50' : ''} ${highlight && value > 0 ? 'bg-green-500/5' : ''}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {isLoading ? (
        <Skeleton className="h-4 w-6" />
      ) : (
        <span className={`text-sm font-semibold tabular-nums ${highlight && value > 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>{value}</span>
      )}
    </div>
  );

  if (!lenders) return content;

  return (
    <Popover>
      <PopoverTrigger asChild>{content}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <h4 className="text-xs font-medium mb-2">{popoverTitle}</h4>
        {lenders.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet.</p>
        ) : (
          <ScrollArea className="max-h-[160px]">
            <div className="space-y-1.5">
              {lenders.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{l.lenderName}</p>
                    {l.lenderEmail && <p className="text-muted-foreground truncate">{l.lenderEmail}</p>}
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-4 ml-2 shrink-0">{l.count}</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function EngagementSummaryCard({ dealId }: EngagementSummaryCardProps) {
  const { data: stats, isLoading } = useDealActivityStats(dealId);
  const { data: lenderEngagement } = useFlexLenderEngagement(dealId);

  const viewLenders = lenderEngagement?.filter(l => l.views > 0).map(l => ({ lenderName: l.lenderName, lenderEmail: l.lenderEmail, count: l.views })) || [];
  const infoReqLenders = lenderEngagement?.filter(l => l.infoRequests > 0).map(l => ({ lenderName: l.lenderName, lenderEmail: l.lenderEmail, count: l.infoRequests })) || [];
  const writeupViewLenders = lenderEngagement?.filter(l => l.writeupViews > 0).map(l => ({ lenderName: l.lenderName, lenderEmail: l.lenderEmail, count: l.writeupViews })) || [];
  const writeupDlLenders = lenderEngagement?.filter(l => l.writeupDownloads > 0).map(l => ({ lenderName: l.lenderName, lenderEmail: l.lenderEmail, count: l.writeupDownloads })) || [];
  const writeupScrollLenders = lenderEngagement?.filter(l => l.writeupFullScrolls > 0).map(l => ({ lenderName: l.lenderName, lenderEmail: l.lenderEmail, count: l.writeupFullScrolls })) || [];

  return (
    <Card className="h-full flex flex-col">
      {/* ── Header ── fixed height, matches Tasks & Info Requests */}
      <CardHeader className="flex flex-row items-center justify-between min-h-[44px] h-[44px] py-0 px-4 space-y-0 shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          Engagement
        </CardTitle>
        <Badge variant="outline" className="text-[10px] h-5 font-normal">
          <Users className="h-2.5 w-2.5 mr-1" />
          {stats?.flexUniqueLenders ?? 0} lenders
        </Badge>
      </CardHeader>

      {/* ── Body ── flex-1 fills remaining height, scrolls internally */}
      <CardContent className="flex-1 min-h-0 px-4 pb-4 pt-0 overflow-y-auto">
        <div className="space-y-0.5">
          <StatItem label="Views" value={stats?.flexViews ?? 0} isLoading={isLoading} lenders={viewLenders} popoverTitle="Lenders who viewed" />
          <StatItem label="Downloads" value={stats?.flexDownloads ?? 0} isLoading={isLoading} />
          <StatItem label="Info Requests" value={stats?.flexInfoRequests ?? 0} isLoading={isLoading} highlight lenders={infoReqLenders} popoverTitle="Lenders who requested info" />
          <StatItem label="NDA Requests" value={stats?.flexNdaRequests ?? 0} isLoading={isLoading} highlight />
          <StatItem label="Term Sheets" value={stats?.flexTermSheetRequests ?? 0} isLoading={isLoading} highlight />
        </div>
        <div className="border-t border-border/50 mt-2 pt-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-2">Write-Up</p>
          <div className="space-y-0.5">
            <StatItem label="Views" value={lenderEngagement?.reduce((s, l) => s + l.writeupViews, 0) ?? 0} isLoading={isLoading} lenders={writeupViewLenders} popoverTitle="Lenders who viewed write-up" />
            <StatItem label="Downloads" value={lenderEngagement?.reduce((s, l) => s + l.writeupDownloads, 0) ?? 0} isLoading={isLoading} lenders={writeupDlLenders} popoverTitle="Lenders who downloaded write-up" />
            <StatItem label="Full Reads" value={lenderEngagement?.reduce((s, l) => s + l.writeupFullScrolls, 0) ?? 0} isLoading={isLoading} lenders={writeupScrollLenders} popoverTitle="Lenders who read full write-up" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
