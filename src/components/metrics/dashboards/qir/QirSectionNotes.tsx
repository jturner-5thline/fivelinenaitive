import React from 'react';
import { useQirSectionNote } from '@/hooks/useQirComments';

interface Props {
  reportKey: string;
  sectionKey: string;
  label?: string;
  /** Whether the current user can edit (e.g. admin). */
  canEdit?: boolean;
}

/**
 * Free-text "Notes" field for a section of the Quarterly Insights Report.
 * Persists company-wide; visible to all members; editable per `canEdit` prop.
 * Always included in printed/PDF export.
 */
export function QirSectionNotes({ reportKey, sectionKey, label = 'Notes', canEdit = true }: Props) {
  const { body, save, loaded } = useQirSectionNote(reportKey, sectionKey);
  const [local, setLocal] = React.useState('');
  const dirtyRef = React.useRef(false);
  // Hydrate local once body loads, and accept incoming realtime updates while not dirty.
  React.useEffect(() => {
    if (!loaded) return;
    if (!dirtyRef.current) setLocal(body);
  }, [body, loaded]);

  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = (v: string) => {
    setLocal(v);
    dirtyRef.current = true;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      void save(v);
      dirtyRef.current = false;
    }, 500);
  };

  if (!body && !canEdit) return null;

  return (
    <div style={{
      background: 'rgba(10,18,36,0.45)',
      border: '1px dashed rgba(120,170,255,0.22)',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(160,200,255,0.55)', marginBottom: 6 }}>
        {label}
      </div>
      {canEdit ? (
        <textarea
          value={local}
          onChange={e => onChange(e.target.value)}
          rows={2}
          maxLength={8000}
          placeholder="Add narrative context for this section…"
          style={{
            width: '100%', resize: 'vertical', minHeight: 36,
            background: 'transparent', color: '#dde8f8',
            border: 'none', outline: 'none', fontSize: 13, lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <div style={{ fontSize: 13, color: '#dde8f8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{body}</div>
      )}
    </div>
  );
}