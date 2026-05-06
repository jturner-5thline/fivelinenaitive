import React from 'react';
import type { SortDir } from './useSortGroup';
import { DarkNativeSelect, DarkOption } from './DarkNativeSelect';

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
        <DarkNativeSelect size="md" value={groupBy ?? ''} onChange={e => setGroupBy(e.target.value || null)}>
          <DarkOption value="">None</DarkOption>
          {groupOptions.map(o => <DarkOption key={o.id} value={o.id}>{o.label}</DarkOption>)}
        </DarkNativeSelect>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>Sort</span>
        <DarkNativeSelect size="md" value={sortBy ?? ''} onChange={e => { const v = e.target.value || null; setSortBy(v); if (v && !sortDir) setSortDir('asc'); }}>
          <DarkOption value="">Default</DarkOption>
          {sortOptions.map(o => <DarkOption key={o.id} value={o.id}>{o.label}</DarkOption>)}
        </DarkNativeSelect>
        <DarkNativeSelect size="md" value={sortDir ?? ''} onChange={e => setSortDir((e.target.value as SortDir) || null)} disabled={!sortBy}>
          <DarkOption value="asc">Asc</DarkOption>
          <DarkOption value="desc">Desc</DarkOption>
        </DarkNativeSelect>
      </div>
    </div>
  );
}