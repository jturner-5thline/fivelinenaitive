import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Building2, Briefcase, Link2, Loader2, Sparkles, ExternalLink, ListTodo, Check, X, UserPlus, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useContactBySenderEmail } from '@/hooks/useContactBySenderEmail';
import { useBodyMentionDealMatch } from '@/hooks/useBodyMentionDealMatch';
import { LinkToDealPopover } from './LinkToDealPopover';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { SuggestedTaskCards } from './SuggestedTaskCards';
import type { WorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';
import { useCreateContact } from '@/hooks/useContacts';
import { useLinkContactToDeal } from '@/hooks/useCrmLinks';
import { STATUS_CONFIG } from '@/types/deal';
import { useIsTeamMemberEmail } from '@/hooks/useIsTeamMemberEmail';
import { domainOf, isInternalEmail } from '@/lib/internalDomains';

interface Props {
  /** Inbound email to enrich. */
  email: {
    from_email?: string;
    from_name?: string;
    subject?: string;
    body_preview?: string;
    body_text?: string;
    /**
     * Mailbox folder of the latest message — used to detect outbound
     * messages (sent by an internal user) so we can suppress the
     * "New contact" prompt entirely.
     */
    folder?: 'inbox' | 'sent' | 'drafts' | 'junk' | 'trash' | 'outbox';
  };
  /** Persists the link selection on the parent thread (deal_emails write). */
  onLinkDeal: (dealId: string, dealName: string) => void | Promise<void>;
  /** True while a parent-side link write is pending. */
  linking?: boolean;
  /**
   * AI-detected next-action tasks for the open thread (from
   * useThreadWorkflowAnalysis). When present, the card surfaces the first
   * suggestion as a follow-up confirmation immediately after the user
   * links the email to a deal — so a task can be created in one extra
   * click without leaving the unmatched card.
   */
   suggestedTasks?: NonNullable<WorkflowAnalysis['suggested_tasks']>;
   /** Open thread id, forwarded to SuggestedTaskCards for activity logging. */
   threadId?: string | null;
}

const CONFIDENCE_BADGE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

/**
 * UnmatchedEmailContextCard
 * --------------------------
 * Renders inside AiAssistSidebar when the open thread has NO linked deal
 * and no high-confidence sender-side match. Three layered fallbacks per
 * spec:
 *   1. CRM contact match → contact card (name, company, recent deal,
 *      last activity).
 *   2. Body mentions a deal name → "may be related" suggestion with
 *      confidence indicator + one-click Link.
 *   3. Neither → "No deal match found" with a Link Deal button.
 */
export function UnmatchedEmailContextCard({
  email,
  onLinkDeal,
  linking,
  suggestedTasks,
  threadId,
}: Props) {
  const senderEmail = email.from_email || '';
  const { data: contact, isLoading: contactLoading } =
    useContactBySenderEmail(senderEmail);

  // Body-mention search runs unconditionally so a contact + deal-mention
  // can both appear (the contact card stays primary, the mention shows
  // below as a separate suggestion).
  const bodyMatch = useBodyMentionDealMatch({
    subject: email.subject,
    body: email.body_text || email.body_preview,
    excludeDealIds: contact?.recentDeal?.id ? [contact.recentDeal.id] : undefined,
  });

  const [linkingTarget, setLinkingTarget] = useState<string | null>(null);
  // After a successful link, capture the deal so we can render an inline
  // follow-up confirmation ("Create suggested task from this email?")
  // without waiting for the parent to re-render with a real `dealId`.
  const [linkedConfirmation, setLinkedConfirmation] = useState<
    { dealId: string; dealName: string } | null
  >(null);
  const [followUpDismissed, setFollowUpDismissed] = useState(false);
  const location = useLocation();

  // Mutations for the "New contact: ... Add to contacts?" prompt rendered
  // when the sender email is not yet in the CRM.
  const createContact = useCreateContact();
  const linkContactDeal = useLinkContactToDeal();
  const [contactAdded, setContactAdded] = useState<{ id: string; name: string } | null>(null);

  const linkSuggestion = async (id: string, name: string) => {
    setLinkingTarget(id);
    try {
      await onLinkDeal(id, name);
      setLinkedConfirmation({ dealId: id, dealName: name });
      setFollowUpDismissed(false);
    } finally {
      setLinkingTarget(null);
    }
  };

  // Treat a strong body-mention as "matched" — the parent thread isn't yet
  // linked, but we have high confidence. The UI surfaces a clean deal
  // header with a single "Link" chip (persists via onLinkDeal) instead of
  // the verbose "Possible deal mention" suggestion card.
  const highMatch = bodyMatch && bodyMatch.confidence === 'high' ? bodyMatch : null;
  const lowOrMediumMatch = bodyMatch && bodyMatch.confidence !== 'high' ? bodyMatch : null;

  // The first non-empty suggestion drives the post-link follow-up prompt.
  // Keeping this scoped to one card avoids overwhelming the user with a
  // full task list immediately after linking.
  const primarySuggestion = (suggestedTasks || []).find(
    (t) => t && t.title && t.title.trim().length > 0,
  );

  const followUpPanel = linkedConfirmation && primarySuggestion && !followUpDismissed && (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 space-y-2">
      <div className="flex items-start gap-1.5">
        <Check className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground leading-snug">
            Linked to{' '}
            <span className="text-emerald-400">{linkedConfirmation.dealName}</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug inline-flex items-center gap-1">
            <ListTodo className="h-2.5 w-2.5 shrink-0" />
            <span>Suggested next action</span>
          </p>
          <p
            className="text-[11px] text-foreground/90 mt-1 leading-snug italic break-words"
            title={primarySuggestion.title}
          >
            “{primarySuggestion.title}”
          </p>
          <RouterLink
            to="/tasks/preview/suggested"
            state={{
              suggestion: primarySuggestion,
              dealId: linkedConfirmation.dealId,
              dealName: linkedConfirmation.dealName,
              threadId: threadId || null,
              returnTo: location.pathname + location.search,
            }}
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:underline"
          >
            <Eye className="h-2.5 w-2.5" />
            Preview before creating
          </RouterLink>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 text-muted-foreground shrink-0"
          title="Dismiss follow-up suggestion"
          onClick={() => setFollowUpDismissed(true)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <SuggestedTaskCards
        suggestions={[primarySuggestion]}
        dealId={linkedConfirmation.dealId}
        dealName={linkedConfirmation.dealName}
        threadId={threadId || null}
      />
    </div>
  );

  if (contactLoading) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }

  // ── High-confidence body-mention: render clean deal header ─────────
  // Replaces the "Possible deal mention — link it?" card with a compact
  // "[Deal] • [Stage] • [Status]" header and a small Link chip.
  const matchedDealHeader = highMatch && (
    <MatchedDealHeader
      match={highMatch}
      linkingTarget={linkingTarget}
      linking={!!linking}
      onLink={linkSuggestion}
      isLinked={!!linkedConfirmation && linkedConfirmation.dealId === highMatch.deal.id}
    />
  );

  // ── New-contact CTA when sender isn't yet in the CRM ───────────────
  const senderName = (email.from_name || '').trim();
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';
  const inferredCompany =
    highMatch?.deal.company || highMatch?.deal.name || senderDomain || '';
  const canShowNewContactPrompt =
    !contact && !!senderEmail && senderEmail.includes('@') && !!senderName;

  const handleAddContact = async () => {
    if (!senderEmail || !senderName) return;
    const parts = senderName.split(/\s+/);
    const firstName = parts[0] || senderName;
    const lastName = parts.slice(1).join(' ') || null;
    try {
      const created: any = await createContact.mutateAsync({
        first_name: firstName,
        last_name: lastName ?? undefined,
        full_name: senderName,
        email: senderEmail,
      } as any);
      const newId = created?.id;
      const newName = created?.full_name || senderName;
      if (newId && highMatch?.deal.id) {
        try {
          await linkContactDeal.mutateAsync({
            contactId: newId,
            dealId: highMatch.deal.id,
          });
        } catch {
          // best effort — contact creation succeeds even if link fails
        }
      }
      if (newId) setContactAdded({ id: newId, name: newName });
    } catch {
      // toast handled in the mutation hook
    }
  };

  const newContactPrompt = canShowNewContactPrompt && !contactAdded && (
    <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <UserPlus className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-semibold tracking-wide text-foreground">
          New contact
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <span className="text-foreground font-medium">{senderName}</span>
        {inferredCompany ? (
          <>
            {' '}@ <span className="text-foreground font-medium">{inferredCompany}</span>
          </>
        ) : null}
        {' '}— Add to contacts?
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px] gap-1.5 w-full"
        disabled={createContact.isPending || linkContactDeal.isPending}
        onClick={handleAddContact}
      >
        {createContact.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        Add to contacts
      </Button>
    </div>
  );

  const contactAddedConfirm = contactAdded && (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 flex items-start gap-1.5">
      <Check className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-foreground leading-snug">
          Added <span className="text-emerald-400">{contactAdded.name}</span> to contacts
        </p>
        <RouterLink
          to={`/crm/contacts/${contactAdded.id}`}
          className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Open contact
        </RouterLink>
      </div>
    </div>
  );

  // ── Case 1: contact-card match ───────────────────────────────────────
  if (contact) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-3">
        {matchedDealHeader}
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            Sender in your CRM
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-semibold text-foreground truncate">
                {contact.fullName}
              </span>
              <RouterLink
                to={`/crm/contacts/${contact.id}`}
                className="text-muted-foreground hover:text-primary"
                title="Open contact"
              >
                <ExternalLink className="h-3 w-3" />
              </RouterLink>
            </div>
            {contact.jobTitle && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                {contact.jobTitle}
              </p>
            )}
            {contact.companyName && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{contact.companyName}</span>
              </div>
            )}
            {contact.lastActivityDate && (
              <p className="text-[10px] text-muted-foreground/80">
                Last activity{' '}
                {formatDistanceToNow(new Date(contact.lastActivityDate), {
                  addSuffix: true,
                })}
              </p>
            )}
          </div>
        </div>

        {contact.recentDeal ? (
          <div className="rounded border border-white/[0.06] bg-background/40 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              Most recent deal
            </div>
            <div className="flex items-center justify-between gap-2">
              <RouterLink
                to={`/deals/${contact.recentDeal.id}`}
                className="text-[12px] font-medium text-foreground hover:text-primary truncate"
              >
                {contact.recentDeal.name}
              </RouterLink>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 px-2 shrink-0"
                disabled={!!linkingTarget || linking}
                onClick={() =>
                  linkSuggestion(
                    contact.recentDeal!.id,
                    contact.recentDeal!.name,
                  )
                }
              >
                {linkingTarget === contact.recentDeal.id ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Link2 className="h-2.5 w-2.5" />
                )}
                Link
              </Button>
            </div>
            {contact.recentDeal.stage && (
              <p className="text-[10px] text-muted-foreground capitalize">
                {contact.recentDeal.stage.replace(/[-_]/g, ' ')}
              </p>
            )}
          </div>
        ) : null}

        {/* Medium/low body-mention deal suggestion can stack under the contact card.
            High-confidence is rendered as the clean header above instead. */}
        {lowOrMediumMatch && (
          <BodyMentionSuggestion
            match={lowOrMediumMatch}
            linkingTarget={linkingTarget}
            linking={!!linking}
            onLink={linkSuggestion}
          />
        )}
        {followUpPanel}
      </div>
    );
  }

  // ── Case 2: high-confidence body-mention → clean deal header ─────────
  if (highMatch) {
    return (
      <div className="space-y-3">
        {matchedDealHeader}
        {newContactPrompt}
        {contactAddedConfirm}
        {followUpPanel}
      </div>
    );
  }

  // ── Case 3: medium/low body-mention → "Possible deal mention" ────────
  if (lowOrMediumMatch) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            Possible deal mention
          </span>
        </div>
        <BodyMentionSuggestion
          match={lowOrMediumMatch}
          linkingTarget={linkingTarget}
          linking={!!linking}
          onLink={linkSuggestion}
        />
        {newContactPrompt}
        {contactAddedConfirm}
        {followUpPanel}
      </div>
    );
  }

  // ── Case 4: nothing matched ─────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            No deal match found
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          We couldn’t auto-link this email to a deal or contact. Link it
          manually so AI Assist can use full deal context.
        </p>
        <LinkToDealPopover
          trigger={
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5 w-full">
              <Link2 className="h-3 w-3" />
              Link Deal
            </Button>
          }
          currentDealName={undefined}
          isLinked={false}
          onLinkDeal={(id, name) => linkSuggestion(id, name)}
          onUnlink={() => undefined}
        />
      </div>
      {newContactPrompt}
      {contactAddedConfirm}
      {followUpPanel}
    </div>
  );
}

