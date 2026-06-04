import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Check, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export interface CommentEditMember {
  user_id: string;
  display_name?: string;
  email?: string;
}

/**
 * Inline comment editor with @mention autocomplete. Shared between the
 * "Your comments" dropdown and the Agenda Queue panel so both surfaces
 * behave identically when a user clicks the pencil/edit icon on a queue
 * item.
 */
export function CommentEditInput({
  initialValue,
  onSave,
  onCancel,
  autoFocus = true,
  compact = false,
}: {
  initialValue: string;
  onSave: (next: string) => void | Promise<void>;
  onCancel: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const companyApi = (useCompany() || {}) as any;
  const companyMembers = companyApi.members ?? [];
  const teamMembers = useTeamMembers() || [];
  const members: CommentEditMember[] = useMemo(() => {
    const map = new Map<string, CommentEditMember>();
    for (const m of companyMembers) {
      if (m?.user_id) map.set(m.user_id, { user_id: m.user_id, display_name: m.display_name, email: m.email });
    }
    for (const m of teamMembers) {
      if (m?.id) {
        const existing = map.get(m.id) || { user_id: m.id };
        map.set(m.id, {
          user_id: m.id,
          display_name: existing.display_name || m.display_name,
          email: existing.email || m.email || undefined,
        });
      }
    }
    return Array.from(map.values());
  }, [companyMembers, teamMembers]);

  useEffect(() => {
    if (autoFocus) setTimeout(() => taRef.current?.focus(), 0);
  }, [autoFocus]);

  const mentionMatch = useMemo(() => {
    const m = /(?:^|\s)@([A-Za-z0-9_.\- ]{0,40})$/.exec(value);
    return m ? { token: m[1] || '', start: m.index + (m[0].startsWith('@') ? 0 : 1) } : null;
  }, [value]);

  const pickMention = (name: string) => {
    if (!mentionMatch) return;
    const before = value.slice(0, mentionMatch.start);
    const formatted = name.includes(' ') ? `@"${name}"` : `@${name}`;
    setValue(before + formatted + ' ');
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    const next = value.trim();
    if (!next || saving) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const matches = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionMatch.token.trim().toLowerCase();
    return members
      .filter(m => {
        const n = (m.display_name || m.email || '').toLowerCase();
        return q === '' || n.includes(q);
      })
      .slice(0, 6);
  }, [mentionMatch, members]);

  return (
    <div
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
        }}
        placeholder="Edit comment… use @ to mention"
        style={{
          width: '100%', minHeight: compact ? 60 : 80, resize: 'vertical',
          background: 'rgba(255,255,255,0.04)', color: '#dde8f8',
          border: '1px solid rgba(120,170,255,0.25)', borderRadius: 6,
          padding: 8, fontSize: 12, lineHeight: 1.4, fontFamily: 'inherit', outline: 'none',
        }}
      />
      {mentionMatch && matches.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
          background: 'rgba(12,20,36,0.98)', border: '1px solid rgba(120,170,255,0.25)',
          borderRadius: 6, padding: 4, maxHeight: 180, overflowY: 'auto', zIndex: 20,
        }}>
          {matches.map(m => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => pickMention(m.display_name || m.email || '')}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 6, padding: '5px 8px',
                background: 'transparent', border: 'none', color: '#dde8f8', cursor: 'pointer',
                fontSize: 12, textAlign: 'left', borderRadius: 4,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,140,255,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <AtSign size={11} style={{ opacity: 0.6 }} />
              <span>{m.display_name || m.email}</span>
              {m.email && m.display_name ? (
                <span style={{ marginLeft: 'auto', color: 'rgba(180,200,230,0.5)', fontSize: 10 }}>{m.email}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent', color: 'rgba(200,225,255,0.7)',
            border: '1px solid rgba(120,170,255,0.2)', borderRadius: 4,
            padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <X size={10} /> Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(80,140,255,0.18)', color: '#cfe5ff',
            border: '1px solid rgba(120,170,255,0.5)', borderRadius: 4,
            padding: '3px 8px', fontSize: 11, fontWeight: 700,
            cursor: saving ? 'wait' : (value.trim() ? 'pointer' : 'not-allowed'),
            opacity: value.trim() ? 1 : 0.5,
          }}
        >
          <Check size={10} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}