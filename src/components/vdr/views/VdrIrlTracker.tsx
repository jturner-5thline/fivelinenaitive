import { useState, useCallback, useMemo, useRef } from 'react';
import { useVdrIrlRequests, IrlStatus } from '@/hooks/useVdrIrlRequests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Upload, Plus, ChevronDown, ChevronRight, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { VdrIrlRequest } from '@/components/vdr/types';

interface VdrIrlTrackerProps {
  dealId: string;
}

type FilterStatus = 'all' | IrlStatus;

const STATUS_CONFIG: Record<IrlStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  addressed: { label: 'Addressed', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  pending_review: { label: 'Pending Review', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

const STATUS_CYCLE: IrlStatus[] = ['open', 'addressed', 'pending_review'];

function parseIrlCsv(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const numIdx = headers.findIndex(h => h.includes('number') || h.includes('request_number') || h === 'no' || h === '#');
  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('request_name') || h.includes('title'));
  const descIdx = headers.findIndex(h => h.includes('desc'));
  const catIdx = headers.findIndex(h => h.includes('cat'));
  const statIdx = headers.findIndex(h => h.includes('stat'));

  if (nameIdx === -1) return [];

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return {
      request_number: numIdx >= 0 ? cols[numIdx] : undefined,
      request_name: cols[nameIdx] || 'Unnamed',
      description: descIdx >= 0 ? cols[descIdx] : undefined,
      category: catIdx >= 0 ? cols[catIdx] : undefined,
      status: statIdx >= 0 ? cols[statIdx] : 'open',
    };
  }).filter(r => r.request_name && r.request_name !== 'Unnamed');
}

export function VdrIrlTracker({ dealId }: VdrIrlTrackerProps) {
  const { requests, loading, counts, addRequest, updateRequest, deleteRequest, bulkUpdateStatus, importFromCsv } = useVdrIrlRequests(dealId);

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<VdrIrlRequest>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ request_number: '', request_name: '', description: '', category: '', status: 'open' as IrlStatus });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter(r => r.status === filter);
  }, [requests, filter]);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }, [allSelected, filtered]);

  const handleStatusCycle = useCallback((req: VdrIrlRequest) => {
    const idx = STATUS_CYCLE.indexOf(req.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    updateRequest(req.id, { status: next });
  }, [updateRequest]);

  const handleCsvUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseIrlCsv(text);
    if (rows.length === 0) { toast.error('No valid rows found. Expected columns: Request Number, Request Name, Description, Category, Status'); return; }
    await importFromCsv(rows);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [importFromCsv]);

  const startEdit = useCallback((req: VdrIrlRequest) => {
    setEditingId(req.id);
    setEditForm({ request_number: req.request_number, request_name: req.request_name, description: req.description, category: req.category, status: req.status });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    await updateRequest(editingId, editForm);
    setEditingId(null);
    toast.success('Request updated');
  }, [editingId, editForm, updateRequest]);

  const handleAdd = useCallback(async () => {
    if (!addForm.request_name.trim()) { toast.error('Request name is required'); return; }
    await addRequest(addForm);
    setAddForm({ request_number: '', request_name: '', description: '', category: '', status: 'open' });
    setShowAddForm(false);
  }, [addForm, addRequest]);

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <h1 className="text-lg font-semibold">Information Request List</h1>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload IRL
          </Button>
        </div>
      </div>

      {/* Filters + Stats */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/40">
        <div className="flex gap-1">
          {(['all', 'open', 'addressed', 'pending_review'] as FilterStatus[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {f === 'all' ? 'All' : f === 'pending_review' ? 'Pending Review' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{counts.total} Total</Badge>
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{counts.addressed} Addressed</Badge>
          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">{counts.open} Open</Badge>
        </div>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-primary/5 border-b border-border/40">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Change Status <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {STATUS_CYCLE.map(s => (
                <DropdownMenuItem key={s} onClick={() => { bulkUpdateStatus(Array.from(selected), s); setSelected(new Set()); }}>
                  {STATUS_CONFIG[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <p className="text-sm">No requests found</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Request
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 sticky top-0">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </th>
                <th className="px-3 py-2.5 w-24">Request #</th>
                <th className="px-3 py-2.5">Request Name</th>
                <th className="px-3 py-2.5 w-32">Category</th>
                <th className="px-3 py-2.5 w-32">Status</th>
                <th className="px-3 py-2.5 w-36">Matched Docs</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => {
                const isExpanded = expandedId === req.id;
                const statusCfg = STATUS_CONFIG[req.status];
                return (
                  <IrlRow
                    key={req.id}
                    req={req}
                    isExpanded={isExpanded}
                    isSelected={selected.has(req.id)}
                    statusCfg={statusCfg}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : req.id)}
                    onToggleSelect={() => toggleSelect(req.id)}
                    onStatusCycle={() => handleStatusCycle(req)}
                    onEdit={() => startEdit(req)}
                    onDelete={() => deleteRequest(req.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Request Button */}
      <div className="px-6 py-3 border-t border-border/40">
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowAddForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Request
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Request # (e.g., 1.01)" value={addForm.request_number} onChange={e => setAddForm(f => ({ ...f, request_number: e.target.value }))} />
            <Input placeholder="Request Name *" value={addForm.request_name} onChange={e => setAddForm(f => ({ ...f, request_name: e.target.value }))} />
            <Textarea placeholder="Description" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            <Input placeholder="Category" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} />
            <Select value={addForm.status} onValueChange={(v: IrlStatus) => setAddForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="addressed">Addressed</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={open => { if (!open) setEditingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Request #" value={editForm.request_number || ''} onChange={e => setEditForm(f => ({ ...f, request_number: e.target.value }))} />
            <Input placeholder="Request Name" value={editForm.request_name || ''} onChange={e => setEditForm(f => ({ ...f, request_name: e.target.value }))} />
            <Textarea placeholder="Description" value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            <Input placeholder="Category" value={editForm.category || ''} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
            <Select value={editForm.status || 'open'} onValueChange={(v: IrlStatus) => setEditForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="addressed">Addressed</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Row component ────────────────────────────────────── */

function IrlRow({ req, isExpanded, isSelected, statusCfg, onToggleExpand, onToggleSelect, onStatusCycle, onEdit, onDelete }: {
  req: VdrIrlRequest;
  isExpanded: boolean;
  isSelected: boolean;
  statusCfg: { label: string; className: string };
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onStatusCycle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          'border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors',
          isSelected && 'bg-primary/5'
        )}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
        </td>
        <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{req.request_number || '—'}</td>
        <td className="px-3 py-2.5 font-medium flex items-center gap-1.5">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="truncate">{req.request_name}</span>
        </td>
        <td className="px-3 py-2.5 text-muted-foreground text-xs">{req.category || '—'}</td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-2 py-0.5 cursor-pointer border transition-colors', statusCfg.className)}
            onClick={onStatusCycle}
          >
            {statusCfg.label}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-muted-foreground text-xs">—</td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive">
                    <Trash2 className="h-3 w-3 mr-2" /> Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Request</AlertDialogTitle>
                    <AlertDialogDescription>Are you sure you want to delete "{req.request_name}"?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-secondary/10">
          <td colSpan={7} className="px-10 py-4">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Description</p>
                <p className="text-sm text-foreground/80">{req.description || 'No description provided.'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Matched Documents</p>
                <p className="text-xs text-muted-foreground italic">AI document matching coming in Phase 2</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
                  <Pencil className="h-3 w-3 mr-1.5" /> Edit
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
