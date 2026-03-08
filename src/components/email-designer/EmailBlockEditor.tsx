import { useState } from 'react';
import { Plus, Trash2, GripVertical, Type, RectangleHorizontal, Image, Minus, ArrowUpDown, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MERGE_TAGS, blocksToHtml, type EmailBlock, type EmailTemplateV2 } from '@/hooks/useEmailDesigner';

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'button', label: 'Button', icon: RectangleHorizontal },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: ArrowUpDown },
] as const;

function defaultBlockProps(type: string): Record<string, any> {
  switch (type) {
    case 'text': return { content: '<p>Your text here</p>', align: 'left', fontSize: 14 };
    case 'button': return { text: 'Click Here', url: '#', color: '#20808d', align: 'center' };
    case 'image': return { src: '', alt: '', width: '100%', align: 'center' };
    case 'divider': return {};
    case 'spacer': return { height: 24 };
    default: return {};
  }
}

interface Props {
  template: EmailTemplateV2;
  onClose: () => void;
  onSave: (updated: Partial<EmailTemplateV2>) => void;
}

export function EmailBlockEditor({ template, onClose, onSave }: Props) {
  const [blocks, setBlocks] = useState<EmailBlock[]>((template.template_json as any[]) || []);
  const [subject, setSubject] = useState(template.subject_template || '');
  const [previewText, setPreviewText] = useState(template.preview_text_template || '');
  const [tab, setTab] = useState('edit');

  const addBlock = (type: string) => {
    setBlocks([...blocks, { id: crypto.randomUUID(), type: type as any, props: defaultBlockProps(type) }]);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const updateBlockProp = (id: string, key: string, value: any) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
    setBlocks(copy);
  };

  const insertMergeTag = (tag: string, blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (block?.type === 'text') {
      updateBlockProp(blockId, 'content', (block.props.content || '') + `{{${tag}}}`);
    }
  };

  const handleSave = () => {
    onSave({
      id: template.id,
      name: template.name,
      template_json: blocks as any,
      subject_template: subject,
      preview_text_template: previewText,
    });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit: {template.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="edit">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="merge">Merge Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Subject Line</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject with {{merge.tags}}" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preview Text</Label>
                <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Preview text..." />
              </div>
            </div>

            {/* Block list */}
            <div className="space-y-2">
              {blocks.map((block, idx) => (
                <div key={block.id} className="border border-border rounded-lg p-3 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <Badge variant="secondary" className="text-[10px] capitalize">{block.type}</Badge>
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveBlock(idx, -1)} disabled={idx === 0}>
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                    {block.type === 'text' && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6"><Tag className="h-3 w-3" /></Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2">
                          <div className="space-y-1">
                            {MERGE_TAGS.map(tag => (
                              <Button key={tag.key} variant="ghost" size="sm" className="w-full justify-start text-xs h-7"
                                onClick={() => insertMergeTag(tag.key, block.id)}>
                                {tag.label}
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeBlock(block.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Block-specific editors */}
                  {block.type === 'text' && (
                    <Textarea
                      value={block.props.content || ''}
                      onChange={e => updateBlockProp(block.id, 'content', e.target.value)}
                      className="text-xs min-h-[60px] font-mono"
                      placeholder="<p>Your HTML content...</p>"
                    />
                  )}
                  {block.type === 'button' && (
                    <div className="grid grid-cols-3 gap-2">
                      <Input className="text-xs" placeholder="Button text" value={block.props.text || ''} onChange={e => updateBlockProp(block.id, 'text', e.target.value)} />
                      <Input className="text-xs" placeholder="URL" value={block.props.url || ''} onChange={e => updateBlockProp(block.id, 'url', e.target.value)} />
                      <Input className="text-xs" placeholder="Color #hex" value={block.props.color || ''} onChange={e => updateBlockProp(block.id, 'color', e.target.value)} />
                    </div>
                  )}
                  {block.type === 'image' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input className="text-xs" placeholder="Image URL" value={block.props.src || ''} onChange={e => updateBlockProp(block.id, 'src', e.target.value)} />
                      <Input className="text-xs" placeholder="Alt text" value={block.props.alt || ''} onChange={e => updateBlockProp(block.id, 'alt', e.target.value)} />
                    </div>
                  )}
                  {block.type === 'spacer' && (
                    <Input className="text-xs w-24" type="number" placeholder="Height px" value={block.props.height || 24} onChange={e => updateBlockProp(block.id, 'height', parseInt(e.target.value) || 24)} />
                  )}
                </div>
              ))}
            </div>

            {/* Add block buttons */}
            <div className="flex gap-2 flex-wrap">
              {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                <Button key={type} variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => addBlock(type)}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-y-auto mt-4">
            <div className="border border-border rounded-lg bg-card max-w-xl mx-auto">
              <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground">
                Subject: <span className="font-medium text-foreground">{subject || '(none)'}</span>
              </div>
              <div className="p-6" dangerouslySetInnerHTML={{ __html: blocksToHtml(blocks) }} />
            </div>
          </TabsContent>

          <TabsContent value="merge" className="flex-1 overflow-y-auto mt-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Available merge tags — click to copy:</p>
              <div className="grid grid-cols-2 gap-2">
                {MERGE_TAGS.map(tag => (
                  <Button key={tag.key} variant="outline" className="justify-start text-xs font-mono h-8"
                    onClick={() => { navigator.clipboard.writeText(`{{${tag.key}}}`); }}>
                    {`{{${tag.key}}}`} <span className="ml-auto text-muted-foreground font-sans">{tag.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
