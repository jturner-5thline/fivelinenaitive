import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FundingSourceNameField, type LinkedCrmCompany } from '@/components/lenders/FundingSourceNameField';
import { LenderContactPicker, type PickedContact } from '@/components/lenders/LenderContactPicker';
import { RelationshipOwnersPicker } from '@/components/lenders/RelationshipOwnersPicker';
import { MultiSelectChips } from '@/components/lenders/MultiSelectChips';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useMasterLenders, type MasterLender, type MasterLenderInsert } from '@/hooks/useMasterLenders';
import { formatCurrencyInput } from '@/utils/formatLenderCurrency';
import { GEO_OPTIONS } from '@/constants/geoOptions';
import { LOAN_TYPE_OPTIONS } from '@/constants/loanTypes';
import { COMPANY_REQUIREMENT_OPTIONS } from '@/constants/companyRequirements';
import { getIndustryOptions } from '@/lib/industryOptions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LENDER_TYPE_OPTIONS = [
  'Alternative',
  'Asset-Based Lender',
  'Bank',
  'Distressed / Specialty',
  'Equipment Financing',
  'Equity',
  'Mezzanine',
  'Real Estate',
  'SBA',
] as const;

interface FundingSourceContact {
  contact_id: string | null;
  name: string;
  title: string;
  email: string;
  phone: string;
  geography: string;
  isPrimary: boolean;
}

interface FundingSourceForm {
  name: string;
  contacts: FundingSourceContact[];
  lenderType: string;
  loanTypes: string;
  minDeal: string;
  maxDeal: string;
  industries: string;
  geo: string;
  description: string;
  tier: string;
  relationshipOwners: string;
  website: string;
  linkedinUrl: string;
  phoneMain: string;
  address: string;
  minRevenue: string;
  ebitdaMin: string;
  companyRequirements: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialContact?: {
    name?: string | null;
    email?: string | null;
    website?: string | null;
  } | null;
  onCreated?: (lender: MasterLender) => void;
}

const emptyContact = (isPrimary = false): FundingSourceContact => ({
  contact_id: null,
  name: '',
  title: '',
  email: '',
  phone: '',
  geography: '',
  isPrimary,
});

const emptyForm = (): FundingSourceForm => ({
  name: '',
  contacts: [emptyContact(true)],
  lenderType: '',
  loanTypes: '',
  minDeal: '',
  maxDeal: '',
  industries: '',
  geo: '',
  description: '',
  tier: '',
  relationshipOwners: '',
  website: '',
  linkedinUrl: '',
  phoneMain: '',
  address: '',
  minRevenue: '',
  ebitdaMin: '',
  companyRequirements: '',
});

function formWithInvitePrefill(
  initialName: string,
  initialContact?: Props['initialContact'],
): FundingSourceForm {
  const form = emptyForm();
  form.name = initialName;
  form.website = initialContact?.website || '';
  form.contacts[0] = {
    ...form.contacts[0],
    name: initialContact?.name || '',
    email: initialContact?.email || '',
  };
  return form;
}

function commaList(value: string): string[] | null {
  const values = value.split(',').map((part) => part.trim()).filter(Boolean);
  return values.length ? values : null;
}

