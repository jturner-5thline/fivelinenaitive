import { useCallback, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Mail, Loader2, ChevronLeft, ChevronRight, Check, CheckCircle2,
  AlertCircle, RotateCw, Send, Users, ExternalLink, AlertTriangle, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmailRichTextEditor } from './EmailRichTextEditor';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { Link } from 'react-router-dom';

export type EmailDraftStatus = 'draft' | 'approved' | 'sending' | 'sent' | 'failed';

/** Lender contact option surfaced in the recipient picker. */
export type LenderContactOption = {
  id: string;            // lender_contacts.id, or 'legacy' for master_lenders.email
  name: string;          // contact display name (or "Primary contact" fallback)
  title?: string | null;
  email: string;
  isPrimary?: boolean;
};

export type EmailDraft = {
  lenderName: string;
  /** master_lenders.id when the draft is matched to a lender directory record. */
  lenderId?: string | null;
  /** All known contact emails for this lender (for the recipient dropdown). */
  availableContacts?: LenderContactOption[];
  /** Currently selected contact id from `availableContacts`. */
  selectedContactId?: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** Sanitized HTML produced by the rich-text editor. */
  bodyHtml: string;
  status: EmailDraftStatus;
  isSubjectEdited?: boolean;
  isBodyEdited?: boolean;
  isCcEdited?: boolean;
  isBccEdited?: boolean;
  errorMessage?: string;
  /**
   * One-line explanation of why the AI personalized this draft to the lender
   * (e.g. "Tailored to Founderpath's SaaS focus and $1–10MM range"). Empty
   * when "Personalize per lender" was off and the same draft was broadcast.
   */
  personalizationRationale?: string;
};

type AppliedField = 'subject' | 'body' | 'cc' | 'bcc' | null;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGenerating: boolean;
  drafts: EmailDraft[];
  setDrafts: React.Dispatch<React.SetStateAction<EmailDraft[]>>;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  /** Callback invoked when the user clicks "Send" for a single draft. */
  onSend: (index: number) => void | Promise<void>;
}

const EMAILS_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmails(value: string): boolean {
  if (!value.trim()) return true;
  return value.split(',').map((s) => s.trim()).filter(Boolean).every((e) => EMAILS_RX.test(e));
}

