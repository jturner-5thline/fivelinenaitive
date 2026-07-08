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
  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = React.useRef<((v: string) => Promise<void>) | null>(null);
  const pendingValueRef = React.useRef<string | null>(null);
  // Keep latest save fn (captures latest reportKey) for use in flush logic.
  React.useEffect(() => { pendingSaveRef.current = save; }, [save]);

  // Flush any pending debounced save immediately, using the CURRENT save fn
  // (which is bound to the current reportKey). Safe to call any time.
  const flushPendingSave = React.useCallback(() => {
    if (tRef.current) {
      clearTimeout(tRef.current);
      tRef.current = null;
    }
    const pending = pendingValueRef.current;
    if (pending == null) return;
    pendingValueRef.current = null;
    dirtyRef.current = false;
    const fn = pendingSaveRef.current;
    if (fn) void fn(pending);
  }, []);

  // When the report period (reportKey) changes, flush any pending save against
  // the PREVIOUS key, then reset local state so the new period's notes hydrate
  // cleanly instead of inheriting the prior period's text.
  const prevKeyRef = React.useRef(reportKey);
  React.useEffect(() => {
    if (prevKeyRef.current === reportKey) return;
    // IMPORTANT: pendingSaveRef is bound to the CURRENT (new) reportKey by
    // the time this effect runs, so we can't safely flush the pending value
    // against the previous key. Drop the pending edit rather than write it
    // to the wrong period.
    if (tRef.current) { clearTimeout(tRef.current); tRef.current = null; }
    pendingValueRef.current = null;
    prevKeyRef.current = reportKey;
    dirtyRef.current = false;
    setLocal('');
    setEditing(false);
  }, [reportKey]);

  // Flush on unmount and when the tab is hidden (page refresh / close /
  // switching tabs). This is the safety net that prevents the "typed and
  // then refreshed too fast" data loss scenario.
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushPendingSave();
    };
    const onBeforeUnload = () => { flushPendingSave(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  React.useEffect(() => {
    if (!loaded) return;
    if (!dirtyRef.current) setLocal(body);
  }, [body, loaded]);

  const onChange = (v: string) => {
    setLocal(v);
    dirtyRef.current = true;
    pendingValueRef.current = v;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      const val = pendingValueRef.current;
      pendingValueRef.current = null;
      void save(v);
      dirtyRef.current = false;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
      // reference `val` so linters don't complain about unused capture
      void val;
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
function WhatWorkingSections({ reportKey, periodLabel }: { reportKey: string; periodLabel?: string }) {
  const suffix = periodLabel ? ` — ${periodLabel}` : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 8 }}>
      <section className="qir-ww-section">
        <CommentaryBlock
          heading={`What's Working${suffix}`}
          reportKey={reportKey}
          sectionKey="whats-working"
          placeholder={`What's driving results${periodLabel ? ` in ${periodLabel}` : ' this period'}? Wins, momentum, levers worth doubling down on…`}
          helper={`Scoped to ${periodLabel || 'this period'}. Save/Reset act on this period only.`}
        />
      </section>
      <section className="qir-ww-section" style={{ borderTop: '1px solid rgba(120,170,255,0.10)', paddingTop: 24 }}>
        <CommentaryBlock
          heading={`What's not Working${suffix}`}
          reportKey={reportKey}
          sectionKey="whats-not-working"
          placeholder={`Where are we falling short${periodLabel ? ` in ${periodLabel}` : ''}, hitting friction, or losing time?`}
          helper={`Scoped to ${periodLabel || 'this period'}. Surface blockers, misses, and risks worth raising.`}
        />
      </section>
    </div>
  );
}

export { WhatWorkingSections };
export default WhatWorkingSections;
