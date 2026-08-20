import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateContact, useUpdateContact, CONTACT_STATUSES, DEFAULT_CONTACT_STATUS } from '@/hooks/useContacts';
import { CompanyComboBox } from '@/components/contacts/CompanyComboBox';
import { ContactTypeMultiSelect } from '@/components/contacts/ContactTypeMultiSelect';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { extractEmailDomain } from '@/lib/extractEmailDomain';
import { useContactTaggingRules } from '@/hooks/useContactTaggingRules';
import { applyTaggingRules } from '@/lib/contactTaggingRules';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { COUNTRY_OPTIONS } from '@/lib/countries';
import { normalizeLinkedInUrl } from '@/lib/linkedin';
import { normalizeDomain } from '@/lib/extractEmailDomain';
import { useContactFieldConfig } from '@/hooks/useContactFieldConfig';
import { CustomContactFieldsSection } from '@/components/contacts/CustomContactFieldsSection';

interface CreateContactModalProps {
  open: boolean;
  onClose: () => void;
  defaultCompanyId?: string;
  /** Pre-fill values (e.g. parsed from a search term, or an existing contact row). */
  initialValues?: Record<string, any>;
  /** When set, the modal edits this existing contact instead of creating a new one. */
  contactId?: string | null;
  /** Optional class overrides (e.g. z-index when nested inside another dialog). */
  contentClassName?: string;
  overlayClassName?: string;
  /** Called with the created/updated contact row after a successful save. */
  onCreated?: (contact: any) => void;
}

const FORM_KEYS = [
  'first_name','last_name','email','phone_work','phone_mobile','job_title','department',
  'lifecycle_stage','status','lead_source','linkedin_url','website_url','description',
  'crm_company_id','contact_type','owner_user_id','city','state','country','timezone','source_system',
] as const;

