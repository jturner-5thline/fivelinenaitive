import { useState } from 'react';
import { Plus, FileText, Copy, Trash2, ToggleLeft, ToggleRight, Pencil, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { useAgreementTemplates } from './useAgreementTemplates';
import { AgreementTemplate } from './types';
import { AgreementTemplateEditor } from './AgreementTemplateEditor';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function AgreementTemplatesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { templates, loading, seedDefaultTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useAgreementTemplates();
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [seeding, setSeeding] = useState(false);

  const handleSeedDefault = async () => {
    setSeeding(true);
    await seedDefaultTemplate();
    setSeeding(false);
  };

  if (editingTemplate) {
    return (
      <AgreementTemplateEditor
        template={editingTemplate}
        onBack={() => setEditingTemplate(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Agreement Templates</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Manage legal agreement templates for deal engagements</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {templates.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleSeedDefault} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Create Default Template
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">No agreement templates yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Create a template or seed the default one to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(tpl => (
              <div key={tpl.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{tpl.name}</span>
                    <Badge variant={tpl.is_active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {tpl.sections.length} sections • Created {tpl.created_at ? format(new Date(tpl.created_at), 'MMM d, yyyy') : ''}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTemplate(tpl)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateTemplate(tpl)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateTemplate(tpl.id, { is_active: !tpl.is_active })}
                    >
                      {tpl.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete "{tpl.name}" and all its sections. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTemplate(tpl.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Agreement Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Template Name</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Exclusive Advisory Agreement" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description of this template" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <CreateTemplateButton name={newName} description={newDesc} onDone={() => { setShowCreateDialog(false); setNewName(''); setNewDesc(''); }} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
