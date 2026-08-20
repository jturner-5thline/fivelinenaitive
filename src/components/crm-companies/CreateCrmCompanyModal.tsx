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
import { useCompanySnapshotFieldConfig } from '@/hooks/useCompanySnapshotFieldConfig';

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
  description: '',
  industry: '',
  owner_user_id: '',
  company_type: 'prospect' as string,
  employee_range: '',
  hq_city: '',
  hq_country: '',
  domain: '',
  linkedin_url: '',
  phone: '',
  main_contact_email: '',
};

export function CreateCrmCompanyModal({ open, onClose, initialName, onCreated }: CreateCrmCompanyModalProps) {
  const create = useCreateCrmCompany();
  const teamMembers = useTeamMembers();
  const { options: industryOptions } = useIndustryOptions();
  const snapshotFields = useCompanySnapshotFieldConfig();
  const [manageIndustriesOpen, setManageIndustriesOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  // Seed the name from the caller each time the modal opens.
  useEffect(() => {
    if (open && initialName) {
      setForm(p => (p.name.trim() ? p : { ...p, name: initialName }));
    }
  }, [open, initialName]);

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }));
  const shown = (key: string) => !snapshotFields.isDisabled(key);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    // Only send fields that are visible on this account's company detail page.
    const entries = Object.entries(form).filter(([k]) =>
      k === 'name' || k === 'description' || shown(k)
    );
    const payload: Record<string, any> = Object.fromEntries(
      entries.map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
    );
    const custom = Object.fromEntries(
      Object.entries(customValues).filter(([, v]) =>
        Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''
      )
    );
    if (Object.keys(custom).length) payload.custom_fields = custom;

    create.mutate(payload as any, {
      onSuccess: (created: any) => {
        onClose();
        onCreated?.(created);
        setForm({ ...EMPTY_FORM });
        setCustomValues({});
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

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="Add a short brief about positioning, traction, and current status…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {shown('industry') && (
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
          )}

          {shown('owner_user_id') && (
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
          )}

          {shown('company_type') && (
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.company_type} onValueChange={v => set('company_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRM_COMPANY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {shown('employee_range') && (
            <div className="space-y-1.5">
              <Label className="text-xs">Employees</Label>
              <Select value={form.employee_range || 'unset'} onValueChange={v => set('employee_range', v === 'unset' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">—</SelectItem>
                  {EMPLOYEE_RANGE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {shown('hq_city') && (
            <div className="space-y-1.5">
              <Label htmlFor="hq_city" className="text-xs">City</Label>
              <Input id="hq_city" value={form.hq_city} onChange={(e) => set('hq_city', e.target.value)} />
            </div>
          )}

          {shown('hq_country') && (
            <div className="space-y-1.5">
              <Label htmlFor="hq_country" className="text-xs">Country</Label>
              <Input id="hq_country" value={form.hq_country} onChange={(e) => set('hq_country', e.target.value)} />
            </div>
          )}

          {shown('domain') && (
            <div className="space-y-1.5">
              <Label htmlFor="domain" className="text-xs">Website</Label>
              <Input id="domain" placeholder="example.com" value={form.domain} onChange={(e) => set('domain', e.target.value)} />
            </div>
          )}

          {shown('linkedin_url') && (
            <div className="space-y-1.5">
              <Label htmlFor="linkedin_url" className="text-xs">LinkedIn</Label>
              <Input id="linkedin_url" value={form.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} />
            </div>
          )}

          {shown('phone') && (
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs">Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          )}

          {shown('main_contact_email') && (
            <div className="space-y-1.5">
              <Label htmlFor="main_contact_email" className="text-xs">Primary email</Label>
              <Input id="main_contact_email" type="email" value={form.main_contact_email} onChange={(e) => set('main_contact_email', e.target.value)} />
            </div>
          )}

          {snapshotFields.config.custom.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              {f.type === 'select' ? (
                <Select
                  value={customValues[f.key] || 'unset'}
                  onValueChange={v => setCustomValues(p => ({ ...p, [f.key]: v === 'unset' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    {(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === 'multiselect' ? (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-border/60 p-2">
                  {(f.options || []).map(o => {
                    const vals: string[] = Array.isArray(customValues[f.key]) ? customValues[f.key] : [];
                    const active = vals.includes(o);
                    return (
                      <Button
                        key={o}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        className="h-6 text-xs"
                        onClick={() => setCustomValues(p => ({
                          ...p,
                          [f.key]: active ? vals.filter(x => x !== o) : [...vals, o],
                        }))}
                      >
                        {o}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <Input
                  value={customValues[f.key] ?? ''}
                  onChange={(e) => setCustomValues(p => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
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
