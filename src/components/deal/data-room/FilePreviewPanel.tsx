import { useState, useEffect } from 'react';
import { X, Download, ExternalLink, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import DOMPurify from 'dompurify';
import { formatBytes } from './helpers';
import { supabase } from '@/integrations/supabase/client';
import type { DealAttachment } from '@/hooks/useDealAttachments';
import { cn } from '@/lib/utils';

interface FilePreviewPanelProps {
  file: DealAttachment;
  onClose: () => void;
  onDownload: (att: DealAttachment) => void;
}

export function FilePreviewPanel({ file, onClose, onDownload }: FilePreviewPanelProps) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '');
  const isPdf = ext === 'pdf';

  const [showSummary, setShowSummary] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [isInferred, setIsInferred] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const getPdfSrc = () => {
    if (!file.url) return '';
    return `https://docs.google.com/viewer?url=${encodeURIComponent(file.url)}&embedded=true`;
  };

  useEffect(() => {
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);

    const fetchSummary = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('summarize-document', {
          body: { fileUrl: file.url, fileName: file.name },
        });

        if (error) throw error;
        setSummary(data.summary);
        setIsInferred(data.isInferred);
      } catch (err: any) {
        console.error('Summary error:', err);
        setSummaryError('Could not generate summary');
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [file.id]);

  const renderMarkdown = (text: string) => {
    // Simple markdown to HTML: bold, bullets
    return text
      .split('\n')
      .map((line, i) => {
        const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return `<li key="${i}" class="ml-4 text-xs text-foreground/90">${formatted.slice(2)}</li>`;
        }
        if (formatted.trim() === '') return `<br key="${i}" />`;
        return `<p key="${i}" class="text-xs text-foreground/90 mb-1">${formatted}</p>`;
      })
      .join('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex gap-3 h-[90vh] max-w-6xl w-[95vw]">
        {/* Main preview */}
        <div className={cn(
          "bg-card border rounded-lg shadow-xl flex flex-col overflow-hidden transition-all duration-200",
          showSummary ? "flex-1" : "w-full"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{file.name}</h3>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)} · {file.content_type}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-4">
              {file.url && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(file.url, '_blank')}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDownload(file)}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </>
              )}
              <Button
                variant={showSummary ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setShowSummary(!showSummary)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {showSummary ? <ChevronRight className="h-3 w-3" /> : 'Summary'}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-hidden bg-muted/10">
            {!file.url ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Preview not available</p>
              </div>
            ) : isImage ? (
              <div className="flex items-center justify-center h-full p-4">
                <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain rounded" />
              </div>
            ) : isPdf ? (
              <iframe
                src={getPdfSrc()}
                className="w-full h-full border-0"
                title={file.name}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <p className="text-sm">Preview not available for .{ext} files</p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDownload(file)}>
                  <Download className="h-3.5 w-3.5" /> Download to view
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Summary side panel */}
        {showSummary && (
          <div className="w-[300px] shrink-0 bg-card border rounded-lg shadow-xl flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">AI Summary</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSummary(false)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-3">
              {summaryLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-xs">Analyzing document…</p>
                </div>
              ) : summaryError ? (
                <div className="text-xs text-muted-foreground text-center py-6">{summaryError}</div>
              ) : summary ? (
                <div className="space-y-1">
                  {isInferred && (
                    <p className="text-[10px] text-muted-foreground italic mb-2 px-1">
                      Based on filename analysis — upload a text-based file for deeper insights.
                    </p>
                  )}
                  <div
                    className="prose prose-xs dark:prose-invert max-w-none text-xs leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(summary), { USE_PROFILES: { html: true } }) }}
                  />
                </div>
              ) : null}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
