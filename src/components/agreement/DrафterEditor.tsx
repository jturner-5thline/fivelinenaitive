import { FileText, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AgreementSection, AgreementFieldDef, AgreementSubsection, AgreementQualifier } from './types';

const CATEGORY_COLORS: Record<string, string> = {
  staple: 'bg-teal-500/20 text-teal-400',
  configurable: 'bg-amber-500/20 text-amber-400',
  optional: 'bg-muted text-muted-foreground',
};

interface Props {
  section: AgreementSection | null;
  values: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
  onSectionUpdate: (sectionId: string, updates: Partial<AgreementSection>) => void;
}

export function DrафterEditor({ section, values, onValueChange, onSectionUpdate }: Props) {
  if (!section) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 mb-3 opacity-20" />
        <p className="font-medium text-sm">Select a section to edit</p>
        <p className="text-xs mt-1 opacity-60">Click on a section from the sidebar to begin editing</p>
      </div>
    );
  }

  const renderField = (field: AgreementFieldDef) => {
    const val = values[field.key] ?? field.defaultValue ?? '';
    if (field.type === 'select') {
      return (
        <Select value={val} onValueChange={v => onValueChange(field.key, v)}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === 'textarea') {
      return (
        <Textarea
          value={val}
          onChange={e => onValueChange(field.key, e.target.value)}
          className="text-sm min-h-[80px]"
          placeholder={field.placeholder}
        />
      );
    }
    return (
      <Input
        value={val}
        onChange={e => onValueChange(field.key, e.target.value)}
        className="text-sm"
        placeholder={field.placeholder}
      />
    );
  };

  // Group short fields in 2-col grid
  const shortFields = section.fields.filter(f => f.type !== 'textarea');
  const longFields = section.fields.filter(f => f.type === 'textarea');

  const updateQualifier = (qi: number, updates: Partial<AgreementQualifier>) => {
    if (!section.qualifiers) return;
    const newQs = [...section.qualifiers];
    newQs[qi] = { ...newQs[qi], ...updates };
    onSectionUpdate(section.section_id, { qualifiers: newQs });
  };

  const addQualifier = () => {
    const existing = section.qualifiers || [];
    const letter = String.fromCharCode(97 + existing.length);
    onSectionUpdate(section.section_id, {
      qualifiers: [...existing, { id: `q_${Date.now()}`, letter, text: '', enabled: true }],
    });
  };

  const removeQualifier = (qi: number) => {
    if (!section.qualifiers) return;
    const newQs = section.qualifiers.filter((_, i) => i !== qi)
      .map((q, i) => ({ ...q, letter: String.fromCharCode(97 + i) }));
    onSectionUpdate(section.section_id, { qualifiers: newQs });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        {/* Section Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[section.category]}`}>
              {section.category}
            </Badge>
          </div>
          {section.description && (
            <p className="text-xs text-muted-foreground">{section.description}</p>
          )}
        </div>

        {/* Short Fields in 2-col */}
        {shortFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {shortFields.map(field => (
              <div key={field.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                {renderField(field)}
              </div>
            ))}
          </div>
        )}

        {/* Long Fields */}
        {longFields.map(field => (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
            {renderField(field)}
          </div>
        ))}

        {/* Subsections */}
        {section.subsections && section.subsections.length > 0 && (
          <>
            <Separator />
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Fee Tiers</label>
              <div className="space-y-3">
                {section.subsections.map((sub, si) => (
                  <div key={sub.id} className={`p-4 rounded-lg border transition-opacity ${sub.enabled ? 'bg-card' : 'opacity-50 bg-muted/30'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold shrink-0">{si + 1}</div>
                      <span className="font-medium text-sm flex-1">{sub.title}</span>
                      <Switch
                        checked={sub.enabled}
                        onCheckedChange={v => {
                          const newSubs = [...(section.subsections || [])];
                          newSubs[si] = { ...newSubs[si], enabled: v };
                          onSectionUpdate(section.section_id, { subsections: newSubs });
                        }}
                        className="scale-75"
                      />
                    </div>
                    {sub.enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sub.fields.map(field => (
                          <div key={field.key}>
                            <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                            {field.type === 'select' ? (
                              <Select value={values[field.key] ?? field.defaultValue} onValueChange={v => onValueChange(field.key, v)}>
                                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(field.options || []).map(opt => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={values[field.key] ?? field.defaultValue}
                                onChange={e => onValueChange(field.key, e.target.value)}
                                className="text-xs"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Qualifiers */}
        {section.qualifiers !== null && section.qualifiers !== undefined && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Qualifiers</label>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={addQualifier}>
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {(section.qualifiers || []).map((q, qi) => (
                  <div key={q.id} className="flex items-center gap-2 group">
                    <span className="text-xs font-mono text-primary w-6 shrink-0 text-center">({q.letter})</span>
                    <Input
                      value={q.text}
                      onChange={e => updateQualifier(qi, { text: e.target.value })}
                      className={`flex-1 text-sm bg-transparent border-0 border-b border-border/40 rounded-none focus-visible:ring-0 px-1 ${
                        !q.enabled ? 'opacity-50 line-through' : ''
                      }`}
                    />
                    <Switch checked={q.enabled} onCheckedChange={v => updateQualifier(qi, { enabled: v })} className="scale-[0.6]" />
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeQualifier(qi)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Template Text */}
        <Separator />
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Section Template</label>
          <Textarea
            value={section.template_text}
            onChange={e => onSectionUpdate(section.section_id, { template_text: e.target.value })}
            className="font-mono text-xs min-h-[100px] bg-muted/30"
            placeholder='Edit the template text. Use {{variable_name}} for dynamic values.'
          />
          <p className="text-[10px] text-muted-foreground/50 mt-1">Use {'{{variable_name}}'} for dynamic values.</p>
        </div>
      </div>
    </ScrollArea>
  );
}
