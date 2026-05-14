import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Pencil, FileText, Check, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { NOTE_TEMPLATES } from './NoteTemplates';
import { useCustomNoteTemplates, CustomNoteTemplate } from '@/hooks/useCustomNoteTemplates';
import { cn } from '@/lib/utils';

interface UnifiedTemplate {
  id: string;
  title: string;
  icon: string;
  content: string;
  isCustom: boolean;
}

function combineTemplates(custom: CustomNoteTemplate[]): UnifiedTemplate[] {
  return [
    ...NOTE_TEMPLATES.map(t => ({ id: `builtin:${t.name}`, title: t.title, icon: t.icon, content: t.content, isCustom: false })),
    ...custom.map(t => ({ id: t.id, title: t.name, icon: t.icon || '📝', content: t.content, isCustom: true })),
  ];
}

// ─── Picker ───
export function TemplatePickerDialog({ open, onOpenChange, onPick }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onPick: (title: string, content: string) => void;
}) {
  const { templates: custom } = useCustomNoteTemplates();
  const all = combineTemplates(custom);
  const [selectedId, setSelectedId] = useState<string | null>(all[0]?.id || null);
  const selected = all.find(t => t.id === selectedId) || all[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
          <DialogDescription>Select a template to start your new note.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[220px_1fr] gap-4 h-[400px]">
          <ScrollArea className="border rounded-md">
            <div className="py-1">
              {all.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                    selectedId === t.id && "bg-muted"
                  )}
                >
                  <span>{t.icon}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.isCustom && <span className="text-[9px] text-muted-foreground">Custom</span>}
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="border rounded-md overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">Preview</div>
            <ScrollArea className="flex-1">
              <div className="prose prose-sm dark:prose-invert max-w-none p-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected?.content || '', { USE_PROFILES: { html: true } }) }} />
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (selected) { onPick(selected.title, selected.content); onOpenChange(false); } }} disabled={!selected}>
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manage ───
export function ManageTemplatesDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { templates, update, remove } = useCustomNoteTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Templates</DialogTitle>
          <DialogDescription>Edit or delete your saved custom templates. Built-in templates can't be modified.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {templates.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No custom templates yet. Save any note as a template from its action menu.
            </div>
          ) : (
            <div className="divide-y">
              {templates.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-2">
                  <span>{t.icon || '📝'}</span>
                  {editingId === t.id ? (
                    <>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm flex-1" autoFocus />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { if (editName.trim()) { await update.mutateAsync({ id: t.id, name: editName.trim() }); } setEditingId(null); }}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{t.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Template</AlertDialogTitle>
                            <AlertDialogDescription>Delete "{t.name}"? This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove.mutate(t.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Save as Template ───
export function SaveAsTemplateDialog({ open, onOpenChange, defaultName, content }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  defaultName: string; content: string;
}) {
  const { create } = useCustomNoteTemplates();
  const [name, setName] = useState(defaultName);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setName(defaultName); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>Saves this note's content as a reusable template available across all deals in your company.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Template name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Quarterly Review" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => { if (name.trim()) { await create.mutateAsync({ name: name.trim(), content }); onOpenChange(false); } }} disabled={!name.trim()}>
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
