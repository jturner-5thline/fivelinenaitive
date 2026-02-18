import { useState } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { NewsItem } from '@/hooks/useNews';

interface AiSummaryDialogProps {
  article: NewsItem | null;
  onClose: () => void;
}

export function AiSummaryPanel({ article, onClose }: AiSummaryDialogProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSummary = async () => {
    if (!article) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-news-summary', {
        body: { title: article.title, summary: article.summary, source: article.source, url: article.url },
      });
      if (fnError) throw fnError;
      setSummary(data?.summary || 'No summary generated.');
    } catch (err) {
      setError('Failed to generate summary. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!article) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Summary
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2 font-medium">{article.title}</p>
        {!summary && !isLoading && !error && (
          <Button variant="outline" size="sm" onClick={generateSummary} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Generate Summary
          </Button>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing article...
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {summary && (
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        )}
      </CardContent>
    </Card>
  );
}
