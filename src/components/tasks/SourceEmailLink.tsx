import { ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Mail, Clock, User as UserIcon, FileText } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SourceEmailLinkProps {
  href: string;
  subject?: string | null;
  from?: string | null;
  receivedAt?: string | null;
  /** Visual element rendered as the trigger. */
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/**
 * Wraps a source-email anchor with a rich tooltip that surfaces the
 * sender, original received timestamp, and subject so users can preview
 * the linked email's metadata before clicking through.
 *
 * Click/mousedown propagation is stopped so the link never triggers row
 * select or description edit-mode in parent task UI.
 */
export function SourceEmailLink({
  href,
  subject,
  from,
  receivedAt,
  children,
  ariaLabel,
  className,
}: SourceEmailLinkProps) {
  const subj = subject?.trim() || '(no subject)';
  const sender = from?.trim();
  const received = receivedAt ? new Date(receivedAt) : null;
  const receivedAbs =
    received && !isNaN(received.getTime())
      ? format(received, 'EEE, MMM d, yyyy h:mm a')
      : null;
  const receivedRel =
    received && !isNaN(received.getTime())
      ? formatDistanceToNow(received, { addSuffix: true })
      : null;

  // Plain-text fallback for browser-native title attribute (screen readers,
  // hovers in environments where Radix tooltips don't render).
  const titleParts = [
    sender ? `From: ${sender}` : null,
    receivedAbs ? `Received: ${receivedAbs}` : null,
    `Subject: ${subj}`,
  ].filter(Boolean) as string[];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title={titleParts.join('\n')}
            aria-label={ariaLabel || `Open source email: ${subj}`}
            className={className}
          >
            {children}
          </a>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-sm space-y-1.5 p-3"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Mail className="h-3 w-3" />
            Source email
          </div>
          {sender && (
            <div className="flex items-start gap-1.5 text-xs">
              <UserIcon className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="break-words">{sender}</span>
            </div>
          )}
          {(receivedAbs || receivedRel) && (
            <div className="flex items-start gap-1.5 text-xs">
              <Clock className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                {receivedAbs}
                {receivedRel && (
                  <span className="text-muted-foreground"> · {receivedRel}</span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-start gap-1.5 text-xs font-medium">
            <FileText className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="break-words">{subj}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}