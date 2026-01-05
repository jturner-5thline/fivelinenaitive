import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';

export function CreateCompanyBanner() {
  const navigate = useNavigate();
  const { company, isLoading: companyLoading, createCompany, isSaving } = useCompany();
  const { profile } = useProfile();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('create-company-banner-dismissed') === 'true';
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');

  // Don't show if loading, already has company, or dismissed
  if (companyLoading || company || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('create-company-banner-dismissed', 'true');
  };

  const handleCreate = async () => {
    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }

    const result = await createCompany(companyName.trim());
    if (!result.error) {
      setDialogOpen(false);
      setCompanyName('');
      setError('');
      navigate('/company');
    }
  };

  // Pre-fill with profile company name if available
  const handleOpenDialog = () => {
    if (profile?.company_name && !companyName) {
      setCompanyName(profile.company_name);
    }
    setDialogOpen(true);
  };

  return (
    <>
      <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-4 mb-4">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">Collaborate with your team</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create a company to invite team members, share deals, and work together on your pipeline.
            </p>
            <Button 
              size="sm" 
              className="mt-3 gap-2"
              onClick={handleOpenDialog}
            >
              <Building2 className="h-4 w-4" />
              Create Company
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Your Company</DialogTitle>
            <DialogDescription>
              Set up your company to start managing your team and collaborating on deals.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="banner-company-name">Company Name</Label>
              <Input
                id="banner-company-name"
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
