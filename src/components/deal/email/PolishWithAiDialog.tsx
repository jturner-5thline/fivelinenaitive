import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current composer body — may be HTML or plain text. */
  draftBody: string;
  subject?: string;
  recipientName?: string;
  /** Recent thread context (plain text, optional). Used only for tone matching. */
  threadContext?: string;
  /**
   * Called with the final body the user accepted. The returned string is
   * plain text with newline-preserved formatting; caller is responsible for
   * wrapping in paragraphs / inserting into the rich text editor.
   */
  onAccept: (finalBody: string) => void;
}

/**
 * Side-by-side "Polish with AI" review dialog. Additive to the existing
 * AI Draft flow — this is for when the user typed first and wants the
 * model to clean it up in 5th Line house style without changing facts.
 *
 * Both panes are editable so the user can tweak either column before
 * accepting. Hard rule: AI must never change factual content; the rule
 * is enforced server-side via the prompt and reinforced in the UI copy.
 */
export function PolishWithAiDialog({
  open,
  onOpenChange,
  draftBody,
  subject,
  recipientName,
  threadContext,
  onAccept,
}: Props) {
  const initialPlain = useRef('');
  const [original, setOriginal] = useState('');
  const [polished, setPolished] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When dialog opens: snapshot the draft (HTML → plain text) and kick off
  // the polish request once.
  useEffect(() => {
    if (!open) return;
    const plain = /<[a-z][\s\S]*>/i.test(draftBody)
      ? htmlToPlainText(draftBody)
      : draftBody;
    initialPlain.current = plain;
    setOriginal(plain);
    setPolished('');
    setError(null);
    void runPolish(plain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPolish = async (plain: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('polish-email-draft', {
        body: {
          draft: plain,
          subject: subject ?? '',
          recipientName: recipientName ?? '',
          threadContext: threadContext ?? '',
        },
      });
      if (invokeErr) throw invokeErr;
      const out = (data as { polished?: string; error?: string } | null);
      if (!out || out.error) throw new Error(out?.error || 'Polish failed');
      setPolished(out.polished ?? '');
      try {
        const { logUsage } = await import('@/lib/usageLogger');
        logUsage({ feature_type: 'EMAIL_DRAFT', feature_subtype: 'polished' });
      } catch { /* ignore */ }
    } catch (e: any) {
      const msg = e?.message || 'Failed to polish draft';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const acceptPolished = () => {
    if (!polished.trim()) return;
    onAccept(polished);
    onOpenChange(false);
  };

  const keepOriginal = () => {
    // Honour any tweaks the user made to the left pane.
    if (original !== initialPlain.current) {
      onAccept(original);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
            Polish with AI
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            5th Line house voice. Facts, numbers, and commitments are preserved exactly —
            you can edit either side before accepting.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 flex-1 min-h-0 overflow-auto">
          {/* Original */}
          <section className="flex flex-col min-h-0">
            <header className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Your draft
              </span>
              <span className="text-[10px] text-muted-foreground">
                {original.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </header>
            <Textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              className="flex-1 min-h-[260px] text-xs font-normal leading-relaxed resize-none"
              placeholder="Your rough draft"
            />
          </section>

          {/* Polished */}
          <section className="flex flex-col min-h-0">
            <header className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--outlook-blue))]">
                Polished
              </span>
              <span className="text-[10px] text-muted-foreground">
                {polished.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </header>
            <div className={cn(
              'flex-1 min-h-[260px] rounded-md border border-border bg-background relative overflow-hidden',
              loading && 'opacity-70',
            )}>
              {loading && !polished && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Polishing in 5th Line voice…
                </div>
              )}
              {error && !loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-destructive p-4 text-center">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 mt-1" onClick={() => runPolish(original)}>
                    <RefreshCw className="h-3 w-3" /> Retry
                  </Button>
                </div>
              )}
              {!loading && !error && (
                <Textarea
                  value={polished}
                  onChange={(e) => setPolished(e.target.value)}
                  className="absolute inset-0 border-0 focus-visible:ring-0 text-xs leading-relaxed resize-none"
                  placeholder="Polished version will appear here"
                />
              )}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border/40 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            Factual content & commitments are never modified.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => runPolish(original)}
              disabled={loading || original.trim().length < 8}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Re-polish
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={keepOriginal}
            >
              <X className="h-3 w-3" />
              Keep original
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1 bg-[hsl(var(--outlook-blue))] text-white hover:bg-[hsl(var(--outlook-blue))]/90"
              onClick={acceptPolished}
              disabled={loading || !polished.trim()}
            >
              <Check className="h-3 w-3" />
              Use polished
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}