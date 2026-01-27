import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryIconPicker, getCategoryIcon } from '@/components/settings/CategoryIconPicker';
import { CategoryColorPicker } from '@/components/settings/CategoryColorPicker';
import { CategoryColor, CategoryIcon, getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { cn } from '@/lib/utils';

interface AddDataRoomFolderDialogProps {
  onAdd: (name: string, icon: CategoryIcon, color: CategoryColor) => Promise<any>;
  existingFolderNames: string[];
}

export function AddDataRoomFolderDialog({ onAdd, existingFolderNames }: AddDataRoomFolderDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<CategoryIcon>('folder');
  const [color, setColor] = useState<CategoryColor>('blue');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Folder name is required');
      return;
    }

    // Check for duplicate names
    if (existingFolderNames.some(n => n.toLowerCase() === trimmedName.toLowerCase())) {
      setError('A folder with this name already exists');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onAdd(trimmedName, icon, color);
      setOpen(false);
      // Reset form
      setName('');
      setIcon('folder');
      setColor('blue');
    } catch (err) {
      setError('Failed to create folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setError('');
      setName('');
      setIcon('folder');
      setColor('blue');
    }
  };

  const colorClasses = getCategoryColorClasses(color);
  const IconComponent = getCategoryIcon(icon);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FolderPlus className="h-4 w-4" />
          Add Folder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Data Room Folder</DialogTitle>
          <DialogDescription>
            Add a new folder to organize your data room documents. This folder will be available for all deals and can be synced to FLEx.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name *</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g., Legal Documents"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              <CategoryIconPicker value={icon} onChange={setIcon} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <CategoryColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg border",
              colorClasses.bgClass
            )}>
              <IconComponent className={cn("h-5 w-5", colorClasses.textClass)} />
              <span className={cn("font-medium", colorClasses.textClass)}>
                {name.trim() || 'Folder Name'}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
