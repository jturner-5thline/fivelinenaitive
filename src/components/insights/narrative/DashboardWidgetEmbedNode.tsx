import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X as XIcon } from 'lucide-react';
import { getDashboardWidget } from '@/components/metrics/dashboards/qir/dashboardWidgetRegistry';

/**
 * Tiptap block node that embeds a full dashboard widget (chart / KPI card /
 * table) exactly as it renders on its source dashboard. Widget identity is
 * snapshotted into the `widgetId` attr and looked up in the registry at
 * render time so the embed pulls its own live data.
 */
function DashboardWidgetEmbedView({ node, deleteNode, editor }: NodeViewProps) {
  const widgetId = (node.attrs as { widgetId?: string }).widgetId;
  const width = (node.attrs as { width?: 'half' | 'full' }).width ?? 'full';
  const entry = widgetId ? getDashboardWidget(widgetId) : undefined;
  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper
      data-dashboard-widget-embed=""
      data-widget-id={widgetId ?? ''}
      data-width={width}
      style={{
        display: 'block',
        width: '100%',
        margin: '10px 0',
        borderRadius: 12,
        border: '1px solid rgba(160,200,255,0.15)',
        background: 'rgba(10,16,26,0.35)',
        padding: 12,
        position: 'relative',
      }}
    >
      {isEditable && (
        <button
          type="button"
          contentEditable={false}
          aria-label="Remove widget"
          onClick={() => deleteNode()}
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 2,
            background: 'rgba(20,28,42,0.85)', border: '1px solid rgba(160,200,255,0.25)',
            borderRadius: 6, padding: 4, color: 'rgba(200,220,255,0.75)',
            cursor: 'pointer', display: 'inline-flex',
          }}
        >
          <XIcon size={12} />
        </button>
      )}
      <div contentEditable={false} style={{ width: '100%' }}>
        {entry ? entry.render() : (
          <div style={{ padding: 24, textAlign: 'center', color: 'rgba(200,220,255,0.55)', fontSize: 12 }}>
            Widget “{widgetId}” is no longer available.
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const DashboardWidgetEmbedNode = Node.create({
  name: 'dashboardWidgetEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      widgetId: {
        default: null,
        parseHTML: element => element.getAttribute('data-widget-id'),
        renderHTML: attributes => attributes.widgetId ? { 'data-widget-id': attributes.widgetId } : {},
      },
      width: {
        default: 'full',
        parseHTML: element => (element.getAttribute('data-width') as 'half' | 'full') ?? 'full',
        renderHTML: attributes => ({ 'data-width': attributes.width ?? 'full' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-dashboard-widget-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-dashboard-widget-embed': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DashboardWidgetEmbedView);
  },
});

export interface DashboardWidgetEmbedAttrs {
  widgetId: string;
  width?: 'half' | 'full';
}