/**
 * MatchedDealHeader
 * -----------------
 * Clean "[Deal Name] • [Stage] • [Status]" header rendered when the
 * email body has a HIGH-confidence mention of a workspace deal. Replaces
 * the older "Possible deal mention — link it?" card so confidently
 * matched threads feel pre-linked. A single compact "Link" chip on the
 * right persists the deal_emails relation; once clicked it flips to a
 * "Linked" indicator.
 */
function MatchedDealHeader({
  match,
  linkingTarget,
  linking,
  onLink,
  isLinked,
}: {
  match: NonNullable<ReturnType<typeof useBodyMentionDealMatch>>;
  linkingTarget: string | null;
  linking: boolean;
  onLink: (id: string, name: string) => void | Promise<void>;
  isLinked: boolean;
}) {
  const dealName = match.deal.company || match.deal.name || 'Deal';
  const stageLabel = (match.deal.stage || '').toString().replace(/[-_]/g, ' ').trim();
  const statusKey = ((match.deal.status || 'on-track') as string).toLowerCase();
  const statusMeta = STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG];
  const statusLabel = statusMeta?.label || statusKey.replace(/[-_]/g, ' ');
  const isLinkingThis = linkingTarget === match.deal.id;

  return (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 flex items-center gap-2">
      <Briefcase className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
        <RouterLink
          to={`/deals/${match.deal.id}`}
          className="text-[12px] font-semibold text-foreground hover:text-primary truncate max-w-[180px]"
          title={dealName}
        >
          {dealName}
        </RouterLink>
        {stageLabel && (
          <>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[11px] text-muted-foreground capitalize truncate">
              {stageLabel}
            </span>
          </>
        )}
        {statusLabel && (
          <>
            <span className="text-[10px] text-muted-foreground">•</span>
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 capitalize border-white/[0.08] text-muted-foreground"
            >
              {statusLabel}
            </Badge>
          </>
        )}
      </div>
      {isLinked ? (
        <Badge
          variant="outline"
          className="text-[10px] h-5 px-1.5 gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0"
        >
          <Check className="h-2.5 w-2.5" />
          Linked
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] gap-1 px-2 shrink-0"
          disabled={!!linkingTarget || linking}
          onClick={() => onLink(match.deal.id, dealName)}
        >
          {isLinkingThis ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Link2 className="h-2.5 w-2.5" />
          )}
          Link
        </Button>
      )}
    </div>
  );
}

function BodyMentionSuggestion({
  match,
  linkingTarget,
  linking,
  onLink,
}: {
  match: NonNullable<ReturnType<typeof useBodyMentionDealMatch>>;
  linkingTarget: string | null;
  linking: boolean;
  onLink: (id: string, name: string) => void | Promise<void>;
}) {
  return (
    <div className="rounded border border-white/[0.06] bg-background/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-foreground leading-tight min-w-0">
          This may be related to{' '}
          <span className="font-semibold">{match.deal.company || match.deal.name}</span> — link it?
        </p>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] h-4 px-1.5 shrink-0 capitalize',
            CONFIDENCE_BADGE[match.confidence],
          )}
        >
          {match.confidence}
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground italic truncate">
        Matched “{match.matchedPhrase}”
      </p>
      <div className="flex items-center gap-2 justify-end">
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1.5 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
          disabled={!!linkingTarget || linking}
          onClick={() => onLink(match.deal.id, match.deal.company || match.deal.name)}
        >
          {linkingTarget === match.deal.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Link2 className="h-3 w-3" />
          )}
          Link Deal
        </Button>
      </div>
    </div>
  );
}
