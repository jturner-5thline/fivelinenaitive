import { ReactNode, useEffect, useRef } from 'react';
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
  const rootRef = useRef<HTMLDivElement>(null);

  // Dev-mode runtime guard: assert the email body container resolves to a
  // transparent computed background. If a future regression reintroduces a
  // solid fill (bg-card, bg-background, white wrapper, etc.) this fires
  // loudly in the console so we catch it before users do.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!rootRef.current) return;
    const cs = getComputedStyle(rootRef.current);
    const bg = cs.backgroundColor;
    const isTransparent =
      !bg ||
      bg === 'transparent' ||
      bg === 'rgba(0, 0, 0, 0)' ||
      /rgba\([^)]*,\s*0\s*\)$/i.test(bg);
    if (!isTransparent) {
      // eslint-disable-next-line no-console
      console.error(
        '[email-body.bg-regression] EmailMessageShell resolved to a non-transparent background:',
        bg,
        rootRef.current,
      );
    }

    const body = rootRef.current.querySelector<HTMLElement>('.email-html-body, iframe');
    if (body && body.scrollWidth > body.clientWidth + 1) {
      const bodyCs = getComputedStyle(body);
      const shellCs = getComputedStyle(rootRef.current);
      const overflowX = bodyCs.overflowX;
      const shellOverflowX = shellCs.overflowX;
      const isClipped = /^(hidden|clip)$/.test(overflowX) && /^(hidden|clip)$/.test(shellOverflowX);
      // eslint-disable-next-line no-console
      console.error('[email-body] horizontal clip detected', {
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        overflowX,
        shellOverflowX,
        clipped: isClipped,
        aiAssistOpen:
          typeof document !== 'undefined' &&
          !!document.querySelector('[data-inbox-surface-scope="assistant"]'),
        body,
        shell: rootRef.current,
      });
    }
  });

  return (
    <div
      ref={rootRef}
      data-email-root=""
      className={cn(
        'email-message-shell w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible flex-[1_1_0%]',
        // Transparent canvas — inherit the deal pop-up / modal dark surface
        // behind us so the email body never paints an inset card-on-card
        // block. A subtle border keeps stacked thread messages visually
        // separable without introducing a competing fill.
        'rounded-lg border border-border/40 bg-transparent text-inherit',
        'px-4 py-3 sm:px-5 sm:py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
