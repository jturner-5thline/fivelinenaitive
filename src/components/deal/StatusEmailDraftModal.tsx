import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import DOMPurify from 'dompurify';
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

export function buildStatusEmailHtml(deal: Deal, content: StatusReportEditableContent): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const v = content.sectionsVisible;
  const company = deal.company || deal.name || 'Deal';

  const keyUpdates = (content.keyUpdates || []).filter(Boolean);
  const milestones = (content.completedMilestones || []).filter(Boolean);
  const nextSteps = (content.nextSteps || []).filter(Boolean);
  const action = (content.actionItems || '').trim();

  // ── Pipeline snapshot groups ─────────────────────────────────────────────
  // Compact, single-row stage summary instead of four boxed cards. Passed
  // lenders are intentionally collapsed to a count line so the email never
  // turns into a wall of declined institutions — the client cares about
  // who is moving forward, not the long tail of "no".
  const lenders = deal.lenders || [];
  const onDeck = lenders.filter((l) => l.trackingStatus === 'on-deck');
  const inReview = lenders.filter((l) => l.trackingStatus === 'active');
  const termsIssued = lenders.filter(
    (l) => l.stage === 'term-sheets' || l.stage === 'draft-terms',
  );
  const passedCount = lenders.filter((l) => l.trackingStatus === 'passed').length;

  // Shared design tokens — restrained palette, single accent, generous rhythm.
  const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif`;
  const INK = '#0f172a';
  const BODY = '#334155';
  const MUTED = '#64748b';
  const RULE = '#e2e8f0';
  const ACCENT = '#0f172a';

  const sectionLabel = (label: string) => `
    <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;margin:28px 0 10px 0;">
      ${label}
    </div>
  `;

  // Split a single bullet's text into a primary line and any sub-bullets
  // (lines starting with "- ", "* ", or indented "  - "). Keeps the email
  // structured and skimmable instead of flat paragraphs.
  const renderBulletItem = (raw: string) => {
    const lines = raw.split(/\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);
    if (lines.length === 0) return '';
    const primary = lines[0].replace(/^[-*•]\s+/, '');
    const subs: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^[-*•]\s+/.test(t) || /^\s{2,}/.test(lines[i])) {
        subs.push(t.replace(/^[-*•]\s+/, ''));
      } else {
        // continuation of primary
        subs.push(t);
      }
    }
    const subList = subs.length
      ? `<ul style="margin:6px 0 0 0;padding:0 0 0 18px;color:${MUTED};font-family:${FONT};font-size:14px;line-height:1.55;">
          ${subs.map((s) => `<li style="margin:0 0 4px 0;">${escapeHtml(s)}</li>`).join('')}
        </ul>`
      : '';
    return `<li style="margin:0 0 10px 0;padding-left:2px;">${escapeHtml(primary)}${subList}</li>`;
  };

  const cleanList = (items: string[]) => `
    <ul style="margin:0;padding:0 0 0 18px;color:${BODY};font-family:${FONT};font-size:15px;line-height:1.65;">
      ${items.map(renderBulletItem).join('')}
    </ul>
  `;

  // Per-stage block: subtle uppercase subhead with a count, followed by a
  // clean bulleted list of every lender in that stage. Designed to scan
  // top-to-bottom so clients can see exactly who sits where.
  const pipelineStageBlock = (
    label: string,
    items: typeof lenders,
    opts: { tone?: 'primary' | 'muted' } = {},
  ) => {
    if (items.length === 0) return '';
    const tone = opts.tone ?? 'primary';
    const headColor = tone === 'muted' ? MUTED : INK;
    const nameColor = tone === 'muted' ? MUTED : BODY;
    const dotColor = tone === 'muted' ? RULE : ACCENT;
    const rows = items
      .map(
        (l) => `
          <tr>
            <td style="padding:5px 0;vertical-align:top;width:14px;">
              <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${dotColor};margin-top:8px;"></span>
            </td>
            <td style="font-family:${FONT};font-size:14px;color:${nameColor};padding:4px 0;line-height:1.55;${tone === 'muted' ? 'font-style:italic;' : ''}">
              ${escapeHtml(l.name)}
            </td>
          </tr>`,
      )
      .join('');
    return `
      <div style="margin:0 0 18px 0;">
        <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${headColor};letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px 0;">
          ${label}
          <span style="color:${MUTED};font-weight:500;margin-left:6px;letter-spacing:0;text-transform:none;font-size:12px;">(${items.length})</span>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${rows}
        </table>
      </div>
    `;
  };

  const passedItems = lenders.filter((l) => l.trackingStatus === 'passed');

  const pipelineTable =
    onDeck.length + inReview.length + termsIssued.length === 0 && passedCount === 0
      ? `<div style="font-family:${FONT};font-size:13px;color:${MUTED};">No active lender activity yet.</div>`
      : `
        <div style="border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};padding:18px 0 4px 0;">
          ${pipelineStageBlock('Terms Issued', termsIssued)}
          ${pipelineStageBlock('In Review', inReview)}
          ${pipelineStageBlock('On Deck', onDeck)}
          ${
            passedItems.length > 0
              ? pipelineStageBlock('Passed', passedItems, { tone: 'muted' })
              : ''
          }
        </div>
      `;

  // ── Intro line ──
  // Pull the first key update as the lead sentence when available, otherwise
  // fall back to a neutral one-liner. Keeps the opening tight.
  const lead =
    keyUpdates[0]?.trim() ||
    `Quick update on where things stand with ${company}.`;

  // Drop the lead from the bulleted list so it isn't repeated.
  const remainingKeyUpdates =
    keyUpdates.length > 1 ? keyUpdates.slice(1, 5) : keyUpdates.length === 1 ? [] : [];

  return `
