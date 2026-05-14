import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Deal } from '@/types/deal';
import type { StatusReportEditableContent } from '@/utils/dealExport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  content: StatusReportEditableContent | null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Convert a single plain-text block (which may contain newlines) into safe HTML
 *  that preserves paragraph and line breaks. */
const textToHtml = (text: string) => {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs
    .map((p) => `<p style="margin:0 0 10px 0;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
};

function buildEmailHtml(deal: Deal, content: StatusReportEditableContent): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const v = content.sectionsVisible;
  const company = deal.company || deal.name || 'Deal';

  const keyUpdates = (content.keyUpdates || []).filter(Boolean);
  const milestones = (content.completedMilestones || []).filter(Boolean);
  const nextSteps = (content.nextSteps || []).filter(Boolean);
  const action = (content.actionItems || '').trim();

  // Pipeline snapshot groups
  const lenders = deal.lenders || [];
  const groups = [
    { label: 'On Deck', color: '#1d4ed8', items: lenders.filter(l => l.trackingStatus === 'on-deck') },
    { label: 'In Review', color: '#1d4ed8', items: lenders.filter(l => l.trackingStatus === 'active') },
    { label: 'Terms Issued', color: '#15803d', items: lenders.filter(l => l.stage === 'term-sheets' || l.stage === 'draft-terms') },
    { label: 'Passed', color: '#b91c1c', items: lenders.filter(l => l.trackingStatus === 'passed') },
  ];

  const sectionTitle = (label: string) => `
    <h2 style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 10px 0;letter-spacing:.02em;text-transform:uppercase;border-bottom:2px solid #2563eb;padding-bottom:6px;">${label}</h2>
  `;

  const bulletList = (items: string[]) => `
    <ul style="margin:0 0 4px 18px;padding:0;color:#1f2937;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;">
      ${items.map(i => `<li style="margin:0 0 6px 0;">${escapeHtml(i).replace(/\n/g, '<br/>')}</li>`).join('')}
    </ul>
  `;

  const pipelineCards = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
      <tr>
        ${groups.map(g => `
          <td valign="top" width="25%" style="background:#f8fafc;border:1px solid #e5e7eb;border-left:4px solid ${g.color};border-radius:6px;padding:10px 12px;font-family:Helvetica,Arial,sans-serif;">
            <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">${g.label} <span style="color:#64748b;font-weight:500;">(${g.items.length})</span></div>
            ${g.items.length === 0
              ? '<div style="font-size:12px;color:#94a3b8;">—</div>'
              : g.items.map((l, i) => `<div style="font-size:12px;color:#334155;line-height:1.5;">${i + 1}. ${escapeHtml(l.name)}</div>`).join('')
            }
          </td>
        `).join('')}
      </tr>
    </table>
  `;

  return `
<div style="background:#ffffff;padding:0;font-family:Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">
    <tr><td style="padding:4px 0 0 0;">

      <!-- Header -->
      <div style="border-top:4px solid #2563eb;padding-top:12px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#2563eb;letter-spacing:.14em;">5ᵀᴴ | LINE</div>
        <h1 style="font-size:20px;line-height:1.3;font-weight:700;color:#0f172a;margin:6px 0 0 0;">
          ${escapeHtml(company)} — Status Update:
          <span style="color:#2563eb;">${dateStr}</span>
        </h1>
      </div>

      <p style="font-size:14px;color:#334155;line-height:1.55;margin:0 0 8px 0;">Hi team,</p>
      <p style="font-size:14px;color:#334155;line-height:1.55;margin:0 0 12px 0;">
        Please find below the latest status update for <strong>${escapeHtml(company)}</strong>.
      </p>

      ${v.keyUpdates && keyUpdates.length > 0 ? `
        ${sectionTitle('Key Updates')}
        ${bulletList(keyUpdates)}
      ` : ''}

      ${v.pipelineSnapshot ? `
        ${sectionTitle('Lender Pipeline Snapshot')}
        ${pipelineCards}
      ` : ''}

      ${v.milestones && milestones.length > 0 ? `
        ${sectionTitle('Recent Milestones')}
        ${bulletList(milestones)}
      ` : ''}

      ${v.nextSteps && nextSteps.length > 0 ? `
        ${sectionTitle('Next Steps')}
        ${bulletList(nextSteps)}
      ` : ''}

      ${v.actionItems && action ? `
        ${sectionTitle('What We Need From You')}
        <div style="font-size:14px;color:#1f2937;line-height:1.55;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;">
          ${textToHtml(action)}
        </div>
      ` : ''}

      <div style="margin:28px 0 8px 0;font-size:14px;color:#334155;line-height:1.55;">
        Happy to discuss any of the above — just reply to this email.
      </div>
      <div style="font-size:14px;color:#0f172a;font-weight:600;margin-top:16px;">
        Best,<br/>
        <span style="font-weight:500;color:#475569;">5th Line</span>
      </div>

    </td></tr>
  </table>
</div>`.trim();
}

export function StatusEmailDraftModal({ open, onOpenChange, deal, content }: Props) {
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const html = useMemo(() => (content ? buildEmailHtml(deal, content) : ''), [deal, content]);

  const subject = useMemo(() => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return `${deal.company || deal.name} — Status Update: ${dateStr}`;
  }, [deal]);

  const handleCopy = async () => {
    try {
      const plain = previewRef.current?.innerText || '';
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Email copied', description: 'Paste into your email client to send.' });
    } catch (err) {
      toast({ title: 'Copy failed', description: 'Select the preview and copy manually.', variant: 'destructive' });
    }
  };

  const handleOpenMail = () => {
    const plain = previewRef.current?.innerText || '';
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="popup-shell-surface max-w-3xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20 rounded-2xl z-[61]"
        overlayClassName="z-[60]"
      >
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Status Email Draft
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Copy the formatted email below, or open it in your default email client.
          </p>
        </DialogHeader>

        <div className="px-6 pb-3 shrink-0">
          <div className="text-xs text-muted-foreground mb-1">Subject</div>
          <div className="text-sm font-medium text-foreground bg-muted/40 border border-border rounded-md px-3 py-2 select-all">
            {subject}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" onClick={handleOpenMail} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Open in email client
          </Button>
          <Button variant="liquid-glass" size="sm" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}