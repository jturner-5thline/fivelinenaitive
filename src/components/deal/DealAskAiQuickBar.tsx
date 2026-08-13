import { useState, type FormEvent } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DealAskAiQuickBarProps {
  dealId: string;
  /** Switches the surrounding tabs over to the Deal Space tab. */
  onOpenDealSpace: () => void;
}

/**
 * Compact "Ask AI" entry point rendered above the deal panels. Submitting a
 * question opens the Deal Space → Ask AI tab and dispatches the prompt via a
 * window event so no props need to be drilled through DealSpaceTab.
 */
export function DealAskAiQuickBar({ dealId, onOpenDealSpace }: DealAskAiQuickBarProps) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const question = value.trim();
    if (!question) return;
    onOpenDealSpace();
    setValue('');
    // Let the Deal Space tab mount before delivering the prompt.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('naitive:deal-ask-ai', { detail: { dealId, question } }),
      );
    }, 250);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div>
          <h3 className="text-sm font-semibold leading-none">Ask AI</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ask questions about this deal's data, documents, and activity
          </p>
        </div>
      </div>
      <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 backdrop-blur px-3 py-2"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask AI about this deal..."
        aria-label="Ask AI about this deal"
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!value.trim()}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      </form>
    </div>
  );
}
