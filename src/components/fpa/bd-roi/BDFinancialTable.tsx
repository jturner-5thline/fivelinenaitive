import { useState, useMemo, useRef, createContext, useContext, useCallback } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Info, FunctionSquare, Database, Loader2, X } from 'lucide-react';
import { formatBDValue } from './bdRoiFormatters';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CellInspector } from './CellInspector';
import type { CellConfig } from './useCellConfig';
import type { QBOResolvedValues } from './useQBOCellValues';
import { resolveFormula } from './formulaEngine';

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
  visibleIndices?: number[];
  getCellConfig?: (rowKey: string, colKey: string) => CellConfig | undefined;
  onCellConfigSaved?: (updated: CellConfig) => void;
  qboResolvedValues?: QBOResolvedValues;
}

interface InspectorState {
  rowKey: string;
  colIdx: number;
  rowLabel: string;
  colLabel: string;
  value: string;
  config: CellConfig;
}

export interface FormulaMode {
  active: boolean;
  /** Append a cell reference (row label) to the formula being built */
  appendRef: (rowKey: string, rowLabel: string) => void;
}

const CellConfigContext = createContext<{
  getCellConfig?: (rowKey: string, colKey: string) => CellConfig | undefined;
  inspecting: InspectorState | null;
  setInspecting: (s: InspectorState | null) => void;
  qboResolvedValues?: QBOResolvedValues;
  formulaMode: FormulaMode;
  sections: TableSection[];
  formulaResolvedValues: Map<string, number>;
}>({
  inspecting: null,
  setInspecting: () => {},
  formulaMode: { active: false, appendRef: () => {} },
  sections: [],
  formulaResolvedValues: new Map(),
});

