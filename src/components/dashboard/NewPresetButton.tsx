import { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NewPresetButtonProps {
  onCreate: (name: string) => void;
  className?: string;
}

/**
 * Standalone "+ New" preset trigger. Extracted from PresetManager so it
 * can be rendered next to the News Feed tab while the rest of the
 * preset list lives inside PresetManager.
 */
export function NewPresetButton({ onCreate, className }: NewPresetButtonProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const commit = () => {
    const name = newName.trim();
    if (name) {
      onCreate(name);
      setNewName('');
      setShowNew(false);
    }
  };

  if (showNew) {
    return (
      <div className={`flex items-center gap-1 shrink-0 ${className ?? ''}`}>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          className="h-7 w-32 text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setShowNew(false); setNewName(''); }
          }}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={commit}><Check className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowNew(false); setNewName(''); }}><X className="h-3 w-3" /></Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-7 text-xs gap-1 shrink-0 ${className ?? ''}`}
      onClick={() => setShowNew(true)}
    >
      <Plus className="h-3 w-3" />New
    </Button>
  );
}