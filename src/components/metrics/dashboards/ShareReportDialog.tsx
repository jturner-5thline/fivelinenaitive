import { useEditor, EditorContent } from '@tiptap/react';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2, Share2 } from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Mention from '@tiptap/extension-mention';
import mentionSuggestion from '@/components/deal/notes/mentionSuggestion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3, Quote,
  Undo2, Redo2, Link as LinkIcon, Unlink, Code, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus, Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SalesDashboardV2 } from './SalesDashboardV2';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors',
        active && 'bg-white/15 text-white',
      )}
    >
      {children}
    </button>
  );
}

export function ShareReportDialog({ open, onOpenChange }: ShareReportDialogProps) {
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const DEFAULT_RECIPIENTS =
    'jturner@5thline.co, jmoffitt@5thline.co, swilliams@5thline.co, ppina@5thline.co, ffustinoni@5thline.co, nheikali@5thline.co';
  const [toValue, setToValue] = useState(DEFAULT_RECIPIENTS);
  const [ccValue, setCcValue] = useState('');
  const formatReportDate = (d = new Date()) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}-${d.getFullYear()}`;
  };
  const defaultSubject = () => `Sales Report ${formatReportDate()}`;
  const [subjectValue, setSubjectValue] = useState(defaultSubject());
  const [messageValue, setMessageValue] = useState('');
  const [sending, setSending] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Configured separately below to avoid duplicate-extension warnings.
        link: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder: 'Write your report here…' }),
      Underline,
      Highlight.configure({ multicolor: false }),
      HorizontalRule,
      Mention.configure({
        HTMLAttributes: {
          class:
            'mention inline-flex items-center rounded px-1 py-0.5 mx-0.5 bg-cyan-400/20 text-cyan-200 border border-cyan-300/30 font-medium',
        },
        suggestion: mentionSuggestion,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: 'text-cyan-300 underline underline-offset-2' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content:
      '<h2>Summary</h2><ul><li><p></p></li></ul>' +
      '<h2>Key Take Aways</h2><ul><li><p></p></li></ul>' +
      '<h2>Asks for Today\u2019s Meeting</h2>' +
      '<ol><li><p>Please review the BD Calls &amp; Meetings List in the Report to determine what is worth discussing at today\u2019s meeting HERE</p></li></ol>',
    editorProps: {
      attributes: {
        class:
          'prose prose-invert prose-sm max-w-none min-h-[220px] px-4 py-3 focus:outline-none text-sm leading-relaxed ' +
          '[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-2 ' +
          '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-2 ' +
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 ' +
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-white/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-white/80 ' +
          '[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em] ' +
          '[&_hr]:border-white/20 [&_hr]:my-3 ' +
          '[&_mark]:bg-yellow-300/40 [&_mark]:text-inherit [&_mark]:rounded-sm [&_mark]:px-0.5 ' +
          '[&_a]:text-cyan-300 [&_a]:underline',
      },
    },
  });

  const promptForLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enter URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const Sep = () => <div className="w-px h-4 bg-white/10 mx-1" />;

  const parseEmails = (s: string): string[] =>
    s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

  // Basic RFC-5322-ish check. Rejects malformed entries like
  // "jturner@5thline.coli@5thline.co" that Resend silently drops.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const splitValidInvalid = (list: string[]) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const e of list) (EMAIL_RE.test(e) ? valid : invalid).push(e);
    return { valid, invalid };
  };

  const generatePdfBase64 = async (): Promise<string> => {
    // Capture the ON-SCREEN dashboard (snapshotRef) plus a small header
    // (title + notes). Capturing the live, already-rendered node avoids the
    // off-screen clone path that produced a blank JPEG (foreignObject
    // silently fails when the cloned subtree is too tall / references
    // absolute-positioned charts).
    const [htmlToImage, jsPDFmod] = await Promise.all([
      import('html-to-image'),
      import('jspdf'),
    ]);
    const jsPDF = (jsPDFmod as any).jsPDF || (jsPDFmod as any).default;
    const dashNode = snapshotRef.current;
    if (!dashNode) throw new Error('Nothing to capture');

    await (document as any).fonts?.ready?.catch?.(() => {});
    await new Promise((r) => setTimeout(r, 80));

    // 1) Header block (title + date + optional notes) — small offscreen node.
    const headerWidth = dashNode.getBoundingClientRect().width || 1240;
    const header = document.createElement('div');
    header.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      `width:${headerWidth}px`,
      'background:#0b0b12',
      'color:#ffffff',
      'font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
      'padding:24px 26px 8px',
      'box-sizing:border-box',
    ].join(';');
    const title = document.createElement('div');
    title.style.cssText = 'font-size:22px;font-weight:700;color:#fff;margin:0 0 6px 0;';
    title.textContent = subjectValue.trim() || defaultSubject();
    header.appendChild(title);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin:0 0 14px 0;';
    meta.textContent = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    header.appendChild(meta);
    const editorHtml = editor?.getHTML()?.trim() ?? '';
    if (editorHtml && editorHtml !== '<p></p>') {
      const notes = document.createElement('div');
      notes.style.cssText =
        'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.18);' +
        'border-radius:10px;padding:14px 18px;color:#fff;font-size:14px;line-height:1.55;';
      // Inline styles so lists / headings / marks render identically to the
      // in-app editor (Tailwind / prose classes are not present in this
      // off-screen node).
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        .report-notes, .report-notes * { color:#fff; font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif; }
        .report-notes h1 { font-size:22px; font-weight:700; margin:10px 0 6px; }
        .report-notes h2 { font-size:18px; font-weight:700; margin:12px 0 6px; }
        .report-notes h3 { font-size:15px; font-weight:600; margin:10px 0 4px; }
        .report-notes p { margin:4px 0; }
        .report-notes ul { list-style:disc; padding-left:24px; margin:6px 0; }
        .report-notes ol { list-style:decimal; padding-left:24px; margin:6px 0; }
        .report-notes li { margin:2px 0; }
        .report-notes li > p { margin:0; }
        .report-notes blockquote { border-left:3px solid rgba(255,255,255,0.35); padding-left:10px; color:rgba(255,255,255,0.85); font-style:italic; margin:6px 0; }
        .report-notes code { background:rgba(255,255,255,0.12); padding:1px 4px; border-radius:4px; font-size:0.9em; }
        .report-notes a { color:#67e8f9; text-decoration:underline; }
        .report-notes mark { background:rgba(253,224,71,0.4); color:inherit; padding:0 2px; border-radius:2px; }
        .report-notes hr { border:0; border-top:1px solid rgba(255,255,255,0.2); margin:10px 0; }
        .report-notes .mention { display:inline-block; padding:1px 6px; margin:0 2px; border-radius:4px;
          background:rgba(34,211,238,0.2); color:#a5f3fc; border:1px solid rgba(103,232,249,0.3); font-weight:500; }
      `;
      notes.className = 'report-notes';
      notes.appendChild(styleTag);
      const inner = document.createElement('div');
      inner.innerHTML = editorHtml;
      notes.appendChild(inner);
      header.appendChild(notes);
    }
    document.body.appendChild(header);

    let headerUrl = '';
    let headerH = 0;
    try {
      headerH = header.scrollHeight;
      headerUrl = await htmlToImage.toPng(header, {
        pixelRatio: 2,
        backgroundColor: '#0b0b12',
        width: headerWidth,
        height: headerH,
        cacheBust: true,
      });
    } finally {
      document.body.removeChild(header);
    }

    // 2) Dashboard — capture the live, on-screen node directly.
    const dashRect = dashNode.getBoundingClientRect();
    // Use scrollWidth so any widget whose content overflows the visible
    // bounds (right-edge borders in particular) is fully captured.
    const dashW = Math.max(Math.ceil(dashRect.width), dashNode.scrollWidth);
    const dashH = Math.ceil(dashNode.scrollHeight);
    // JPEG (quality 0.9) keeps the PDF well under Resend's 40MB attachment
    // limit — PNG at 2x pixelRatio blew past it on wide dashboards.
    const dashUrl = await htmlToImage.toJpeg(dashNode, {
      pixelRatio: 1.5,
      quality: 0.9,
      backgroundColor: '#0b0b12',
      width: dashW,
      height: dashH,
      cacheBust: true,
      style: { width: `${dashW}px` },
    });

    if (!headerUrl || headerUrl.length < 200 || !dashUrl || dashUrl.length < 200) {
      throw new Error('Snapshot rendering returned an empty image');
    }

    // 3) Single-page PDF sized to header + dashboard stacked.
    const pxToPt = 72 / 96;
    // Add a small right-edge pad so 1px widget borders aren't clipped by
    // sub-pixel rounding in html-to-image / jsPDF.
    const EDGE_PAD = 8;
    const pageW = Math.max(headerWidth, dashW) + EDGE_PAD;
    const pageH = headerH + dashH;
    const pageWpt = pageW * pxToPt;
    const pageHpt = pageH * pxToPt;
    const pdf = new jsPDF({
      orientation: pageWpt > pageHpt ? 'l' : 'p',
      unit: 'pt',
      format: [pageWpt, pageHpt],
    });
    pdf.setFillColor(11, 11, 18);
    pdf.rect(0, 0, pageWpt, pageHpt, 'F');
    pdf.addImage(headerUrl, 'PNG', 0, 0, headerWidth * pxToPt, headerH * pxToPt);
    pdf.addImage(
      dashUrl,
      'JPEG',
      0,
      headerH * pxToPt,
      dashW * pxToPt,
      dashH * pxToPt,
      undefined,
      'FAST',
    );
    const dataUri = pdf.output('datauristring');
    return dataUri.split(',')[1] ?? '';
  };

  /**
   * Upload PDF to Supabase Storage and return a short-lived signed URL.
   * Passing a URL to the edge function avoids WORKER_RESOURCE_LIMIT errors
   * caused by inlining large base64 bodies in the JSON request.
   */
  const uploadPdfAndGetUrl = async (filename: string): Promise<string> => {
    const base64 = await generatePdfBase64();
    // base64 -> Uint8Array (avoids atob on huge strings by chunking)
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`;
    const { error: upErr } = await supabase.storage
      .from('share-reports')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (upErr) throw upErr;
    const { data, error: signErr } = await supabase.storage
      .from('share-reports')
      .createSignedUrl(path, 60 * 15);
    if (signErr || !data?.signedUrl) throw signErr || new Error('Signed URL failed');
    return data.signedUrl;
  };

  const handleSend = async () => {
    const toParsed = splitValidInvalid(parseEmails(toValue));
    const ccParsed = splitValidInvalid(parseEmails(ccValue));
    if (toParsed.invalid.length > 0 || ccParsed.invalid.length > 0) {
      const bad = [...toParsed.invalid, ...ccParsed.invalid].join(', ');
      toast.error(`Invalid email address${toParsed.invalid.length + ccParsed.invalid.length === 1 ? '' : 'es'}: ${bad}`);
      return;
    }
    const to = toParsed.valid;
    const cc = ccParsed.valid;
    if (to.length === 0) {
      toast.error('Add at least one recipient email');
      return;
    }
    if (!subjectValue.trim()) {
      toast.error('Add a subject line');
      return;
    }
    setSending(true);
    try {
      const filename = `${(subjectValue.trim() || defaultSubject()).replace(/[^\w\-]+/g, '_')}.pdf`;
      const attachmentUrl = await uploadPdfAndGetUrl(filename);
      const messageHtml = editor?.getHTML() || '';
      const { data, error } = await supabase.functions.invoke('send-share-report', {
        body: {
          to,
          cc,
          subject: subjectValue.trim(),
          message: messageValue,
          messageHtml,
          attachment: { filename, url: attachmentUrl },
        },
      });
      if (error) {
        // Surface the real edge-function response body (Resend error) instead of
        // the generic "non-2xx" message returned by supabase-js.
        let details = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.text) details = await ctx.text();
        } catch { /* ignore */ }
        throw new Error(details);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Report sent to ${to.length} recipient${to.length === 1 ? '' : 's'}`);
      setSendOpen(false);
      setToValue(DEFAULT_RECIPIENTS);
      setCcValue('');
      setMessageValue('');
    } catch (err: any) {
      console.error('send-share-report failed:', err);
      toast.error(err?.message || 'Failed to send report');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden border-white/10"
        style={{ background: '#0b0b12' }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle className="text-white text-lg font-semibold">Share Report</DialogTitle>
            <Button
              size="sm"
              onClick={() => setSendOpen(true)}
              className="h-8 gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share Report
            </Button>
          </div>
        </DialogHeader>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Rich text editor — aligned exactly to the 3-widget KPI row */}
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 26px 0' }} className="w-full">
            <div
              className="rounded-lg border border-white/40 bg-white/[0.04] shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_10px_30px_-12px_rgba(0,0,0,0.8)]"
              style={{
                // Width of 3 KPI cards + 2 gaps (gap-4 = 16px) inside a 3-col grid.
                // = (100% - 2*16px) * 3/3 = full inner width of the KPI row.
                width: '100%',
              }}
              onClick={() => editor?.chain().focus().run()}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/25">
                <ToolbarBtn
                  title="Bold"
                  active={editor?.isActive('bold')}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <Bold size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Italic"
                  active={editor?.isActive('italic')}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <Italic size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Underline"
                  active={editor?.isActive('underline')}
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                >
                  <UnderlineIcon size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Strikethrough"
                  active={editor?.isActive('strike')}
                  onClick={() => editor?.chain().focus().toggleStrike().run()}
                >
                  <Strikethrough size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Highlight"
                  active={editor?.isActive('highlight')}
                  onClick={() => editor?.chain().focus().toggleHighlight().run()}
                >
                  <Highlighter size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Inline code"
                  active={editor?.isActive('code')}
                  onClick={() => editor?.chain().focus().toggleCode().run()}
                >
                  <Code size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Heading 1"
                  active={editor?.isActive('heading', { level: 1 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                  <Heading1 size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Heading 2"
                  active={editor?.isActive('heading', { level: 2 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  <Heading2 size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Heading 3"
                  active={editor?.isActive('heading', { level: 3 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  <Heading3 size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Bullet list"
                  active={editor?.isActive('bulletList')}
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                >
                  <List size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Numbered list"
                  active={editor?.isActive('orderedList')}
                  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                >
                  <ListOrdered size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Quote"
                  active={editor?.isActive('blockquote')}
                  onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                >
                  <Quote size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Horizontal rule"
                  onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                >
                  <Minus size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Align left"
                  active={editor?.isActive({ textAlign: 'left' })}
                  onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                >
                  <AlignLeft size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Align center"
                  active={editor?.isActive({ textAlign: 'center' })}
                  onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                >
                  <AlignCenter size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Align right"
                  active={editor?.isActive({ textAlign: 'right' })}
                  onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                >
                  <AlignRight size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Justify"
                  active={editor?.isActive({ textAlign: 'justify' })}
                  onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                >
                  <AlignJustify size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Add / edit link"
                  active={editor?.isActive('link')}
                  onClick={promptForLink}
                >
                  <LinkIcon size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Remove link"
                  onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}
                >
                  <Unlink size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Clear formatting"
                  onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
                >
                  <Eraser size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn title="Undo" onClick={() => editor?.chain().focus().undo().run()}>
                  <Undo2 size={14} />
                </ToolbarBtn>
                <ToolbarBtn title="Redo" onClick={() => editor?.chain().focus().redo().run()}>
                  <Redo2 size={14} />
                </ToolbarBtn>
              </div>
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Dashboard snapshot (no Sales Model) — wrapped in ref for PDF capture */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 border-t border-white/10">
            <div ref={snapshotRef}>
              <SalesDashboardV2 reportMode />
            </div>
          </div>
        </div>

        {/* Nested send-by-email dialog */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent
            className="max-w-lg border-white/15"
            style={{ background: '#0f0f1a' }}
          >
            <DialogHeader>
              <DialogTitle className="text-white text-base font-semibold">
                Send report by email
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-white/70 text-xs">To</Label>
                <Input
                  value={toValue}
                  onChange={(e) => setToValue(e.target.value)}
                  placeholder="alice@company.com, bob@company.com"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/30"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Cc (optional)</Label>
                <Input
                  value={ccValue}
                  onChange={(e) => setCcValue(e.target.value)}
                  placeholder="cc@company.com"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/30"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Subject</Label>
                <Input
                  value={subjectValue}
                  onChange={(e) => setSubjectValue(e.target.value)}
                  className="bg-white/5 border-white/15 text-white"
                />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Message (optional)</Label>
                <Textarea
                  value={messageValue}
                  onChange={(e) => setMessageValue(e.target.value)}
                  rows={4}
                  placeholder="Add a note for the recipients…"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/30"
                />
              </div>
              <p className="text-[11px] text-white/50">
                The full dashboard (including your written report) will be attached as a PDF.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}