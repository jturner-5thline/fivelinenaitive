import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCrmCompany, CRM_COMPANY_TYPES } from '@/hooks/useCrmCompanies';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useIndustryOptions } from '@/hooks/useIndustryOptions';
import { ManageIndustryOptionsDialog } from '@/components/crm/ManageIndustryOptionsDialog';
import { EMPLOYEE_RANGE_OPTIONS } from '@/constants/employeeRanges';

interface CreateCrmCompanyModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the company name (e.g. from a search term). */
  initialName?: string;
  /** Called with the created company row after a successful save. */
  onCreated?: (company: any) => void;
}

const EMPTY_FORM = {
  name: '',
  company_type: 'prospect' as string,
  industry: '',
  sub_industry: '',
  employee_range: '',
  annual_revenue: '',
  phone: '',
  main_contact_email: '',
  domain: '',
  linkedin_url: '',
  hq_city: '',
  hq_country: '',
  hq_address: '',
  segment: '',
  customer_tier: '',
  source_system: '',
  owner_user_id: '',
  description: '',
};

export function CreateCrmCompanyModal({ open, onClose, initialName, onCreated }: CreateCrmCompanyModalProps) {
  const create = useCreateCrmCompany();
  const teamMembers = useTeamMembers();
  const { options: industryOptions } = useIndustryOptions();
  const [manageIndustriesOpen, setManageIndustriesOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Seed the name from the caller each time the modal opens.
  useEffect(() => {
    if (open && initialName) {
      setForm(p => (p.name.trim() ? p : { ...p, name: initialName }));
    }
  }, [open, initialName]);

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    // Convert empty strings to null so optional fields stay blank rather than empty text.
    const payload: Record<string, any> = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
    );
    if (payload.annual_revenue != null) {
      const n = Number(String(payload.annual_revenue).replace(/[^\d.-]/g, ''));
      payload.annual_revenue = isNaN(n) ? null : n;
    }
    create.mutate(payload as any, {
      onSuccess: (created: any) => {
        onClose();
        onCreated?.(created);
        setForm({ ...EMPTY_FORM });
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
            <Label htmlFor="name" className="text-xs">Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.company_type} onValueChange={v => set('company_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <Select value={form.industry || 'unset'} onValueChange={v => set('industry', v === 'unset' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    {industryOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="icon"
                variant="ghost"
                type="button"
                className="h-8 w-8 shrink-0"
                title="Manage industries"
                onClick={() => setManageIndustriesOpen(true)}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub_industry" className="text-xs">Sub-Industry</Label>
            <Input id="sub_industry" value={form.sub_industry} onChange={(e) => set('sub_industry', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Company Size</Label>
            <Select value={form.employee_range || 'unset'} onValueChange={v => set('employee_range', v === 'unset' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                {EMPLOYEE_RANGE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annual_revenue" className="text-xs">Annual Revenue</Label>
            <Input id="annual_revenue" inputMode="numeric" value={form.annual_revenue} onChange={(e) => set('annual_revenue', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="main_contact_email" className="text-xs">Email</Label>
            <Input id="main_contact_email" type="email" value={form.main_contact_email} onChange={(e) => set('main_contact_email', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs">Website</Label>
            <Input id="domain" placeholder="example.com" value={form.domain} onChange={(e) => set('domain', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linkedin_url" className="text-xs">LinkedIn</Label>
            <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hq_city" className="text-xs">City</Label>
            <Input id="hq_city" value={form.hq_city} onChange={(e) => set('hq_city', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hq_country" className="text-xs">HQ Country</Label>
            <Input id="hq_country" value={form.hq_country} onChange={(e) => set('hq_country', e.target.value)} />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="hq_address" className="text-xs">HQ Address</Label>
            <Textarea id="hq_address" rows={2} value={form.hq_address} onChange={(e) => set('hq_address', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="segment" className="text-xs">Segment</Label>
            <Input id="segment" placeholder="SMB, Mid-Market, Enterprise" value={form.segment} onChange={(e) => set('segment', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer_tier" className="text-xs">Tier</Label>
            <Input id="customer_tier" value={form.customer_tier} onChange={(e) => set('customer_tier', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source_system" className="text-xs">Source</Label>
            <Input id="source_system" value={form.source_system} onChange={(e) => set('source_system', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Company owner</Label>
            <Select
              value={form.owner_user_id || 'unassigned'}
              onValueChange={v => set('owner_user_id', v === 'unassigned' ? '' : v)}
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
            <Textarea id="description" placeholder="Add a company description…" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Company'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ManageIndustryOptionsDialog open={manageIndustriesOpen} onOpenChange={setManageIndustriesOpen} />
    </Dialog>
  );
}