export function CreateContactModal({ open, onClose, defaultCompanyId, initialValues, contactId, contentClassName, overlayClassName, onCreated }: CreateContactModalProps) {
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const isEdit = !!contactId;
  const teamMembers = useTeamMembers();
  const { data: taggingRules = [] } = useContactTaggingRules({ activeOnly: true });
  const { user } = useAuth();
  const { config: fieldConfig, isDisabled: isFieldDisabled } = useContactFieldConfig();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_work: '',
    phone_mobile: '',
    job_title: '',
    department: '',
    lifecycle_stage: 'lead' as string,
    status: DEFAULT_CONTACT_STATUS as string,
    lead_source: '',
    linkedin_url: '',
    website_url: '',
    description: '',
    crm_company_id: defaultCompanyId || '' as string,
    contact_type: '' as string,
    owner_user_id: '' as string,
    city: '',
    state: '',
    country: '',
    timezone: '',
    source_system: '',
    custom_fields: {} as Record<string, any>,
  });

  // Seed the form from the caller each time the modal opens. When editing an
  // existing contact every known field is hydrated as-is so the user can adjust it.
  useEffect(() => {
    if (!open || !initialValues) return;
    setForm(p => {
      const next: any = { ...p };
      for (const key of FORM_KEYS) {
        const incoming = (initialValues as any)[key];
        if (incoming === undefined || incoming === null || incoming === '') continue;
        if (isEdit || !next[key]) next[key] = String(incoming);
      }
      if (initialValues.custom_fields && typeof initialValues.custom_fields === 'object') {
        next.custom_fields = { ...(next.custom_fields || {}), ...initialValues.custom_fields };
      }
      return next;
    });
  }, [open, initialValues, isEdit]);

  const domainAutoFilledRef = useRef(true);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const DOMAIN_RE = /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/.*)?$/i;

  const emailValue = form.email.trim();
  const domainValue = form.website_url.trim();
  const emailError = emailValue && !EMAIL_RE.test(emailValue)
    ? 'Enter a valid email address (e.g. name@company.com)'
    : null;
  const domainError = domainValue && !DOMAIN_RE.test(domainValue)
    ? 'Enter a valid domain (e.g. company.com)'
    : null;

  const handleEmailChange = (email: string) => {
    setForm(p => {
      const next = { ...p, email };
      // Keep the domain in sync with the email until the user edits it manually.
      if (!p.website_url || domainAutoFilledRef.current) {
        const domain = extractEmailDomain(email);
        if (domain) {
          next.website_url = domain;
          domainAutoFilledRef.current = true;
        } else if (domainAutoFilledRef.current) {
          next.website_url = '';
        }
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const missing: string[] = [];
    if (!firstName) missing.push('First Name');
    if (!lastName) missing.push('Last Name');
    if (!email) missing.push('Email');
    if (missing.length > 0) {
      toast.error(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast.error('Enter a valid email address (e.g. name@company.com)');
      return;
    }
    if (domainError) {
      toast.error(domainError);
      return;
    }
    const linkedinTrim = form.linkedin_url.trim();
    if (linkedinTrim && !/^https?:\/\//i.test(linkedinTrim) && !/^([\w-]+\.)+[a-z]{2,}/i.test(linkedinTrim)) {
      // soft validation: warn but do not block; let it through
    }
    const payload = {
      ...form,
      crm_company_id: form.crm_company_id || null,
      contact_type:
        applyTaggingRules(taggingRules, {
          email,
          website_url: form.website_url,
          contact_type: form.contact_type?.trim() || null,
        }) || form.contact_type?.trim() || null,
      linkedin_url: linkedinTrim ? normalizeLinkedInUrl(linkedinTrim) : null,
      website_url: normalizeDomain(form.website_url) || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country || null,
      timezone: form.timezone.trim() || null,
      source_system: form.source_system.trim() || null,
      department: form.department.trim() || null,
      lead_source: form.lead_source.trim() || null,
      custom_fields: Object.keys(form.custom_fields || {}).length ? form.custom_fields : null,
      job_title: form.job_title.trim() || null,
      owner_user_id: form.owner_user_id || user?.id || null,
    };
    const onSaved = (created: any) => {
      onClose();
      onCreated?.({ ...payload, ...(created || {}) });
      setForm({
        first_name: '', last_name: '', email: '', phone_work: '', phone_mobile: '',
        job_title: '', department: '', lifecycle_stage: 'lead', status: DEFAULT_CONTACT_STATUS,
        lead_source: '', linkedin_url: '', website_url: '', description: '', crm_company_id: '', contact_type: '', owner_user_id: '',
        city: '', state: '', country: '', timezone: '', source_system: '', custom_fields: {},
      });
      domainAutoFilledRef.current = true;
    };
    if (isEdit) {
      updateContact.mutate({ id: contactId as string, ...(payload as any) }, { onSuccess: onSaved });
    } else {
      createContact.mutate(payload as any, { onSuccess: onSaved });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('sm:max-w-[550px] max-h-[85vh] overflow-y-auto', contentClassName)} overlayClassName={overlayClassName}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Update Contact' : 'Create Contact'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="first_name" className="text-xs">First Name <span className="text-destructive">*</span></Label>
            <Input id="first_name" value={form.first_name} onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name" className="text-xs">Last Name <span className="text-destructive">*</span></Label>
            <Input id="last_name" value={form.last_name} onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))} />
          </div>

          {!isFieldDisabled('job_title') && (
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="job_title" className="text-xs">Job Title</Label>
              <Input id="job_title" value={form.job_title} onChange={(e) => setForm(p => ({ ...p, job_title: e.target.value }))} />
            </div>
          )}

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Company</Label>
            <CompanyComboBox
              value={form.crm_company_id}
              onChange={(id) => setForm(p => ({ ...p, crm_company_id: id }))}
              email={form.email}
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Owner</Label>
            <Select
              value={form.owner_user_id || (user?.id ?? 'unassigned')}
              onValueChange={(v) => setForm(p => ({ ...p, owner_user_id: v === 'unassigned' ? '' : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!isFieldDisabled('linkedin_url') && (
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="linkedin_url" className="text-xs">LinkedIn</Label>
              <Input
                id="linkedin_url"
                placeholder="https://linkedin.com/in/… or handle"
                value={form.linkedin_url}
                onChange={(e) => setForm(p => ({ ...p, linkedin_url: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="email" className="text-xs">Work Email <span className="text-destructive">*</span></Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              className={emailError ? 'border-destructive focus-visible:ring-destructive' : undefined}
            />
            {emailError && <p id="email-error" className="text-xs text-destructive">{emailError}</p>}
          </div>

          {!isFieldDisabled('phone_mobile') && (
            <div className="space-y-1.5">
              <Label htmlFor="phone_mobile" className="text-xs">Mobile</Label>
              <Input id="phone_mobile" value={form.phone_mobile} onChange={(e) => setForm(p => ({ ...p, phone_mobile: e.target.value }))} />
            </div>
          )}
          {!isFieldDisabled('phone_work') && (
            <div className="space-y-1.5">
              <Label htmlFor="phone_work" className="text-xs">Office Phone</Label>
              <Input id="phone_work" value={form.phone_work} onChange={(e) => setForm(p => ({ ...p, phone_work: e.target.value }))} />
            </div>
          )}

          {!isFieldDisabled('city') && (
            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-xs">City</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
          )}
          {!isFieldDisabled('state') && (
            <div className="space-y-1.5">
              <Label htmlFor="state" className="text-xs">State</Label>
              <Input id="state" value={form.state} onChange={(e) => setForm(p => ({ ...p, state: e.target.value }))} />
            </div>
          )}
          {!isFieldDisabled('country') && (
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Country</Label>
              <Select value={form.country || 'unset'} onValueChange={(v) => setForm(p => ({ ...p, country: v === 'unset' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">—</SelectItem>
                  {COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isFieldDisabled('website_url') && (
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="website_url" className="text-xs">Domain</Label>
              <Input
                id="website_url"
                placeholder="auto from email"
                value={form.website_url}
                onChange={(e) => { domainAutoFilledRef.current = false; setForm(p => ({ ...p, website_url: e.target.value })); }}
                aria-invalid={!!domainError}
                aria-describedby={domainError ? 'website-url-error' : undefined}
                className={domainError ? 'border-destructive focus-visible:ring-destructive' : undefined}
              />
              {domainError && <p id="website-url-error" className="text-xs text-destructive">{domainError}</p>}
            </div>
          )}

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Contact Type</Label>
            <ContactTypeMultiSelect
              value={form.contact_type}
              onChange={(v) => setForm(p => ({ ...p, contact_type: v || '' }))}
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Set status" /></SelectTrigger>
              <SelectContent>
                {CONTACT_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', s.dot)} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional details — mirrors the detail page rail */}
          <div className="col-span-2 pt-1 border-t border-border/40 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-foreground/80 font-semibold">Additional Details</p>
            <div className="grid grid-cols-2 gap-4">
              {!isFieldDisabled('department') && (
                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-xs">Department</Label>
                  <Input id="department" value={form.department} onChange={(e) => setForm(p => ({ ...p, department: e.target.value }))} />
                </div>
              )}
              {!isFieldDisabled('timezone') && (
                <div className="space-y-1.5">
                  <Label htmlFor="timezone" className="text-xs">Timezone</Label>
                  <Input id="timezone" value={form.timezone} onChange={(e) => setForm(p => ({ ...p, timezone: e.target.value }))} />
                </div>
              )}
              {!isFieldDisabled('lead_source') && (
                <div className="space-y-1.5">
                  <Label htmlFor="lead_source" className="text-xs">Lead Source</Label>
                  <Input id="lead_source" value={form.lead_source} onChange={(e) => setForm(p => ({ ...p, lead_source: e.target.value }))} />
                </div>
              )}
            </div>
            <CustomContactFieldsSection
              fields={fieldConfig.custom}
              values={form.custom_fields}
              onChange={(_key, nextObj) => setForm(p => ({ ...p, custom_fields: nextObj }))}
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description" className="text-xs">Notes</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              createContact.isPending ||
              updateContact.isPending ||
              !form.first_name.trim() ||
              !form.last_name.trim() ||
              !form.email.trim() ||
              !!emailError ||
              !!domainError
            }
          >
            {isEdit
              ? (updateContact.isPending ? 'Saving...' : 'Save Contact')
              : (createContact.isPending ? 'Creating...' : 'Create Contact')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
