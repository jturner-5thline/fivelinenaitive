import { useState, useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { z } from 'zod';
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

const companySettingsSchema = z.object({
  phone: z.string()
    .refine(val => !val || /^[\d\s\-+()]*$/.test(val), { message: 'Invalid phone number format' })
    .refine(val => !val || val.length <= 20, { message: 'Phone number is too long' }),
  backup_email: z.string()
    .refine(val => !val || z.string().email().safeParse(val).success, { message: 'Invalid email format' }),
  company_name: z.string().max(100, { message: 'Company name must be less than 100 characters' }),
  company_url: z.string()
    .refine(val => !val || /^https?:\/\/.+\..+/.test(val), { message: 'Invalid URL format (must start with http:// or https://)' }),
  company_size: z.string(),
  company_role: z.string(),
});

type FormErrors = Partial<Record<keyof z.infer<typeof companySettingsSchema>, string>>;

export function CompanySettings() {
  const { profile, isLoading, updateProfile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
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

  const validateForm = (): boolean => {
    const result = companySettingsSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.errors.forEach(err => {
        const field = err.path[0] as keyof FormErrors;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors before saving.",
        variant: "destructive",
      });
      return;
    }

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

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
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
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              placeholder="Enter phone number"
              className={errors.phone ? 'border-destructive' : ''}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup_email">Backup Email</Label>
            <Input
              id="backup_email"
              type="email"
              value={formData.backup_email}
              onChange={(e) => handleFieldChange('backup_email', e.target.value)}
              placeholder="Enter backup email"
              className={errors.backup_email ? 'border-destructive' : ''}
            />
            {errors.backup_email && (
              <p className="text-sm text-destructive">{errors.backup_email}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_name">Company Name</Label>
          <Input
            id="company_name"
            value={formData.company_name}
            onChange={(e) => handleFieldChange('company_name', e.target.value)}
            placeholder="Enter company name"
            className={errors.company_name ? 'border-destructive' : ''}
          />
          {errors.company_name && (
            <p className="text-sm text-destructive">{errors.company_name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_url">Company Website</Label>
          <Input
            id="company_url"
            type="url"
            value={formData.company_url}
            onChange={(e) => handleFieldChange('company_url', e.target.value)}
            placeholder="https://example.com"
            className={errors.company_url ? 'border-destructive' : ''}
          />
          {errors.company_url && (
            <p className="text-sm text-destructive">{errors.company_url}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company_size">Company Size</Label>
            <Select
              value={formData.company_size}
              onValueChange={(value) => handleFieldChange('company_size', value)}
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
              onValueChange={(value) => handleFieldChange('company_role', value)}
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
