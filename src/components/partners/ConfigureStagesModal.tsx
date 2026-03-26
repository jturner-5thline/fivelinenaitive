import { useState, useEffect } from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePipelineStages, useSavePipelineStages, type PipelineStage } from '@/hooks/usePartnersPipeline';

const PRESET_COLORS = ['#6b7280', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

interface StageRow {
  id: string;
  company_id: string;
  name: string;
  definition: string;
  color: string;
  sort_order: number;
}

export function ConfigureStagesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: stages = [] } = usePipelineStages();
  const save = useSavePipelineStages();
  const [rows, setRows] = useState<StageRow[]>([]);

  useEffect(() => {
    if (open && stages.length > 0) {
      setRows(stages.map(s => ({ id: s.id, company_id: s.company_id, name: s.name, definition: s.definition, color: s.color, sort_order: s.sort_order })));
    }
  }, [open, stages]);

  const update = (idx: number, field: keyof StageRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const remove = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const addRow = () => {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      company_id: stages[0]?.company_id || '',
      name: '',
      definition: '',
      color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
      sort_order: prev.length,
    }]);
  };

  const handleSave = () => {
    save.mutate(rows, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Pipeline Stages</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.id} className="flex items-start gap-2 p-2 rounded border border-slate-700 bg-slate-800/50">
              <GripVertical className="h-4 w-4 text-slate-500 mt-2.5 shrink-0 cursor-grab" />
              <div className="relative shrink-0 mt-2.5">
                <input
                  type="color"
                  value={row.color}
                  onChange={(e) => update(idx, 'color', e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
                />
                <span className="block h-5 w-5 rounded-full border border-slate-600" style={{ backgroundColor: row.color }} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Input
                  value={row.name}
                  onChange={e => update(idx, 'name', e.target.value)}
                  placeholder="Stage name"
                  className="h-8 text-sm"
                />
                <Textarea
                  value={row.definition}
                  onChange={e => update(idx, 'definition', e.target.value)}
                  placeholder="Definition..."
                  className="min-h-[40px] text-xs resize-none"
                  rows={1}
                />
              </div>
              <button onClick={() => remove(idx)} className="text-slate-500 hover:text-red-400 mt-2.5 shrink-0">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 w-full mt-2">
          <Plus className="h-3.5 w-3.5" /> Add Stage
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
