import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Search, Columns2, Columns3, RotateCcw, Save, Loader2, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useHubSpotFieldMetadata,
  useLayoutConfig,
  useLayoutSections,
  useLayoutSectionFields,
  useSaveLayout,
  useSeedFieldMetadata,
  HubSpotFieldMetadata,
} from '@/hooks/useHubSpotFieldMetadata';

interface EditorSection {
  id: string;
  title: string;
  is_collapsed_default: boolean;
  fields: EditorField[];
}

interface EditorField {
  field_metadata_id: string;
  label: string;
  internal_name: string;
  hubspot_field_type: string | null;
  is_visible: boolean;
  is_required: boolean;
  column_span: 1 | 2;
  is_read_only: boolean;
}

function fieldTypeColor(type: string | null): string {
  switch (type) {
    case 'text': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'textarea': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'select': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'number': return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'date': return 'bg-pink-500/15 text-pink-400 border-pink-500/30';
    case 'checkbox': return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

function ObjectLayoutEditor({ objectType }: { objectType: 'contact' | 'company' }) {
  const { data: allFields = [], isLoading: fieldsLoading } = useHubSpotFieldMetadata(objectType);
  const { data: layoutConfig } = useLayoutConfig(objectType);
  const { data: dbSections = [] } = useLayoutSections(layoutConfig?.id);
  const sectionIds = dbSections.map(s => s.id);
  const { data: dbSectionFields = [] } = useLayoutSectionFields(sectionIds);
  const saveLayout = useSaveLayout();
  const seedMetadata = useSeedFieldMetadata();

  const [sections, setSections] = useState<EditorSection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Load from DB into editor state
  useEffect(() => {
    if (initialized) return;
    if (dbSections.length > 0 && dbSectionFields.length >= 0) {
      const loaded: EditorSection[] = dbSections.map(s => {
        const sFields = dbSectionFields
          .filter(f => f.section_id === s.id)
          .sort((a, b) => a.display_order - b.display_order)
          .map(f => ({
            field_metadata_id: f.field_metadata_id,
            label: f.field_metadata?.label || 'Unknown',
            internal_name: f.field_metadata?.internal_name || '',
            hubspot_field_type: f.field_metadata?.hubspot_field_type || null,
            is_visible: f.is_visible,
            is_required: f.is_required,
            column_span: f.column_span as 1 | 2,
            is_read_only: f.field_metadata?.is_read_only || false,
          }));
        return { id: s.id, title: s.title, is_collapsed_default: s.is_collapsed_default, fields: sFields };
      });
      setSections(loaded);
      setInitialized(true);
    } else if (allFields.length > 0 && dbSections.length === 0) {
      // Auto-generate sections from group_name
      const groups = new Map<string, EditorField[]>();
      allFields.forEach(f => {
        const group = f.group_name || 'Other';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push({
          field_metadata_id: f.id,
          label: f.label,
          internal_name: f.internal_name,
          hubspot_field_type: f.hubspot_field_type,
          is_visible: true,
          is_required: false,
          column_span: f.hubspot_field_type === 'textarea' ? 2 : 1,
          is_read_only: f.is_read_only,
        });
      });
      const auto: EditorSection[] = Array.from(groups.entries()).map(([title, fields], i) => ({
        id: `auto-${i}`,
        title,
        is_collapsed_default: false,
        fields,
      }));
      setSections(auto);
      setInitialized(true);
    }
  }, [dbSections, dbSectionFields, allFields, initialized]);

  // Available fields = all fields not assigned to any section
  const assignedFieldIds = new Set(sections.flatMap(s => s.fields.map(f => f.field_metadata_id)));
  const availableFields = allFields.filter(f => !assignedFieldIds.has(f.id));
  const filteredAvailable = availableFields.filter(f =>
    !searchQuery || f.label.toLowerCase().includes(searchQuery.toLowerCase()) || f.internal_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addSection = () => {
    setSections(prev => [...prev, {
      id: `new-${Date.now()}`,
      title: 'New Section',
      is_collapsed_default: false,
      fields: [],
    }]);
  };

  const removeSection = (idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, title } : s));
  };

  const addFieldToSection = (sectionIdx: number, field: HubSpotFieldMetadata) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      fields: [...s.fields, {
        field_metadata_id: field.id,
        label: field.label,
        internal_name: field.internal_name,
        hubspot_field_type: field.hubspot_field_type,
        is_visible: true,
        is_required: false,
        column_span: field.hubspot_field_type === 'textarea' ? 2 : 1,
        is_read_only: field.is_read_only,
      }],
    } : s));
  };

  const removeFieldFromSection = (sectionIdx: number, fieldIdx: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      fields: s.fields.filter((_, fi) => fi !== fieldIdx),
    } : s));
  };

  const toggleFieldVisibility = (sectionIdx: number, fieldIdx: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      fields: s.fields.map((f, fi) => fi === fieldIdx ? { ...f, is_visible: !f.is_visible } : f),
    } : s));
  };

  const toggleFieldSpan = (sectionIdx: number, fieldIdx: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      fields: s.fields.map((f, fi) => fi === fieldIdx ? { ...f, column_span: f.column_span === 1 ? 2 : 1 } : f),
    } : s));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    setSections(prev => {
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const moveField = (sectionIdx: number, fieldIdx: number, dir: -1 | 1) => {
    const newFieldIdx = fieldIdx + dir;
    setSections(prev => prev.map((s, si) => {
      if (si !== sectionIdx) return s;
      if (newFieldIdx < 0 || newFieldIdx >= s.fields.length) return s;
      const fields = [...s.fields];
      [fields[fieldIdx], fields[newFieldIdx]] = [fields[newFieldIdx], fields[fieldIdx]];
      return { ...s, fields };
    }));
  };

  const handleSave = () => {
    saveLayout.mutate({
      objectType,
      sections: sections.map((s, i) => ({
        title: s.title,
        display_order: i,
        is_collapsed_default: s.is_collapsed_default,
        fields: s.fields.map((f, fi) => ({
          field_metadata_id: f.field_metadata_id,
          display_order: fi,
          is_visible: f.is_visible,
          is_required: f.is_required,
          column_span: f.column_span,
        })),
      })),
    });
  };

  const handleReset = () => {
    setInitialized(false);
    setSections([]);
  };

  if (fieldsLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (allFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-muted-foreground text-sm">No field metadata found. Seed default fields to get started.</p>
        <Button onClick={() => seedMetadata.mutate(objectType)} disabled={seedMetadata.isPending}>
          <Sparkles className="h-4 w-4 mr-2" />
          {seedMetadata.isPending ? 'Seeding...' : `Seed Default ${objectType === 'contact' ? 'Contact' : 'Company'} Fields`}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Main layout editor */}
      <div className="col-span-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            {sections.length} section{sections.length !== 1 ? 's' : ''} · {sections.reduce((a, s) => a + s.fields.length, 0)} fields
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset</Button>
            <Button size="sm" onClick={handleSave} disabled={saveLayout.isPending}>
              {saveLayout.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save Layout
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {sections.map((section, sectionIdx) => (
            <SectionCard
              key={section.id}
              section={section}
              sectionIdx={sectionIdx}
              totalSections={sections.length}
              onUpdateTitle={(t) => updateSectionTitle(sectionIdx, t)}
              onRemove={() => removeSection(sectionIdx)}
              onMoveSection={(dir) => moveSection(sectionIdx, dir)}
              onRemoveField={(fi) => removeFieldFromSection(sectionIdx, fi)}
              onToggleVisibility={(fi) => toggleFieldVisibility(sectionIdx, fi)}
              onToggleSpan={(fi) => toggleFieldSpan(sectionIdx, fi)}
              onMoveField={(fi, dir) => moveField(sectionIdx, fi, dir)}
            />
          ))}
        </div>

        <Button variant="outline" className="w-full border-dashed" onClick={addSection}>
          <Plus className="h-4 w-4 mr-2" /> Add Section
        </Button>
      </div>

      {/* Available fields sidebar */}
      <div className="col-span-4">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Available Fields</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search fields..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[60vh]">
              <div className="px-4 pb-4 space-y-1">
                {filteredAvailable.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {searchQuery ? 'No matching fields' : 'All fields assigned'}
                  </p>
                ) : (
                  filteredAvailable.map(field => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs truncate">{field.label}</span>
                        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 shrink-0', fieldTypeColor(field.hubspot_field_type))}>
                          {field.hubspot_field_type || 'text'}
                        </Badge>
                      </div>
                      {sections.length > 0 && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {sections.map((s, idx) => (
                            <Button
                              key={s.id}
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              title={`Add to ${s.title}`}
                              onClick={() => addFieldToSection(idx, field)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SectionCard({
  section, sectionIdx, totalSections,
  onUpdateTitle, onRemove, onMoveSection,
  onRemoveField, onToggleVisibility, onToggleSpan, onMoveField,
}: {
  section: EditorSection;
  sectionIdx: number;
  totalSections: number;
  onUpdateTitle: (title: string) => void;
  onRemove: () => void;
  onMoveSection: (dir: -1 | 1) => void;
  onRemoveField: (fieldIdx: number) => void;
  onToggleVisibility: (fieldIdx: number) => void;
  onToggleSpan: (fieldIdx: number) => void;
  onMoveField: (fieldIdx: number, dir: -1 | 1) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <Card className="border-border/60">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <Button variant="ghost" size="icon" className="h-4 w-4" disabled={sectionIdx === 0} onClick={() => onMoveSection(-1)}>
            <ChevronDown className="h-3 w-3 rotate-180" />
          </Button>
          <Button variant="ghost" size="icon" className="h-4 w-4" disabled={sectionIdx >= totalSections - 1} onClick={() => onMoveSection(1)}>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <button onClick={() => setIsOpen(!isOpen)} className="shrink-0">
          
        </button>
        {editingTitle ? (
          <Input
            value={section.title}
            onChange={e => onUpdateTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => e.key === 'Enter' && setEditingTitle(false)}
            className="h-7 text-sm font-medium flex-1"
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-medium flex-1 cursor-pointer hover:text-primary"
            onClick={() => setEditingTitle(true)}
          >
            {section.title}
          </span>
        )}
        <Badge variant="secondary" className="text-[10px]">{section.fields.length}</Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isOpen && (
        <CardContent className="pt-0 pb-3 px-4">
          {section.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">
              Drag fields here or click + from Available Fields
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {section.fields.map((field, fieldIdx) => (
                <div
                  key={field.field_metadata_id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border border-border/50 bg-muted/20 group',
                    field.column_span === 2 && 'col-span-2',
                    !field.is_visible && 'opacity-50'
                  )}
                >
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-3 w-3" disabled={fieldIdx === 0} onClick={() => onMoveField(fieldIdx, -1)}>
                      <ChevronDown className="h-2.5 w-2.5 rotate-180" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-3 w-3" disabled={fieldIdx >= section.fields.length - 1} onClick={() => onMoveField(fieldIdx, 1)}>
                      <ChevronDown className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block">{field.label}</span>
                    <Badge variant="outline" className={cn('text-[9px] px-1 py-0 mt-0.5', fieldTypeColor(field.hubspot_field_type))}>
                      {field.hubspot_field_type || 'text'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onToggleVisibility(fieldIdx)} title={field.is_visible ? 'Hide' : 'Show'}>
                      {field.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onToggleSpan(fieldIdx)} title={field.column_span === 1 ? 'Full width' : 'Half width'}>
                      {field.column_span === 1 ? <Columns3 className="h-3 w-3" /> : <Columns2 className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onRemoveField(fieldIdx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function FieldLayoutEditor() {
  const [activeTab, setActiveTab] = useState<'contact' | 'company'>('contact');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'contact' | 'company')}>
        <TabsList>
          <TabsTrigger value="contact">Contacts</TabsTrigger>
          <TabsTrigger value="company">Companies</TabsTrigger>
        </TabsList>
        <TabsContent value="contact" className="mt-6">
          <ObjectLayoutEditor objectType="contact" />
        </TabsContent>
        <TabsContent value="company" className="mt-6">
          <ObjectLayoutEditor objectType="company" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
