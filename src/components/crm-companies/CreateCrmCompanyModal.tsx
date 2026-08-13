import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCrmCompany, CRM_COMPANY_TYPES, CRM_COMPANY_STATUSES, CRM_COMPANY_LIFECYCLES } from '@/hooks/useCrmCompanies';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface CreateCrmCompanyModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the company name (e.g. from a search term). */
  initialName?: string;
  /** Called with the created company row after a successful save. */
  onCreated?: (company: any) => void;
}

export function CreateCrmCompanyModal({ open, onClose, initialName, onCreated }: CreateCrmCompanyModalProps) {
  const create = useCreateCrmCompany();
  const teamMembers = useTeamMembers();
  const [form, setForm] = useState({
    name: '',
    domain: '',
    industry: '',
    company_type: 'prospect' as string,
    status: 'active' as string,
    lifecycle_stage: 'target' as string,
    employee_range: '',
    year_founded: '',
    financing_status: '',
    created_at: '',
    hq_city: '',
    hq_country: '',
    segment: '',
    linkedin_url: '',
    phone: '',
    main_contact_email: '',
    description: '',
    address: '',
    hq_address: '',
    notes: '',
    owner_user_id: '',
  });

  // Seed the name from the caller each time the modal opens.
  useEffect(() => {
    if (open && initialName) {
      setForm(p => (p.name.trim() ? p : { ...p, name: initialName }));
    }
  }, [open, initialName]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    // Convert empty strings to null so optional fields stay blank rather than empty text.
    const payload: Record<string, any> = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
    );
    if (payload.year_founded != null) {
      const n = parseInt(String(payload.year_founded).replace(/[^\d]/g, ''), 10);
      payload.year_founded = isNaN(n) ? null : n;
    }
    if (payload.created_at) {
      const d = new Date(String(payload.created_at));
      payload.created_at = isNaN(d.getTime()) ? null : d.toISOString();
    }
    create.mutate(payload as any, {
      onSuccess: (created: any) => {
        onClose();
        onCreated?.(created);
        setForm({
          name: '', domain: '', industry: '', company_type: 'prospect', status: 'active',
          lifecycle_stage: 'target', employee_range: '', hq_city: '', hq_country: '',
          year_founded: '', financing_status: '', created_at: '',
          segment: '', linkedin_url: '', phone: '', main_contact_email: '', description: '',
          address: '', hq_address: '', notes: '', owner_user_id: '',
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Company</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="name" className="text-xs">Company Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs">Domain</Label>
            <Input id="domain" placeholder="example.com" value={form.domain} onChange={(e) => setForm(p => ({ ...p, domain: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry" className="text-xs">Industry</Label>
            <Input id="industry" value={form.industry} onChange={(e) => setForm(p => ({ ...p, industry: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.company_type} onValueChange={v => setForm(p => ({ ...p, company_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Lifecycle Stage</Label>
            <Select value={form.lifecycle_stage} onValueChange={v => setForm(p => ({ ...p, lifecycle_stage: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_LIFECYCLES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="segment" className="text-xs">Segment</Label>
            <Input id="segment" placeholder="SMB, Mid-Market, Enterprise" value={form.segment} onChange={(e) => setForm(p => ({ ...p, segment: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee_range" className="text-xs">Employee Range</Label>
            <Input id="employee_range" placeholder="51-200" value={form.employee_range} onChange={(e) => setForm(p => ({ ...p, employee_range: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year_founded" className="text-xs">Year Founded</Label>
            <Input id="year_founded" placeholder="2015" inputMode="numeric" value={form.year_founded} onChange={(e) => setForm(p => ({ ...p, year_founded: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="created_at" className="text-xs">Create Date</Label>
            <Input id="created_at" type="date" value={form.created_at} onChange={(e) => setForm(p => ({ ...p, created_at: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company Financing Status</Label>
            <Select value={form.financing_status || 'unset'} onValueChange={v => setForm(p => ({ ...p, financing_status: v === 'unset' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="bootstrapped">Bootstrapped</SelectItem>
                <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                <SelectItem value="seed">Seed</SelectItem>
                <SelectItem value="series_a">Series A</SelectItem>
                <SelectItem value="series_b">Series B</SelectItem>
                <SelectItem value="series_c">Series C</SelectItem>
                <SelectItem value="series_d_plus">Series D+</SelectItem>
                <SelectItem value="growth">Growth / Late Stage</SelectItem>
                <SelectItem value="private_equity">Private Equity-Backed</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="acquired">Acquired</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hq_city" className="text-xs">City</Label>
            <Input id="hq_city" value={form.hq_city} onChange={(e) => setForm(p => ({ ...p, hq_city: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hq_country" className="text-xs">Country</Label>
            <Input id="hq_country" value={form.hq_country} onChange={(e) => setForm(p => ({ ...p, hq_country: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedin_url" className="text-xs">LinkedIn</Label>
            <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => setForm(p => ({ ...p, linkedin_url: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="main_contact_email" className="text-xs">Main Email</Label>
            <Input id="main_contact_email" value={form.main_contact_email} onChange={(e) => setForm(p => ({ ...p, main_contact_email: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="address" className="text-xs">Address</Label>
            <Input id="address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="hq_address" className="text-xs">HQ Address</Label>
            <Input id="hq_address" value={form.hq_address} onChange={(e) => setForm(p => ({ ...p, hq_address: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Owner</Label>
            <Select
              value={form.owner_user_id || 'unassigned'}
              onValueChange={v => setForm(p => ({ ...p, owner_user_id: v === 'unassigned' ? '' : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="notes" className="text-xs">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
