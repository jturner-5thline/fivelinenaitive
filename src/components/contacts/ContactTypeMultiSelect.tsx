import { useMemo, useRef, useState } from 'react';
import { Check, Plus, X, Pencil, Trash2, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  useContactTypes,
  useCreateContactType,
  useUpdateContactType,
  useDeleteContactType,
  ContactType,
} from '@/hooks/useContactTypes';
import { useCompany } from '@/hooks/useCompany';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contactTypeBadgeClass } from './contactTypeBadge';
import { cn } from '@/lib/utils';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';

const SEPARATOR = ' ; ';
const PROTECTED_TYPES = new Set(['referral source']);

function isProtectedType(name: string): boolean {
  return PROTECTED_TYPES.has(name.trim().toLowerCase());
}

export function splitContactTypes(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*;\s*/g)
    .map(s => s.trim())
    .filter(Boolean);
}

export function joinContactTypes(tags: string[]): string | null {
  const cleaned = Array.from(new Set(tags.map(t => t.trim()).filter(Boolean)));
  return cleaned.length ? cleaned.join(SEPARATOR) : null;
}

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
}

export function ContactTypeMultiSelect({ value, onChange, className }: Props) {
  const { isAdmin, company } = useCompany();
  const queryClient = useQueryClient();
  const { data: types = [] } = useContactTypes({ includeInactive: isAdmin });
  useRealtimeInvalidate({
    table: 'contact_types',
    filter: company?.id ? `company_id=eq.${company.id}` : undefined,
    queryKeys: [['contact-types']],
    enabled: !!company?.id,
  });
  const createType = useCreateContactType();
  const updateType = useUpdateContactType();
  const deleteType = useDeleteContactType();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogScrollRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const [manage, setManage] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContactType | null>(null);
  const [affected, setAffected] = useState<Array<{ id: string; full_name: string | null; contact_type: string | null }>>([]);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [replacements, setReplacements] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [simpleDeleteTarget, setSimpleDeleteTarget] = useState<ContactType | null>(null);
  const selected = useMemo(() => splitContactTypes(value), [value]);

  const trimmed = search.trim();
  const exists = trimmed
    ? types.some(t => t.name.toLowerCase() === trimmed.toLowerCase())
    : true;

  const toggle = (name: string) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange(joinContactTypes(Array.from(set)));
  };

  const remove = (name: string) => {
    onChange(joinContactTypes(selected.filter(s => s !== name)));
  };

  const handleCreate = () => {
    if (!trimmed || exists) return;
    const nextOrder = Math.max(0, ...types.map(t => t.sort_order)) + 10;
    createType.mutate(
      { name: trimmed, sort_order: nextOrder },
      {
        onSuccess: (t) => {
          setSearch('');
          // auto-select the newly created type
          const set = new Set(selected);
          set.add(t.name);
          onChange(joinContactTypes(Array.from(set)));
        },
      },
    );
  };

  const saveRename = (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    updateType.mutate(
      { id, name },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditingName('');
        },
      },
    );
  };

  const startDelete = async (t: ContactType) => {
    if (!company?.id) return;
    if (isProtectedType(t.name)) {
      toast.error(`"${t.name}" is a system contact type and cannot be deleted.`);
      return;
    }
    setCheckingUsage(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, contact_type')
        .eq('company_id', company.id)
        .ilike('contact_type', `%${t.name}%`);
      if (error) throw error;
      const rows = (data || []).filter(r => splitContactTypes(r.contact_type).includes(t.name));
      if (rows.length === 0) {
        setSimpleDeleteTarget(t);
        return;
      }
      setDeleteTarget(t);
      setAffected(rows);
      setReplacements([]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to check contact type usage');
    } finally {
      setCheckingUsage(false);
    }
  };

  const confirmDeletion = async () => {
    if (!deleteTarget) return;
    setConfirmingDelete(true);
    try {
      // Update each affected contact: remove old type, add replacements
      for (const row of affected) {
        const current = splitContactTypes(row.contact_type);
        const next = joinContactTypes([
          ...current.filter(n => n !== deleteTarget.name),
          ...replacements,
        ]);
        const { error } = await supabase
          .from('contacts')
          .update({ contact_type: next as any })
          .eq('id', row.id);
        if (error) throw error;
      }
      deleteType.mutate(deleteTarget.id, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
          queryClient.invalidateQueries({ queryKey: ['contact'] });
          setDeleteTarget(null);
          setAffected([]);
          setReplacements([]);
          // reflect change locally if the current record was affected
          if (selected.includes(deleteTarget.name)) {
            onChange(joinContactTypes([
              ...selected.filter(n => n !== deleteTarget.name),
              ...replacements,
            ]));
          }
        },
      });
    } catch (e: any) {
      toast.error(e.message || 'Failed to reassign contacts');
    } finally {
      setConfirmingDelete(false);
    }
  };

  const toggleReplacement = (name: string) => {
    setReplacements(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const preserveDialogScroll = () => {
    const dialog = triggerRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (dialog) dialogScrollRef.current = { element: dialog, top: dialog.scrollTop };
  };

  const restoreDialogScroll = () => {
    const saved = dialogScrollRef.current;
    if (!saved) return;
    saved.element.scrollTop = saved.top;
    requestAnimationFrame(() => {
      saved.element.scrollTop = saved.top;
    });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {selected.map(tag => (
        <span key={tag} className={cn(contactTypeBadgeClass(tag), 'group gap-1 pr-1')}>
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) preserveDialogScroll();
          setOpen(o);
          if (o) requestAnimationFrame(restoreDialogScroll);
          if (!o) { setManage(false); setSearch(''); setEditingId(null); }
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            onPointerDown={preserveDialogScroll}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-border"
          >
            <Plus className="h-3 w-3" /> {selected.length ? 'Add' : 'Add type'}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-72 max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto"
          align="start"
          side="bottom"
          sideOffset={6}
          avoidCollisions
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            restoreDialogScroll();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
            restoreDialogScroll();
          }}
        >
          {manage && isAdmin ? (
            <div className="p-2 space-y-2">
              <div className="flex items-center justify-between px-1 pb-1 border-b border-border/60">
                <span className="text-xs font-medium">Manage contact types</span>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setManage(false)}>
                  Done
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="New type name…"
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="gradient"
                  className="h-7 px-2 text-[11px]"
                  disabled={!trimmed || exists || createType.isPending}
                  onClick={handleCreate}
                >
                  Add
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {types.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No types yet.</p>
                )}
                {types.map(t => (
                  <div key={t.id} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-muted/50">
                    {editingId === t.id ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(t.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                          className="h-6 text-xs"
                        />
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => saveRename(t.id)}>Save</Button>
                      </>
                    ) : (
                      <>
                        <span className={cn('flex-1 text-xs truncate', !t.is_active && 'line-through text-muted-foreground')}>
                          {t.name}
                        </span>
                        <button
                          type="button"
                          title={t.is_active ? 'Hide from dropdown' : 'Show in dropdown'}
                          onClick={() => updateType.mutate({ id: t.id, is_active: !t.is_active })}
                          className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                        >
                          {t.is_active ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          title="Rename"
                          onClick={() => { setEditingId(t.id); setEditingName(t.name); }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          disabled={checkingUsage || isProtectedType(t.name)}
                          onClick={() => startDelete(t)}
                          className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Search types..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>
                  {isAdmin && trimmed ? (
                    <button
                      type="button"
                      onClick={handleCreate}
                      className="w-full text-left text-xs px-2 py-1.5 hover:bg-muted rounded"
                    >
                      + Create "{trimmed}"
                    </button>
                  ) : (
                    'No types found.'
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {types.filter(t => t.is_active).map(t => {
                    const isSelected = selected.includes(t.name);
                    return (
                      <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.name)}>
                        <Check className={cn('mr-2 h-3.5 w-3.5', isSelected ? 'opacity-100' : 'opacity-0')} />
                        {t.name}
                      </CommandItem>
                    );
                  })}
                  {isAdmin && trimmed && !exists && (
                    <CommandItem value={`__create_${trimmed}`} onSelect={handleCreate}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Create "{trimmed}"
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
              {isAdmin && (
                <div className="border-t border-border/60 p-1">
                  <button
                    type="button"
                    onClick={() => { setManage(true); setSearch(''); }}
                    className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted"
                  >
                    <Settings2 className="h-3 w-3" /> Manage contact types
                  </button>
                </div>
              )}
            </Command>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setAffected([]); setReplacements([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              {affected.length} contact{affected.length === 1 ? '' : 's'} currently {affected.length === 1 ? 'has' : 'have'} this type.
              Choose replacement type(s) to reassign before deleting. Leave empty to remove this type without a replacement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Replacement types</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {types.filter(t => t.is_active && t.id !== deleteTarget?.id).map(t => {
                  const active = replacements.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleReplacement(t.name)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {t.name}
                    </button>
                  );
                })}
                {types.filter(t => t.is_active && t.id !== deleteTarget?.id).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No other active types available.</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Affected contacts ({affected.length})</p>
              <div className="max-h-40 overflow-y-auto rounded border border-border/60 divide-y divide-border/40">
                {affected.slice(0, 200).map(r => (
                  <div key={r.id} className="px-2 py-1 text-xs truncate">{r.full_name || '(unnamed)'}</div>
                ))}
                {affected.length > 200 && (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground">…and {affected.length - 200} more</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={confirmingDelete}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeletion} disabled={confirmingDelete}>
              {confirmingDelete ? 'Reassigning…' : `Reassign & delete`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!simpleDeleteTarget}
        onOpenChange={(o) => { if (!o) setSimpleDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{simpleDeleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              No contacts are currently using this type. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (simpleDeleteTarget) deleteType.mutate(simpleDeleteTarget.id);
                setSimpleDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}