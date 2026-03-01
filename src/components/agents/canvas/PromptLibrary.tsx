import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Plus, Trash2, Copy, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: 'system_prompt' | 'tool_schema' | 'review_criteria';
  createdAt: string;
}

export interface ToolSchemaTemplate {
  id: string;
  name: string;
  description: string;
  schema: string; // JSON schema string
  category: string;
  createdAt: string;
}

const STORAGE_KEY_PROMPTS = 'agent-prompt-library';
const STORAGE_KEY_SCHEMAS = 'agent-tool-schemas';

function loadPrompts(): PromptTemplate[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_PROMPTS) || '[]'); } catch { return []; }
}
function savePrompts(p: PromptTemplate[]) { localStorage.setItem(STORAGE_KEY_PROMPTS, JSON.stringify(p)); }

function loadSchemas(): ToolSchemaTemplate[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SCHEMAS) || '[]'); } catch { return []; }
}
function saveSchemas(s: ToolSchemaTemplate[]) { localStorage.setItem(STORAGE_KEY_SCHEMAS, JSON.stringify(s)); }

interface PromptLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPrompt?: (prompt: string) => void;
  onSelectSchema?: (schema: string) => void;
  mode?: 'prompt' | 'schema' | 'both';
}

export function PromptLibrary({ open, onOpenChange, onSelectPrompt, onSelectSchema, mode = 'both' }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState(loadPrompts);
  const [schemas, setSchemas] = useState(loadSchemas);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'prompts' | 'schemas'>(mode === 'schema' ? 'schemas' : 'prompts');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newContent, setNewContent] = useState('');

  const filteredPrompts = prompts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSchemas = schemas.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddPrompt = () => {
    if (!newName.trim() || !newContent.trim()) { toast.error('Name and content required'); return; }
    const item: PromptTemplate = {
      id: `pt_${Date.now()}`,
      name: newName,
      description: newDesc,
      prompt: newContent,
      category: 'system_prompt',
      createdAt: new Date().toISOString(),
    };
    const updated = [...prompts, item];
    setPrompts(updated);
    savePrompts(updated);
    setAdding(false);
    setNewName(''); setNewDesc(''); setNewContent('');
    toast.success('Prompt saved to library');
  };

  const handleAddSchema = () => {
    if (!newName.trim() || !newContent.trim()) { toast.error('Name and schema required'); return; }
    const item: ToolSchemaTemplate = {
      id: `ts_${Date.now()}`,
      name: newName,
      description: newDesc,
      schema: newContent,
      category: 'tool',
      createdAt: new Date().toISOString(),
    };
    const updated = [...schemas, item];
    setSchemas(updated);
    saveSchemas(updated);
    setAdding(false);
    setNewName(''); setNewDesc(''); setNewContent('');
    toast.success('Schema saved to library');
  };

  const deletePrompt = (id: string) => {
    const updated = prompts.filter(p => p.id !== id);
    setPrompts(updated);
    savePrompts(updated);
  };

  const deleteSchema = (id: string) => {
    const updated = schemas.filter(s => s.id !== id);
    setSchemas(updated);
    saveSchemas(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {mode === 'schema' ? 'Tool Schema Library' : mode === 'prompt' ? 'Prompt Library' : 'Prompt & Schema Library'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {mode === 'both' && (
            <div className="flex gap-1">
              <Button variant={tab === 'prompts' ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTab('prompts')}>
                Prompts ({prompts.length})
              </Button>
              <Button variant={tab === 'schemas' ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTab('schemas')}>
                Schemas ({schemas.length})
              </Button>
            </div>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="h-7 pl-7 text-xs" />
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1.5 pr-2">
            {tab === 'prompts' && filteredPrompts.map(p => (
              <div key={p.id} className="p-2 rounded-md border border-border hover:bg-muted/30 group">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{p.name}</p>
                    {p.description && <p className="text-[10px] text-muted-foreground">{p.description}</p>}
                    <pre className="text-[10px] text-foreground/70 mt-1 whitespace-pre-wrap max-h-16 overflow-hidden">{p.prompt.slice(0, 150)}{p.prompt.length > 150 ? '…' : ''}</pre>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onSelectPrompt?.(p.prompt); onOpenChange(false); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deletePrompt(p.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {tab === 'schemas' && filteredSchemas.map(s => (
              <div key={s.id} className="p-2 rounded-md border border-border hover:bg-muted/30 group">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{s.name}</p>
                    {s.description && <p className="text-[10px] text-muted-foreground">{s.description}</p>}
                    <pre className="text-[10px] text-foreground/70 mt-1 font-mono whitespace-pre-wrap max-h-16 overflow-hidden">{s.schema.slice(0, 150)}{s.schema.length > 150 ? '…' : ''}</pre>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onSelectSchema?.(s.schema); onOpenChange(false); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSchema(s.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {((tab === 'prompts' && filteredPrompts.length === 0) || (tab === 'schemas' && filteredSchemas.length === 0)) && (
              <p className="text-xs text-muted-foreground text-center py-6">
                {search ? 'No matches found' : `No ${tab} yet. Click "Add" to create one.`}
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Add form */}
        {adding && (
          <div className="border-t border-border pt-3 space-y-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="h-7 text-xs" />
            <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="h-7 text-xs" />
            <Textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={tab === 'prompts' ? 'System prompt text...' : '{"type": "object", "properties": {...}}'}
              className="text-xs min-h-[80px] font-mono"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" className="text-xs h-7" onClick={tab === 'prompts' ? handleAddPrompt : handleAddSchema}>Save</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
