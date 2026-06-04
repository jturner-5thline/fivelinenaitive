import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ExternalLink, Plus } from 'lucide-react';
import { useAgendaFootnotes } from './useAgendaFootnotes';
import { getAllFootnoteRefs, getOrderedFootnoteIds } from './FootnoteRefMark';
import type { AgendaFootnote, FootnoteType } from './types';
import { useInsertAgendaFootnote } from './useInsertAgendaFootnote';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  editor: Editor | null;
  companyId: string | null | undefined;
  periodType: 'month' | 'quarter';
  periodKey: string;
}

const TYPE_LABEL: Record<string, string> = {
  decision: 'Decision',
  note: 'Note',
  action_item: 'Action Item',
};

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

/**
 * Renders the canonical Footnotes section below the Agenda editor for the
 * active reporting period. Numbering is derived from the editor doc order;
 * footnotes with no body refs are appended after, ordered by creation.
 */
export function AgendaFootnotesSection({ editor, companyId, periodType, periodKey }: Props) {
  const { footnotes, byId, archiveFootnote } = useAgendaFootnotes({ companyId, periodType, periodKey });
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [authors, setAuthors] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [composer, setComposer] = useState<{ type: FootnoteType; text: string; insertBody: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const insertFootnote = useInsertAgendaFootnote();

  // Recompute ordering whenever the editor doc changes.
  useEffect(() => {
    if (!editor) { setOrderedIds([]); return; }
    const recompute = () => setOrderedIds(getOrderedFootnoteIds(editor.state.doc));
    recompute();
    editor.on('update', recompute);
    editor.on('selectionUpdate', recompute);
    return () => {
      editor.off('update', recompute);
      editor.off('selectionUpdate', recompute);
    };
  }, [editor]);

  // Hydrate author profile names lazily.
  useEffect(() => {
    const missing = Array.from(new Set(footnotes.map((f) => f.created_by).filter((id) => !authors[id])));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', missing);
      if (!data) return;
      const next: typeof authors = { ...authors };
      for (const p of data as any[]) {
        next[p.user_id] = { display_name: p.display_name ?? null, email: p.email ?? null };
      }
      setAuthors(next);
    })();
  }, [footnotes, authors]);

  const ordered = useMemo(() => {
    const list: AgendaFootnote[] = [];
    const seen = new Set<string>();
    for (const id of orderedIds) {
      const f = byId[id];
      if (f) { list.push(f); seen.add(id); }
    }
    for (const f of footnotes) {
      if (!seen.has(f.id)) list.push(f);
    }
    return list;
  }, [orderedIds, byId, footnotes]);

  // Clean up orphaned footnotes (no body ref + was placed as 'marker' or
  // 'freetext'): we do NOT auto-archive — the user explicitly chose footnote-only
  // or removed the ref, and we surface a tiny prompt instead.

  // Apply numbering as a CSS custom property on each <sup> for visible display.
  useEffect(() => {
    if (!editor) return;
    const refs = getAllFootnoteRefs(editor.state.doc);
    const numberFor: Record<string, number> = {};
    let n = 0;
    for (const r of refs) {
      if (!(r.footnoteId in numberFor)) {
        n += 1;
        numberFor[r.footnoteId] = n;
      }
    }
    const dom = editor.view.dom as HTMLElement;
    const sups = dom.querySelectorAll<HTMLElement>('sup.agenda-footnote-ref');
    sups.forEach((el) => {
      const fid = el.getAttribute('data-footnote-id');
      if (!fid) return;
      const num = numberFor[fid];
      if (num) {
        el.setAttribute('data-num', String(num));
      }
    });
  }, [editor, orderedIds, ordered.length]);

  if (!companyId) return null;

  const startCompose = (type: FootnoteType) => {
    setComposer({ type, text: '', insertBody: true });
  };

  const submitCompose = async () => {
    if (!composer || !composer.text.trim() || busy) return;
    setBusy(true);
    try {
      await insertFootnote(
        {
          footnoteType: composer.type,
          sourceType: 'manual',
          sourceId: null,
          sourceAnchor: `manual::${Date.now()}`,
          snapshotText: composer.text.trim(),
        },
        composer.insertBody ? 'marker' : 'footnote_only',
      );
      setComposer(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Agenda footnotes"
      style={{
        marginTop: 24,
        padding: '16px 40px 24px',
        borderTop: '1px solid rgba(80,140,255,0.18)',
        color: 'rgba(200,225,255,0.75)',
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <style>{`
        .agenda-prose sup.agenda-footnote-ref::after {
          content: '[' attr(data-num) ']';
          color: #7ed0ff;
          font-weight: 600;
          cursor: pointer;
          padding: 0 1px;
        }
        .agenda-prose sup.agenda-footnote-ref { font-size: 0.75em; }
        .agenda-footnotes-row { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px 12px; padding: 6px 0; border-bottom: 1px dashed rgba(80,140,255,0.10); }
        .agenda-footnotes-row:last-child { border-bottom: none; }
        .agenda-footnotes-num { color: #7ed0ff; font-weight: 600; }
        .agenda-footnotes-type { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(200,225,255,0.5); margin-right: 6px; }
        .agenda-footnotes-meta { font-size: 11px; color: rgba(200,225,255,0.5); margin-top: 2px; }
        .agenda-footnotes-updated-dot { display: inline-block; width: 6px; height: 6px; border-radius: 999px; background: #ffb347; margin-left: 6px; vertical-align: middle; }
        .agenda-footnotes-link { color: rgba(200,225,255,0.6); display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
        .agenda-footnotes-link:hover { color: #7ed0ff; }
      `}</style>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 8, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(200,225,255,0.55)' }}>
          Footnotes {ordered.length > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>· {ordered.length}</span>}
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {(['decision', 'note', 'action_item'] as FootnoteType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => startCompose(t)}
              title={`Add ${TYPE_LABEL[t]}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, padding: '3px 9px', borderRadius: 999,
                border: '0.5px solid rgba(80,140,255,0.28)',
                background: 'rgba(16,28,52,0.55)', color: 'rgba(200,225,255,0.85)',
                cursor: 'pointer',
              }}
            >
              <Plus size={11} /> {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      {composer && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 8,
          border: '0.5px solid rgba(80,140,255,0.22)', background: 'rgba(16,28,52,0.4)',
        }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(200,225,255,0.6)', marginBottom: 6 }}>
            New {TYPE_LABEL[composer.type]}
          </div>
          <textarea
            autoFocus
            value={composer.text}
            onChange={(e) => setComposer({ ...composer, text: e.target.value })}
            placeholder={`Describe this ${TYPE_LABEL[composer.type].toLowerCase()}…`}
            rows={2}
            style={{
              width: '100%', resize: 'vertical', minHeight: 48,
              padding: 8, fontSize: 13, lineHeight: 1.45,
              borderRadius: 6, border: '0.5px solid rgba(80,140,255,0.22)',
              background: 'rgba(10,20,40,0.6)', color: 'rgba(230,240,255,0.92)',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitCompose(); }
              if (e.key === 'Escape') { e.preventDefault(); setComposer(null); }
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(200,225,255,0.7)' }}>
              <input
                type="checkbox"
                checked={composer.insertBody}
                onChange={(e) => setComposer({ ...composer, insertBody: e.target.checked })}
              />
              Also insert reference in Agenda body at cursor
            </label>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setComposer(null)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  border: '0.5px solid rgba(80,140,255,0.2)',
                  background: 'transparent', color: 'rgba(200,225,255,0.7)', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={() => void submitCompose()}
                disabled={busy || !composer.text.trim()}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 6,
                  border: '0.5px solid rgba(80,140,255,0.4)',
                  background: 'linear-gradient(180deg,#9bdcff,#4db8ff)',
                  color: '#0a2540', fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer', opacity: composer.text.trim() ? 1 : 0.5,
                }}
              >Add</button>
            </div>
          </div>
        </div>
      )}
      {ordered.length === 0 && !composer && (
        <div style={{ fontSize: 11.5, color: 'rgba(200,225,255,0.5)', padding: '4px 0' }}>
          No decisions, notes, or action items yet for {periodKey}. Add one above, or right-click a Decision / Note / Action Item from a meeting to drop it here.
        </div>
      )}
      {ordered.map((fn, idx) => {
        const num = idx + 1;
        const author = authors[fn.created_by];
        const authorName = author?.display_name || author?.email || 'Unknown';
        const sourceUpdated =
          fn.source_current_text != null &&
          fn.source_current_text !== fn.source_snapshot_text;
        return (
          <div
            key={fn.id}
            id={`agenda-footnote-${fn.id}`}
            className="agenda-footnotes-row"
          >
            <div className="agenda-footnotes-num">[{num}]</div>
            <div>
              <span className="agenda-footnotes-type">{TYPE_LABEL[fn.footnote_type] ?? fn.footnote_type}</span>
              <span>{fn.source_snapshot_text}</span>
              {sourceUpdated && (
                <span
                  className="agenda-footnotes-updated-dot"
                  title="Source updated since this footnote was created"
                />
              )}
              <div className="agenda-footnotes-meta">
                via {fn.source_type === 'comment'
                  ? `comment · ${fn.source_anchor || 'Agenda'}`
                  : fn.source_type.replace(/_/g, ' ')}
                {' · '}{authorName} · {formatTs(fn.created_at)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {fn.link_url && (
                <a
                  className="agenda-footnotes-link"
                  href={fn.link_url}
                  target={fn.link_url.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  title="Open source"
                >
                  <ExternalLink size={11} /> source
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!confirm('Remove this footnote from the Agenda? Body references will be left intact.')) return;
                  void archiveFootnote(fn.id);
                }}
                title="Remove footnote"
                style={{
                  fontSize: 11, color: 'rgba(200,225,255,0.4)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                remove
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}