export function FundingSourceFormDialog({
  open,
  onOpenChange,
  initialName = '',
  initialContact,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const { company, members: companyMembers } = useCompany();
  const { addLender } = useMasterLenders({ mode: 'all', pageSize: 100 });
  const [form, setForm] = useState<FundingSourceForm>(() => formWithInvitePrefill(initialName, initialContact));
  const [linkedCrmCompany, setLinkedCrmCompany] = useState<LinkedCrmCompany | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formWithInvitePrefill(initialName, initialContact));
    setLinkedCrmCompany(null);
  }, [open, initialName, initialContact]);

  const updateForm = <K extends keyof FundingSourceForm>(field: K, value: FundingSourceForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateContact = (index: number, next: PickedContact) => {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) => contactIndex === index
        ? {
            ...contact,
            contact_id: next.contact_id,
            name: next.name,
            title: next.title,
            email: next.email,
            phone: next.phone,
            geography: next.geography || '',
          }
        : contact),
    }));
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name || !user) return;

    const primaryContact = form.contacts.find((contact) => contact.isPrimary) || form.contacts[0];
    const lenderData: MasterLenderInsert = {
      name,
      company_id: company?.id || null,
      contact_name: primaryContact?.name.trim() || null,
      contact_title: primaryContact?.title.trim() || null,
      email: primaryContact?.email.trim() || null,
      contact_phone: primaryContact?.phone.trim() || null,
      lender_type: form.lenderType.trim() || null,
      loan_types: commaList(form.loanTypes),
      min_deal: form.minDeal ? parseFloat(form.minDeal) : null,
      max_deal: form.maxDeal ? parseFloat(form.maxDeal) : null,
      industries: commaList(form.industries),
      geo: form.geo.trim() || null,
      deal_structure_notes: form.description.trim() || null,
      tier: form.tier ? `T${form.tier}` : null,
      relationship_owners: form.relationshipOwners.trim() || null,
      website: form.website.trim() || null,
      linkedin_url: form.linkedinUrl.trim() || null,
      phone: form.phoneMain.trim() || null,
      address: form.address.trim() || null,
      min_revenue: form.minRevenue ? parseFloat(form.minRevenue) : null,
      ebitda_min: form.ebitdaMin ? parseFloat(form.ebitdaMin) : null,
      company_requirements: form.companyRequirements.trim() || null,
      ...(linkedCrmCompany ? { crm_company_id: linkedCrmCompany.id } : {}),
    };

    setSaving(true);
    try {
      const created = await addLender(lenderData);
      if (!created) throw new Error('Failed to add funding source');

      const contactsToSave = form.contacts.filter((contact) => contact.name.trim() || contact.email.trim());
      const affiliatedContactIds: string[] = [];
      if (contactsToSave.length) {
        const resolved = await Promise.all(contactsToSave.map(async (contact) => {
          let contactId = contact.contact_id;
          if (!contactId && contact.name.trim()) {
            const [firstName, ...rest] = contact.name.trim().split(/\s+/);
            const { data: newContact, error } = await supabase
              .from('contacts')
              .insert({
                first_name: firstName || null,
                last_name: rest.join(' ').trim() || null,
                email: contact.email.trim() || null,
                job_title: contact.title.trim() || null,
                phone_work: contact.phone.trim() || null,
              })
              .select('id')
              .single();
            if (!error) contactId = newContact?.id || null;
          }
          if (contactId) affiliatedContactIds.push(contactId);
          return {
            lender_id: created.id,
            contact_id: contactId,
            name: contact.name.trim(),
            title: contact.title.trim() || null,
            email: contact.email.trim() || null,
            phone: contact.phone.trim() || null,
            geography: contact.geography.trim() || null,
            is_primary: contact.isPrimary,
          };
        }));
        await supabase.from('lender_contacts').insert(resolved);
      }

      if (linkedCrmCompany && affiliatedContactIds.length) {
        await supabase
          .from('contacts')
          .update({ crm_company_id: linkedCrmCompany.id } as any)
          .in('id', affiliatedContactIds)
          .is('crm_company_id', null);
      }

      toast.success(`${name} added as a funding source`);
      onOpenChange(false);
      onCreated?.(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create funding source');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[1700] w-[calc(100dvw-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] border-white/10 bg-background"
        overlayClassName="z-[1690] bg-slate-900/50"
      >
        <DialogHeader>
          <DialogTitle>Add Funding Source</DialogTitle>
          <DialogDescription>Complete the funding source profile before adding it to the directory.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4 -mr-2">
          <div className="space-y-4 pb-2">
            <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="new-funding-source-name">Funding Source Name *</Label>
                <FundingSourceNameField
                  id="new-funding-source-name"
                  value={form.name}
                  onChange={(name) => updateForm('name', name)}
                  linkedCompany={linkedCrmCompany}
                  onLinkCompany={(companyValue) => {
                    setLinkedCrmCompany(companyValue);
                    if (companyValue && !form.website.trim() && (companyValue.website_url || companyValue.domain)) {
                      updateForm('website', companyValue.website_url || companyValue.domain || '');
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-funding-source-tier">Tier</Label>
                <Select value={form.tier || 'none'} onValueChange={(value) => updateForm('tier', value === 'none' ? '' : value)}>
                  <SelectTrigger id="new-funding-source-tier" className="w-[100px]"><SelectValue placeholder="Tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="1">T1</SelectItem>
                    <SelectItem value="2">T2</SelectItem>
                    <SelectItem value="3">T3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-funding-source-description">About / Notes</Label>
              <Textarea id="new-funding-source-description" value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Additional notes about the funding source..." rows={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-funding-source-type">Funding Source Type</Label>
              <Select value={form.lenderType || 'none'} onValueChange={(value) => updateForm('lenderType', value === 'none' ? '' : value)}>
                <SelectTrigger id="new-funding-source-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {LENDER_TYPE_OPTIONS.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Contacts</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setForm((current) => ({ ...current, contacts: [...current.contacts, emptyContact()] }))}>
                  <Plus className="h-3 w-3" /> Add Contact
                </Button>
              </div>
              {form.contacts.map((contact, index) => (
                <div key={index} className="space-y-2 p-3 rounded-lg border bg-muted/30 relative">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="new-funding-source-primary-contact"
                        checked={contact.isPrimary}
                        onChange={() => setForm((current) => ({ ...current, contacts: current.contacts.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })) }))}
                        className="accent-primary"
                      />
                      {contact.isPrimary ? <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">Primary</Badge> : <span className="text-muted-foreground">Set as primary</span>}
                    </label>
                    {form.contacts.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setForm((current) => {
                        const next = current.contacts.filter((_, itemIndex) => itemIndex !== index);
                        if (contact.isPrimary && next.length) next[0].isPrimary = true;
                        return { ...current, contacts: next };
                      })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <LenderContactPicker
                    value={{ contact_id: contact.contact_id, name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, geography: contact.geography }}
                    onChange={(next) => updateContact(index, next)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-funding-source-owners">Relationship Owner(s)</Label>
              <RelationshipOwnersPicker value={form.relationshipOwners} onChange={(next) => updateForm('relationshipOwners', next)} members={companyMembers} currentUserEmail={user?.email || null} />
            </div>

            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Business Info</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="new-funding-source-website" className="text-xs text-muted-foreground">Website</Label><Input id="new-funding-source-website" value={form.website} onChange={(event) => updateForm('website', event.target.value)} placeholder="https://example.com" /></div>
                <div className="space-y-2"><Label htmlFor="new-funding-source-linkedin" className="text-xs text-muted-foreground">LinkedIn</Label><Input id="new-funding-source-linkedin" value={form.linkedinUrl} onChange={(event) => updateForm('linkedinUrl', event.target.value)} placeholder="https://linkedin.com/company/..." /></div>
                <div className="space-y-2"><Label htmlFor="new-funding-source-phone" className="text-xs text-muted-foreground">Phone</Label><Input id="new-funding-source-phone" value={form.phoneMain} onChange={(event) => updateForm('phoneMain', event.target.value)} placeholder="(555) 555-5555" /></div>
                <div className="space-y-2"><Label htmlFor="new-funding-source-address" className="text-xs text-muted-foreground">Address</Label><Input id="new-funding-source-address" value={form.address} onChange={(event) => updateForm('address', event.target.value)} placeholder="City, State" /></div>
              </div>
            </div>

            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Lending Criteria</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="new-funding-source-min-deal" className="text-xs text-muted-foreground">Min Deal Size ($)</Label><Input id="new-funding-source-min-deal" inputMode="numeric" value={formatCurrencyInput(form.minDeal)} onChange={(event) => updateForm('minDeal', event.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g., $1,000,000" /></div>
                <div className="space-y-2"><Label htmlFor="new-funding-source-max-deal" className="text-xs text-muted-foreground">Max Deal Size ($)</Label><Input id="new-funding-source-max-deal" inputMode="numeric" value={formatCurrencyInput(form.maxDeal)} onChange={(event) => updateForm('maxDeal', event.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g., $25,000,000" /></div>
              </div>
              <div className="space-y-2"><Label className="text-xs text-muted-foreground">Geographic Preference</Label><MultiSelectChips value={form.geo} onChange={(next) => updateForm('geo', next)} options={GEO_OPTIONS} placeholder="Select regions" searchPlaceholder="Search regions..." /></div>
              <div className="space-y-2"><Label className="text-xs text-muted-foreground">Industries</Label><MultiSelectChips value={form.industries} onChange={(next) => updateForm('industries', next)} options={getIndustryOptions()} placeholder="Select industries" searchPlaceholder="Search industries..." /></div>
              <div className="space-y-2"><Label className="text-xs text-muted-foreground">Loan Types</Label><MultiSelectChips value={form.loanTypes} onChange={(next) => updateForm('loanTypes', next)} options={LOAN_TYPE_OPTIONS} placeholder="Select loan types" searchPlaceholder="Search loan types..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="new-funding-source-min-revenue" className="text-xs text-muted-foreground">Min Revenue ($)</Label><Input id="new-funding-source-min-revenue" inputMode="numeric" value={formatCurrencyInput(form.minRevenue)} onChange={(event) => updateForm('minRevenue', event.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g., $5,000,000" /></div>
                <div className="space-y-2"><Label htmlFor="new-funding-source-ebitda" className="text-xs text-muted-foreground">Min EBITDA ($)</Label><Input id="new-funding-source-ebitda" inputMode="numeric" value={formatCurrencyInput(form.ebitdaMin)} onChange={(event) => updateForm('ebitdaMin', event.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g., $1,000,000" /></div>
              </div>
              <div className="space-y-2"><Label className="text-xs text-muted-foreground">Company Requirements</Label><MultiSelectChips value={form.companyRequirements} onChange={(next) => updateForm('companyRequirements', next)} options={COMPANY_REQUIREMENT_OPTIONS} placeholder="Select requirements" searchPlaceholder="Search requirements..." /></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" variant="gradient" onClick={handleSubmit} disabled={!form.name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Funding Source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
