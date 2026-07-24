import { useMemo, useState } from 'react';
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
import { contactTypeBadgeClass } from './contactTypeBadge';
import { cn } from '@/lib/utils';

const SEPARATOR = ' ; ';

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
  const { isAdmin } = useCompany();
  const { data: types = [] } = useContactTypes({ includeInactive: isAdmin });
  const createType = useCreateContactType();
  const updateType = useUpdateContactType();
  const deleteType = useDeleteContactType();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
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
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setManage(false); setSearch(''); setEditingId(null); } }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-border"
          >
            <Plus className="h-3 w-3" /> {selected.length ? 'Add' : 'Add type'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
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
                          onClick={() => {
                            if (confirm(`Delete "${t.name}"? Contacts already assigned will keep their value.`)) {
                              deleteType.mutate(t.id);
                            }
                          }}
                          className="p-1 text-muted-foreground hover:text-destructive"
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
    </div>
  );
}