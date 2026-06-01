import { memo, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import type { EmailAttachment } from './mockEmailData';
import { fetchAttachmentDataUrl } from './useFullEmailMessage';
import { BrandedEmailFrame, shouldRenderAsBranded } from './BrandedEmailFrame';
import { EmailMessageShell } from './EmailMessageShell';

interface Props {
  html?: string;
  text?: string;
  className?: string;
  /** Message ID, required to resolve `cid:` inline images via the mail provider. */
  messageId?: string;
  /** Inline attachments keyed by Content-ID. Used to swap `cid:` URLs into real ones. */
  inlineAttachments?: EmailAttachment[];
  /**
   * Visible (non-inline) attachments. Some providers carry a Content-ID on
   * regular attachments, so we also scan this list when resolving `cid:`
   * references in the HTML body. Without this, signature logos that the
   * provider classified as `attachment` instead of `inline` would show as
   * broken images.
   */
  attachments?: EmailAttachment[];
  /** Sender email — used to auto-detect notification/marketing senders
   *  (LinkedIn, HubSpot, newsletters, etc.) that should render with full
   *  fidelity inside a sandboxed iframe instead of the simplified renderer. */
  fromEmail?: string;
  /** Force the iframe (branded) renderer regardless of heuristics. */
  forceBranded?: boolean;
}

/**
 * Strip color/background-related declarations from an inline `style` string.
 * Email HTML often hardcodes near-black text colors that become invisible on
 * our dark-mode reading surface. We keep layout/dimensional declarations.
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
 * falling back to plain text. Designed to live inside a scrollable parent.
 *
 * Image handling:
 * - `cid:` references are resolved against `inlineAttachments` and lazily
 *   swapped to `data:` URLs fetched from the mail provider.
 * - Remote `https://` images are allowed and load directly.
 * - `data:` URI images pass through untouched.
 * - Failed images render an inline muted placeholder with their alt/filename
 *   instead of an empty bordered box.
 */
function EmailBodyRendererImpl({
  html,
  text,
  className,
  messageId,
  inlineAttachments,
  attachments,
  fromEmail,
  forceBranded,
}: Props) {
  // Branded/notification mode — render the original HTML inside a sandboxed
  // iframe so the email's own CSS, tables, images, CTAs and layout survive
  // (Outlook reading-pane style). If anything goes wrong we fall through to
  // the simplified renderer below so the user never sees a blank message.
  const [brandedFailed, setBrandedFailed] = useState(false);
  const useBranded = !!html && !brandedFailed && (forceBranded || shouldRenderAsBranded(html, fromEmail));

  // Resolved CID -> data URL map, populated as inline attachments are fetched.
  const [cidUrls, setCidUrls] = useState<Record<string, string>>({});

  // Lazily resolve every inline attachment that has a content_id, so that
  // `cid:image001.jpg@01D9...` references in the body can be rewritten.
  useEffect(() => {
    if (!messageId) return;
    // Merge inline + visible attachments — both buckets may contain parts
    // with a `content_id` that the body references via `cid:`.
    const candidates: EmailAttachment[] = [
      ...(inlineAttachments || []),
      ...(attachments || []),
    ];
    if (candidates.length === 0) return;
    let cancelled = false;
    const toFetch = candidates.filter(
      (a) => a.content_id && !cidUrls[a.content_id],
    );
    if (toFetch.length === 0) return;

    (async () => {
      const updates: Record<string, string> = {};
      // Fetch sequentially with a small cap to avoid hammering the function.
      for (const att of toFetch.slice(0, 12)) {
        const url = await fetchAttachmentDataUrl(messageId, att);
        if (url && att.content_id) updates[att.content_id] = url;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setCidUrls((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, inlineAttachments, attachments]);

  const sanitized = useMemo(() => {
    if (!html) return null;

    // Hook 1: neutralize hardcoded text colors AND rewrite cid: image refs.
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      // Neutralize inline color/background overrides on every element
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

      // Resolve cid: image references against the inline attachment map
      if (
        node.tagName === 'IMG' &&
        data.attrName === 'src' &&
        typeof data.attrValue === 'string' &&
        data.attrValue.toLowerCase().startsWith('cid:')
      ) {
        const cid = data.attrValue.slice(4).replace(/^<|>$/g, '');
        const resolved = cidUrls[cid];
        if (resolved) {
          data.attrValue = resolved;
        } else {
          // Mark unresolved CID images so we can show a graceful placeholder
          // instead of a broken empty box.
          (node as Element).setAttribute('data-cid-pending', cid);
          data.keepAttr = false;
        }
      }
    });

    // Hook 2: open links safely in new tab; flag images for fallback handling.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.tagName === 'IMG') {
        const img = node as HTMLImageElement;
        // Inline error fallback: replace the broken image with its alt text
        // (or filename hint) wrapped in a muted pill — never a blank box.
        const alt = img.getAttribute('alt') || img.getAttribute('title') || '';
        img.setAttribute(
          'onerror',
          "this.onerror=null;" +
          "var s=document.createElement('span');" +
          "s.className='email-img-fallback';" +
          "s.textContent=" + JSON.stringify(alt || 'image') + ";" +
          "this.replaceWith(s);"
        );
        // Preserve aspect ratio / sane sizing without nuking author dimensions.
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        // Mark unresolved-cid placeholders so CSS can render a tidy stub.
        if (img.getAttribute('data-cid-pending') && !img.getAttribute('src')) {
          img.setAttribute('alt', alt || 'Loading image…');
        }
      }
      if (node.tagName === 'STYLE') {
        node.parentNode?.removeChild(node);
      }
    });

    // Allow image-friendly attributes (incl. data: URIs and srcset) so
    // signature logos render correctly. Disallow only the dangerous bits.
    const clean = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link'],
      FORBID_ATTR: [
        'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit',
        'class', // strip remote class hooks that might reference unknown stylesheets
      ],
      ADD_ATTR: ['target', 'rel', 'srcset', 'sizes', 'loading', 'decoding', 'data-cid-pending'],
      // Allow data: and cid: schemes on images so base64 + inline refs survive.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    DOMPurify.removeAllHooks();

    return clean;
  }, [html, cidUrls]);

  if (useBranded && html) {
    return (
      <EmailMessageShell className={className}>
        <BrandedEmailFrame
          html={html}
          onError={() => setBrandedFailed(true)}
        />
      </EmailMessageShell>
    );
  }

  if (sanitized) {
    return (
      <EmailMessageShell className={className}>
        <div
          className={cn(
            'email-body email-html-body w-full min-w-0 max-w-full overflow-x-auto text-[14px] leading-[1.7] text-[hsl(var(--email-text-primary))]',
            'break-words bg-transparent',
          )}
          style={{ width: '100%', maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </EmailMessageShell>
    );
  }

  return (
    <EmailMessageShell className={className}>
      <div
        className={cn(
          'email-body w-full min-w-0 max-w-full overflow-x-auto text-[14px] leading-[1.7] text-[hsl(var(--email-text-primary))] break-words bg-transparent',
        )}
        style={{ width: '100%', maxWidth: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
      >
        {text || ''}
      </div>
    </EmailMessageShell>
  );
}

/**
 * Memoize so the (expensive) DOMPurify sanitize + iframe srcDoc rebuild only
 * runs when the message content itself changes. The thread view re-renders
 * frequently due to AI Assist sidebar state, hover, selection, composer
 * keystrokes — none of which should invalidate a rendered message body.
 */
export const EmailBodyRenderer = memo(EmailBodyRendererImpl, (prev, next) =>
  prev.html === next.html &&
  prev.text === next.text &&
  prev.messageId === next.messageId &&
  prev.fromEmail === next.fromEmail &&
  prev.forceBranded === next.forceBranded &&
  prev.className === next.className &&
  prev.inlineAttachments === next.inlineAttachments &&
  prev.attachments === next.attachments,
);
