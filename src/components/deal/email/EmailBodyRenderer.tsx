import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface Props {
  html?: string;
  text?: string;
  className?: string;
}

/**
 * Strip color/background-related declarations from an inline `style` string.
 * Email HTML often hardcodes near-black text colors that become invisible on
 * our dark-mode reading surface. We keep layout-related declarations intact.
 */
const COLOR_PROP_RE = /(^|;)\s*(color|background|background-color|bgcolor)\s*:\s*[^;]+/gi;
function stripColorDeclarations(style: string): string {
  return style
    .replace(COLOR_PROP_RE, '$1')
    .replace(/^;+|;+$/g, '')
    .replace(/;{2,}/g, ';')
    .trim();
}

/**
 * Renders an email body, preferring sanitized HTML when available and
 * falling back to plain text. Designed to live inside a scrollable parent
 * — never adds its own height clipping.
 *
 * HTML is sanitized with DOMPurify (no scripts, no event handlers, no
 * iframes). Hardcoded colors/backgrounds from the source email are
 * neutralized so the body always inherits naitive's dark-mode tokens.
 * Links are forced to open in a new tab.
 */
export function EmailBodyRenderer({ html, text, className }: Props) {
  const sanitized = useMemo(() => {
    if (!html) return null;

    // Hook 1: neutralize hardcoded colors before serialization
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'style' && typeof data.attrValue === 'string') {
        const cleaned = stripColorDeclarations(data.attrValue);
        if (!cleaned) {
          data.keepAttr = false;
        } else {
          data.attrValue = cleaned;
        }
      }
      // Drop legacy presentational color attributes
      if (['color', 'bgcolor', 'background', 'text', 'link', 'vlink', 'alink'].includes(data.attrName)) {
        data.keepAttr = false;
      }
    });

    // Hook 2: strip <font color="..."> by removing color attr (handled above)
    // and force every <a> to open in a new tab safely
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // Remove any <style> children that might have slipped through
      if (node.tagName === 'STYLE') {
        node.parentNode?.removeChild(node);
      }
    });

    const clean = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link'],
      FORBID_ATTR: [
        'onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit',
        'class', // strip remote class hooks that might reference unknown stylesheets
      ],
      ADD_ATTR: ['target', 'rel'],
    });

    // Clean up our hooks so we don't leak across renders
    DOMPurify.removeAllHooks();

    return clean;
  }, [html]);

  if (sanitized) {
    return (
      <div
        className={cn(
          'email-html-body text-[14px] leading-[1.7] text-[hsl(var(--email-text-primary))] max-w-full',
          'break-words',
          className,
        )}
        // Sanitized + color-stripped above. CSS below enforces theme inheritance.
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
