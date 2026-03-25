import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FunctionSquare, Database, FileText, X, Calendar, Save, Loader2, Plus, Minus, Divide } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CellConfig } from './useCellConfig';
import { resolveSingleCell } from './useQBOCellValues';
import { resolveFormula, rowKeyToRefLabel, displayFormulaToInternal, internalFormulaToDisplay } from './formulaEngine';
import type { TableSection } from './BDFinancialTable';

interface Props {
  config: CellConfig;
  rowLabel: string;
  colLabel: string;
  value: string;
  onClose: () => void;
  onSaved?: (updated: CellConfig) => void;
  onQboValueResolved?: (rowKey: string, colKey: string, value: number) => void;
  onFormulaResolved?: (rowKey: string, colKey: string, value: number) => void;
  enterFormulaMode?: (callback: (rowKey: string, label: string) => void) => void;
  exitFormulaMode?: () => void;
  formulaModeActive?: boolean;
  sections?: TableSection[];
}

const AGGREGATION_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'balance', label: 'Balance' },
  { value: 'count', label: 'Count' },
];

const OPERATORS = [
  { label: '+', value: ' + ' },
  { label: '−', value: ' - ' },
  { label: '×', value: ' * ' },
  { label: '÷', value: ' / ' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
];

function getQuarterDates(colKey: string): { start: string; end: string; label: string } {
  const match = colKey.match(/^Q(\d)-(\d{2})$/);
  if (!match) return { start: '', end: '', label: colKey };
  const q = parseInt(match[1]);
  const year = 2000 + parseInt(match[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
    label: `Q${q} ${year}`,
  };
}

export function CellInspector({
  config, rowLabel, colLabel, value, onClose, onSaved, onQboValueResolved,
  onFormulaResolved, enterFormulaMode, exitFormulaMode, formulaModeActive, sections,
}: Props) {
  const { user } = useAuth();
  const [cellType, setCellType] = useState<CellConfig['cell_type']>(config.cell_type);
  const [qboEntity, setQboEntity] = useState(config.qbo_entity ?? '');
  const [qboAccount, setQboAccount] = useState(config.qbo_account ?? '');
  const [qboAggregation, setQboAggregation] = useState(config.qbo_aggregation ?? 'sum');
  // Store display formula (human-readable labels)
  const [displayFormula, setDisplayFormula] = useState(() => {
    const internal = config.formula_string ?? '';
    return sections ? internalFormulaToDisplay(internal, sections) : internal;
  });
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<{ name: string; qb_id: string; realm_id: string }[]>([]);
  const [entities, setEntities] = useState<{ realm_id: string; company_name: string }[]>([]);
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  const timeWindow = useMemo(() => getQuarterDates(colLabel), [colLabel]);

  // Derive internal formula for dirty check and saving
  const internalFormula = useMemo(
    () => sections ? displayFormulaToInternal(displayFormula, sections) : displayFormula,
    [displayFormula, sections],
  );

  const isDirty = cellType !== config.cell_type
    || qboEntity !== (config.qbo_entity ?? '')
    || qboAccount !== (config.qbo_account ?? '')
    || qboAggregation !== (config.qbo_aggregation ?? 'sum')
    || internalFormula !== (config.formula_string ?? '');

  // Activate/deactivate formula mode when cell type changes
  useEffect(() => {
    if (cellType === 'formula') {
      enterFormulaMode?.((rowKey: string, label: string) => {
        const refLabel = sections
          ? rowKeyToRefLabel(rowKey, sections)
          : label.replace(/[:\s—–-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        setDisplayFormula(prev => {
          const trimmed = prev.trimEnd();
          // Add space if last char isn't an operator or opening paren
          const needsSpace = trimmed.length > 0 && !/[+\-*/(]$/.test(trimmed);
          return prev + (needsSpace ? ' ' : '') + refLabel;
        });
      });
    } else {
      exitFormulaMode?.();
    }
  }, [cellType, enterFormulaMode, exitFormulaMode, sections]);

  // Preview resolved formula value
  const formulaPreview = useMemo(() => {
    if (cellType !== 'formula' || !internalFormula || !sections) return null;
    // Find the column index from colLabel
    const quarters = ['Q1-25','Q2-25','Q3-25','Q4-25','Q1-26','Q2-26','Q3-26','Q4-26','Q1-27','Q2-27','Q3-27','Q4-27'];
    const colIdx = quarters.indexOf(colLabel);
    if (colIdx < 0) return null;
    return resolveFormula(internalFormula, sections, colIdx);
  }, [cellType, internalFormula, sections, colLabel]);

  // Load QBO entities
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('quickbooks_tokens' as any)
        .select('realm_id, company_name')
        .order('company_name');
      if (data) {
        const unique = Array.from(new Map((data as any[]).map((d: any) => [d.realm_id, d])).values());
        setEntities(unique as any[]);
        if (!qboEntity && unique.length > 0) {
          setQboEntity((unique[0] as any).company_name ?? '');
        }
      }
    };
    load();
  }, [user]);

  // Load QBO accounts
  useEffect(() => {
    if (!user || cellType !== 'qbo_metric') return;
    const load = async () => {
      let query = (supabase.from('quickbooks_accounts' as any) as any)
        .select('name, qb_id, realm_id')
        .eq('active', true)
        .order('name');
      const entity = entities.find(e => e.company_name === qboEntity);
      if (entity) query = query.eq('realm_id', entity.realm_id);
      const { data } = await query;
      if (data) setAccounts(data as any[]);
    };
    load();
  }, [user, cellType, qboEntity, entities]);

  const insertOperator = useCallback((op: string) => {
    setDisplayFormula(prev => prev + op);
    setTimeout(() => formulaRef.current?.focus(), 0);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: companyMember } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single();

      const payload = {
        sheet_id: config.sheet_id,
        row_key: config.row_key,
        col_key: config.col_key,
        cell_type: cellType,
        company_id: companyMember?.company_id ?? '',
        formula_string: cellType === 'formula' ? internalFormula : null,
        qbo_entity: cellType === 'qbo_metric' ? qboEntity : null,
        qbo_account: cellType === 'qbo_metric' ? qboAccount : null,
        qbo_aggregation: cellType === 'qbo_metric' ? qboAggregation : null,
        qbo_time_window: cellType === 'qbo_metric' ? (timeWindow as any) : null,
      };

      if (config.id) {
        await supabase
          .from('sheet_cell_config')
          .update(payload as any)
          .eq('id', config.id);
      } else {
        await supabase
          .from('sheet_cell_config')
          .insert(payload as any);
      }

      const updatedConfig: CellConfig = {
        ...config,
        cell_type: cellType,
        formula_string: cellType === 'formula' ? internalFormula : undefined,
        qbo_entity: cellType === 'qbo_metric' ? qboEntity : undefined,
        qbo_account: cellType === 'qbo_metric' ? qboAccount : undefined,
        qbo_aggregation: cellType === 'qbo_metric' ? qboAggregation : undefined,
        qbo_time_window: cellType === 'qbo_metric' ? timeWindow : undefined,
      };

      onSaved?.(updatedConfig);

      // Resolve formula after save
      if (cellType === 'formula' && formulaPreview !== null) {
        onFormulaResolved?.(config.row_key, config.col_key, formulaPreview);
      }

      // Resolve QBO value after save
      if (cellType === 'qbo_metric') {
        const resolved = await resolveSingleCell(updatedConfig);
        if (resolved !== null) {
          onQboValueResolved?.(config.row_key, config.col_key, resolved);
        }
      }

      exitFormulaMode?.();
      onClose();
    } catch (err) {
      console.error('Failed to save cell config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    exitFormulaMode?.();
    onClose();
  };

  const typeIcon = cellType === 'formula'
    ? <FunctionSquare className="h-3.5 w-3.5 text-emerald-400" />
    : cellType === 'qbo_metric'
    ? <Database className="h-3.5 w-3.5 text-blue-400" />
    : <FileText className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <div className="w-72 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            {typeIcon}
            <span className="text-xs font-semibold text-foreground">{rowLabel}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{colLabel}</span>
        </div>
        <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Separator />

      {/* Current Value */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-0.5">Current Value</div>
        <div className="text-sm font-mono font-semibold text-foreground">{value}</div>
      </div>

      <Separator />

      {/* Cell Type Selector */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">Cell Type</div>
        <Select value={cellType} onValueChange={(v) => setCellType(v as CellConfig['cell_type'])}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="formula">Formula</SelectItem>
            <SelectItem value="qbo_metric">QBO Metric</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Formula builder */}
      {cellType === 'formula' && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Formula</div>
            <textarea
              ref={formulaRef}
              value={displayFormula}
              onChange={e => setDisplayFormula(e.target.value)}
              placeholder="Click cells in the grid or type references..."
              className="w-full bg-muted/50 rounded px-2 py-1.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/30 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              rows={3}
            />
          </div>

          {/* Operator toolbar */}
          <div className="flex items-center gap-1">
            {OPERATORS.map(op => (
              <button
                key={op.label}
                onClick={() => insertOperator(op.value)}
                className="w-7 h-7 flex items-center justify-center rounded border border-border/50 bg-muted/30 hover:bg-muted text-xs font-mono text-foreground hover:text-primary transition-colors"
              >
                {op.label}
              </button>
            ))}
            <button
              onClick={() => setDisplayFormula('')}
              className="ml-auto text-[10px] text-muted-foreground hover:text-destructive px-1.5 py-0.5"
            >
              Clear
            </button>
          </div>

          {/* Hint */}
          {formulaModeActive && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/80 bg-emerald-500/5 rounded px-2 py-1.5 border border-emerald-500/20">
              <FunctionSquare className="h-3 w-3 flex-shrink-0" />
              <span>Click any cell in the grid to add it as a reference</span>
            </div>
          )}

          {/* Live preview */}
          {displayFormula.trim() && (
            <div className="bg-muted/30 rounded px-2 py-1.5 border border-border/50">
              <div className="text-[10px] text-muted-foreground mb-0.5">Preview</div>
              <div className="text-xs font-mono font-semibold text-foreground">
                {formulaPreview !== null ? (
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(formulaPreview)
                ) : (
                  <span className="text-destructive/60">Invalid formula</span>
                )}
              </div>
              {internalFormula !== displayFormula && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5 font-mono truncate">
                  → {internalFormula}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QBO Metric picker */}
      {cellType === 'qbo_metric' && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Source</div>
            <div className="flex items-center gap-1.5">
              <Database className="h-3 w-3 text-blue-400" />
              <span className="text-xs text-foreground font-medium">QuickBooks Online</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Entity</div>
            <Select value={qboEntity} onValueChange={setQboEntity}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select entity..." />
              </SelectTrigger>
              <SelectContent>
                {entities.map(e => (
                  <SelectItem key={e.realm_id} value={e.company_name}>{e.company_name}</SelectItem>
                ))}
                {entities.length === 0 && (
                  <SelectItem value="__none" disabled>No connected entities</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Account</div>
            <Select value={qboAccount} onValueChange={setQboAccount}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.qb_id} value={a.name ?? a.qb_id}>{a.name}</SelectItem>
                ))}
                {accounts.length === 0 && (
                  <SelectItem value="__none" disabled>No accounts found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Aggregation</div>
            <Select value={qboAggregation} onValueChange={setQboAggregation}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGGREGATION_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Time Window</div>
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span>{timeWindow.label}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {timeWindow.start} → {timeWindow.end}
            </div>
          </div>
        </div>
      )}

      {/* Static info */}
      {cellType === 'static' && (
        <div className="text-[10px] text-muted-foreground italic">
          Manually entered value — not driven by formula or external source.
        </div>
      )}

      {/* Save button */}
      {isDirty && (
        <>
          <Separator />
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleSave}
            disabled={saving || (cellType === 'qbo_metric' && (!qboEntity || !qboAccount)) || (cellType === 'formula' && formulaPreview === null && displayFormula.trim().length > 0)}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save Configuration
          </Button>
        </>
      )}
    </div>
  );
}
