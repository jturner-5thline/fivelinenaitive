import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateContact } from '@/hooks/useContacts';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'went_dark', label: 'Went Dark' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];
import { CompanyComboBox } from '@/components/contacts/CompanyComboBox';
import { ContactTypeSelect } from '@/components/contacts/ContactTypeSelect';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { extractEmailDomain } from '@/lib/extractEmailDomain';
import { useContactTaggingRules } from '@/hooks/useContactTaggingRules';
import { applyTaggingRules } from '@/lib/contactTaggingRules';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CreateContactModalProps {
  open: boolean;
  onClose: () => void;
  defaultCompanyId?: string;
  /** Pre-fill values (e.g. parsed from a search term). */
  initialValues?: { first_name?: string; last_name?: string; email?: string };
  /** Called with the created contact row after a successful save. */
  onCreated?: (contact: any) => void;
}

export function CreateContactModal({ open, onClose, defaultCompanyId, initialValues, onCreated }: CreateContactModalProps) {
  const createContact = useCreateContact();
  const teamMembers = useTeamMembers();
  const { data: taggingRules = [] } = useContactTaggingRules({ activeOnly: true });
  const { user } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_work: '',
    phone_mobile: '',
    job_title: '',
    department: '',
    lifecycle_stage: 'lead' as string,
    status: 'active' as string,
    lead_source: '',
    linkedin_url: '',
    website_url: '',
    description: '',
    crm_company_id: defaultCompanyId || '' as string,
    contact_type: '' as string,
    owner_user_id: '' as string,
  });

  // Seed name/email from the caller each time the modal opens.
  useEffect(() => {
    if (!open || !initialValues) return;
    setForm(p => ({
      ...p,
      first_name: p.first_name || initialValues.first_name || '',
      last_name: p.last_name || initialValues.last_name || '',
      email: p.email || initialValues.email || '',
    }));
  }, [open, initialValues]);

  const handleEmailChange = (email: string) => {
    setForm(p => {
      const next = { ...p, email };
      if (!p.website_url) {
        const domain = extractEmailDomain(email);
        if (domain) next.website_url = `https://${domain}`;
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
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
      linkedin_url: linkedinTrim || null,
      job_title: form.job_title.trim() || null,
      owner_user_id: form.owner_user_id || user?.id || null,
    };
    createContact.mutate(payload as any, {
      onSuccess: (created: any) => {
        onClose();
        onCreated?.({ ...payload, ...(created || {}) });
        setForm({
          first_name: '', last_name: '', email: '', phone_work: '', phone_mobile: '',
          job_title: '', department: '', lifecycle_stage: 'lead', status: 'active',
          lead_source: '', linkedin_url: '', website_url: '', description: '', crm_company_id: '', contact_type: '', owner_user_id: '',
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Contact</DialogTitle>
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
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="email" className="text-xs">Email <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => handleEmailChange(e.target.value)} />
          </div>

          {/* Company selector */}
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Company</Label>
            <CompanyComboBox
              value={form.crm_company_id}
              onChange={(id) => setForm(p => ({ ...p, crm_company_id: id }))}
              email={form.email}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone_work" className="text-xs">Work Phone</Label>
            <Input id="phone_work" value={form.phone_work} onChange={(e) => setForm(p => ({ ...p, phone_work: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone_mobile" className="text-xs">Mobile</Label>
            <Input id="phone_mobile" value={form.phone_mobile} onChange={(e) => setForm(p => ({ ...p, phone_mobile: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job_title" className="text-xs">Job Title</Label>
            <Input id="job_title" value={form.job_title} onChange={(e) => setForm(p => ({ ...p, job_title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department" className="text-xs">Department</Label>
            <Input id="department" value={form.department} onChange={(e) => setForm(p => ({ ...p, department: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead_source" className="text-xs">Lead Source</Label>
            <Input id="lead_source" value={form.lead_source} onChange={(e) => setForm(p => ({ ...p, lead_source: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedin_url" className="text-xs">LinkedIn URL</Label>
            <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => setForm(p => ({ ...p, linkedin_url: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Contact Type</Label>
            <ContactTypeSelect
              value={form.contact_type}
              onChange={(v) => setForm(p => ({ ...p, contact_type: v || '' }))}
              triggerClassName="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website_url" className="text-xs">Website / Domain</Label>
            <Input id="website_url" placeholder="auto from email" value={form.website_url} onChange={(e) => setForm(p => ({ ...p, website_url: e.target.value }))} />
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
              !form.first_name.trim() ||
              !form.last_name.trim() ||
              !form.email.trim()
            }
          >
            {createContact.isPending ? 'Creating...' : 'Create Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
