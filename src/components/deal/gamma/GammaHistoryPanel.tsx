import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Clock, ExternalLink, Eye, Trash2, Loader2, Star, StarOff, Search, Share2, Copy, Check, MessageSquare } from 'lucide-react';
import { GammaFilePreview } from './GammaFilePreview';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  is_starred: boolean;
  share_token: string | null;
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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('gamma_generations')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setGenerations((data as Generation[]) || []);
    } catch (err) {
      console.error('Failed to load generation history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [dealId, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('gamma_generations').delete().eq('id', id);
      if (error) throw error;
      setGenerations(prev => prev.filter(g => g.id !== id));
      toast.success('Generation removed');
    } catch { toast.error('Failed to delete generation'); }
  };

  const handleToggleStar = async (gen: Generation) => {
    const newVal = !gen.is_starred;
    setGenerations(prev => prev.map(g => g.id === gen.id ? { ...g, is_starred: newVal } : g));
    try {
      const { error } = await supabase.from('gamma_generations').update({ is_starred: newVal }).eq('id', gen.id);
      if (error) throw error;
    } catch {
      setGenerations(prev => prev.map(g => g.id === gen.id ? { ...g, is_starred: !newVal } : g));
      toast.error('Failed to update');
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    setGenerations(prev => prev.map(g => g.id === id ? { ...g, title: newTitle } : g));
    try {
      const { error } = await supabase.from('gamma_generations').update({ title: newTitle }).eq('id', id);
      if (error) throw error;
    } catch { toast.error('Failed to rename'); }
  };

  const handleShare = async (gen: Generation) => {
    if (gen.share_token) {
      const url = gen.gamma_url || '';
      await navigator.clipboard.writeText(url);
      setCopiedId(gen.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Link copied!');
      return;
    }
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { error } = await supabase.from('gamma_generations')
        .update({ share_token: token, share_expires_at: expires })
        .eq('id', gen.id);
      if (error) throw error;
      setGenerations(prev => prev.map(g => g.id === gen.id ? { ...g, share_token: token } : g));
      if (gen.gamma_url) {
        await navigator.clipboard.writeText(gen.gamma_url);
        setCopiedId(gen.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
      toast.success('Share link created & copied!');
    } catch { toast.error('Failed to create share link'); }
  };

  const filtered = generations.filter(g => {
    if (filter === 'starred' && !g.is_starred) return false;
    if (search) {
      const s = search.toLowerCase();
      return (g.title || '').toLowerCase().includes(s) || g.format.toLowerCase().includes(s);
    }
    return true;
  });

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
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generation History</p>
        <div className="flex items-center gap-1">
          <Button
            variant={filter === 'starred' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setFilter(f => f === 'starred' ? 'all' : 'starred')}
          >
            <Star className="h-3 w-3 mr-1" />
            Starred
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Search generations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs pl-7"
        />
      </div>

      <ScrollArea className="max-h-[250px]">
        <div className="space-y-1">
          {filtered.map((gen) => (
            <div
              key={gen.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => handleToggleStar(gen)} className="shrink-0">
                  {gen.is_starred ? (
                    <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                  ) : (
                    <StarOff className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
                <div className="min-w-0">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-sm text-foreground truncate block text-left hover:underline">
                        {gen.title || gen.template_id || gen.format}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-2" align="start">
                      <Input
                        defaultValue={gen.title || ''}
                        placeholder="Enter a name..."
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRename(gen.id, (e.target as HTMLInputElement).value);
                            (e.target as HTMLElement).closest('[data-state]')?.dispatchEvent(
                              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                            );
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={gen.status === 'completed' ? 'default' : 'secondary'} className="text-[9px] h-4 px-1.5">
                      {gen.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(gen.created_at).toLocaleDateString()} · {new Date(gen.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {gen.gamma_url && (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onView(gen)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <GammaFilePreview pdfUrl={gen.pdf_url || undefined} pptxUrl={gen.pptx_url || undefined} title={gen.title || undefined} />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleShare(gen)}>
                      {copiedId === gen.id ? <Check className="h-3 w-3 text-primary" /> : <Share2 className="h-3 w-3" />}
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
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No matching generations</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
