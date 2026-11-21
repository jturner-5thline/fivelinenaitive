import type React from 'react';

/** Spreadsheet-style keyboard handling for grids of <input data-row data-col>. */
export function sheetKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const r = Number(el.dataset.row), c = Number(el.dataset.col);
  const editing = el.dataset.editing === '1';
  const go = (dr: number, dc: number) => {
    const table = el.closest('table');
    const t = table?.querySelector<HTMLInputElement>(`input[data-row="${r + dr}"][data-col="${c + dc}"]`);
    if (t) { e.preventDefault(); t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; }
    return false;
  };
  switch (e.key) {
    case 'Tab': if (!go(0, e.shiftKey ? -1 : 1)) go(e.shiftKey ? -1 : 1, 0); e.preventDefault(); break;
    case 'Enter': e.preventDefault(); go(e.shiftKey ? -1 : 1, 0); break;
    case 'ArrowUp': if (!editing) go(-1, 0); break;
    case 'ArrowDown': if (!editing) go(1, 0); break;
    case 'ArrowLeft': if (!editing || el.selectionStart === 0) go(0, -1); break;
    case 'ArrowRight': if (!editing || el.selectionStart === el.value.length) go(0, 1); break;
    case 'F2': e.preventDefault(); el.dataset.editing = '1'; el.setSelectionRange(el.value.length, el.value.length); break;
    default:
      if (!editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey) el.dataset.editing = '1';
  }
}

export const sheetFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.dataset.editing = '0';
  const t = e.target; requestAnimationFrame(() => t.select());
};
export const sheetDoubleClick = (e: React.MouseEvent<HTMLInputElement>) => { e.currentTarget.dataset.editing = '1'; };

export const SHEET_TABLE = 'w-full text-sm border-collapse border-spacing-0 [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border';
export const SHEET_INPUT = 'block w-full h-7 rounded-none border-0 bg-transparent px-2 text-right tabular-nums shadow-none outline-none cursor-cell caret-primary focus:outline-2 focus:outline focus:-outline-offset-2 focus:outline-primary focus-visible:ring-0 focus-visible:ring-offset-0';
