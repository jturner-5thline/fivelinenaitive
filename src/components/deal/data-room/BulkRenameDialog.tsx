import { useState, useEffect } from 'react';
import { Pencil, Wand2, Loader2, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileIcon } from './FileIcon';
import type { DealAttachment } from '@/hooks/useDealAttachments';

type NamingAction = 'prefix' | 'suffix' | 'replace' | 'custom';

interface BulkRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: DealAttachment[];
  onRename: (renames: { id: string; newName: string }[]) => Promise<void>;
}

export function BulkRenameDialog({ open, onOpenChange, files, onRename }: BulkRenameDialogProps) {
  const [action, setAction] = useState<NamingAction>('prefix');
  const [value, setValue] = useState('');
  const [findText, setFindText] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setAction('prefix');
      setValue('');
      setFindText('');
      const initial: Record<string, string> = {};
      files.forEach(f => { initial[f.id] = f.name; });
      setCustomNames(initial);
    }
  }, [open, files]);

  const getPreviewName = (originalName: string): string => {
    const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
    const baseName = originalName.replace(/\.[^.]+$/, '');

    switch (action) {
      case 'prefix':
        return value ? `${value} ${originalName}` : originalName;
      case 'suffix':
        return value ? `${baseName} ${value}${ext}` : originalName;
      case 'replace':
        return findText ? originalName.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), value) : originalName;
      case 'custom':
        return originalName; // handled individually
      default:
        return originalName;
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const renames = files.map(f => ({
        id: f.id,
        newName: action === 'custom' ? (customNames[f.id] || f.name) : getPreviewName(f.name),
      })).filter(r => r.newName !== files.find(f => f.id === r.id)?.name);

      if (renames.length > 0) {
        await onRename(renames);
      }
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Bulk Rename ({files.length} files)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Action:</Label>
            <Select value={action} onValueChange={(v) => setAction(v as NamingAction)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prefix">Add Prefix</SelectItem>
                <SelectItem value="suffix">Add Suffix</SelectItem>
                <SelectItem value="replace">Find & Replace</SelectItem>
                <SelectItem value="custom">Custom (per file)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {action !== 'custom' && (
            <div className="space-y-2">
              {action === 'replace' && (
                <div>
                  <Label className="text-xs">Find:</Label>
                  <Input
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder="Text to find..."
                    className="h-8 text-xs mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">{action === 'replace' ? 'Replace with:' : 'Text:'}</Label>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={action === 'prefix' ? 'e.g. 2024 Q4 -' : action === 'suffix' ? 'e.g. - Final' : 'Replacement text...'}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          )}

          <Separator />

          <div>
            <Label className="text-xs font-semibold">Preview</Label>
            <ScrollArea className="h-[240px] mt-2">
              <div className="space-y-1.5">
                {files.map(f => {
                  const newName = action === 'custom' ? (customNames[f.id] || f.name) : getPreviewName(f.name);
                  const changed = newName !== f.name;

                  return (
                    <div key={f.id} className="flex items-center gap-2 p-2 rounded-md border text-xs">
                      <FileIcon name={f.name} className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-muted-foreground line-through truncate text-[10px]">{f.name}</p>
                        {action === 'custom' ? (
                          <Input
                            value={customNames[f.id] || ''}
                            onChange={(e) => setCustomNames(prev => ({ ...prev, [f.id]: e.target.value }))}
                            className="h-6 text-xs px-1"
                          />
                        ) : (
                          <p className="truncate font-medium">{newName}</p>
                        )}
                      </div>
                      {changed && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleApply} disabled={isApplying} className="gap-1.5">
            {isApplying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
            Rename {files.length} Files
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
