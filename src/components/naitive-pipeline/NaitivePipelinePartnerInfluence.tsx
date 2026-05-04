import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Handshake } from 'lucide-react';
import { Deal } from '@/types/deal';
import { useMemo } from 'react';

interface PartnerInfluenceProps {
  deals: Deal[];
}

export function NaitivePipelinePartnerInfluence({ deals }: PartnerInfluenceProps) {
  const stats = useMemo(() => {
    // Deals sourced via partner/channel
    const channelLinked = deals.filter(d => d.sourcedVia && ['partner', 'channel', 'referral'].includes(d.sourcedVia.toLowerCase()));
    const nonLinked = deals.filter(d => !d.sourcedVia || !['partner', 'channel', 'referral'].includes(d.sourcedVia.toLowerCase()));

    const linkedValue = channelLinked.reduce((s, d) => s + (d.value || 0), 0);
    const nonLinkedValue = nonLinked.reduce((s, d) => s + (d.value || 0), 0);

    // Top partners by referrer name
    const partnerCounts = new Map<string, number>();
    channelLinked.forEach(d => {
      const name = d.referredBy?.name || d.sourcedVia || 'Unknown';
      partnerCounts.set(name, (partnerCounts.get(name) || 0) + 1);
    });
    const topPartners = Array.from(partnerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { channelLinkedCount: channelLinked.length, nonLinkedCount: nonLinked.length, linkedValue, nonLinkedValue, topPartners };
  }, [deals]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Partner Influence</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-xl font-bold text-foreground leading-tight tracking-tight">{stats.channelLinkedCount}</p>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Channel-Linked</p>
          </div>
          <div className="text-center p-3 rounded-md bg-muted/50">
            <p className="text-xl font-bold text-foreground leading-tight tracking-tight">{stats.nonLinkedCount}</p>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Direct</p>
          </div>
        </div>
        {stats.topPartners.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Top Partners</p>
            {stats.topPartners.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between text-xs py-1">
                <span className="text-foreground truncate">{name}</span>
                <span className="text-muted-foreground">{count} deal{count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No channel-linked deals yet</p>
        )}
      </CardContent>
    </Card>
  );
}