<div style="background:#ffffff;padding:0;font-family:${FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="padding:0;">

      <!-- Header -->
      <div style="margin:0 0 22px 0;">
        <h1 style="font-family:${FONT};font-size:22px;line-height:1.3;font-weight:600;color:${ACCENT};margin:0;letter-spacing:-0.01em;">
          ${escapeHtml(company)} Status Update
        </h1>
        <div style="font-family:${FONT};font-size:13px;color:${MUTED};margin-top:4px;">
          ${dateStr}
        </div>
      </div>

      <p style="font-family:${FONT};font-size:15px;color:${BODY};line-height:1.65;margin:0;">
        ${escapeHtml(lead)}
      </p>

      ${
        v.keyUpdates && remainingKeyUpdates.length > 0
          ? `
            ${sectionLabel('Key Updates')}
            ${cleanList(remainingKeyUpdates)}
          `
          : ''
      }

      ${
        v.pipelineSnapshot
          ? `
            ${sectionLabel('Lender Pipeline')}
            ${pipelineTable}
          `
          : ''
      }

      ${
        v.milestones && milestones.length > 0
          ? `
            ${sectionLabel('Recent Milestones')}
            ${cleanList(milestones.slice(0, 5))}
          `
          : ''
      }

      ${
        v.nextSteps && nextSteps.length > 0
          ? `
            ${sectionLabel('Next Steps')}
            ${cleanList(nextSteps.slice(0, 5))}
          `
          : ''
      }

      ${
        v.actionItems && action
          ? `
            ${sectionLabel('What We Need From You')}
            <div style="font-family:${FONT};font-size:15px;color:${INK};line-height:1.65;background:#f8fafc;border:1px solid ${RULE};border-left:3px solid ${ACCENT};border-radius:6px;padding:14px 16px;">
              ${
                action.includes('\n')
                  ? cleanList(action.split(/\n(?=[-*•]\s|\S)/).map((s) => s.trim()).filter(Boolean))
                  : textToHtml(action)
              }
            </div>
          `
          : ''
      }

      <p style="font-family:${FONT};font-size:15px;color:${BODY};line-height:1.65;margin:28px 0 0 0;">
        Happy to jump on a call if helpful — otherwise, just reply with any questions.
      </p>

    </td></tr>
  </table>
</div>`.trim();
}

export function buildStatusEmailSubject(deal: Deal): string {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${deal.company || deal.name} — Status Update: ${dateStr}`;
}

export function StatusEmailDraftModal({ open, onOpenChange, deal, content }: Props) {
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const html = useMemo(() => (content ? buildStatusEmailHtml(deal, content) : ''), [deal, content]);

  const subject = useMemo(() => buildStatusEmailSubject(deal), [deal]);

  const _legacySubject = useMemo(() => {
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
            <div
              ref={previewRef}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } }) }}
            />
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