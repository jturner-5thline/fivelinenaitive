import { useState } from 'react';
import { Plus, Copy, Trash2, Edit2, Check, X, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DashboardPreset } from '@/hooks/useDashboardPresets';
import { cn } from '@/lib/utils';

interface PresetManagerProps {
  presets: DashboardPreset[];
  activePreset: DashboardPreset | null;
  onSwitch: (presetId: string) => void;
  onCreate: (name: string) => void;
  onDuplicate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onRename: (presetId: string, name: string) => void;
}

export function PresetManager({ presets, activePreset, onSwitch, onCreate, onDuplicate, onDelete, onRename }: PresetManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const startEdit = (preset: DashboardPreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
  };

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const commitNew = () => {
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName('');
      setShowNew(false);
    }
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {presets.map(preset => (
        <div key={preset.id} className="flex items-center shrink-0">
          {editingId === preset.id ? (
            <div className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 w-32 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={commitEdit}><Check className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    preset.id === activePreset?.id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => onSwitch(preset.id)}
                >
                  <LayoutGrid className="h-3 w-3" />
                  {preset.name}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => onSwitch(preset.id)}>
                  <Check className="h-3.5 w-3.5 mr-2" />Activate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => startEdit(preset)}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" />Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(preset.id)}>
                  <Copy className="h-3.5 w-3.5 mr-2" />Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(preset.id)}
                  className="text-destructive focus:text-destructive"
                  disabled={presets.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}

      <Separator orientation="vertical" className="h-5 mx-1" />

      {showNew ? (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Preset name..."
            className="h-7 w-32 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew();
              if (e.key === 'Escape') { setShowNew(false); setNewName(''); }
            }}
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={commitNew}><Check className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowNew(false); setNewName(''); }}><X className="h-3 w-3" /></Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setShowNew(true)}>
          <Plus className="h-3 w-3" />New
        </Button>
      )}
    </div>
  );
}
