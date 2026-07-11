import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X as XIcon } from 'lucide-react';

/**
 * Tiptap block node that renders a KPI/widget inline inside the narrative
 * editor. KPI metadata is snapshotted into node attrs at insert time so the
 * HTML round-trips through save/load without any external state.
 */

function formatValue(raw: string, format: string): string {
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return raw || '—';
  if (format === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  }
  if (format === 'percent') return `${n}%`;
  return n.toLocaleString();
}

function KpiEmbedView({ node, deleteNode, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || 'KPI';
  const format = (node.attrs.format as string) || 'number';
  const actual = String(node.attrs.actual ?? '0');
  const target = String(node.attrs.target ?? '');
  const canEdit = editor.isEditable;
  return (
    <NodeViewWrapper
      as="div"
      data-kpi-embed
      className="qir-kpi-embed"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 4,
        minWidth: 140,
        maxWidth: 200,
        padding: '12px 14px',
        margin: '6px 6px 6px 0',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(120,170,255,0.22)',
        verticalAlign: 'middle',
        position: 'relative',
      }}
      contentEditable={false}
    >
      {canEdit && (
        <button
          type="button"
          aria-label="Remove widget"
          onClick={(e) => { e.stopPropagation(); deleteNode(); }}
          style={{
            position: 'absolute', top: 4, right: 4,
            background: 'transparent', border: 'none',
            color: 'rgba(160,200,255,0.55)', cursor: 'pointer',
            padding: 2, display: 'inline-flex',
          }}
        >
          <XIcon size={11} />
        </button>
      )}
      <div style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'rgba(160,200,255,0.65)', maxWidth: '100%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: '#f4f8ff',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>{formatValue(actual, format)}</div>
      {target && (
        <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
          Target {formatValue(target, format)}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const KpiEmbedNode = Node.create({
  name: 'kpiEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: 'KPI' },
      format: { default: 'number' },
      actual: { default: '0' },
      target: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-kpi-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-kpi-embed': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KpiEmbedView);
  },
});

export interface KpiEmbedAttrs {
  id: string | null;
  label: string;
  format: string;
  actual: string;
  target: string;
}