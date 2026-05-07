import React from 'react';
import { useQirSectionNote } from '@/hooks/useQirComments';

const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(200,225,255,0.55)';

function ProminentSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 0,
        marginBottom: 14,
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
  helper,
}: {
  reportKey: string;
  sectionKey: string;
  placeholder: string;
  helper?: string;
}) {
  const { body, save, loaded } = useQirSectionNote(reportKey, sectionKey);
  const [local, setLocal] = React.useState('');
  const dirtyRef = React.useRef(false);
  const [savedFlash, setSavedFlash] = React.useState(false);
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
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    }, 500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={local}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        maxLength={8000}
        placeholder={placeholder}
        style={{
          width: '100%',
          resize: 'vertical',
          minHeight: 160,
          background: 'rgba(10,18,36,0.45)',
          color: TEXT_PRIMARY,
          border: '1px solid rgba(120,170,255,0.18)',
          borderRadius: 10,
          padding: '14px 16px',
          outline: 'none',
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.4 }}>
          {helper || 'Auto-saves as you type. Visible to everyone with access to this report.'}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: savedFlash ? 'hsl(var(--success, 142 70% 45%))' : 'transparent',
            transition: 'color .25s',
            whiteSpace: 'nowrap',
          }}
        >
          Saved
        </span>
      </div>
    </div>
  );
}

/**
 * "What's Working..." and "What's not Working..." report sections.
 * Each section is rendered as a first-class report card matching the
 * surrounding sections (Narrative, Goals, Initiatives, Open Risks).
 */
function WhatWorkingSections({ reportKey }: { reportKey: string }) {
  const cardStyle: React.CSSProperties = {
    background: 'rgba(16,28,52,0.35)',
    border: '1px solid rgba(120,170,255,0.14)',
    borderRadius: 14,
    padding: '20px 22px',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 8 }}>
      <section style={cardStyle}>
        <ProminentSectionTitle>What's Working...</ProminentSectionTitle>
        <CommentaryBlock
          reportKey={reportKey}
          sectionKey="whats-working"
          placeholder="What's driving results this period? Wins, momentum, levers worth doubling down on…"
          helper="Capture the wins, tailwinds, and bright spots for this period."
        />
      </section>
      <section style={cardStyle}>
        <ProminentSectionTitle>What's not Working...</ProminentSectionTitle>
        <CommentaryBlock
          reportKey={reportKey}
          sectionKey="whats-not-working"
          placeholder="Where are we falling short, hitting friction, or losing time?"
          helper="Be candid — surface the blockers, misses, and risks worth raising."
        />
      </section>
    </div>
  );
}

export { WhatWorkingSections };
export default WhatWorkingSections;
