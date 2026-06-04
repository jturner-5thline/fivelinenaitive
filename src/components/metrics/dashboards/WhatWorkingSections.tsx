import React from 'react';
import { Pencil } from 'lucide-react';
import { useQirSectionNote } from '@/hooks/useQirComments';

const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(200,225,255,0.55)';

function DocHeading({ children, onEdit, editing }: { children: React.ReactNode; onEdit?: () => void; editing?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: TEXT_PRIMARY, margin: 0, lineHeight: 1.2 }}>
        {children}
      </h2>
      {onEdit && !editing && (
        <button
          type="button"
          onClick={onEdit}
          className="qir-ww-edit-trigger"
          aria-label="Edit section"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
            color: TEXT_MUTED, background: 'transparent', border: 0, cursor: 'pointer',
            padding: '4px 6px', borderRadius: 6,
          }}
        >
          <Pencil size={11} /> Edit
        </button>
      )}
    </div>
  );
}

function CommentaryBlock({
  reportKey,
  sectionKey,
  placeholder,
  helper,
  heading,
}: {
  reportKey: string;
  sectionKey: string;
  placeholder: string;
  helper?: string;
  heading: React.ReactNode;
}) {
  const { body, save, loaded } = useQirSectionNote(reportKey, sectionKey);
  const [local, setLocal] = React.useState('');
  const [editing, setEditing] = React.useState(false);
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

  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      try { taRef.current.setSelectionRange(len, len); } catch {}
    }
  }, [editing]);

  const hasContent = !!(local && local.trim());

  return (
    <div className="qir-ww-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <DocHeading onEdit={() => setEditing(true)} editing={editing}>{heading}</DocHeading>
      {editing ? (
        <>
          <textarea
            ref={taRef}
            value={local}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
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
              fontSize: 14,
              lineHeight: 1.65,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.4 }}>
              {helper || 'Auto-saves as you type. Visible to everyone with access to this report.'}
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: savedFlash ? 'hsl(var(--success, 142 70% 45%))' : 'transparent',
                transition: 'color .25s', whiteSpace: 'nowrap',
              }}
            >
              Saved
            </span>
          </div>
        </>
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onFocus={() => setEditing(true)}
          style={{
            minHeight: 64,
            color: hasContent ? TEXT_PRIMARY : TEXT_MUTED,
            fontStyle: hasContent ? 'normal' : 'italic',
            fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            cursor: 'text', padding: '4px 0',
          }}
        >
          {hasContent ? local : placeholder}
        </div>
      )}
    </div>
  );
}

/**
 * "What's Working..." and "What's not Working..." report sections.
 * Each section is rendered as a first-class report card matching the
 * surrounding sections (Narrative, Goals, Initiatives, Open Risks).
 */
function WhatWorkingSections({ reportKey }: { reportKey: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 8 }}>
      <section className="qir-ww-section">
        <CommentaryBlock
          heading="What's Working"
          reportKey={reportKey}
          sectionKey="whats-working"
          placeholder="What's driving results this period? Wins, momentum, levers worth doubling down on…"
          helper="Capture the wins, tailwinds, and bright spots for this period."
        />
      </section>
      <section className="qir-ww-section" style={{ borderTop: '1px solid rgba(120,170,255,0.10)', paddingTop: 24 }}>
        <CommentaryBlock
          heading="What's not Working"
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
