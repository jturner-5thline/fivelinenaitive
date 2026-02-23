import { useState, useEffect, useCallback } from 'react';
import { Pin, Trash2, ClipboardCopy, Check } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface PinnedInsight {
  id: string;
  content: string;
  pinned_at: string;
}

// Simple localStorage-based pinned insights store
const STORAGE_KEY = 'naitive-pinned-insights';

export function getPinnedInsights(): PinnedInsight[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function addPinnedInsight(content: string) {
  const insights = getPinnedInsights();
  const newInsight: PinnedInsight = {
    id: crypto.randomUUID(),
    content,
    pinned_at: new Date().toISOString(),
  };
  insights.unshift(newInsight);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(insights.slice(0, 50)));
  window.dispatchEvent(new Event('pinned-insights-changed'));
  return newInsight;
}

export function removePinnedInsight(id: string) {
  const insights = getPinnedInsights().filter(i => i.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(insights));
  window.dispatchEvent(new Event('pinned-insights-changed'));
}

export function PinnedInsightsPanel() {
  const [insights, setInsights] = useState<PinnedInsight[]>(getPinnedInsights());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setInsights(getPinnedInsights());
    window.addEventListener('pinned-insights-changed', handler);
    return () => window.removeEventListener('pinned-insights-changed', handler);
  }, []);

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast.success('Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRemove = (id: string) => {
    removePinnedInsight(id);
    toast('Unpinned');
  };

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Pin className="h-5 w-5 text-primary/50" />
        </div>
        <p className="text-sm text-muted-foreground">No pinned insights yet</p>
        <p className="text-xs text-muted-foreground/70 max-w-[240px]">
          Pin important AI responses from chat to save them here for quick reference.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              'rounded-xl p-3 text-sm',
              'border border-[hsl(263,40%,30%,0.4)]',
              'bg-[linear-gradient(135deg,hsl(260,20%,10%,0.5)_0%,hsl(263,18%,8%,0.6)_100%)]',
              'backdrop-blur-md group'
            )}
          >
            <div className="flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="flex-1 text-xs leading-relaxed line-clamp-6 whitespace-pre-wrap">
                {insight.content.slice(0, 500)}{insight.content.length > 500 ? '...' : ''}
              </p>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(insight.pinned_at), 'MMM d, h:mm a')}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(insight.content, insight.id)}>
                  {copiedId === insight.id ? <Check className="h-3 w-3 text-green-500" /> : <ClipboardCopy className="h-3 w-3 text-muted-foreground" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(insight.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
