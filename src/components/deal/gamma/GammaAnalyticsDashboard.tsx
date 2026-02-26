import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart3, FileText, Presentation, Star, Share2, Eye, Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface GammaAnalyticsDashboardProps {
  dealId: string;
}

interface AnalyticsSummary {
  totalGenerations: number;
  presentations: number;
  documents: number;
  starred: number;
  shared: number;
  templateBreakdown: Record<string, number>;
  recentActivity: Array<{ event_type: string; created_at: string; metadata: any }>;
}

export function GammaAnalyticsDashboard({ dealId }: GammaAnalyticsDashboardProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      // Fetch generations for stats
      const { data: generations, error: genError } = await supabase
        .from('gamma_generations')
        .select('*')
        .eq('deal_id', dealId);

      if (genError) throw genError;

      const gens = generations || [];
      
      const templateBreakdown: Record<string, number> = {};
      gens.forEach(g => {
        const key = g.template_id || 'Custom';
        templateBreakdown[key] = (templateBreakdown[key] || 0) + 1;
      });

      // Fetch recent analytics events
      const { data: events } = await supabase
        .from('gamma_analytics')
        .select('event_type, created_at, metadata')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(10);

      setSummary({
        totalGenerations: gens.length,
        presentations: gens.filter(g => g.format === 'presentation').length,
        documents: gens.filter(g => g.format === 'document').length,
        starred: gens.filter(g => g.is_starred).length,
        shared: gens.filter(g => g.share_token).length,
        templateBreakdown,
        recentActivity: events || [],
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary || summary.totalGenerations === 0) {
    return (
      <div className="text-center py-4">
        <BarChart3 className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No generation data yet</p>
      </div>
    );
  }

  const stats = [
    { label: 'Total', value: summary.totalGenerations, icon: TrendingUp },
    { label: 'Presentations', value: summary.presentations, icon: Presentation },
    { label: 'Documents', value: summary.documents, icon: FileText },
    { label: 'Starred', value: summary.starred, icon: Star },
    { label: 'Shared', value: summary.shared, icon: Share2 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analytics</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-5 gap-2">
        {stats.map(stat => (
          <Card key={stat.label} className="bg-muted/30 border-0">
            <CardContent className="p-2 text-center">
              <stat.icon className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template usage */}
      {Object.keys(summary.templateBreakdown).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Template Usage</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(summary.templateBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([template, count]) => (
                <Badge key={template} variant="secondary" className="text-[10px] h-5 gap-1">
                  {template} <span className="text-muted-foreground">×{count}</span>
                </Badge>
              ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {summary.recentActivity.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Recent Activity</p>
          <ScrollArea className="max-h-[120px]">
            <div className="space-y-1">
              {summary.recentActivity.map((event, i) => (
                <div key={i} className="flex items-center gap-2 py-1 px-2 rounded text-[10px]">
                  <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{event.event_type.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground ml-auto shrink-0">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
