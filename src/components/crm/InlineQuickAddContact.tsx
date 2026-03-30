import { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateContact } from '@/hooks/useContacts';
import { useQueryClient } from '@tanstack/react-query';

interface InlineQuickAddContactProps {
  companyId: string;
  companyName: string;
  onAdded?: () => void;
}

export function InlineQuickAddContact({ companyId, companyName, onAdded }: InlineQuickAddContactProps) {
  const createContact = useCreateContact();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', job_title: '' });
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    if (!form.first_name && !form.last_name && !form.email) return;
    createContact.mutate(
      { first_name: form.first_name, last_name: form.last_name, email: form.email, job_title: form.job_title, crm_company_id: companyId } as any,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['crm-company-contacts'] });
          setForm({ first_name: '', last_name: '', email: '', job_title: '' });
          setJustAdded(true);
        },
      }
    );
  };

  const handleCancel = () => {
    setShowForm(false);
    setForm({ first_name: '', last_name: '', email: '', job_title: '' });
    setJustAdded(false);
  };

  if (!showForm) {
    return (
      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowForm(true)}>
        <Plus className="h-3 w-3 mr-1" /> Quick Add Contact
      </Button>
    );
  }

  return (
    <div className="space-y-2 border border-border/50 rounded-md p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          placeholder="First name"
          value={form.first_name}
          onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
          className="h-8 text-xs"
          autoFocus
        />
        <Input
          placeholder="Last name"
          value={form.last_name}
          onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
          className="h-8 text-xs"
        />
      </div>
      <Input
        placeholder="Email"
        value={form.email}
        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
        className="h-8 text-xs"
        type="email"
      />
      <Input
        placeholder="Role / Title"
        value={form.job_title}
        onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))}
        className="h-8 text-xs"
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={handleAdd}
          disabled={createContact.isPending || (!form.first_name && !form.last_name && !form.email)}
        >
          <Check className="h-3 w-3 mr-1" />
          {createContact.isPending ? 'Adding...' : 'Add'}
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {justAdded && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs text-primary"
          onClick={() => {
            setJustAdded(false);
            setForm({ first_name: '', last_name: '', email: '', job_title: '' });
          }}
        >
          <Plus className="h-3 w-3 mr-1" /> Add Another
        </Button>
      )}
    </div>
  );
}
