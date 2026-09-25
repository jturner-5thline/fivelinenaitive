import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { draftLenderStatusFromEmails } from '@/services/draftLenderStatusFromEmails';

interface Props {
  lenderId: string;
  onApply: (text: string) => void;
}

/** Drafts a one-sentence funding source update from emails with the lender that reference the deal. */
export function DraftAiLenderStatusButton({ lenderId, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [meta, setMeta] = useState({ count: 0, lender: '', deal: '' });

  const run = async () => {
    setLoading(true);
    setText('');
    try {
      const r = await draftLenderStatusFromEmails(lenderId);
      setMeta({ count: r.emailCount, lender: r.lenderName, deal: r.dealName });
      if (r.reason === 'no_contacts') { toast.error('No contact emails on this funding source to search by.'); setOpen(false); return; }
      if (r.reason === 'no_emails') { toast.info(`No recent emails with ${r.lenderName} mentioning ${r.dealName || 'this deal'}.`); setOpen(false); return; }
      if (!r.text) { toast.error('Could not draft an update. Try again.'); return; }
      setText(r.text);
    } catch (e: any) {
      toast.error(e?.message || 'Could not draft an update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !text && !loading) run(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5" title="Draft AI update from funding source emails" aria-label="Draft AI funding source update">
          <Sparkles className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-80 p-3 z-[1300] bg-popover space-y-2">
        <div className="text-xs font-medium">Draft AI update</div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning emails with this funding source…
          </div>
        ) : (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[70px] text-sm" />
            {meta.count > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Based on {meta.count} email{meta.count === 1 ? '' : 's'} with {meta.lender}{meta.deal ? ` referencing ${meta.deal}` : ''}.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={run}>Regenerate</Button>
              <Button size="sm" disabled={!text.trim()} onClick={() => { onApply(text.trim()); setOpen(false); setText(''); }}>
                Use update
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
