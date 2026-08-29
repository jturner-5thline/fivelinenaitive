import React, { useState, useMemo, useEffect, useRef } from 'react';

import { getIndustryOptions, useIndustryOptionsList } from '@/lib/industryOptions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DealWriteUpData, TeamMember } from '../DealWriteUp';
import { Check, ChevronsUpDown, Loader2, Plus, Trash2, Linkedin, GripVertical, List } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { AutoFillReviewDialog, ExtractedField } from './AutoFillReviewDialog';
import { FlexChangedFieldWrapper } from './FlexChangedFieldWrapper';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTeamMember({
  member,
  onUpdate,
  onDelete,
}: {
  member: TeamMember;
  onUpdate: (id: string, field: keyof Omit<TeamMember, 'id'>, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 p-3 border rounded-lg">
      <div className="cursor-grab active:cursor-grabbing pt-1" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2">
        <Input
          value={member.name}
          onChange={(e) => onUpdate(member.id, 'name', e.target.value)}
          placeholder="Full Name *"
          className="h-8 text-sm"
        />
        <Input
          value={member.title}
          onChange={(e) => onUpdate(member.id, 'title', e.target.value)}
          placeholder="Job Title *"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-1">
          <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={member.linkedin}
            onChange={(e) => onUpdate(member.id, 'linkedin', e.target.value)}
            placeholder="LinkedIn URL"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(member.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const LOCATION_OPTIONS = [
  // US States
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  // Canada
  'Ontario, Canada',
  'British Columbia, Canada',
  // UK
  'United Kingdom',
  // Other
  'Other',
];

// Deal type options now come from DealTypesContext

const BILLING_MODEL_OPTIONS = [
  'Subscription',
  'Transaction',
  'License',
  'Usage-based',
  'Hybrid',
  'Other',
];

const STATUS_OPTIONS = [
  'Draft',
  'Published',
  'Under Review',
  'Closed',
];

interface WriteUpCompanyOverviewTabProps {
  dealId: string;
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
  onChange?: (data: DealWriteUpData) => void;
  changedFields?: Set<string>;
  isFieldEdited?: (field: string) => boolean;
}

export function WriteUpCompanyOverviewTab({ dealId, data, updateField, onChange, changedFields, isFieldEdited }: WriteUpCompanyOverviewTabProps) {
  const { dealTypes: dealTypeOptions } = useDealTypes();
  const { lenders: masterLenders } = useMasterLenders();
  const [locationSearch, setLocationSearch] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState('');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [extractedCompanyName, setExtractedCompanyName] = useState<string>();
  const [dealManager, setDealManager] = useState('');
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const teamSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch deal manager (read-only)
  useEffect(() => {
    const fetchMgr = async () => {
      const { data: row } = await supabase.from('deals').select('manager').eq('id', dealId).single();
      setDealManager(row?.manager || '');
    };
    fetchMgr();
  }, [dealId]);


  // Fixed industry options
  const industryOptions = INDUSTRY_OPTIONS as unknown as string[];

  // Get display labels for selected deal types (which are stored as IDs)
  const getSelectedDealTypeLabels = () => {
    return data.dealTypes
      .map(id => dealTypeOptions.find(dt => dt.id === id)?.label || id)
      .filter(Boolean);
  };

  const filteredLocations = useMemo(() => {
    if (!locationSearch) return LOCATION_OPTIONS;
    const search = locationSearch.toLowerCase();
    return LOCATION_OPTIONS.filter(loc => loc.toLowerCase().includes(search));
  }, [locationSearch]);

  const handleAutoFillFromUrl = async () => {
    const url = data.companyUrl?.trim();
    if (!url) {
      toast.error('Please enter a company URL first');
      return;
    }

    setIsAutoFilling(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('scrape-company-info', {
        body: { url },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract company information');
      }

      const companyInfo = result.data;
      const fields: ExtractedField[] = [];

      // Build list of extracted fields
      if (companyInfo.companyName) {
        fields.push({
          key: 'companyName',
          label: 'Company Name',
          value: companyInfo.companyName,
          currentValue: data.companyName,
          hasExisting: !!data.companyName,
        });
      }

      if (companyInfo.description) {
        fields.push({
          key: 'description',
          label: 'Company Overview',
          value: companyInfo.description,
          currentValue: data.description,
          hasExisting: !!data.description,
        });
      }

      if (companyInfo.industries?.length > 0) {
        fields.push({
          key: 'industries',
          label: 'Industry',
          value: companyInfo.industries,
          currentValue: data.industries,
          hasExisting: data.industries.length > 0,
        });
      }

      if (companyInfo.location) {
        // Try to match with our location options
        const scrapedLoc = companyInfo.location.toLowerCase();
        const matchedLocation = LOCATION_OPTIONS.find(loc => {
          const optLower = loc.toLowerCase();
          return scrapedLoc.includes(optLower) || optLower.includes(scrapedLoc);
        }) || 'Other';
        
        fields.push({
          key: 'location',
          label: 'Location',
          value: matchedLocation,
          currentValue: data.location,
          hasExisting: !!data.location,
        });
      }

      if (companyInfo.yearFounded) {
        fields.push({
          key: 'yearFounded',
          label: 'Year Founded',
          value: companyInfo.yearFounded,
          currentValue: data.yearFounded,
          hasExisting: !!data.yearFounded,
        });
      }

      if (companyInfo.headcount) {
        fields.push({
          key: 'headcount',
          label: 'Headcount',
          value: companyInfo.headcount,
          currentValue: data.headcount,
          hasExisting: !!data.headcount,
        });
      }

      if (companyInfo.linkedinUrl) {
        fields.push({
          key: 'linkedinUrl',
          label: 'LinkedIn URL',
          value: companyInfo.linkedinUrl,
          currentValue: data.linkedinUrl,
          hasExisting: !!data.linkedinUrl,
        });
      }

      if (fields.length === 0) {
        toast.info('No information could be extracted from the website');
        return;
      }

      setExtractedFields(fields);
      setExtractedCompanyName(companyInfo.companyName);
      setReviewDialogOpen(true);
    } catch (err) {
      console.error('Auto-fill error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to auto-fill company information');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleApplyFields = (selectedKeys: string[]) => {
    const updates: Partial<DealWriteUpData> = {};
    let fieldsApplied = 0;

    for (const field of extractedFields) {
      if (selectedKeys.includes(field.key)) {
        const value = field.value;
        switch (field.key) {
          case 'companyName':
            updates.companyName = value as string;
            break;
          case 'description':
            updates.description = value as string;
            break;
          case 'industries':
            updates.industries = value as string[];
            break;
          case 'location':
            updates.location = value as string;
            break;
          case 'yearFounded':
            updates.yearFounded = value as string;
            break;
          case 'headcount':
            updates.headcount = value as string;
            break;
          case 'linkedinUrl':
            updates.linkedinUrl = value as string;
            break;
        }
        fieldsApplied++;
      }
    }

    if (fieldsApplied > 0) {
      // Apply all fields in a single batch update to avoid stale data overwrites
      if (onChange) {
        onChange({ ...data, ...updates });
      } else {
        // Fallback: apply individually (may lose some if React hasn't re-rendered)
        Object.entries(updates).forEach(([key, value]) => {
          updateField(key as keyof DealWriteUpData, value as DealWriteUpData[keyof DealWriteUpData]);
        });
      }
      toast.success(`Applied ${fieldsApplied} field${fieldsApplied !== 1 ? 's' : ''}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Company Name & URL Row */}
      <div className="grid grid-cols-2 gap-4">
        <FlexChangedFieldWrapper fieldKey="companyName" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input
            id="companyName"
            value={data.companyName}
            onChange={(e) => updateField('companyName', e.target.value)}
            placeholder="TechFlow Solutions"
          />
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="companyUrl" changedFields={changedFields} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="companyUrl">Company URL</Label>
            <Button
              type="button"
              variant="gradient"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={handleAutoFillFromUrl}
              disabled={isAutoFilling || !data.companyUrl?.trim()}
            >
              {isAutoFilling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {isAutoFilling ? 'Extracting...' : 'Auto-fill'}
            </Button>
            <span className="text-[9px] text-muted-foreground/60 ml-0.5">Powered by Claude</span>
          </div>
          <Input
            id="companyUrl"
            value={data.companyUrl}
            onChange={(e) => updateField('companyUrl', e.target.value)}
            placeholder="example.com"
          />
        </FlexChangedFieldWrapper>
      </div>

      {/* Company Overview (formerly Description) */}
      <FlexChangedFieldWrapper fieldKey="description" changedFields={changedFields} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Company Overview *</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Toggle bullet on current line"
            onClick={() => {
              const ta = descTextareaRef.current;
              if (!ta) return;
              const val = data.description || '';
              const start = ta.selectionStart ?? 0;
              // Find the start and end of the current line
              const lineStart = val.lastIndexOf('\n', start - 1) + 1;
              let lineEnd = val.indexOf('\n', start);
              if (lineEnd === -1) lineEnd = val.length;
              const line = val.substring(lineStart, lineEnd);
              const trimmed = line.trimStart();
              let newLine: string;
              let cursorOffset: number;
              if (trimmed.startsWith('• ')) {
                // Remove bullet
                newLine = line.replace('• ', '');
                cursorOffset = -2;
              } else {
                // Add bullet
                const leadingWhitespace = line.length - trimmed.length;
                newLine = line.substring(0, leadingWhitespace) + '• ' + trimmed;
                cursorOffset = 2;
              }
              const newVal = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
              updateField('description', newVal);
              // Restore cursor position after React re-render
              const newPos = Math.max(lineStart, Math.min(start + cursorOffset, lineStart + newLine.length));
              requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(newPos, newPos);
              });
            }}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <Textarea
          ref={descTextareaRef}
          id="description"
          value={data.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Enterprise SaaS platform for workflow automation with strong recurring revenue and expanding customer base."
          className="min-h-[100px]"
        />
      </FlexChangedFieldWrapper>

      {/* Deal Manager + LinkedIn + Location Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dealManager">Deal Manager</Label>
          <Input
            id="dealManager"
            value={dealManager}
            readOnly
            disabled
            placeholder="Set in Deal Information"
            className="bg-muted"
          />
        </div>
        <FlexChangedFieldWrapper fieldKey="linkedinUrl" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            value={data.linkedinUrl}
            onChange={(e) => updateField('linkedinUrl', e.target.value)}
            placeholder="linkedin.com/company/..."
          />
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="location" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="location">Location *</Label>
          <Popover open={locationOpen} onOpenChange={setLocationOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={locationOpen}
                className="w-full justify-between font-normal"
              >
                {data.location || "Select location"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-popover border" align="start">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search locations..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <ScrollArea className="h-[200px]">
                <div className="p-1">
                  {filteredLocations.length === 0 ? (
                    <div className="py-2 px-3 text-sm text-muted-foreground">No locations found</div>
                  ) : (
                    filteredLocations.map(option => (
                      <div
                        key={option}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm hover:bg-accent",
                          data.location === option && "bg-accent"
                        )}
                        onClick={() => {
                          updateField('location', option);
                          setLocationOpen(false);
                          setLocationSearch('');
                        }}
                      >
                        <Check className={cn("h-4 w-4", data.location === option ? "opacity-100" : "opacity-0")} />
                        {option}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </FlexChangedFieldWrapper>
      </div>

      {/* Industry & Year Founded Row */}
      <div className="grid grid-cols-3 gap-4">
        <FlexChangedFieldWrapper fieldKey="industries" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="industry">Industry *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.industries.length > 0
                  ? data.industries.length === 1
                    ? data.industries[0]
                    : `${data.industries.length} industries selected`
                  : "Select industries"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-popover border" align="start">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search industries..."
                  value={industrySearch}
                  onChange={(e) => setIndustrySearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                {(industrySearch
                  ? industryOptions.filter(o => o.toLowerCase().includes(industrySearch.toLowerCase()))
                  : industryOptions
                ).map(option => (
                  <div
                    key={option}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newIndustries = data.industries.includes(option)
                        ? data.industries.filter(i => i !== option)
                        : [...data.industries, option];
                      updateField('industries', newIndustries);
                    }}
                  >
                    <Checkbox
                      checked={data.industries.includes(option)}
                      onCheckedChange={(checked) => {
                        const newIndustries = checked
                          ? [...data.industries, option]
                          : data.industries.filter(i => i !== option);
                        updateField('industries', newIndustries);
                      }}
                    />
                    <span className="text-sm">{option}</span>
                  </div>
                ))}
                {industrySearch && industryOptions.filter(o => o.toLowerCase().includes(industrySearch.toLowerCase())).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No industries found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="yearFounded" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="yearFounded">Year Founded</Label>
          <Input
            id="yearFounded"
            value={data.yearFounded}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              updateField('yearFounded', value);
            }}
            placeholder="e.g., 2015"
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="customerBase" changedFields={changedFields} className="space-y-2">
          <Label>Customer Base</Label>
          <div className="flex flex-wrap gap-2">
            {['B2B', 'B2C', 'Both'].map((option) => {
              const isSelected = data.customerBase?.includes(option);
              return (
                <Button
                  key={option}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const current = data.customerBase || [];
                    if (isSelected) {
                      updateField('customerBase', current.filter(v => v !== option));
                    } else {
                      updateField('customerBase', [...current, option]);
                    }
                  }}
                >
                  {option}
                </Button>
              );
            })}
          </div>
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="headcount" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="headcount">Headcount</Label>
          <Input
            id="headcount"
            value={data.headcount}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              updateField('headcount', value);
            }}
            placeholder="e.g., 150"
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </FlexChangedFieldWrapper>
      </div>

      {/* Team Members Section */}
      <FlexChangedFieldWrapper fieldKey="team" changedFields={changedFields} className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Team</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => {
              const newMember: TeamMember = {
                id: crypto.randomUUID(),
                name: '',
                title: '',
                linkedin: '',
              };
              updateField('team', [...(data.team || []), newMember]);
            }}
          >
            <Plus className="h-3 w-3" />
            Add Member
          </Button>
        </div>
        {(data.team || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members added yet.</p>
        ) : (
          <DndContext
            sensors={teamSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (over && active.id !== over.id) {
                const team = data.team || [];
                const oldIndex = team.findIndex(m => m.id === active.id);
                const newIndex = team.findIndex(m => m.id === over.id);
                updateField('team', arrayMove(team, oldIndex, newIndex));
              }
            }}
          >
            <SortableContext items={(data.team || []).map(m => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {(data.team || []).map((member) => (
                  <SortableTeamMember
                    key={member.id}
                    member={member}
                    onUpdate={(id, field, value) => {
                      const updated = (data.team || []).map(m =>
                        m.id === id ? { ...m, [field]: value } : m
                      );
                      updateField('team', updated);
                    }}
                    onDelete={(id) => {
                      updateField('team', (data.team || []).filter(m => m.id !== id));
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </FlexChangedFieldWrapper>

      {/* Deal Type & Billing Model Row */}
      <div className="grid grid-cols-2 gap-4">
        <FlexChangedFieldWrapper fieldKey="dealTypes" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="dealType">Deal Type *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.dealTypes.length > 0
                  ? getSelectedDealTypeLabels().join(', ')
                  : "Select deal types"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 bg-popover border" align="start">
              <div className="p-2 space-y-1">
                {dealTypeOptions.map(option => (
                  <div
                    key={option.id}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newTypes = data.dealTypes.includes(option.id)
                        ? data.dealTypes.filter(t => t !== option.id)
                        : [...data.dealTypes, option.id];
                      updateField('dealTypes', newTypes);
                    }}
                  >
                    <Checkbox
                      checked={data.dealTypes.includes(option.id)}
                      onCheckedChange={(checked) => {
                        const newTypes = checked
                          ? [...data.dealTypes, option.id]
                          : data.dealTypes.filter(t => t !== option.id);
                        updateField('dealTypes', newTypes);
                      }}
                    />
                    <span className="text-sm">{option.label}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="billingModels" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="billingModel">Billing Model *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.billingModels.length > 0
                  ? data.billingModels.join(', ')
                  : "Select billing models"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 bg-popover border" align="start">
              <div className="p-2 space-y-1">
                {BILLING_MODEL_OPTIONS.map(option => (
                  <div
                    key={option}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newModels = data.billingModels.includes(option)
                        ? data.billingModels.filter(m => m !== option)
                        : [...data.billingModels, option];
                      updateField('billingModels', newModels);
                    }}
                  >
                    <Checkbox
                      checked={data.billingModels.includes(option)}
                      onCheckedChange={(checked) => {
                        const newModels = checked
                          ? [...data.billingModels, option]
                          : data.billingModels.filter(m => m !== option);
                        updateField('billingModels', newModels);
                      }}
                    />
                    <span className="text-sm">{option}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </FlexChangedFieldWrapper>
      </div>

      {/* Auto-fill Review Dialog */}
      <AutoFillReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        fields={extractedFields}
        onApply={handleApplyFields}
        companyName={extractedCompanyName}
      />

    </div>
  );
}
