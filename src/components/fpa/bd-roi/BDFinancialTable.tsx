import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Info } from 'lucide-react';
import { formatBDValue } from './bdRoiFormatters';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface TableRow {
  key: string;
  label: string;
  values: (number | null)[];
  format: 'dollar' | 'percent' | 'multiple' | 'number';
  editable?: boolean;
  indented?: boolean;
  isTotal?: boolean;
  isSubtotal?: boolean;
  isDelta?: boolean;
  isDatarails?: boolean;
  formulaDesc?: string;
  onEdit?: (index: number, value: number) => void;
}

export interface TableSection {
  key: string;
  label: string;
  rows: TableRow[];
}

interface Props {
  sections: TableSection[];
  quarters: string[];
  compact?: boolean;
  /** When provided, only show columns at these original indices. Edit callbacks still receive original indices. */
  visibleIndices?: number[];
}

export function BDFinancialTable({ sections, quarters, compact, visibleIndices }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Determine which column indices to show
  const indices = visibleIndices ?? quarters.map((_, i) => i);
  const displayQuarters = indices.map(i => quarters[i]);

  const allCollapsed = collapsed.size === sections.length;

  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(sections.map(s => s.key)));
  };

  const startEdit = (rowKey: string, col: number, currentValue: number | null) => {
    setEditingCell({ rowKey, col });
    setEditValue(currentValue?.toString() ?? '0');
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = (row: TableRow) => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    row.onEdit?.(editingCell.col, val);
    setEditingCell(null);
  };

  const cellFontSize = compact ? 'text-[10px]' : 'text-[11px]';
  const headerFontSize = compact ? 'text-[10px]' : 'text-[12px]';

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <div className="flex justify-end p-1 bg-muted/30 border-b border-border/50">
        <button onClick={toggleAll} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5">
          {allCollapsed ? <ChevronsUpDown className="h-3 w-3" /> : <ChevronsDownUp className="h-3 w-3" />}
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </button>
      </div>
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full border-collapse" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-30 bg-muted/50 text-left px-3 py-1.5 border-b border-r border-border/50 min-w-[180px] text-[11px] font-semibold text-foreground">
                &nbsp;
              </th>
              {displayQuarters.map(q => (
                <th key={q} className={`px-2 py-1.5 text-right border-b border-border/50 ${headerFontSize} font-semibold text-foreground min-w-[85px] whitespace-nowrap`}>
                  {q}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <SectionBlock
                key={section.key}
                section={section}
                collapsed={collapsed.has(section.key)}
                onToggle={() => toggleSection(section.key)}
                editingCell={editingCell}
                editValue={editValue}
                inputRef={inputRef}
                onStartEdit={startEdit}
                onEditValueChange={setEditValue}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingCell(null)}
                cellFontSize={cellFontSize}
                quarters={displayQuarters}
                visibleIndices={indices}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionBlock({
  section, collapsed, onToggle, editingCell, editValue, inputRef,
  onStartEdit, onEditValueChange, onCommitEdit, onCancelEdit, cellFontSize, quarters, visibleIndices,
}: {
  section: TableSection; collapsed: boolean; onToggle: () => void;
  editingCell: { rowKey: string; col: number } | null; editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (rowKey: string, col: number, val: number | null) => void;
  onEditValueChange: (v: string) => void;
  onCommitEdit: (row: TableRow) => void;
  onCancelEdit: () => void;
  cellFontSize: string; quarters: string[]; visibleIndices: number[];
}) {
  return (
    <>
      <tr className="cursor-pointer select-none bg-primary/10" onClick={onToggle}>
        <td className="sticky left-0 z-10 px-3 py-1.5 border-b border-r border-border/50 font-bold text-[12px] text-foreground flex items-center gap-1 bg-primary/10">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {section.label}
        </td>
        {quarters.map(q => (
          <td key={q} className="border-b border-border/50" />
        ))}
      </tr>
      {!collapsed && section.rows.map(row => (
        <RowBlock
          key={row.key}
          row={row}
          editingCell={editingCell}
          editValue={editValue}
          inputRef={inputRef}
          onStartEdit={onStartEdit}
          onEditValueChange={onEditValueChange}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          cellFontSize={cellFontSize}
          visibleIndices={visibleIndices}
        />
      ))}
    </>
  );
}

function RowBlock({
  row, editingCell, editValue, inputRef, onStartEdit, onEditValueChange, onCommitEdit, onCancelEdit, cellFontSize, visibleIndices,
}: {
  row: TableRow;
  editingCell: { rowKey: string; col: number } | null; editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (rowKey: string, col: number, val: number | null) => void;
  onEditValueChange: (v: string) => void;
  onCommitEdit: (row: TableRow) => void;
  onCancelEdit: () => void;
  cellFontSize: string;
  visibleIndices: number[];
}) {
  const totalClass = row.isTotal ? 'font-bold border-t-2 border-b-2 border-foreground/20' : '';
  const subtotalClass = row.isSubtotal ? 'font-semibold border-t border-border/50' : '';
  const deltaClass = row.isDelta ? 'text-[10px] text-muted-foreground/60' : '';
  const bgClass = row.isTotal ? 'bg-muted/20' : '';

  return (
    <tr className={`${totalClass} ${subtotalClass} ${deltaClass} ${bgClass} hover:bg-muted/30 group`}>
      <td className={`sticky left-0 z-10 px-3 py-1 border-b border-r border-border/50 ${cellFontSize} text-foreground whitespace-nowrap`}
          style={{ paddingLeft: row.indented ? '28px' : '12px', backgroundColor: row.isTotal ? 'hsl(var(--muted) / 0.3)' : 'hsl(var(--card))' }}>
        <div className="flex items-center gap-1">
          {row.isDatarails && <span className="w-2 h-2 rounded-full bg-yellow-400 border border-border/50 flex-shrink-0" />}
          <span>{row.label}</span>
          {row.formulaDesc && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                  <Info className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" side="right">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{row.label}</span>
                    {row.editable
                      ? <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">INPUT</span>
                      : <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-medium">FORMULA</span>
                    }
                    {row.isDatarails && <span className="text-[9px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-medium">DATARAILS</span>}
                  </div>
                  {row.formulaDesc && <p className="text-[10px] text-muted-foreground">{row.formulaDesc}</p>}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </td>
      {visibleIndices.map(origIdx => {
        const val = row.values[origIdx];
        const isEditing = editingCell?.rowKey === row.key && editingCell?.col === origIdx;
        const isGreenDelta = row.isDelta && val !== null && val > 0;
        const isRedDelta = row.isDelta && val !== null && val < 0;

        return (
          <td
            key={origIdx}
            className={`px-2 py-1 text-right border-b border-border/50 ${cellFontSize} whitespace-nowrap cursor-pointer`}
            style={{
              color: row.editable ? '#60a5fa' : isGreenDelta ? '#34d399' : isRedDelta ? '#f87171' : undefined,
            }}
            onClick={() => row.editable && row.onEdit && onStartEdit(row.key, origIdx, val)}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={e => onEditValueChange(e.target.value)}
                onBlur={() => onCommitEdit(row)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onCommitEdit(row);
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="w-full text-right border border-primary rounded px-1 py-0.5 text-[11px] outline-none bg-primary/10 text-foreground"
                autoFocus
              />
            ) : (
              <span className={!row.editable && !isGreenDelta && !isRedDelta ? 'text-foreground' : ''}>
                {formatBDValue(val, row.format)}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
