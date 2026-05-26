import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Canonical wrapper around every rendered email message body —
 * plaintext, sanitized HTML, and iframe/srcDoc branded HTML all sit
 * inside this shell so the visual background, border, radius and
 * padding stay identical regardless of MIME type or sender.
 *
 * The shell owns the surface fill using the existing Naitive theme
 * tokens (`--email-reading-bg`), so inner renderers must stay
 * transparent.
 */
export function EmailMessageShell({ children, className }: Props) {
  return (
    <div
      className={cn(
        'email-message-shell w-full min-w-0 max-w-full overflow-hidden',
        'rounded-lg border border-border/40',
        'bg-[hsl(var(--email-reading-bg))]',
        'px-4 py-3 sm:px-5 sm:py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
