import { useMemo } from 'react';
import { Copy, FileText, ListChecks, Mail, ClipboardCheck, CalendarPlus, StickyNote, Sparkles } from 'lucide-react';

export type WorkspaceItemType =
  | 'status_report'
  | 'follow_up_summary'
  | 'draft_email'
  | 'asana_task'
  | 'meeting'
  | 'deal_note';

export type WorkspaceItem = {
  id: string;
  type: WorkspaceItemType;
  title: string;
  dealId?: string;
  dealName?: string;
  createdAt: string;
  previewOnly?: boolean;
  body: string;
  sourceMessageId?: string;
};

const TYPE_META: Record<WorkspaceItemType, { label: string; Icon: typeof FileText }> = {
  status_report:    { label: 'Status Report',     Icon: FileText },
  follow_up_summary:{ label: 'Follow-up Summary', Icon: ListChecks },
  draft_email:      { label: 'Draft Email',       Icon: Mail },
  asana_task:       { label: 'Asana Task',        Icon: ClipboardCheck },
  meeting:          { label: 'Meeting',           Icon: CalendarPlus },
  deal_note:        { label: 'Deal Note',         Icon: StickyNote },
};

const QUICK_STARTS = [
  'Draft a status report for the active deal',
  'Summarize follow-up items across my deals',
  'Draft an email to the lender on the active deal',
  'Create a task for the active deal',
];

interface Props {
  items: WorkspaceItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onQuickStart?: (prompt: string) => void;
}

export function CopilotWorkspacePane({ items, activeId, onSelect, onQuickStart }: Props) {
  const active = useMemo(() => items.find((i) => i.id === activeId) ?? items[items.length - 1] ?? null, [items, activeId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'rgba(8,10,16,0.55)' }}>
      {/* Recent strip */}
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', overflowX: 'auto', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>
            Recent
          </span>
          {items.slice().reverse().map((it) => {
            const isActive = (active?.id ?? null) === it.id;
            const Meta = TYPE_META[it.type];
            return (
              <button
                key={it.id}
                onClick={() => onSelect(it.id)}
                title={it.title}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 999, fontSize: 11,
                  background: isActive ? 'rgba(126,184,247,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'rgba(126,184,247,0.5)' : 'var(--glass-border)'}`,
                  color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <Meta.Icon size={11} />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {!active ? (
          <EmptyState onQuickStart={onQuickStart} />
        ) : (
          <PreviewCard item={active} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onQuickStart }: { onQuickStart?: (prompt: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 12, color: 'hsl(var(--muted-foreground))' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(126,184,247,0.12)', border: '1px solid rgba(126,184,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--primary))' }}>
        <Sparkles size={20} />
      </div>
      <div style={{ fontSize: 14, color: 'var(--foreground)', fontWeight: 500 }}>Workspace</div>
      <div style={{ fontSize: 12, maxWidth: 280 }}>
        Select a suggested action or ask naitive AI to draft something. Previews land here as editable cards.
      </div>
      {onQuickStart && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, width: '100%', maxWidth: 320 }}>
          {QUICK_STARTS.map((q) => (
            <button
              key={q}
              onClick={() => onQuickStart(q)}
              style={{
                textAlign: 'left', fontSize: 12, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                color: 'var(--foreground)', cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewCard({ item }: { item: WorkspaceItem }) {
  const Meta = TYPE_META[item.type];
  const copy = () => {
    try { navigator.clipboard.writeText(item.body); } catch { /* noop */ }
  };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      background: 'var(--glass-surface)', border: '1px solid var(--glass-border)',
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(126,184,247,0.12)', border: '1px solid rgba(126,184,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--primary))' }}>
          <Meta.Icon size={14} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            {Meta.label}{item.dealName ? ` • ${item.dealName}` : ''}
            {item.previewOnly ? ' • Preview only' : ''}
          </span>
        </div>
        <button
          onClick={copy}
          aria-label="Copy"
          title="Copy"
          style={{ background: 'none', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
        >
          <Copy size={12} /> Copy
        </button>
      </div>
      <pre style={{
        margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--foreground)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
      }}>{item.body}</pre>
    </div>
  );
}