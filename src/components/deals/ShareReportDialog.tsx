import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, List as ListIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { stripHtml } from '@/lib/stripHtml';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { cn } from '@/lib/utils';
import type { Deal, DealStatus } from '@/types/deal';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
  activePipelineId: string | null;
  pipelineName?: string | null;
}

const STATUS_ORDER: { key: DealStatus; label: string; color: string }[] = [
  { key: 'on-track', label: 'On Track', color: '#16a34a' },      // green
  { key: 'at-risk', label: 'At Risk', color: '#d97706' },        // amber/orange
  { key: 'off-track', label: 'Off Track', color: '#dc2626' },    // red
  { key: 'on-hold', label: 'On Hold', color: '#2563eb' },        // blue
];

function formatAmount(value: number): string {
  if (!value || value <= 0) return '$0';
  if (value >= 1_000_000) {
    const mm = value / 1_000_000;
    return `$${mm.toFixed(2)}MM`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k.toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function startsWithTestPrefix(name: string): boolean {
  return /^\s*test\s*-/i.test(name || '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pull the per-deal status text from the deal title card status input. */
function dealStatusText(deal: Deal, fallback: string): string {
  const raw = stripHtml(deal.notes || '').trim();
  return raw || fallback;
}

function buildReportHtml(deals: Deal[], pipelineName?: string | null): string {
  const grouped = new Map<DealStatus, Deal[]>();
  STATUS_ORDER.forEach(s => grouped.set(s.key, []));

  for (const d of deals) {
    if (!d?.name) continue;
    if (isExcludedDealName(d.name)) continue;
    if (startsWithTestPrefix(d.name)) continue;
    if (!STATUS_ORDER.some(s => s.key === d.status)) continue;
    grouped.get(d.status as DealStatus)!.push(d);
  }

  const parts: string[] = [];
  parts.push(`<p>Team,</p>`);
  parts.push(
    `<p>Here's the latest status for the ${escapeHtml(pipelineName || 'active')} pipeline:</p>`
  );

  let total = 0;
  for (const s of STATUS_ORDER) {
    const rows = grouped.get(s.key) || [];
    if (rows.length === 0) continue;
    parts.push(
      `<p><strong><span style="color: ${s.color}">${escapeHtml(s.label)}</span></strong> (${rows.length})</p>`
    );
    const items = rows
      .slice()
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map(d => {
        const status = dealStatusText(d, s.label);
        total += 1;
        return `<li>${escapeHtml(d.name)} — ${escapeHtml(formatAmount(d.value || 0))} — <span style="color: ${s.color}">${escapeHtml(status)}</span></li>`;
      })
      .join('');
    parts.push(`<ul>${items}</ul>`);
  }

  if (total === 0) {
    parts.push(`<p>No active deals to report at this time.</p>`);
  }

  parts.push(`<p>Reply with any questions.</p>`);
  parts.push(`<p>Thanks</p>`);
  return parts.join('');
}

function defaultSubject(pipelineName?: string | null): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const scope = pipelineName ? `${pipelineName} ` : 'Active ';
  return `${scope}Pipeline Status Report – ${date}`;
}

export function ShareReportDialog({ open, onOpenChange, deals, activePipelineId, pipelineName }: ShareReportDialogProps) {
  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      if (!d?.name) return false;
      if (isExcludedDealName(d.name)) return false;
      if (startsWithTestPrefix(d.name)) return false;
      if (activePipelineId && d.pipelineId && d.pipelineId !== activePipelineId) return false;
      return STATUS_ORDER.some(s => s.key === d.status);
    });
  }, [deals, activePipelineId]);

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, Color],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[320px] p-3 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
      },
    },
    onUpdate: ({ editor }) => setBodyHtml(editor.getHTML()),
  });

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject(pipelineName));
    const html = buildReportHtml(filteredDeals, pipelineName);
    setBodyHtml(html);
    if (editor) editor.commands.setContent(html, { emitUpdate: false });
  }, [open, filteredDeals, pipelineName, editor]);

  const parseList = (s: string) =>
    s.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);

  const handleSend = async () => {
    const toList = parseList(to);
    const ccList = parseList(cc);
    if (toList.length === 0) {
      toast({ title: 'Add at least one recipient', variant: 'destructive' });
      return;
    }
    if (!subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const html = editor?.getHTML() || bodyHtml;
      const text = stripHtml(html);
      const { data, error } = await supabase.functions.invoke('share-pipeline-report', {
        body: { to: toList, cc: ccList, subject: subject.trim(), body: text, bodyHtml: html },
      });
      if (error || (data as any)?.error) {
        throw new Error((error as any)?.message || (data as any)?.error || 'Failed to send');
      }
      toast({ title: 'Report sent', description: `Sent to ${toList.length} recipient${toList.length === 1 ? '' : 's'}.` });
      onOpenChange(false);
      setTo('');
      setCc('');
    } catch (e) {
      toast({ title: 'Could not send report', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const TbBtn = ({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  );

  const STATUS_COLOR_SWATCHES = STATUS_ORDER;

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share Pipeline Report</DialogTitle>
          <DialogDescription>
            Review and edit the active pipeline status summary before sending. Test deals and archived deals are excluded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="share-to">To</Label>
            <Input
              id="share-to"
              placeholder="name@example.com, other@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="share-cc">Cc (optional)</Label>
            <Input
              id="share-cc"
              placeholder="cc@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="share-subject">Subject</Label>
            <Input
              id="share-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Message</Label>
            <div className="rounded-md border border-border bg-background">
              <div className="flex items-center gap-1 p-1 border-b border-border/60">
                <TbBtn label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
                  <BoldIcon className="h-3.5 w-3.5" />
                </TbBtn>
                <TbBtn label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                  <ItalicIcon className="h-3.5 w-3.5" />
                </TbBtn>
                <TbBtn label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                  <UnderlineIcon className="h-3.5 w-3.5" />
                </TbBtn>
                <TbBtn label="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                  <ListIcon className="h-3.5 w-3.5" />
                </TbBtn>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Color</span>
                {STATUS_COLOR_SWATCHES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={`${s.label} color`}
                    title={s.label}
                    onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setColor(s.color).run(); }}
                    className="h-4 w-4 rounded-full border border-border/60 hover:scale-110 transition-transform"
                    style={{ backgroundColor: s.color }}
                  />
                ))}
                <button
                  type="button"
                  aria-label="Clear color"
                  title="Clear color"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().unsetColor().run(); }}
                  className="ml-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 h-5 rounded border border-border/60"
                >
                  reset
                </button>
              </div>
              <EditorContent editor={editor} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {filteredDeals.length} deal{filteredDeals.length === 1 ? '' : 's'} included. Edit lines or add commentary before sending.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" variant="liquid-glass" size="sm" className="gap-2" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
