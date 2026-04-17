import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface Props {
  html?: string;
  text?: string;
  className?: string;
}

/**
 * Renders an email body, preferring sanitized HTML when available and
 * falling back to plain text. Designed to live inside a scrollable parent
 * — never adds its own height clipping.
 *
 * HTML is sanitized with DOMPurify (no scripts, no event handlers, no
 * iframes) and links are forced to open in a new tab.
 */
export function EmailBodyRenderer({ html, text, className }: Props) {
  const sanitized = useMemo(() => {
    if (!html) return null;
    const clean = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
      ADD_ATTR: ['target', 'rel'],
    });
    // Force every <a> to open in a new tab safely
    return clean.replace(/<a /gi, '<a target="_blank" rel="noopener noreferrer" ');
  }, [html]);

  if (sanitized) {
    return (
      <div
        className={cn(
          'email-html-body text-[14px] leading-[1.7] text-[hsl(var(--email-text-primary))] max-w-full',
          // Tighten up common HTML email patterns so they fit the panel
          '[&_*]:max-w-full [&_img]:h-auto [&_img]:rounded',
          '[&_table]:max-w-full [&_table]:!w-full [&_table]:border-collapse',
          '[&_p]:mb-3 [&_p:last-child]:mb-0',
          '[&_a]:text-[hsl(var(--outlook-blue))] [&_a]:underline [&_a]:underline-offset-2',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-[hsl(var(--outlook-blue)/0.35)] [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-[hsl(var(--email-text-secondary))]',
          '[&_pre]:whitespace-pre-wrap [&_pre]:bg-muted/30 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs',
          '[&_code]:bg-muted/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
          'break-words',
          className,
        )}
        // The HTML is sanitized; this is the only place we render email HTML.
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <div
      className={cn(
        'text-[14px] leading-[1.7] text-[hsl(var(--email-text-primary))] max-w-full break-words',
        className,
      )}
      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
    >
      {text || ''}
    </div>
  );
}
