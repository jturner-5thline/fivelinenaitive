import React from 'react';
import { useNavigate } from 'react-router-dom';

export type EntityType = 'deal' | 'contact' | 'company' | 'funding_source';

/**
 * Map an entity:// URI type to an in-app route prefix. Returns null when the
 * type has no known route (we then render the label as plain text).
 */
export function entityRouteFor(type: string, id: string): string | null {
  switch (type) {
    case 'deal':           return `/deals/${id}`;
    case 'contact':        return `/contacts/${id}`;
    case 'company':        return `/crm-companies/${id}`;
    case 'funding_source': return `/lenders/${encodeURIComponent(id)}/history`;
    default:               return null;
  }
}

/** Parse `entity://<type>/<id>` URIs. */
export function parseEntityUri(uri: string): { type: string; id: string } | null {
  const m = /^entity:\/\/([a-z_]+)\/([^/?#\s]+)$/i.exec(uri.trim());
  if (!m) return null;
  return { type: m[1].toLowerCase(), id: m[2] };
}

interface EntityLinkProps {
  type: string;
  id: string;
  children: React.ReactNode;
}

/**
 * Unified clickable entity reference used by every AI-rendered surface
 * (chat bubbles, approval cards, workspace cards, toasts). Navigates in-app
 * without a page reload so chat state is preserved.
 */
export function EntityLink({ type, id, children }: EntityLinkProps) {
  const navigate = useNavigate();
  const href = entityRouteFor(type, id);
  if (!href) return <strong>{children}</strong>;
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(href);
      }}
      style={{
        color: 'hsl(var(--primary))',
        textDecoration: 'none',
        cursor: 'pointer',
        fontWeight: 600,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
    >
      {children}
    </a>
  );
}

/**
 * Inline parser: walks a plain string and converts `[Name](entity://type/id)`
 * occurrences into <EntityLink> nodes. Surrounding text is preserved as
 * plain strings. Use this anywhere we render AI text outside of the
 * full ReactMarkdown pipeline (approval card titles, toasts, workspace
 * card headers, etc).
 */
export function renderTextWithEntityLinks(text: string): React.ReactNode[] {
  if (!text) return [text];
  const re = /\[([^\]]+)\]\(entity:\/\/([a-z_]+)\/([^)\s]+)\)/gi;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <EntityLink key={`el-${key++}`} type={m[2].toLowerCase()} id={m[3]}>
        {m[1]}
      </EntityLink>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}