import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateContact, LIFECYCLE_STAGES, CONTACT_STATUSES } from '@/hooks/useContacts';
import { CompanyComboBox } from '@/components/contacts/CompanyComboBox';
import { extractEmailDomain } from '@/lib/extractEmailDomain';
import { cn } from '@/lib/utils';

interface CreateContactModalProps {
  open: boolean;
  onClose: () => void;
  defaultCompanyId?: string;
}

export function CreateContactModal({ open, onClose, defaultCompanyId }: CreateContactModalProps) {
  const createContact = useCreateContact();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_work: '',
    phone_mobile: '',
    job_title: '',
    department: '',
    lifecycle_stage: 'lead' as string,
    status: 'new' as string,
    lead_source: '',
    linkedin_url: '',
    website_url: '',
    description: '',
    crm_company_id: defaultCompanyId || '' as string,
  });

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
    if (!form.first_name && !form.last_name && !form.email) return;
    const payload = { ...form, crm_company_id: form.crm_company_id || null };
    createContact.mutate(payload as any, {
      onSuccess: () => {
        onClose();
        setForm({
          first_name: '', last_name: '', email: '', phone_work: '', phone_mobile: '',
          job_title: '', department: '', lifecycle_stage: 'lead', status: 'new',
          lead_source: '', linkedin_url: '', website_url: '', description: '', crm_company_id: '',
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
            <Label htmlFor="first_name" className="text-xs">First Name</Label>
            <Input id="first_name" value={form.first_name} onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name" className="text-xs">Last Name</Label>
            <Input id="last_name" value={form.last_name} onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="email" className="text-xs">Email</Label>
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
            <Label className="text-xs">Lifecycle Stage</Label>
            <Select value={form.lifecycle_stage} onValueChange={(v) => setForm(p => ({ ...p, lifecycle_stage: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIFECYCLE_STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_STATUSES.map(s => (
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
            <Label htmlFor="website_url" className="text-xs">Website / Domain</Label>
            <Input id="website_url" placeholder="auto from email" value={form.website_url} onChange={(e) => setForm(p => ({ ...p, website_url: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description" className="text-xs">Notes</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createContact.isPending}>
            {createContact.isPending ? 'Creating...' : 'Create Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
