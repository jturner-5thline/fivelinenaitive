import React, { useState } from 'react';
import { Pencil, Check as CheckIcon, ChevronDown } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────
   Document primitives for the Insights JT/JM/SW reports.
   These keep the page reading like one continuous, authored document
   instead of a stack of operational widgets — borderless typographic
   sections, quiet metadata rows, hover-only edit affordances, and
   collapsible "source data" disclosures that hide sync/sort/group chrome
   until the reader explicitly asks for it.
   ───────────────────────────────────────────────────────────────────── */

const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';

export function DocSection({
  id,
  title,
  meta,
  actions,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="qir-doc-section">
      <header className="qir-doc-section-header">
        <div className="qir-doc-section-heading">
          <h2 className="qir-doc-section-title">{title}</h2>
          {meta && <div className="qir-doc-section-meta">{meta}</div>}
        </div>
        {actions && <div className="qir-doc-section-actions">{actions}</div>}
      </header>
      <div className="qir-doc-section-body">{children}</div>
    </section>
  );
}

export function DocMetaRow({ items }: { items: Array<React.ReactNode | null | undefined> }) {
  const visible = items.filter(Boolean);
  return (
    <div className="qir-doc-meta-row">
      {visible.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span aria-hidden className="qir-doc-meta-sep">·</span>}
          <span>{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Quiet "View source data" disclosure. Wraps any of the existing
 * operational tables/toolbars/sync controls and demotes them behind a
 * single-line summary trigger so the main reading column stays clean.
 */
export function SourceDataDisclosure({
  label = 'View source data',
  defaultOpen = false,
  children,
}: {
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`qir-doc-source ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="qir-doc-source-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <ChevronDown size={12} className={open ? 'qir-doc-source-chev open' : 'qir-doc-source-chev'} />
        <span>{open ? `Hide source data` : label}</span>
      </button>
      {open && <div className="qir-doc-source-body">{children}</div>}
    </div>
  );
}

/**
 * Inline read-first editable field. Renders the read state by default and
 * swaps to the edit slot on click / pencil press. Commits on blur, Enter,
 * or the ✓ button; restores on Escape. Used for header metadata so Date
 * Prepared / Prepared By stop looking like form fields in the resting
 * report.
 */
export function InlineEditable({
  value,
  onCommit,
  render,
  renderEditor,
  label,
}: {
  value: string;
  onCommit: (next: string) => void;
  render: (value: string) => React.ReactNode;
  renderEditor: (args: {
    value: string;
    setValue: (v: string) => void;
    commit: () => void;
    cancel: () => void;
  }) => React.ReactNode;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const start = () => { setDraft(value); setEditing(true); };
  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <span className="qir-doc-inline-edit" onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      }}>
        {renderEditor({ value: draft, setValue: setDraft, commit, cancel })}
        <button type="button" className="qir-doc-inline-confirm" aria-label="Save" onClick={commit}>
          <CheckIcon size={12} />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="qir-doc-inline-read"
      onClick={start}
      aria-label={label ? `Edit ${label}` : 'Edit'}
      title={label ? `Edit ${label}` : 'Edit'}
    >
      <span>{render(value)}</span>
      <Pencil size={11} className="qir-doc-inline-pencil" />
    </button>
  );
}

/** Inject the shared document stylesheet exactly once. */
export function DocStylesOnce() {
  React.useEffect(() => {
    const id = 'qir-doc-primitives-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.innerHTML = `
      /* Document-style report sections — borderless, typographic, calm */
      .qir-doc-section { padding: 28px 4px 4px; }
      .qir-doc-section + .qir-doc-section { border-top: 1px solid rgba(120,170,255,0.10); margin-top: 12px; }
      .qir-doc-section-header {
        display: flex; align-items: flex-end; justify-content: space-between;
        gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
      }
      .qir-doc-section-heading { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .qir-doc-section-title {
        font-size: 20px; font-weight: 700; letter-spacing: -0.01em;
        color: ${TEXT_PRIMARY}; margin: 0; line-height: 1.2;
      }
      .qir-doc-section-meta { font-size: 12px; color: ${TEXT_MUTED}; }
      .qir-doc-section-actions {
        display: inline-flex; gap: 8px; align-items: center; opacity: 0;
        transition: opacity .15s;
      }
      .qir-doc-section:hover .qir-doc-section-actions,
      .qir-doc-section:focus-within .qir-doc-section-actions { opacity: 1; }
      .qir-doc-section-body { color: ${TEXT_PRIMARY}; }

      .qir-doc-meta-row {
        display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
        font-size: 12px; color: ${TEXT_MUTED};
      }
      .qir-doc-meta-sep { color: ${TEXT_LABEL}; }

      .qir-doc-source { margin-top: 18px; }
      .qir-doc-source-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11px; font-weight: 600; letter-spacing: .04em;
        color: ${TEXT_LABEL}; background: transparent; border: 0; cursor: pointer;
        padding: 4px 0; text-transform: uppercase;
      }
      .qir-doc-source-toggle:hover { color: ${TEXT_PRIMARY}; }
      .qir-doc-source-chev { transition: transform .15s; }
      .qir-doc-source-chev.open { transform: rotate(180deg); }
      .qir-doc-source-body {
        margin-top: 10px; padding: 14px 16px;
        border-radius: 10px;
        background: rgba(10,18,36,0.35);
        border: 1px solid rgba(120,170,255,0.10);
      }

      .qir-doc-inline-read {
        display: inline-flex; align-items: center; gap: 6px;
        background: transparent; border: 0; padding: 0;
        color: inherit; font: inherit; cursor: pointer;
        border-bottom: 1px dashed transparent;
      }
      .qir-doc-inline-read:hover { border-bottom-color: rgba(120,170,255,0.35); }
      .qir-doc-inline-pencil { opacity: 0; color: ${TEXT_LABEL}; transition: opacity .12s; }
      .qir-doc-inline-read:hover .qir-doc-inline-pencil,
      .qir-doc-inline-read:focus-visible .qir-doc-inline-pencil { opacity: 1; }
      .qir-doc-inline-edit { display: inline-flex; align-items: center; gap: 4px; }
      .qir-doc-inline-confirm {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 6px;
        background: rgba(40,120,200,0.25); color: #cfe6ff;
        border: 1px solid rgba(80,150,220,0.3); cursor: pointer;
      }

      /* Read-first prose blocks (Risks, What's Working, etc.) */
      .qir-doc-prose {
        font-size: 13.5px; line-height: 1.65; color: ${TEXT_PRIMARY};
        white-space: pre-wrap;
      }
      .qir-doc-prose-muted { color: ${TEXT_MUTED}; font-style: italic; }
      .qir-doc-edit-trigger {
        position: absolute; top: 4px; right: 4px;
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 10px; font-weight: 600; letter-spacing: .04em;
        text-transform: uppercase; color: ${TEXT_LABEL};
        background: transparent; border: 0; cursor: pointer;
        opacity: 0; transition: opacity .15s;
        padding: 4px 6px; border-radius: 6px;
      }
      .qir-doc-editable-block:hover .qir-doc-edit-trigger,
      .qir-doc-editable-block:focus-within .qir-doc-edit-trigger { opacity: 1; }
      .qir-doc-editable-block { position: relative; }

      .qir-doc-risk { padding: 14px 0; border-bottom: 1px solid rgba(120,170,255,0.08); }
      .qir-doc-risk:last-child { border-bottom: 0; }
      .qir-doc-risk-statement { font-size: 14px; font-weight: 600; color: ${TEXT_PRIMARY}; line-height: 1.45; }
      .qir-doc-risk-mitigation { margin-top: 6px; font-size: 13px; color: ${TEXT_MUTED}; line-height: 1.55; }
      .qir-doc-risk-mitigation > strong { color: ${TEXT_PRIMARY}; font-weight: 600; margin-right: 4px; }
      .qir-doc-risk-actions {
        margin-top: 8px; display: inline-flex; gap: 12px;
        opacity: 0; transition: opacity .15s;
      }
      .qir-doc-risk:hover .qir-doc-risk-actions,
      .qir-doc-risk:focus-within .qir-doc-risk-actions { opacity: 1; }
      .qir-doc-risk-link {
        background: transparent; border: 0; padding: 0; cursor: pointer;
        font-size: 11px; color: ${TEXT_LABEL};
        text-transform: uppercase; letter-spacing: .04em;
      }
      .qir-doc-risk-link:hover { color: ${TEXT_PRIMARY}; }
      .qir-doc-risk-link-danger:hover { color: #f08585; }

      .qir-doc-add-link {
        margin-top: 14px;
        background: transparent; border: 1px dashed rgba(120,170,255,0.25);
        color: ${TEXT_MUTED}; cursor: pointer;
        font-size: 12px; padding: 8px 14px; border-radius: 8px;
      }
      .qir-doc-add-link:hover { color: ${TEXT_PRIMARY}; border-color: rgba(120,170,255,0.45); }

      /* Summary list used for default Goals / Initiatives presentation */
      .qir-doc-list { display: flex; flex-direction: column; gap: 2px; }
      .qir-doc-list-row {
        display: grid; grid-template-columns: 1fr auto auto; gap: 16px;
        align-items: baseline; padding: 8px 0;
        border-bottom: 1px solid rgba(120,170,255,0.06);
      }
      .qir-doc-list-row:last-child { border-bottom: 0; }
      .qir-doc-list-row a {
        color: ${TEXT_PRIMARY}; text-decoration: none; font-size: 13.5px;
        line-height: 1.45;
      }
      .qir-doc-list-row a:hover { color: #7cc8f0; }
      .qir-doc-list-owner { font-size: 12px; color: ${TEXT_MUTED}; }
      .qir-doc-list-empty { font-size: 12px; color: ${TEXT_MUTED}; padding: 12px 0; font-style: italic; }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
}