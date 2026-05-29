import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatUSD } from '@/lib/formatters/currency';
import type { FinservProject } from '@/hooks/useFinservProjects';

interface Props {
  projects: FinservProject[];
  total: number;
  loading?: boolean;
  onAdd: (input: {
    name: string;
    startDate: string | null;
    completionDate: string | null;
    description: string | null;
    value: number;
  }) => Promise<void> | void;
  onUpdate: (
    id: string,
    patch: Partial<{
      name: string;
      startDate: string | null;
      completionDate: string | null;
      description: string | null;
      value: number;
    }>,
  ) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

interface DraftState {
  name: string;
  startDate: string;
  completionDate: string;
  description: string;
  value: string;
}

const emptyDraft = (): DraftState => ({
  name: '',
  startDate: '',
  completionDate: '',
  description: '',
  value: '',
});

const projectToDraft = (p: FinservProject): DraftState => ({
  name: p.name,
  startDate: p.startDate ?? '',
  completionDate: p.completionDate ?? '',
  description: p.description ?? '',
  value: p.value ? String(p.value) : '',
});

function ProjectForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Project Name</label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="PROJECT"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start Date</label>
          <Input
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Completion Date</label>
          <Input
            type="date"
            value={draft.completionDate}
            onChange={(e) => setDraft({ ...draft, completionDate: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Description / Notes</label>
          <Textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Scope, deliverables, notes…"
            className="min-h-[60px] text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Project Value (USD)</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={draft.value}
              onChange={(e) => {
                const raw = e.target.value.replace(/[$,\s]/g, '');
                if (raw === '' || /^\d+(\.\d{0,2})?$/.test(raw)) {
                  setDraft({ ...draft, value: raw });
                }
              }}
              placeholder="0"
              className="pl-5 h-8 text-sm"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave}>
          <Check className="h-3.5 w-3.5 mr-1" /> {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function FinServProjectsCard({
  projects,
  total,
  loading,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setAdding(true);
  };
  const startEdit = (p: FinservProject) => {
    setAdding(false);
    setEditingId(p.id);
    setDraft(projectToDraft(p));
  };
  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const saveAdd = async () => {
    await onAdd({
      name: draft.name.trim() || 'PROJECT',
      startDate: draft.startDate || null,
      completionDate: draft.completionDate || null,
      description: draft.description.trim() || null,
      value: Number(draft.value || 0),
    });
    cancel();
  };
  const saveEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, {
      name: draft.name.trim() || 'PROJECT',
      startDate: draft.startDate || null,
      completionDate: draft.completionDate || null,
      description: draft.description.trim() || null,
      value: Number(draft.value || 0),
    });
    cancel();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Projects</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total: <span className="font-medium text-foreground">{formatUSD(total)}</span>
            <span className="ml-1">= One-Time Revenue</span>
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add project
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <ProjectForm
            draft={draft}
            setDraft={setDraft}
            onSave={saveAdd}
            onCancel={cancel}
            saveLabel="Add"
          />
        )}
        {projects.length === 0 && !adding && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No projects yet. Add one to start tracking one-time revenue.
          </p>
        )}
        <div className="space-y-2">
          {projects.map((p) =>
            editingId === p.id ? (
              <ProjectForm
                key={p.id}
                draft={draft}
                setDraft={setDraft}
                onSave={saveEdit}
                onCancel={cancel}
                saveLabel="Save"
              />
            ) : (
              <div
                key={p.id}
                className="group rounded-md border border-border bg-card/60 p-3 flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-sm truncate">{p.name || 'PROJECT'}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.startDate || '—'} → {p.completionDate || '—'}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                      {p.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{formatUSD(p.value || 0)}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(p)}
                      aria-label="Edit project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(p.id)}
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}