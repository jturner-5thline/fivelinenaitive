import React from 'react';
import { AtSign } from 'lucide-react';

/**
 * Renders a comment body, highlighting @"Full Name" and @Token mentions
 * as styled pills. Used everywhere we display comment text so tagged users
 * are visually distinct.
 */
export function MentionText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  if (!text) return null;
  const parts: Array<{ kind: 'text' | 'mention'; value: string }> = [];
  // Match @"Full Name" or @Token (letters/numbers/._-, no spaces).
  const re = /@"([^"]+)"|@([A-Za-z][A-Za-z0-9_.\-]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    parts.push({ kind: 'mention', value: m[1] || m[2] || '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return (
    <span className={className} style={style}>
      {parts.map((p, i) => p.kind === 'text' ? (
        <React.Fragment key={i}>{p.value}</React.Fragment>
      ) : (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            padding: '0 5px', margin: '0 1px', borderRadius: 4,
            background: 'rgba(80,140,255,0.18)',
            color: 'rgba(200,225,255,0.98)',
            border: '1px solid rgba(120,170,255,0.32)',
            fontWeight: 600, fontSize: '0.92em',
            verticalAlign: 'baseline',
          }}
        >
          <AtSign size={9} style={{ opacity: 0.7 }} />{p.value}
        </span>
      ))}
    </span>
  );
}