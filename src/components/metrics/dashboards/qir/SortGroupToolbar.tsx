import React from 'react';
import type { SortDir } from './useSortGroup';

interface Option { id: string; label: string }

interface Props {
  groupBy: string | null;
  setGroupBy: (id: string | null) => void;
  sortBy: string | null;
  sortDir: SortDir;
  setSortBy: (id: string | null) => void;
  setSortDir: (d: SortDir) => void;
  groupOptions: Option[];
  sortOptions: Option[];
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(220,235,250,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
  color: 'rgba(140,175,200,0.7)',
};

export function SortGroupToolbar({
  groupBy, setGroupBy, sortBy, sortDir, setSortBy, setSortDir, groupOptions, sortOptions,
}: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>Group</span>
        <select value={groupBy ?? ''} onChange={e => setGroupBy(e.target.value || null)} style={selectStyle}>
          <option value="">None</option>
          {groupOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>Sort</span>
        <select value={sortBy ?? ''} onChange={e => { const v = e.target.value || null; setSortBy(v); if (v && !sortDir) setSortDir('asc'); }} style={selectStyle}>
          <option value="">Default</option>
          {sortOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={sortDir ?? ''} onChange={e => setSortDir((e.target.value as SortDir) || null)} style={{ ...selectStyle, opacity: sortBy ? 1 : 0.5 }} disabled={!sortBy}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>
    </div>
  );
}