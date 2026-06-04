import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';
import { useAgendaFootnotes } from './useAgendaFootnotes';
import { getAllFootnoteRefs, getOrderedFootnoteIds } from './FootnoteRefMark';
import type { AgendaFootnote } from './types';
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
  if (ordered.length === 0) return null;

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
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(200,225,255,0.55)', marginBottom: 8 }}>
        Footnotes
      </div>
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
                via {fn.source_type.replace(/_/g, ' ')} · {authorName} · {formatTs(fn.created_at)}
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