import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { Deal, DealStatus } from '@/types/deal';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
  activePipelineId: string | null;
  pipelineName?: string | null;
}

const STATUS_ORDER: { key: DealStatus; label: string }[] = [
  { key: 'on-track', label: 'On Track' },
  { key: 'at-risk', label: 'At Risk' },
  { key: 'off-track', label: 'Off Track' },
  { key: 'on-hold', label: 'On Hold' },
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

function buildReportBody(deals: Deal[], pipelineName?: string | null): string {
  const grouped = new Map<DealStatus, Deal[]>();
  STATUS_ORDER.forEach(s => grouped.set(s.key, []));

  for (const d of deals) {
    if (!d?.name) continue;
    if (isExcludedDealName(d.name)) continue;
    if (startsWithTestPrefix(d.name)) continue;
    if (!STATUS_ORDER.some(s => s.key === d.status)) continue; // exclude archived & anything else
    grouped.get(d.status as DealStatus)!.push(d);
  }

  const lines: string[] = [];
  lines.push(`Team,`);
  lines.push('');
  lines.push(
    `Here's the latest status for the ${pipelineName ? `${pipelineName} ` : 'active '}pipeline:`
  );
  lines.push('');

  let total = 0;
  for (const s of STATUS_ORDER) {
    const rows = grouped.get(s.key) || [];
    if (rows.length === 0) continue;
    lines.push(`${s.label} (${rows.length})`);
    rows
      .slice()
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .forEach(d => {
        lines.push(`• ${d.name} — ${formatAmount(d.value || 0)} — ${s.label}`);
        total += 1;
      });
    lines.push('');
  }

  if (total === 0) {
    lines.push('No active deals to report at this time.');
    lines.push('');
  }

  lines.push('Reply with any questions.');
  lines.push('');
  lines.push('Thanks');
  return lines.join('\n');
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
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject(pipelineName));
    setBody(buildReportBody(filteredDeals, pipelineName));
  }, [open, filteredDeals, pipelineName]);

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
      const { data, error } = await supabase.functions.invoke('share-pipeline-report', {
        body: { to: toList, cc: ccList, subject: subject.trim(), body },
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
            <Label htmlFor="share-body">Message</Label>
            <Textarea
              id="share-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[320px] font-mono text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              {filteredDeals.length} deal{filteredDeals.length === 1 ? '' : 's'} included. Edit lines or add commentary before sending.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
