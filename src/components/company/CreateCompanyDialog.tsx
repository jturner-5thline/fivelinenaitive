import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/hooks/useCompany';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';

export function CreateCompanyDialog() {
  const navigate = useNavigate();
  const { createCompany, isSaving } = useCompany();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }

    const result = await createCompany(companyName.trim());
    if (!result.error) {
      setOpen(false);
      setCompanyName('');
      setError('');
      navigate('/company');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Company
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Your Company</DialogTitle>
          <DialogDescription>
            Set up your company to start managing your team and collaborating on deals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                setError('');
              }}
              placeholder="Enter your company name"
              className={error ? 'border-destructive' : ''}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
