import React from 'react';
import { NotebookPen, CheckSquare, ListChecks } from 'lucide-react';

export type CommentType = 'note' | 'decision' | 'action_item';

const OPTIONS: Array<{ value: CommentType; label: string; Icon: any }> = [
  { value: 'note', label: 'Note', Icon: NotebookPen },
  { value: 'decision', label: 'Decision', Icon: CheckSquare },
  { value: 'action_item', label: 'Action Item', Icon: ListChecks },
];

/**
 * Compact segmented selector used by every comment composer to tag the
 * comment type. Selected comments are routed into the Agenda footnotes
 * section under the matching bucket (Note / Decision / Action Item).
 */
export function CommentTypePicker({
  value,
  onChange,
}: {
  value: CommentType;
  onChange: (v: CommentType) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Comment type"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: 2, borderRadius: 999,
        background: 'rgba(10,20,40,0.55)',
        border: '0.5px solid rgba(80,140,255,0.22)',
      }}
    >
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            title={label}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 999,
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
              border: 'none', cursor: 'pointer',
              background: active ? 'rgba(80,140,255,0.28)' : 'transparent',
              color: active ? 'rgba(230,240,255,0.98)' : 'rgba(200,225,255,0.65)',
            }}
          >
            <Icon size={11} /> {label}
          </button>
        );
      })}
    </div>
  );
}