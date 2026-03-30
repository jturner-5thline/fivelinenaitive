import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useLayoutConfig, useLayoutSections, useLayoutSectionFields, useHubSpotFieldMetadata, HubSpotFieldMetadata } from '@/hooks/useHubSpotFieldMetadata';

interface DynamicFieldRendererProps {
  objectType: 'contact' | 'company';
  record: Record<string, any>;
  onFieldUpdate?: (field: string, value: any) => void;
}

function FieldControl({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: { hubspot_field_type: string | null; options?: Array<{ label: string; value: string }> | null; mapped_column_name: string | null; label: string };
  value: any;
  onChange?: (value: any) => void;
  readOnly?: boolean;
}) {
  const fieldType = field.hubspot_field_type || 'text';

  if (readOnly || !onChange) {
    // Display mode
    if (fieldType === 'checkbox') {
      return <span className="text-sm">{value ? 'Yes' : 'No'}</span>;
    }
    if (fieldType === 'date' && value) {
      try {
        return <span className="text-sm">{format(new Date(value), 'MMM d, yyyy')}</span>;
      } catch { return <span className="text-sm">{String(value)}</span>; }
    }
    if (fieldType === 'select' && field.options) {
      const opt = field.options.find(o => o.value === value);
      return <span className="text-sm">{opt?.label || value || '—'}</span>;
    }
    return <span className="text-sm">{value != null && value !== '' ? String(value) : '—'}</span>;
  }

  switch (fieldType) {
    case 'textarea':
      return (
        <Textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="text-xs min-h-[60px]"
        />
      );
    case 'select':
      return (
        <Select value={value || ''} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'number':
      return (
        <Input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          className="h-8 text-xs"
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={value ? value.split('T')[0] : ''}
          onChange={e => onChange(e.target.value || null)}
          className="h-8 text-xs"
        />
      );
    case 'checkbox':
      return (
        <Switch
          checked={!!value}
          onCheckedChange={onChange}
        />
      );
    default:
      return (
        <Input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      );
  }
}

export function DynamicFieldRenderer({ objectType, record, onFieldUpdate }: DynamicFieldRendererProps) {
  const { data: layoutConfig } = useLayoutConfig(objectType);
  const { data: sections = [] } = useLayoutSections(layoutConfig?.id);
  const sectionIds = sections.map(s => s.id);
  const { data: sectionFields = [] } = useLayoutSectionFields(sectionIds);
  const { data: allFields = [] } = useHubSpotFieldMetadata(objectType);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showMoreFields, setShowMoreFields] = useState(false);

  // If no layout config, render nothing (fall through to existing UI)
  if (!layoutConfig || sections.length === 0) return null;

  // Fields assigned to sections
  const assignedFieldIds = new Set(sectionFields.map(f => f.field_metadata_id));
  const unassignedFields = allFields.filter(f => !assignedFieldIds.has(f.id));

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  };

  const getFieldValue = (field: HubSpotFieldMetadata) => {
    if (field.mapped_column_name) return record[field.mapped_column_name];
    return record.custom_fields?.[field.internal_name] ?? record.hubspot_properties?.[field.internal_name];
  };

  const handleFieldChange = (field: HubSpotFieldMetadata, value: any) => {
    if (!onFieldUpdate || field.is_read_only) return;
    if (field.mapped_column_name) {
      onFieldUpdate(field.mapped_column_name, value);
    }
  };

  return (
    <div className="space-y-4">
      {sections.map(section => {
        const fields = sectionFields
          .filter(sf => sf.section_id === section.id && sf.is_visible)
          .sort((a, b) => a.display_order - b.display_order);
        const isCollapsed = collapsedSections.has(section.id);

        return (
          <Card key={section.id}>
            <Collapsible open={!isCollapsed} onOpenChange={() => toggleSection(section.id)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {section.title}
                    <Badge variant="secondary" className="text-[10px]">{fields.length}</Badge>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map(sf => {
                      const meta = sf.field_metadata;
                      if (!meta) return null;
                      return (
                        <div key={sf.id} className={cn(sf.column_span === 2 && 'col-span-2')}>
                          <p className="text-[10px] text-muted-foreground uppercase mb-1">{meta.label}</p>
                          <FieldControl
                            field={meta as any}
                            value={getFieldValue(meta as HubSpotFieldMetadata)}
                            onChange={meta.is_read_only ? undefined : (v) => handleFieldChange(meta as HubSpotFieldMetadata, v)}
                            readOnly={meta.is_read_only}
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {/* More Fields */}
      {unassignedFields.length > 0 && (
        <Card>
          <Collapsible open={showMoreFields} onOpenChange={setShowMoreFields}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center gap-2">
                  {showMoreFields ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <MoreHorizontal className="h-4 w-4" /> More Fields
                  <Badge variant="secondary" className="text-[10px]">{unassignedFields.length}</Badge>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  {unassignedFields.map(field => (
                    <div key={field.id}>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">{field.label}</p>
                      <FieldControl
                        field={field as any}
                        value={getFieldValue(field)}
                        onChange={field.is_read_only ? undefined : (v) => handleFieldChange(field, v)}
                        readOnly={field.is_read_only}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
