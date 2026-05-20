import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, Copy, Check, FileText, X, Mail, Send, ClipboardPaste } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { DraftAndSendDialog, type DraftAndSendInitial } from './DraftAndSendDialog';

interface PostCallFollowupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
}

interface DraftEmail {
  subject: string;
  body: string;
}

interface DraftResponse {
  next_steps: string[];
  client_email: DraftEmail;
  lender_email: DraftEmail;
}

const ACCEPTED_EXTS = ['.txt', '.vtt', '.srt', '.md', '.csv', '.json', '.docx', '.doc'];

function stripVttCues(text: string): string {
  // Strip WEBVTT headers and cue timing lines so the model sees clean dialogue.
  return text
    .replace(/^WEBVTT.*$/gim, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^\d{2}:\d{2}[:.,]\d{2,3}\s*-->\s*\d{2}:\d{2}[:.,]\d{2,3}.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Parse a transcript filename like "[Acme] & [TriplePoint] | Intro & Review.vtt"
function parseTranscriptFilename(filename: string): { company?: string; lender?: string } {
  const base = filename.replace(/\.[^.]+$/, '');
  // Try bracketed: [Company] & [Lender] | ...
  const bracket = base.match(/\[([^\]]+)\]\s*&\s*\[([^\]]+)\]/);
  if (bracket) return { company: bracket[1].trim(), lender: bracket[2].trim() };
  // Fallback: Company & Lender | ...
  const before = base.split('|')[0];
  if (before && before.includes('&')) {
    const [c, l] = before.split('&').map(s => s.trim());
    if (c && l) return { company: c, lender: l };
  }
  return {};
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      toast({ title: 'Copied to clipboard' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  }, [getText]);
  return (
    <Button type="button" size="sm" variant="outline" onClick={onCopy} className="h-7 px-2 text-xs">
      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function EmailPane({
  title,
  recipient,
  draft,
  onChange,
  onDraftAndSend,
}: {
  title: string;
  recipient: string;
  draft: DraftEmail;
  onChange: (next: DraftEmail) => void;
  onDraftAndSend: () => void;
}) {
  const fullText = useMemo(
    () => `Subject: ${draft.subject}\n\n${draft.body}`,
    [draft.subject, draft.body],
  );
  return (
    <div className="flex flex-col min-h-0 h-full rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="text-sm font-medium truncate">{recipient}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <CopyButton getText={() => fullText} />
          <Button
            type="button"
            size="sm"
            onClick={onDraftAndSend}
            className="h-7 px-2 text-xs"
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            Draft &amp; Send
          </Button>
        </div>
      </div>
      <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
        <div>
          <Label className="text-[11px] text-muted-foreground">Subject</Label>
          <Input
            value={draft.subject}
            onChange={(e) => onChange({ ...draft, subject: e.target.value })}
            className="h-8 text-sm mt-1"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <Label className="text-[11px] text-muted-foreground">Body</Label>
          <Textarea
            value={draft.body}
            onChange={(e) => onChange({ ...draft, body: e.target.value })}
            className="mt-1 flex-1 min-h-[260px] text-sm font-mono leading-relaxed resize-none"
          />
        </div>
      </div>
    </div>
  );
}

export function PostCallFollowupModal({ open, onOpenChange, dealId }: PostCallFollowupModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [clientFirst, setClientFirst] = useState('');
  const [lenderFirst, setLenderFirst] = useState('');
  const [managerName, setManagerName] = useState('');

  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptFilename, setTranscriptFilename] = useState('');
  const [isReading, setIsReading] = useState(false);
  // Intake mode + source typing — distinguishes uploaded files from pasted text
  // so downstream UI/telemetry can tell them apart. Existing upload path
  // remains the default and is unchanged.
  const [intakeMode, setIntakeMode] = useState<'upload' | 'paste'>('upload');
  const [sourceType, setSourceType] = useState<'file_upload' | 'pasted_text' | null>(null);
  const [pasteDraft, setPasteDraft] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  // Soft cap on pasted transcripts — keeps payloads under the edge function
  // request budget. Files bypass this since they're already validated above.
  const PASTE_MAX_CHARS = 200_000;

  const [isGenerating, setIsGenerating] = useState(false);
  const [drafts, setDrafts] = useState<DraftResponse | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [composer, setComposer] = useState<{
    initial: DraftAndSendInitial;
    label: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from the deal record on open.
  useEffect(() => {
    if (!open || !dealId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: deal } = await supabase
          .from('deals')
          .select('company, manager, deal_owner, contact, contact_email')
          .eq('id', dealId)
          .maybeSingle();
        if (cancelled || !deal) return;
        if (deal.company && !companyName) setCompanyName(deal.company);
        const mgr = (deal.manager || deal.deal_owner || '').toString().trim();
        if (mgr && !managerName) setManagerName(mgr);
        if (deal.contact && !clientFirst) {
          const first = String(deal.contact).trim().split(/\s+/)[0];
          if (first) setClientFirst(first);
        }
        const ce = (deal as any).contact_email as string | undefined;
        if (ce) setContactEmail(ce);
      } catch {
        // best-effort prefill only
      }

      // Resolve manager name from current user's profile if still empty.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name, email')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled || !profile) return;
        const resolved = (
          (profile.display_name as string | undefined)?.trim() ||
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
          (profile.email ? String(profile.email).split('@')[0] : '')
        );
        setManagerName((prev) => prev || resolved || '');
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
    // Only re-run when the modal opens for a different deal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dealId]);

  const handleFile = useCallback((file: File) => {
    setIsReading(true);
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast({
        title: 'Unsupported file type',
        description: `Please upload a text-based transcript (${ACCEPTED_EXTS.join(', ')}).`,
        variant: 'destructive',
      });
      setIsReading(false);
      return;
    }
    const finish = (text: string) => {
      setTranscriptText(text);
      setTranscriptFilename(file.name);
      setSourceType('file_upload');
      const guess = parseTranscriptFilename(file.name);
      if (guess.company && !companyName) setCompanyName(guess.company);
      if (guess.lender && !lenderName) setLenderName(guess.lender);
      setIsReading(false);
    };
    if (ext === '.docx') {
      (async () => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const mammoth = await import('mammoth/mammoth.browser');
          const result = await mammoth.extractRawText({ arrayBuffer });
          const text = (result?.value || '').trim();
          if (!text) throw new Error('Empty document');
          finish(text);
        } catch (err) {
          console.error('docx parse failed', err);
          toast({
            title: 'Could not read Word document',
            description: 'The .docx file appears to be malformed or empty. Try re-saving it or paste the transcript text directly.',
            variant: 'destructive',
          });
          setIsReading(false);
        }
      })();
      return;
    }
    if (ext === '.doc') {
      toast({
        title: 'Legacy .doc not supported',
        description: 'Please save the file as .docx (Word) or paste the transcript text directly.',
        variant: 'destructive',
      });
      setIsReading(false);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const cleaned = ext === '.vtt' || ext === '.srt' ? stripVttCues(raw) : raw;
      finish(cleaned);
    };
    reader.onerror = () => {
      toast({ title: 'Could not read file', variant: 'destructive' });
      setIsReading(false);
    };
    reader.readAsText(file);
  }, [companyName, lenderName]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleGenerate = useCallback(async () => {
    if (!transcriptText.trim()) {
      toast({ title: 'Upload a transcript first', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('post-call-followup-drafts', {
        body: {
          transcript: transcriptText,
          source_type: sourceType ?? 'file_upload',
          company_name: companyName,
          lender_name: lenderName,
          client_first_name: clientFirst,
          lender_first_name: lenderFirst,
          deal_manager_name: managerName,
        },
      });
      if (error) throw error;
      if (!data || !data.client_email || !data.lender_email) {
        throw new Error('AI returned an unexpected response.');
      }
      setDrafts(data as DraftResponse);
      toast({ title: 'Drafts ready', description: 'Review, tweak, and copy to send.' });
    } catch (e: any) {
      const msg = e?.message || 'Failed to generate drafts';
      toast({ title: 'Could not generate drafts', description: msg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }, [transcriptText, sourceType, companyName, lenderName, clientFirst, lenderFirst, managerName]);

  const clearTranscript = useCallback(() => {
    setTranscriptText('');
    setTranscriptFilename('');
    setSourceType(null);
  }, []);

  // Accept the pasted draft as the active transcript. Mirrors handleFile's
  // contract (sets transcriptText + a synthetic "filename" label) so every
  // downstream consumer (generate button, char counter, clear action,
  // edge function payload) keeps working without branches.
  const handleUsePastedText = useCallback(() => {
    const trimmed = pasteDraft.trim();
    if (!trimmed) {
      setPasteError('No transcript text entered.');
      return;
    }
    if (trimmed.length > PASTE_MAX_CHARS) {
      setPasteError('This transcript is too long. Split it into smaller sections.');
      return;
    }
    setPasteError(null);
    setTranscriptText(trimmed);
    setTranscriptFilename('Pasted transcript');
    setSourceType('pasted_text');
    toast({ title: 'Transcript ready', description: 'Pasted text accepted — generate when ready.' });
  }, [pasteDraft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Post-Management Call Follow-Ups
          </DialogTitle>
          <DialogDescription>
            Upload the call transcript and we'll draft a client email and a funding source email based on the next steps discussed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-0">
          {/* Left: inputs */}
          <ScrollArea className="border-r border-border">
            <div className="p-5 space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Transcript</Label>
                {/* Show the active transcript pill regardless of mode once
                    something has been accepted. Keeps the existing visual
                    affordance for "transcript loaded" intact. */}
                {transcriptFilename ? (
                  <div className="mt-1 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-start gap-2 p-3">
                      <FileText className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {transcriptFilename}
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {sourceType === 'pasted_text' ? 'Pasted' : 'Uploaded'}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {transcriptText.length.toLocaleString()} chars
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={clearTranscript}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Tabs value={intakeMode} onValueChange={(v) => setIntakeMode(v as 'upload' | 'paste')} className="mt-1">
                    <TabsList className="grid grid-cols-2 h-8 w-full">
                      <TabsTrigger value="upload" className="text-xs gap-1.5">
                        <Upload className="h-3.5 w-3.5" />
                        Upload file
                      </TabsTrigger>
                      <TabsTrigger value="paste" className="text-xs gap-1.5">
                        <ClipboardPaste className="h-3.5 w-3.5" />
                        Paste text
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="mt-2">
                      <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    'rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors',
                    'hover:bg-muted/50',
                  )}
                >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-5 flex flex-col items-center justify-center gap-1 text-center"
                    >
                      {isReading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="text-sm">Drop transcript or click to upload</div>
                      <div className="text-[11px] text-muted-foreground">
                        {ACCEPTED_EXTS.join(', ')}
                      </div>
                    </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ACCEPTED_EXTS.join(',')}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                    </TabsContent>

                    <TabsContent value="paste" className="mt-2 space-y-2">
                      <Label className="text-xs text-muted-foreground">Paste transcript text</Label>
                      <Textarea
                        value={pasteDraft}
                        onChange={(e) => {
                          setPasteDraft(e.target.value);
                          if (pasteError) setPasteError(null);
                        }}
                        placeholder="Paste Zoom, Teams, meeting, call, or interview transcript text here."
                        className="min-h-[180px] text-xs font-mono resize-y"
                        aria-invalid={!!pasteError}
                      />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Upload a file or paste transcript text. Both options use the same processing flow.</span>
                        <span className={cn(pasteDraft.length > PASTE_MAX_CHARS && 'text-destructive')}>
                          {pasteDraft.length.toLocaleString()} chars
                        </span>
                      </div>
                      {pasteError && (
                        <p className="text-[11px] text-destructive" role="alert">{pasteError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleUsePastedText}
                          disabled={!pasteDraft.trim() || pasteDraft.length > PASTE_MAX_CHARS}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Use transcript
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => { setPasteDraft(''); setPasteError(null); }}
                          disabled={!pasteDraft}
                        >
                          Clear
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Tip: the typical filename pattern is <span className="font-mono">[COMPANY] &amp; [LENDER] | Intro &amp; Review</span> — names auto-fill when matched.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Company name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Lender name</Label>
                  <Input value={lenderName} onChange={(e) => setLenderName(e.target.value)} className="h-8 mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Client first name</Label>
                    <Input value={clientFirst} onChange={(e) => setClientFirst(e.target.value)} className="h-8 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Lender first name</Label>
                    <Input value={lenderFirst} onChange={(e) => setLenderFirst(e.target.value)} className="h-8 mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Deal manager name</Label>
                  <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} className="h-8 mt-1" />
                </div>
              </div>

              <Button
                type="button"
                variant="liquid-glass"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !transcriptText.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Drafting…</>
                ) : (
                  <>Generate follow-up emails</>
                )}
              </Button>

              {drafts?.next_steps?.length ? (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-medium mb-1.5">Next steps detected</div>
                  <ul className="space-y-1">
                    {drafts.next_steps.map((s, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">{i + 1}</Badge>
                        <span className="flex-1">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </ScrollArea>

          {/* Right: previews */}
          <div className="min-h-0 p-4">
            {drafts ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-0">
                <EmailPane
                  title="Client Email"
                  recipient={`To: ${clientFirst || 'Client'}${companyName ? ` · ${companyName}` : ''}`}
                  draft={drafts.client_email}
                  onChange={(next) => setDrafts({ ...drafts, client_email: next })}
                  onDraftAndSend={() => setComposer({
                    label: 'Client follow-up',
                    initial: {
                      to: contactEmail ? [contactEmail] : [],
                      subject: drafts.client_email.subject,
                      body: drafts.client_email.body,
                    },
                  })}
                />
                <EmailPane
                  title="Lender Email"
                  recipient={`To: ${lenderFirst || 'Lender'}${lenderName ? ` · ${lenderName}` : ''}`}
                  draft={drafts.lender_email}
                  onChange={(next) => setDrafts({ ...drafts, lender_email: next })}
                  onDraftAndSend={() => setComposer({
                    label: 'Lender follow-up',
                    initial: {
                      to: [],
                      subject: drafts.lender_email.subject,
                      body: drafts.lender_email.body,
                    },
                  })}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <Mail className="h-10 w-10 mb-3 opacity-50" />
                <div className="text-sm">Drafts will appear here</div>
                <div className="text-xs mt-1 max-w-sm">
                  Upload a transcript and click <span className="font-medium">Generate follow-up emails</span> to draft a side-by-side client and lender follow-up.
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <DraftAndSendDialog
        open={!!composer}
        onOpenChange={(v) => { if (!v) setComposer(null); }}
        initial={composer?.initial ?? null}
        contextLabel={composer?.label}
      />
    </Dialog>
  );
}