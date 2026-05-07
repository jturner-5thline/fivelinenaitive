import React from 'react';
import { useQirSectionNote } from '@/hooks/useQirComments';

const TEXT_PRIMARY = '#dde8f8';

function ProminentSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 8,
        marginBottom: 18,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 3,
            height: 22,
            borderRadius: 2,
            background: 'hsl(var(--primary))',
            flexShrink: 0,
          }}
        />
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: TEXT_PRIMARY,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {children}
        </h2>
      </div>
    </div>
  );
}

function CommentaryBlock({
  reportKey,
  sectionKey,
  placeholder,
}: {
  reportKey: string;
  sectionKey: string;
  placeholder: string;
}) {
  const { body, save, loaded } = useQirSectionNote(reportKey, sectionKey);
  const [local, setLocal] = React.useState('');
  const dirtyRef = React.useRef(false);
  React.useEffect(() => {
    if (!loaded) return;
    if (!dirtyRef.current) setLocal(body);
  }, [body, loaded]);

  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = (v: string) => {
    setLocal(v);
    dirtyRef.current = true;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      void save(v);
      dirtyRef.current = false;
    }, 500);
  };

  return (
    <textarea
      value={local}
      onChange={(e) => onChange(e.target.value)}
      rows={5}
      maxLength={8000}
      placeholder={placeholder}
      style={{
        width: '100%',
        resize: 'vertical',
        minHeight: 110,
        background: 'rgba(10,18,36,0.45)',
        color: TEXT_PRIMARY,
        border: '1px solid rgba(120,170,255,0.18)',
        borderRadius: 8,
        padding: '12px 14px',
        outline: 'none',
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: 'inherit',
      }}
    />
  );
}

/**
 * "What's Working..." and "What's not Working..." report sections.
 * Renders the same prominent section heading used for Narrative / Goals /
 * Initiatives / Open Risks, with a persistent multiline commentary box per
 * section. Each consumer (tab) passes a unique `reportKey` so the two tabs
 * never share content.
 */
function WhatWorkingSections({ reportKey }: { reportKey: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 24 }}>
      <section>
        <ProminentSectionTitle>What's Working...</ProminentSectionTitle>
        <CommentaryBlock
          reportKey={reportKey}
          sectionKey="whats-working"
          placeholder="What's driving results this period?"
        />
      </section>
      <section>
        <ProminentSectionTitle>What's not Working...</ProminentSectionTitle>
        <CommentaryBlock
          reportKey={reportKey}
          sectionKey="whats-not-working"
          placeholder="Where are we falling short or hitting friction?"
        />
      </section>
    </div>
  );
}

export { WhatWorkingSections };
export default WhatWorkingSections;
