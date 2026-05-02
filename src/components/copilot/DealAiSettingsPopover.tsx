import { useState, useRef, useEffect } from 'react';
import { Settings2, FileText, Loader2 } from 'lucide-react';
import { useDealAiSettings } from '@/hooks/useDealAiSettings';

interface Props { dealId: string; }

export function DealAiSettingsPopover({ dealId }: Props) {
  const { settings, loading, saving, canEdit, save } = useDealAiSettings(dealId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings.custom_instructions);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(settings.custom_instructions); }, [settings.custom_instructions]);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Deal AI settings"
        title="Deal AI settings"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, borderRadius: 6, display: 'flex' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >
        <Settings2 size={18} />
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 320,
            background: 'var(--glass-surface)', border: '1px solid var(--glass-border)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: 60, padding: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'hsl(var(--muted-foreground))', marginBottom: 10 }}>
            Deal AI settings
          </div>

          {/* Data Room toggle */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: canEdit ? 'pointer' : 'not-allowed', opacity: canEdit ? 1 : 0.6 }}>
            <input
              type="checkbox"
              checked={settings.data_room_context_enabled}
              disabled={!canEdit || saving}
              onChange={(e) => save({ data_room_context_enabled: e.target.checked })}
              style={{ marginTop: 3 }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--foreground)', fontWeight: 500 }}>
                <FileText size={13} /> Include Data Room files in context
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                AI cites relevant excerpts from this deal's documents.
              </span>
            </span>
          </label>

          {/* Custom instructions */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)', marginBottom: 6 }}>
              Custom instructions
            </div>
            <textarea
              value={draft}
              disabled={!canEdit || saving}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (draft !== settings.custom_instructions) save({ custom_instructions: draft }); }}
              placeholder="e.g. This is a senior secured ABL deal. Format financial outputs for TriplePoint Capital's template."
              rows={4}
              style={{
                width: '100%', resize: 'vertical', fontSize: 12, lineHeight: 1.4,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                borderRadius: 6, padding: 8, color: 'var(--foreground)', fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
              {canEdit ? 'Saved on blur. Pre-pended to every AI message on this deal.' : 'Only admins or the deal owner can edit.'}
            </div>
          </div>

          {(loading || saving) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 8 }}>
              <Loader2 size={11} className="animate-spin" /> {saving ? 'Saving…' : 'Loading…'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}