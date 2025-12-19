import { useState, useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/use-toast';

const companySizeOptions = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

const companyRoleOptions = [
  { value: 'founder', label: 'Founder / CEO' },
  { value: 'executive', label: 'Executive (C-suite)' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'associate', label: 'Associate' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'other', label: 'Other' },
];

export function CompanySettings() {
  const { profile, isLoading, updateProfile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    company_name: '',
    backup_email: '',
    company_url: '',
    company_size: '',
    company_role: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        phone: profile.phone || '',
        company_name: profile.company_name || '',
        backup_email: profile.backup_email || '',
        company_url: profile.company_url || '',
        company_size: profile.company_size || '',
        company_role: profile.company_role || '',
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        phone: formData.phone || null,
        company_name: formData.company_name || null,
        backup_email: formData.backup_email || null,
        company_url: formData.company_url || null,
        company_size: formData.company_size || null,
        company_role: formData.company_role || null,
      });
      toast({
        title: "Company information updated",
        description: "Your company information has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update company information",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Information
        </CardTitle>
        <CardDescription>
          Manage your company details and contact information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Enter phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup_email">Backup Email</Label>
            <Input
              id="backup_email"
              type="email"
              value={formData.backup_email}
              onChange={(e) => setFormData(prev => ({ ...prev, backup_email: e.target.value }))}
              placeholder="Enter backup email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_name">Company Name</Label>
          <Input
            id="company_name"
            value={formData.company_name}
            onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
            placeholder="Enter company name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_url">Company Website</Label>
          <Input
            id="company_url"
            type="url"
            value={formData.company_url}
            onChange={(e) => setFormData(prev => ({ ...prev, company_url: e.target.value }))}
            placeholder="https://example.com"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company_size">Company Size</Label>
            <Select
              value={formData.company_size}
              onValueChange={(value) => setFormData(prev => ({ ...prev, company_size: value }))}
            >
              <SelectTrigger id="company_size">
                <SelectValue placeholder="Select company size" />
              </SelectTrigger>
              <SelectContent>
                {companySizeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_role">Your Role</Label>
            <Select
              value={formData.company_role}
              onValueChange={(value) => setFormData(prev => ({ ...prev, company_role: value }))}
            >
              <SelectTrigger id="company_role">
                <SelectValue placeholder="Select your role" />
              </SelectTrigger>
              <SelectContent>
                {companyRoleOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
