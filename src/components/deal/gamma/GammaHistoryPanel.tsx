import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Clock, ExternalLink, Eye, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Generation {
  id: string;
  generation_id: string;
  status: string;
  format: string;
  template_id: string | null;
  title: string | null;
  gamma_url: string | null;
  pdf_url: string | null;
  pptx_url: string | null;
  created_at: string;
}

interface GammaHistoryPanelProps {
  dealId: string;
  onView: (gen: Generation) => void;
  refreshKey?: number;
}

export function GammaHistoryPanel({ dealId, onView, refreshKey }: GammaHistoryPanelProps) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('gamma_generations')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setGenerations((data as Generation[]) || []);
    } catch (err) {
      console.error('Failed to load generation history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [dealId, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('gamma_generations').delete().eq('id', id);
      if (error) throw error;
      setGenerations(prev => prev.filter(g => g.id !== id));
      toast.success('Generation removed');
    } catch (err) {
      toast.error('Failed to delete generation');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-xs">Loading history...</span>
      </div>
    );
  }

  if (generations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generation History</p>
      <ScrollArea className="max-h-[220px]">
        <div className="space-y-1">
          {generations.map((gen) => (
            <div
              key={gen.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground truncate">
                      {gen.title || gen.template_id || gen.format}
                    </span>
                    <Badge variant={gen.status === 'completed' ? 'default' : 'secondary'} className="text-[9px] h-4 px-1.5">
                      {gen.status}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(gen.created_at).toLocaleDateString()} · {new Date(gen.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {gen.gamma_url && (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onView(gen)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                      <a href={gen.gamma_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(gen.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
