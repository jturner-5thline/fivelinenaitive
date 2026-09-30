import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadUrlAsFile } from '@/lib/downloadFile';

export interface PreviewableAttachment {
  name: string;
  url?: string;
  content_type?: string | null;
}

type Kind = 'pdf' | 'image' | 'text' | 'office' | 'video' | 'audio' | 'unsupported';

function detectKind(a: PreviewableAttachment): Kind {
  const n = a.name.toLowerCase();
  const t = (a.content_type || '').toLowerCase();
  if (n.endsWith('.pdf') || t === 'application/pdf') return 'pdf';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|webm|mov)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/.test(n)) return 'audio';
  if (t.startsWith('text/') || /\.(txt|md|csv|json|log|xml)$/.test(n)) return 'text';
  if (/\.(docx?|pptx?|xlsx?)$/.test(n)) return 'office';
  return 'unsupported';
}

export function downloadAttachment(a: PreviewableAttachment) {
  if (a.url) void downloadUrlAsFile(a.url, a.name);
}

interface Props {
  attachment: PreviewableAttachment | null;
  onClose: () => void;
}

export function CrmAttachmentPreviewDialog({ attachment, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = attachment ? detectKind(attachment) : 'unsupported';

  useEffect(() => {
    setText(null);
    setBlobUrl(null);
    if (!attachment?.url) return;
    let revoked: string | null = null;
    let cancelled = false;
    // Fetch bytes and re-wrap as a typed blob so the browser renders inline
    // instead of honouring any attachment/download headers.
    if (kind === 'pdf' || kind === 'image' || kind === 'text' || kind === 'video' || kind === 'audio') {
      setLoading(true);
      fetch(attachment.url)
        .then(r => r.blob())
        .then(async b => {
          if (cancelled) return;
          if (kind === 'text') { setText(await b.text()); return; }
          const type = kind === 'pdf' ? 'application/pdf' : (attachment.content_type || b.type);
          revoked = URL.createObjectURL(new Blob([b], { type }));
          setBlobUrl(revoked);
        })
        .catch(() => { if (!cancelled) setBlobUrl(attachment.url!); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [attachment, kind]);

  if (!attachment) return null;
  const officeUrl = attachment.url
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(attachment.url)}`
    : '';

  return (
    <Dialog open={!!attachment} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pr-8">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="truncate text-base">{attachment.name}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => downloadAttachment(attachment)} disabled={!attachment.url}>
                <Download className="h-4 w-4 mr-1.5" /> Download
              </Button>
              {attachment.url && (
                <Button variant="outline" size="sm" onClick={() => window.open(kind === 'office' ? officeUrl : (blobUrl || attachment.url), '_blank', 'noopener,noreferrer')}>
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Open in new tab
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 mt-2">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : kind === 'pdf' && blobUrl ? (
            <iframe src={blobUrl} title={attachment.name} className="w-full h-full rounded-md border border-border" />
          ) : kind === 'image' && blobUrl ? (
            <div className="h-full flex items-center justify-center overflow-auto">
              <img src={blobUrl} alt={attachment.name} className="max-w-full max-h-full object-contain" />
            </div>
          ) : kind === 'video' && blobUrl ? (
            <video src={blobUrl} controls className="w-full h-full" />
          ) : kind === 'audio' && blobUrl ? (
            <div className="h-full flex items-center justify-center"><audio src={blobUrl} controls /></div>
          ) : kind === 'text' && text !== null ? (
            <ScrollArea className="h-full rounded-md border border-border bg-muted/30 p-4">
              <pre className="text-sm whitespace-pre-wrap font-mono">{text}</pre>
            </ScrollArea>
          ) : kind === 'office' && attachment.url ? (
            <iframe src={officeUrl} title={attachment.name} className="w-full h-full rounded-md border border-border" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <FileText className="h-14 w-14 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-3">Preview isn't available for this file type.</p>
              <Button onClick={() => downloadAttachment(attachment)} disabled={!attachment.url}>
                <Download className="h-4 w-4 mr-1.5" /> Download
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