export function BDFinancialTable({ sections, quarters, compact, visibleIndices, getCellConfig, onCellConfigSaved, qboResolvedValues }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [inspecting, setInspecting] = useState<InspectorState | null>(null);
  const [localQboValues, setLocalQboValues] = useState<Map<string, number>>(new Map());
  const [formulaModeActive, setFormulaModeActive] = useState(false);
  const [formulaRefCallback, setFormulaRefCallback] = useState<((rowKey: string, label: string) => void) | null>(null);
  const [formulaResolvedValues, setFormulaResolvedValues] = useState<Map<string, number>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Merge hook-resolved and locally-resolved QBO values
  const mergedQbo = useMemo((): QBOResolvedValues => {
    const merged = new Map(qboResolvedValues?.values ?? []);
    for (const [k, v] of localQboValues) merged.set(k, v);
    return { values: merged, loading: qboResolvedValues?.loading ?? new Set() };
  }, [qboResolvedValues, localQboValues]);

  const handleQboValueResolved = (rowKey: string, colKey: string, value: number) => {
    setLocalQboValues(prev => {
      const next = new Map(prev);
      next.set(`${rowKey}::${colKey}`, value);
      return next;
    });
  };

  const handleFormulaResolved = useCallback((rowKey: string, colKey: string, value: number) => {
    setFormulaResolvedValues(prev => {
      const next = new Map(prev);
      next.set(`${rowKey}::${colKey}`, value);
      return next;
    });
  }, []);

  // Formula mode controls
  const enterFormulaMode = useCallback((callback: (rowKey: string, label: string) => void) => {
    setFormulaModeActive(true);
    setFormulaRefCallback(() => callback);
  }, []);

  const exitFormulaMode = useCallback(() => {
    setFormulaModeActive(false);
    setFormulaRefCallback(null);
  }, []);

  const formulaMode: FormulaMode = useMemo(() => ({
    active: formulaModeActive,
    appendRef: (rowKey: string, label: string) => {
      formulaRefCallback?.(rowKey, label);
    },
  }), [formulaModeActive, formulaRefCallback]);

  return (
    <CellConfigContext.Provider value={{ getCellConfig, inspecting, setInspecting, qboResolvedValues: mergedQbo, formulaMode, sections, formulaResolvedValues }}>
      <div className="flex gap-0">
        <div className={`border border-border/50 rounded-md overflow-hidden ${inspecting ? 'flex-1 min-w-0' : 'w-full'}`}>
          {/* Formula mode banner */}
          {formulaModeActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/30">
              <FunctionSquare className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] text-emerald-300 font-medium flex-1">Formula mode: click cells to add references</span>
              <button
                onClick={exitFormulaMode}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </div>
          )}

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

        {/* Inspector Side Panel */}
        {inspecting && (
          <div className="w-72 flex-shrink-0 border border-border/50 border-l-0 rounded-r-md bg-card overflow-auto max-h-[640px]">
            <CellInspector
              config={inspecting.config}
              rowLabel={inspecting.rowLabel}
              colLabel={inspecting.colLabel}
              value={inspecting.value}
              onClose={() => { setInspecting(null); exitFormulaMode(); }}
              onSaved={onCellConfigSaved}
              onQboValueResolved={handleQboValueResolved}
              onFormulaResolved={handleFormulaResolved}
              enterFormulaMode={enterFormulaMode}
              exitFormulaMode={exitFormulaMode}
              formulaModeActive={formulaModeActive}
              sections={sections}
            />
          </div>
        )}
      </div>
    </CellConfigContext.Provider>
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
  const { getCellConfig, inspecting, setInspecting, qboResolvedValues, formulaMode, sections, formulaResolvedValues } = useContext(CellConfigContext);
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

        const quarterLabel = ['Q1-25','Q2-25','Q3-25','Q4-25','Q1-26','Q2-26','Q3-26','Q4-26','Q1-27','Q2-27','Q3-27','Q4-27'][origIdx] ?? '';
        const cellConfig = getCellConfig?.(row.key, quarterLabel);
        const isInspected = inspecting?.rowKey === row.key && inspecting?.colIdx === origIdx;

        // Resolve QBO value if available
        const qboKey = `${row.key}::${quarterLabel}`;
        const isQboCell = cellConfig?.cell_type === 'qbo_metric';
        const qboResolved = isQboCell ? qboResolvedValues?.values.get(qboKey) : undefined;
        const qboLoading = isQboCell && qboResolvedValues?.loading.has(qboKey);

        // Resolve formula value if available
        const isFormulaCell = cellConfig?.cell_type === 'formula' && cellConfig?.formula_string;
        const formulaResolved = formulaResolvedValues.get(qboKey);
        const liveFormulaValue = isFormulaCell ? resolveFormula(cellConfig!.formula_string!, sections, origIdx) : null;

        const displayVal = qboResolved !== undefined
          ? qboResolved
          : formulaResolved !== undefined
          ? formulaResolved
          : liveFormulaValue !== null
          ? liveFormulaValue
          : val;

        const handleCellClick = () => {
          // In formula mode, clicking a cell appends its reference
          if (formulaMode.active) {
            formulaMode.appendRef(row.key, row.label);
            return;
          }

          // Normal mode: open inspector
          const effectiveConfig: CellConfig = cellConfig ?? {
            sheet_id: 'bd-budget-dashboard',
            row_key: row.key,
            col_key: quarterLabel,
            cell_type: 'static',
          };
          setInspecting({
            rowKey: row.key,
            colIdx: origIdx,
            rowLabel: row.label,
            colLabel: quarterLabel,
            value: formatBDValue(displayVal, row.format),
            config: effectiveConfig,
          });
        };

        return (
          <td
            key={origIdx}
            className={`px-2 py-1 text-right border-b border-border/50 ${cellFontSize} whitespace-nowrap cursor-pointer transition-all
              ${isInspected ? 'ring-1 ring-primary/50 bg-primary/5' : ''}
              ${formulaMode.active ? 'hover:ring-1 hover:ring-emerald-400/50 hover:bg-emerald-500/5' : ''}
            `}
            style={{
              color: row.editable && !formulaMode.active ? '#60a5fa' : isGreenDelta ? '#34d399' : isRedDelta ? '#f87171' : undefined,
            }}
            onClick={handleCellClick}
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
            ) : qboLoading ? (
              <span className="inline-flex items-center gap-0.5">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500/60" />
              </span>
            ) : (
              <span className={`inline-flex items-center gap-0.5 ${!row.editable && !isGreenDelta && !isRedDelta ? 'text-foreground' : ''}`}>
                {cellConfig?.cell_type === 'formula' && (
                  <FunctionSquare className="h-2.5 w-2.5 text-emerald-500/60 flex-shrink-0" />
                )}
                {cellConfig?.cell_type === 'qbo_metric' && (
                  <Database className="h-2.5 w-2.5 text-blue-500/60 flex-shrink-0" />
                )}
                {formatBDValue(displayVal, row.format)}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
