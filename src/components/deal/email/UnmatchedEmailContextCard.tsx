import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Building2, Briefcase, Link2, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useContactBySenderEmail } from '@/hooks/useContactBySenderEmail';
import { useBodyMentionDealMatch } from '@/hooks/useBodyMentionDealMatch';
import { LinkToDealPopover } from './LinkToDealPopover';
import { Link as RouterLink } from 'react-router-dom';

interface Props {
  /** Inbound email to enrich. */
  email: {
    from_email?: string;
    from_name?: string;
    subject?: string;
    body_preview?: string;
    body_text?: string;
  };
  /** Persists the link selection on the parent thread (deal_emails write). */
  onLinkDeal: (dealId: string, dealName: string) => void | Promise<void>;
  /** True while a parent-side link write is pending. */
  linking?: boolean;
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
export function UnmatchedEmailContextCard({ email, onLinkDeal, linking }: Props) {
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
  const linkSuggestion = async (id: string, name: string) => {
    setLinkingTarget(id);
    try {
      await onLinkDeal(id, name);
    } finally {
      setLinkingTarget(null);
    }
  };

  if (contactLoading) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }

  // ── Case 1: contact-card match ───────────────────────────────────────
  if (contact) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-3">
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

        {/* Body-mention deal suggestion can stack under the contact card. */}
        {bodyMatch && (
          <BodyMentionSuggestion
            match={bodyMatch}
            linkingTarget={linkingTarget}
            linking={!!linking}
            onLink={linkSuggestion}
          />
        )}
      </div>
    );
  }

  // ── Case 2: body-mention deal suggestion ─────────────────────────────
  if (bodyMatch) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            Possible deal mention
          </span>
        </div>
        <BodyMentionSuggestion
          match={bodyMatch}
          linkingTarget={linkingTarget}
          linking={!!linking}
          onLink={linkSuggestion}
        />
      </div>
    );
  }

  // ── Case 3: nothing matched ─────────────────────────────────────────
  return (
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
        onLinkDeal={(id, name) => onLinkDeal(id, name)}
        onUnlink={() => undefined}
      />
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
