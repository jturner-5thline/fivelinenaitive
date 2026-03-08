import { useState, useCallback } from 'react';
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgreementTemplate, AgreementSection, AgreementFieldDef, AgreementSubsection, AgreementQualifier } from './types';
import { useAgreementTemplates } from './useAgreementTemplates';
import { toast } from 'sonner';

const CATEGORY_COLORS: Record<string, string> = {
  staple: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  configurable: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  optional: 'bg-muted text-muted-foreground border-border',
};

export function AgreementTemplateEditor({ template, onBack }: { template: AgreementTemplate; onBack: () => void }) {
  const { updateTemplate, saveSections } = useAgreementTemplates();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || '');
  const [sections, setSections] = useState<AgreementSection[]>(template.sections);
  const [activeSection, setActiveSection] = useState<string | null>(sections[0]?.section_id || null);
  const [saving, setSaving] = useState(false);

  const activeIdx = sections.findIndex(s => s.section_id === activeSection);
  const active = activeIdx >= 0 ? sections[activeIdx] : null;

  const updateSection = useCallback((sectionId: string, updates: Partial<AgreementSection>) => {
    setSections(prev => prev.map(s => s.section_id === sectionId ? { ...s, ...updates } : s));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTemplate(template.id, { name, description });
      await saveSections(template.id, sections);
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    const newId = `section_${Date.now()}`;
    const newSection: AgreementSection = {
      id: newId,
      section_id: newId,
      title: 'New Section',
      category: 'optional',
      enabled: true,
      sort_order: sections.length,
      template_text: '',
      fields: [],
      subsections: null,
      qualifiers: null,
    };
    setSections(prev => [...prev, newSection]);
    setActiveSection(newId);
  };

  const removeSection = (sectionId: string) => {
    setSections(prev => prev.filter(s => s.section_id !== sectionId));
    if (activeSection === sectionId) setActiveSection(sections[0]?.section_id || null);
  };

  const updateField = (fieldIdx: number, updates: Partial<AgreementFieldDef>) => {
    if (!active) return;
    const newFields = [...active.fields];
    newFields[fieldIdx] = { ...newFields[fieldIdx], ...updates };
    updateSection(active.section_id, { fields: newFields });
  };

  const addField = () => {
    if (!active) return;
    const newField: AgreementFieldDef = { key: `field_${Date.now()}`, label: 'New Field', type: 'text', defaultValue: '' };
    updateSection(active.section_id, { fields: [...active.fields, newField] });
  };

  const removeField = (idx: number) => {
    if (!active) return;
    updateSection(active.section_id, { fields: active.fields.filter((_, i) => i !== idx) });
  };

  const updateSubsection = (subIdx: number, updates: Partial<AgreementSubsection>) => {
    if (!active?.subsections) return;
    const newSubs = [...active.subsections];
    newSubs[subIdx] = { ...newSubs[subIdx], ...updates };
    updateSection(active.section_id, { subsections: newSubs });
  };

  const addSubsection = () => {
    if (!active) return;
    const newSub: AgreementSubsection = { id: `sub_${Date.now()}`, title: 'New Tier', enabled: true, fields: [], template_text: '' };
    updateSection(active.section_id, { subsections: [...(active.subsections || []), newSub] });
  };

  const addQualifier = () => {
    if (!active) return;
    const existing = active.qualifiers || [];
    const letter = String.fromCharCode(97 + existing.length);
    const newQ: AgreementQualifier = { id: `q_${Date.now()}`, letter, text: '', enabled: true };
    updateSection(active.section_id, { qualifiers: [...existing, newQ] });
  };

  const updateQualifier = (qIdx: number, updates: Partial<AgreementQualifier>) => {
    if (!active?.qualifiers) return;
    const newQs = [...active.qualifiers];
    newQs[qIdx] = { ...newQs[qIdx], ...updates };
    updateSection(active.section_id, { qualifiers: newQs });
  };

  const removeQualifier = (qIdx: number) => {
    if (!active?.qualifiers) return;
    const newQs = active.qualifiers.filter((_, i) => i !== qIdx)
      .map((q, i) => ({ ...q, letter: String.fromCharCode(97 + i) }));
    updateSection(active.section_id, { qualifiers: newQs });
  };

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <Input value={name} onChange={e => setName(e.target.value)} className="text-lg font-semibold h-auto p-0 border-0 bg-transparent focus-visible:ring-0" />
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." className="text-sm text-muted-foreground h-auto p-0 border-0 bg-transparent focus-visible:ring-0 mt-0.5" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Template
          </Button>
        </div>

        <div className="flex min-h-[500px]">
          {/* Section List */}
          <div className="w-64 border-r overflow-y-auto">
            <div className="p-3 space-y-1">
              {sections.map((s, i) => (
                <div
                  key={s.section_id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${
                    activeSection === s.section_id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  } ${!s.enabled ? 'opacity-50' : ''}`}
                  onClick={() => setActiveSection(s.section_id)}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <Switch checked={s.enabled} onCheckedChange={v => updateSection(s.section_id, { enabled: v })} className="scale-75 shrink-0" />
                  <span className={`truncate flex-1 ${!s.enabled ? 'line-through' : ''}`}>{s.title}</span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 shrink-0 ${CATEGORY_COLORS[s.category]}`}>
                    {s.category.charAt(0).toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="p-3 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={addSection}>
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add Section
              </Button>
            </div>
          </div>

          {/* Editor Panel */}
          <ScrollArea className="flex-1 p-6">
            {active ? (
              <div className="space-y-6 max-w-2xl">
                {/* Title & Category */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Section Title</label>
                    <Input value={active.title} onChange={e => updateSection(active.section_id, { title: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                    <Input value={active.description || ''} onChange={e => updateSection(active.section_id, { description: e.target.value })} className="mt-1" placeholder="Brief description" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Category</label>
                    <div className="flex gap-2">
                      {(['staple', 'configurable', 'optional'] as const).map(cat => (
                        <Button
                          key={cat}
                          variant={active.category === cat ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateSection(active.section_id, { category: cat })}
                          className={active.category === cat ? CATEGORY_COLORS[cat] : ''}
                        >
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Fields */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fields</label>
                    <Button variant="ghost" size="sm" onClick={addField}><Plus className="h-3.5 w-3.5 mr-1" /> Add Field</Button>
                  </div>
                  <div className="space-y-3">
                    {active.fields.map((field, fi) => (
                      <div key={fi} className="flex gap-2 items-start p-3 rounded-md border bg-muted/30">
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <Input value={field.key} onChange={e => updateField(fi, { key: e.target.value })} placeholder="Key" className="text-xs font-mono" />
                          <Input value={field.label} onChange={e => updateField(fi, { label: e.target.value })} placeholder="Label" className="text-xs" />
                          <Select value={field.type} onValueChange={v => updateField(fi, { type: v as any })}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="textarea">Textarea</SelectItem>
                              <SelectItem value="select">Select</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input value={field.defaultValue} onChange={e => updateField(fi, { defaultValue: e.target.value })} placeholder="Default value" className="text-xs" />
                          {field.type === 'select' && (
                            <Input
                              value={(field.options || []).join(', ')}
                              onChange={e => updateField(fi, { options: e.target.value.split(',').map(s => s.trim()) })}
                              placeholder="Options (comma-separated)"
                              className="text-xs col-span-2"
                            />
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeField(fi)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subsections */}
                {active.subsections !== null && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fee Tiers / Subsections</label>
                        <Button variant="ghost" size="sm" onClick={addSubsection}><Plus className="h-3.5 w-3.5 mr-1" /> Add Tier</Button>
                      </div>
                      <div className="space-y-3">
                        {(active.subsections || []).map((sub, si) => (
                          <div key={sub.id} className="p-3 rounded-md border bg-muted/30 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">{si + 1}</div>
                              <Input value={sub.title} onChange={e => updateSubsection(si, { title: e.target.value })} className="text-sm flex-1" />
                              <Switch checked={sub.enabled} onCheckedChange={v => updateSubsection(si, { enabled: v })} className="scale-75" />
                            </div>
                            <Textarea value={sub.template_text} onChange={e => updateSubsection(si, { template_text: e.target.value })} className="text-xs font-mono" rows={2} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Qualifiers */}
                {active.qualifiers !== null && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Qualifiers</label>
                        <Button variant="ghost" size="sm" onClick={addQualifier}><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button>
                      </div>
                      <div className="space-y-2">
                        {(active.qualifiers || []).map((q, qi) => (
                          <div key={q.id} className="flex items-center gap-2">
                            <span className="text-xs font-mono text-primary w-6 shrink-0">({q.letter})</span>
                            <Input
                              value={q.text}
                              onChange={e => updateQualifier(qi, { text: e.target.value })}
                              className={`text-sm flex-1 bg-transparent border-0 border-b rounded-none focus-visible:ring-0 px-0 ${!q.enabled ? 'opacity-50 line-through' : ''}`}
                            />
                            <Switch checked={q.enabled} onCheckedChange={v => updateQualifier(qi, { enabled: v })} className="scale-75" />
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeQualifier(qi)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Template Text */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">Template Text</label>
                  <Textarea
                    value={active.template_text}
                    onChange={e => updateSection(active.section_id, { template_text: e.target.value })}
                    className="font-mono text-sm min-h-[120px]"
                    placeholder='Edit the template text. Use {{variable_name}} for dynamic values.'
                  />
                </div>

                {/* Remove Section */}
                <div className="flex justify-end">
                  <Button variant="destructive" size="sm" onClick={() => removeSection(active.section_id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Remove Section
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3 opacity-30" />
                <p className="font-medium">Select a section to edit</p>
                <p className="text-sm opacity-60">Click on a section from the sidebar</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
