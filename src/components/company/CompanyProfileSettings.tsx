import { useState, useEffect } from 'react';
import { useCompany, Company } from '@/hooks/useCompany';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, Globe, Users, MapPin, Briefcase } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const employeeSizeOptions = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001+', label: '1000+ employees' },
];

const industryOptions = [
  'Finance & Banking',
  'Real Estate',
  'Technology',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Professional Services',
  'Construction',
  'Transportation',
  'Energy',
  'Other',
];

export function CompanyProfileSettings() {
  const { company, updateCompany, isAdmin, isSaving } = useCompany();
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name,
        website_url: company.website_url || '',
        industry: company.industry || '',
        employee_size: company.employee_size || '',
        description: company.description || '',
        address: company.address || '',
        city: company.city || '',
        state: company.state || '',
        country: company.country || '',
      });
    }
  }, [company]);

  const handleChange = (field: keyof Company, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateCompany(formData);
    setHasChanges(false);
  };

  if (!company) return null;

  return (
    <div className="space-y-6">
      {/* Company Logo & Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Identity
          </CardTitle>
          <CardDescription>Your company's brand and basic information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={company.logo_url || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {company.name?.charAt(0) || 'C'}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-sm font-medium">Company Logo</p>
              <p className="text-xs text-muted-foreground">
                Logo upload coming soon
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Company Name</Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={!isAdmin}
              placeholder="Enter company name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={!isAdmin}
              placeholder="Brief description of your company"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Business Details
          </CardTitle>
          <CardDescription>Industry and company size information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={formData.industry || ''}
                onValueChange={(value) => handleChange('industry', value)}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee_size">Employee Size</Label>
              <Select
                value={formData.employee_size || ''}
                onValueChange={(value) => handleChange('employee_size', value)}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {employeeSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website_url" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Website URL
            </Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url || ''}
              onChange={(e) => handleChange('website_url', e.target.value)}
              disabled={!isAdmin}
              placeholder="https://www.example.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location
          </CardTitle>
          <CardDescription>Company headquarters address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              disabled={!isAdmin}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                disabled={!isAdmin}
                placeholder="City"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input
                id="state"
                value={formData.state || ''}
                onChange={(e) => handleChange('state', e.target.value)}
                disabled={!isAdmin}
                placeholder="State"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                disabled={!isAdmin}
                placeholder="Country"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      )}

      {!isAdmin && (
        <p className="text-sm text-muted-foreground text-center">
          Contact a company admin to make changes to company information.
        </p>
      )}
    </div>
  );
}