export function DraftSubmissionEmailsModal({
  open, onOpenChange, isGenerating, drafts, setDrafts, activeIndex, setActiveIndex, onSend,
}: Props) {
  const [appliedField, setAppliedField] = useState<AppliedField>(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const updateActiveDraft = useCallback((patch: Partial<EmailDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === activeIndex ? { ...d, ...patch } : d)));
  }, [activeIndex, setDrafts]);

  const flashApplied = (field: Exclude<AppliedField, null>) => {
    setAppliedField(field);
    setTimeout(() => setAppliedField((f) => (f === field ? null : f)), 1800);
  };

  const applyToAll = useCallback((field: 'subject' | 'bodyHtml' | 'cc' | 'bcc') => {
    const source = drafts[activeIndex];
    if (!source) return;
    setDrafts((prev) => prev.map((d) => {
      const next: EmailDraft = { ...d, [field]: source[field] };
      if (field === 'subject') next.isSubjectEdited = false;
      if (field === 'bodyHtml') next.isBodyEdited = false;
      if (field === 'cc') next.isCcEdited = false;
      if (field === 'bcc') next.isBccEdited = false;
      return next;
    }));
    flashApplied(field === 'bodyHtml' ? 'body' : field);
  }, [drafts, activeIndex, setDrafts]);

  const goToPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goToNext = () => setActiveIndex((i) => Math.min(drafts.length - 1, i + 1));

  const handleApprove = () => {
    updateActiveDraft({ status: 'approved' });
    if (activeIndex < drafts.length - 1) setActiveIndex((i) => i + 1);
  };

  const draft = drafts[activeIndex];
  const ccInvalid = draft ? !validateEmails(draft.cc) : false;
  const bccInvalid = draft ? !validateEmails(draft.bcc) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] flex flex-col z-[2147483600]"
        overlayClassName="z-[2147483500]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Draft Submission Emails
            {!isGenerating && drafts.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                · {activeIndex + 1} of {drafts.length}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Review each lender-specific draft. Format the body, add CC/BCC, then approve and send one at a time.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating drafts for each active lender…
            </div>
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <p className="text-sm text-muted-foreground">No drafts generated.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            {/* Lender pager */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {drafts.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap border transition-colors',
                    i === activeIndex
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 hover:bg-muted border-border'
                  )}
                >
                  {d.status === 'sent' && <CheckCircle2 className="h-3 w-3" />}
                  {d.status === 'approved' && <Check className="h-3 w-3" />}
                  {d.status === 'sending' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {d.status === 'failed' && <AlertCircle className="h-3 w-3 text-destructive" />}
                  <span>{d.lenderName}</span>
                </button>
              ))}
            </div>

            {/* Active email */}
            {draft && (
              <div className="flex-1 flex flex-col gap-2 overflow-auto rounded-md border bg-card p-3 min-h-0">
                {/* To */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-muted-foreground">To:</span>
                  <Input
                    value={draft.to}
                    onChange={(e) => updateActiveDraft({ to: e.target.value })}
                    placeholder="recipient@example.com"
                    className="h-8 text-xs flex-1"
                  />
                  {/* Multi-contact picker — only when ≥2 contact emails on file. */}
                  {(draft.availableContacts?.length ?? 0) > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px] gap-1"
                          aria-label="Choose lender contact"
                        >
                          <Users className="h-3 w-3" />
                          {draft.availableContacts!.length} contacts
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {draft.lenderName} contacts
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {draft.availableContacts!.map((c) => (
                          <DropdownMenuItem
                            key={c.id}
                            onClick={() =>
                              updateActiveDraft({ to: c.email, selectedContactId: c.id })
                            }
                            className="flex flex-col items-start gap-0.5 py-1.5"
                          >
                            <div className="flex items-center gap-1.5 w-full">
                              <span className="text-xs font-medium">{c.name}</span>
                              {c.isPrimary && (
                                <Badge variant="outline" className="text-[9px] py-0 h-4 ml-auto">
                                  Primary
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {c.email}
                              {c.title ? ` · ${c.title}` : ''}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <div className="flex items-center gap-1">
                    {!showCc && !draft.cc && (
                      <button
                        type="button"
                        onClick={() => setShowCc(true)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Cc
                      </button>
                    )}
                    {!showBcc && !draft.bcc && (
                      <button
                        type="button"
                        onClick={() => setShowBcc(true)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Bcc
                      </button>
                    )}
                  </div>
                </div>

                {/* No-email warning when the lender directory record has no contacts. */}
                {(draft.availableContacts?.length ?? 0) === 0 && !draft.to.trim() && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 ml-[56px]">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">
                      No email on file for <strong>{draft.lenderName}</strong> — add one before sending.
                    </span>
                    <Link
                      to={
                        draft.lenderId
                          ? `/lenders?lender=${encodeURIComponent(draft.lenderId)}`
                          : `/lenders?search=${encodeURIComponent(draft.lenderName)}`
                      }
                      target="_blank"
                      className="inline-flex items-center gap-1 font-medium hover:underline whitespace-nowrap"
                    >
                      Open lender <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                )}

                {/* Cc */}
                {(showCc || draft.cc) && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">Cc:</span>
                      <Input
                        value={draft.cc}
                        onChange={(e) => updateActiveDraft({ cc: e.target.value, isCcEdited: true })}
                        placeholder="comma-separated emails"
                        className={cn('h-8 text-xs flex-1', ccInvalid && 'border-destructive focus-visible:ring-destructive')}
                      />
                    </div>
                    {(draft.isCcEdited || appliedField === 'cc') && drafts.length > 1 && (
                      <ApplyToAllButton
                        applied={appliedField === 'cc'}
                        onClick={() => applyToAll('cc')}
                        offset
                      />
                    )}
                  </div>
                )}

                {/* Bcc */}
                {(showBcc || draft.bcc) && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">Bcc:</span>
                      <Input
                        value={draft.bcc}
                        onChange={(e) => updateActiveDraft({ bcc: e.target.value, isBccEdited: true })}
                        placeholder="comma-separated emails"
                        className={cn('h-8 text-xs flex-1', bccInvalid && 'border-destructive focus-visible:ring-destructive')}
                      />
                    </div>
                    {(draft.isBccEdited || appliedField === 'bcc') && drafts.length > 1 && (
                      <ApplyToAllButton
                        applied={appliedField === 'bcc'}
                        onClick={() => applyToAll('bcc')}
                        offset
                      />
                    )}
                  </div>
                )}

                {/* Subject */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-muted-foreground">Subject:</span>
                    <Input
                      value={draft.subject}
                      onChange={(e) => updateActiveDraft({ subject: e.target.value, isSubjectEdited: true })}
                      className="h-8 text-xs flex-1"
                    />
                  </div>
                  {(draft.isSubjectEdited || appliedField === 'subject') && drafts.length > 1 && (
                    <ApplyToAllButton
                      applied={appliedField === 'subject'}
                      onClick={() => applyToAll('subject')}
                      offset
                    />
                  )}
                </div>

                {/* Personalization rationale — surfaced when the AI tailored
                    this draft to the lender's profile (focus areas, deal
                    size range, prior interaction). Hidden when the user
                    chose to broadcast a single generic draft. */}
                {draft.personalizationRationale && (
                  <div className="flex items-start gap-1.5 ml-[56px] -mt-1 text-[11px] text-primary/90">
                    <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="flex-1 italic">{draft.personalizationRationale}</span>
                  </div>
                )}

                {/* Body */}
                <div className="flex flex-col gap-1 flex-1 min-h-0">
                  <span className="text-xs text-muted-foreground">Body:</span>
                  <EmailRichTextEditor
                    content={draft.bodyHtml}
                    onChange={(html) => updateActiveDraft({ bodyHtml: html, isBodyEdited: true })}
                    className="flex-1 min-h-[260px]"
                    minHeight={240}
                  />
                  {(draft.isBodyEdited || appliedField === 'body') && drafts.length > 1 && (
                    <ApplyToAllButton
                      applied={appliedField === 'body'}
                      onClick={() => applyToAll('bodyHtml')}
                    />
                  )}
                </div>

                {/* Status row */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge
                      variant={draft.status === 'failed' ? 'destructive' : draft.status === 'sent' ? 'default' : 'outline'}
                      className="text-[10px] py-0 h-4 gap-1"
                    >
                      {draft.status === 'sending' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {draft.status === 'sent' && <CheckCircle2 className="h-2.5 w-2.5" />}
                      {draft.status === 'failed' && <AlertCircle className="h-2.5 w-2.5" />}
                      {draft.status}
                    </Badge>
                    <span>Lender: {draft.lenderName}</span>
                  </div>
                  {draft.status === 'failed' && draft.errorMessage && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="flex-1">{draft.errorMessage}</span>
                      <button
                        type="button"
                        onClick={() => onSend(activeIndex)}
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        <RotateCw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  )}
                  {draft.status === 'sent' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-primary">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Sent from your connected email account.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrev}
            disabled={isGenerating || activeIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNext}
            disabled={isGenerating || activeIndex >= drafts.length - 1}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleApprove}
            disabled={isGenerating || drafts.length === 0 || drafts[activeIndex]?.status === 'sent'}
          >
            <Check className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            onClick={() => onSend(activeIndex)}
            disabled={
              isGenerating ||
              drafts.length === 0 ||
              ccInvalid ||
              bccInvalid ||
              drafts[activeIndex]?.status === 'sending' ||
              drafts[activeIndex]?.status === 'sent'
            }
          >
            {drafts[activeIndex]?.status === 'sending' ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</>
            ) : drafts[activeIndex]?.status === 'sent' ? (
              <><CheckCircle2 className="h-4 w-4 mr-1" /> Sent</>
            ) : drafts[activeIndex]?.status === 'failed' ? (
              <><RotateCw className="h-4 w-4 mr-1" /> Retry send</>
            ) : (
              <><Send className="h-4 w-4 mr-1" /> Send</>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyToAllButton({
  applied, onClick, offset,
}: { applied: boolean; onClick: () => void; offset?: boolean }) {
  return (
    <div className={offset ? 'pl-[56px]' : ''}>
      <button
        type="button"
        onClick={onClick}
        disabled={applied}
        className="text-[11px] text-primary hover:underline disabled:opacity-60"
      >
        {applied ? '✓ Applied to all drafts' : 'Apply to all submissions'}
      </button>
    </div>
  );
}

/** Convert the rich-text body to a plain-text fallback for downstream send APIs. */
export function draftBodyToPlainText(bodyHtml: string): string {
  return htmlToPlainText(bodyHtml);
}
