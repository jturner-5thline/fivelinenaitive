import { useState, useCallback, useRef, useEffect } from 'react';
import { X, ExternalLink, Pencil, Check, AlertCircle } from 'lucide-react';
import { Deal, MANAGERS } from '@/types/deal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StageDrilloverPanelProps {
  stageLabel: string;
  stageVolume: number;
  dealCount: number;
  pipelineName: string;
  deals: Deal[];
  onClose: () => void;
}

interface EditState {
  dealId: string;
  field: string;
  value: string;
  error?: string;
}

export function StageDrilloverPanel({
  stageLabel,
  stageVolume,
  dealCount,
  pipelineName,
  deals,
  onClose,
}: StageDrilloverPanelProps) {
  const { formatCurrencyValue } = usePreferences();
  const { updateDeal } = useDealsContext();
  const navigate = useNavigate();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editState && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editState]);

  const startEdit = (dealId: string, field: string, currentValue: string) => {
    setEditState({ dealId, field, value: currentValue });
  };

  const validate = (field: string, value: string): string | undefined => {
    if (field === 'value') {
      const num = parseFloat(value.replace(/[,$]/g, ''));
      if (isNaN(num) || num < 0) return 'Enter a valid amount';
    }
    if (field === 'closingDate') {
      if (value && isNaN(Date.parse(value))) return 'Enter a valid date';
    }
    return undefined;
  };

  const saveEdit = useCallback(async () => {
    if (!editState) return;

    const error = validate(editState.field, editState.value);
    if (error) {
      setEditState(prev => prev ? { ...prev, error } : null);
      return;
    }

    const cellKey = `${editState.dealId}-${editState.field}`;
    setSavingCell(cellKey);

    try {
      let updates: Partial<Deal> = {};

      switch (editState.field) {
        case 'value': {
          const num = parseFloat(editState.value.replace(/[,$]/g, ''));
          updates = { value: num };
          break;
        }
        case 'manager':
          updates = { manager: editState.value };
          break;
        case 'closingDate':
          updates = { closingDate: editState.value || null };
          break;
      }

      await updateDeal(editState.dealId, updates);

      toast({
        title: 'Saved',
        description: `${editState.field === 'value' ? 'Amount' : editState.field === 'closingDate' ? 'Close date' : 'Owner'} updated`,
        duration: 2000,
      });
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingCell(null);
      setEditState(null);
    }
  }, [editState, updateDeal]);

  const cancelEdit = () => setEditState(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const formatDealValue = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}MM`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  const isEditing = (dealId: string, field: string) =>
    editState?.dealId === dealId && editState?.field === field;

  const isSaving = (dealId: string, field: string) =>
    savingCell === `${dealId}-${field}`;

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {stageLabel}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCurrencyValue(stageVolume)} · {dealCount} deal{dealCount !== 1 ? 's' : ''} · {pipelineName}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted/50 transition-colors flex-shrink-0 ml-2"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/20 backdrop-blur-sm">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Deal Name</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Amount</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Owner</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Close Date</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal, idx) => (
              <tr
                key={deal.id}
                className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${
                  idx % 2 === 0 ? '' : 'bg-muted/5'
                }`}
              >
                {/* Deal Name */}
                <td className="py-2 px-3">
                  <span className="text-sm font-medium text-foreground truncate block max-w-[180px]" title={deal.name}>
                    {deal.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate block max-w-[180px]">{deal.company}</span>
                </td>

                {/* Amount - editable */}
                <td className="py-2 px-3 text-right">
                  {isEditing(deal.id, 'value') ? (
                    <div className="flex flex-col items-end">
                      <input
                        ref={inputRef}
                        type="text"
                        value={editState!.value}
                        onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value, error: undefined } : null)}
                        onBlur={saveEdit}
                        onKeyDown={handleKeyDown}
                        className="w-24 text-right text-sm bg-background border border-primary/40 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      {editState?.error && (
                        <span className="text-[10px] text-destructive mt-0.5 flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" />
                          {editState.error}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(deal.id, 'value', deal.value.toString())}
                      className="group/edit inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {isSaving(deal.id, 'value') ? (
                        <Check className="h-3 w-3 text-success animate-pulse" />
                      ) : (
                        <Pencil className="h-3 w-3 opacity-0 group-hover/edit:opacity-50 transition-opacity" />
                      )}
                      {formatDealValue(deal.value)}
                    </button>
                  )}
                </td>

                {/* Owner - editable */}
                <td className="py-2 px-3">
                  {isEditing(deal.id, 'manager') ? (
                    <Select
                      value={editState!.value}
                      onValueChange={async (val) => {
                        setEditState(prev => prev ? { ...prev, value: val } : null);
                        // Auto-save on selection
                        const cellKey = `${deal.id}-manager`;
                        setSavingCell(cellKey);
                        try {
                          await updateDeal(deal.id, { manager: val });
                          toast({ title: 'Saved', description: 'Owner updated', duration: 2000 });
                        } catch {
                          toast({ title: 'Failed to save', variant: 'destructive' });
                        } finally {
                          setSavingCell(null);
                          setEditState(null);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MANAGERS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <button
                      onClick={() => startEdit(deal.id, 'manager', deal.manager || '')}
                      className="group/edit inline-flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {isSaving(deal.id, 'manager') ? (
                        <Check className="h-3 w-3 text-success animate-pulse" />
                      ) : (
                        <Pencil className="h-3 w-3 opacity-0 group-hover/edit:opacity-50 transition-opacity" />
                      )}
                      {deal.manager || '—'}
                    </button>
                  )}
                </td>

                {/* Close Date - editable */}
                <td className="py-2 px-3">
                  {isEditing(deal.id, 'closingDate') ? (
                    <div className="flex flex-col">
                      <input
                        ref={inputRef}
                        type="date"
                        value={editState!.value}
                        onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value, error: undefined } : null)}
                        onBlur={saveEdit}
                        onKeyDown={handleKeyDown}
                        className="w-[130px] text-xs bg-background border border-primary/40 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      {editState?.error && (
                        <span className="text-[10px] text-destructive mt-0.5 flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" />
                          {editState.error}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(deal.id, 'closingDate', deal.closingDate || '')}
                      className="group/edit inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      {isSaving(deal.id, 'closingDate') ? (
                        <Check className="h-3 w-3 text-success animate-pulse" />
                      ) : (
                        <Pencil className="h-3 w-3 opacity-0 group-hover/edit:opacity-50 transition-opacity" />
                      )}
                      {deal.closingDate
                        ? new Date(deal.closingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </button>
                  )}
                </td>

                {/* View deal */}
                <td className="py-2 px-1">
                  <button
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    className="p-1 rounded hover:bg-muted/50 transition-colors"
                    title="View deal"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                  No deals in this stage
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
