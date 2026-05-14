import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, ListChecks, Building2, Briefcase, ChevronDown, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useOutstandingItems } from '@/hooks/useOutstandingItems';
import { useDealsContext } from '@/contexts/DealsContext';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import type { EmailThread } from './mockEmailData';

interface Props {
  dealId: string | null | undefined;
  dealName: string | null | undefined;
  thread: EmailThread;
  /** Optional preselected counterparty name (e.g. AI-suggested likely lender). */
  preselectLenderName?: string | null;
  onClose?: () => void;
}

/**
 * Parse free-form email body text into clean line items.
 * Strips bullets, numbering, quotes, signatures, and empty lines.
 */
export function parseOutstandingItemsFromText(raw: string): string[] {
  if (!raw) return [];
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim());

  const out: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    // Skip quoted reply lines and common email artifacts
    if (/^>/.test(line)) continue;
    if (/^On .+ wrote:$/i.test(line)) continue;
    if (/^(from|to|cc|bcc|subject|sent|date):/i.test(line)) continue;
    if (/^--+$/.test(line) || /^__+$/.test(line)) continue;
    // Strip bullet/number prefixes
    const cleaned = line
      .replace(/^[-*•·●○◦▪▫■□]+\s*/, '')
      .replace(/^\(?\d{1,3}[.)]\s+/, '')
      .replace(/^[a-z][.)]\s+/i, '')
      .trim();
    if (!cleaned) continue;
    if (cleaned.length < 3) continue;
    out.push(cleaned);
  }
  return out;
}

function getThreadBodyText(thread: EmailThread): string {
  const msg = thread.emails?.[thread.emails.length - 1] || thread.latestEmail;
  if (!msg) return '';
  if (msg.body_text && msg.body_text.trim()) return msg.body_text;
  if (msg.body_html) return htmlToPlainText(msg.body_html);
  return msg.body_preview || msg.snippet || '';
}

/**
 * AddOutstandingItemsInlineCard
 * -----------------------------
 * Lets the user bulk-add outstanding items to a deal directly from an
 * email thread. The latest message's body is parsed into one item per
 * line (bullets/numbering stripped) and prefilled in an editable
 * textarea. The user picks the requesting counterparty (one of the
 * deal's lenders) and confirms — each line becomes a separate
 * outstanding item attributed to that lender.
 */
export function AddOutstandingItemsInlineCard({
  dealId,
  dealName,
  thread,
  preselectLenderName,
  onClose,
}: Props) {
  const { getDealById } = useDealsContext();
  const deal = dealId ? getDealById(dealId) : undefined;
  const lenders = deal?.lenders || [];

  const initialText = useMemo(() => {
    const body = getThreadBodyText(thread);
    const parsed = parseOutstandingItemsFromText(body);
    return parsed.join('\n');
  }, [thread]);

  const [text, setText] = useState<string>(initialText);
  const [requester, setRequester] = useState<string>(() => {
    if (preselectLenderName) return preselectLenderName;
    // Try to match sender name to a known lender
    const sender = (thread.latestEmail?.from_name || '').toLowerCase();
    const match = lenders.find((l) => sender.includes(l.name.toLowerCase()));
    return match?.name || '';
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { bulkAddItems } = useOutstandingItems(dealId || undefined);

  // If the thread changes, reset the textarea to the freshly parsed body
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  const items = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    [text],
  );

  const handleAdd = async () => {
    if (!dealId) {
      toast.error('Link this email to a deal first');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setBusy(true);
    try {
      await bulkAddItems(items, requester ? [requester] : []);
      toast.success(
        `Added ${items.length} outstanding item${items.length === 1 ? '' : 's'}${
          dealName ? ` to ${dealName}` : ''
        }`,
      );
      onClose?.();
    } catch (e) {
      console.error('[AddOutstandingItemsInlineCard] bulk add failed', e);
      toast.error('Failed to add items');
    } finally {
      setBusy(false);
    }
  };

  if (!dealId) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[12px] text-amber-200/90">
        Link this email to a deal to add its contents as outstanding items.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-2.5 max-w-full min-w-0">
      <div className="flex items-center gap-2">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Add Outstanding Items
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Linked context chips */}
      <div className="flex flex-wrap gap-1.5">
        {dealName && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[11px] text-primary/90 max-w-full">
            <Briefcase className="h-3 w-3 shrink-0" />
            <span className="truncate">{dealName}</span>
          </span>
        )}
      </div>

      {/* Counterparty (lender) picker */}
      <div className="flex items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-7 px-2 gap-1.5 text-[11px] font-normal',
                !requester && 'text-muted-foreground',
              )}
            >
              <Building2 className="h-3 w-3" />
              <span className="truncate max-w-[180px]">
                {requester || 'Requested by…'}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0 pointer-events-auto" align="start">
            <Command>
              <CommandInput placeholder="Search lenders…" className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty>No lenders on this deal.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      setRequester('');
                      setPickerOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">No requester</span>
                    {!requester && <Check className="h-3 w-3 ml-auto" />}
                  </CommandItem>
                  {lenders.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.name}
                      onSelect={() => {
                        setRequester(l.name);
                        setPickerOpen(false);
                      }}
                    >
                      <Building2 className="h-3 w-3 mr-2" />
                      <span className="truncate">{l.name}</span>
                      {requester === l.name && <Check className="h-3 w-3 ml-auto" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <span className="text-[11px] text-muted-foreground">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One item per line"
        rows={Math.min(Math.max(items.length || 4, 4), 12)}
        className="text-[12px] font-mono leading-snug"
      />

      <p className="text-[10.5px] text-muted-foreground">
        Each line becomes a separate outstanding item. Bullets and numbering
        from the email have been stripped — edit freely before adding.
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-3 text-[11px] gap-1.5"
          disabled={busy || items.length === 0}
          onClick={handleAdd}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Add {items.length > 0 ? `${items.length} ` : ''}item{items.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
