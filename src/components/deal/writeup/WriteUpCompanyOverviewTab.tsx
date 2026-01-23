import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DealWriteUpData } from '../DealWriteUp';

const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Real Estate',
  'Energy',
  'Transportation',
  'Media',
  'Other',
];

const LOCATION_OPTIONS = [
  'California',
  'New York',
  'Texas',
  'Florida',
  'Illinois',
  'Washington',
  'Massachusetts',
  'Colorado',
  'Other',
];

const DEAL_TYPE_OPTIONS = [
  'Growth Capital',
  'Acquisition',
  'Refinance',
  'Working Capital',
  'Bridge Loan',
  'Term Loan',
  'Other',
];

const BILLING_MODEL_OPTIONS = [
  'Subscription',
  'Transaction',
  'License',
  'Usage-based',
  'Hybrid',
  'Other',
];

const STATUS_OPTIONS = [
  'Draft',
  'Published',
  'Under Review',
  'Closed',
];

interface WriteUpCompanyOverviewTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
}

export function WriteUpCompanyOverviewTab({ data, updateField }: WriteUpCompanyOverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Company Name & URL Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input
            id="companyName"
            value={data.companyName}
            onChange={(e) => updateField('companyName', e.target.value)}
            placeholder="TechFlow Solutions"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyUrl">Company URL</Label>
          <Input
            id="companyUrl"
            value={data.companyUrl}
            onChange={(e) => updateField('companyUrl', e.target.value)}
            placeholder="example.com"
          />
        </div>
      </div>

      {/* Company Overview (formerly Description) */}
      <div className="space-y-2">
        <Label htmlFor="description">Company Overview *</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Enterprise SaaS platform for workflow automation with strong recurring revenue and expanding customer base."
          className="min-h-[100px]"
        />
      </div>

      {/* LinkedIn Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            value={data.linkedinUrl}
            onChange={(e) => updateField('linkedinUrl', e.target.value)}
            placeholder="linkedin.com/company/..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location *</Label>
          <Select value={data.location} onValueChange={(v) => updateField('location', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Industry & Year Founded Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="industry">Industry *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.industries.length > 0
                  ? data.industries.length === 1
                    ? data.industries[0]
                    : `${data.industries.length} industries selected`
                  : "Select industries"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 bg-popover border z-50" align="start">
              <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                {INDUSTRY_OPTIONS.map(option => (
                  <div
                    key={option}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newIndustries = data.industries.includes(option)
                        ? data.industries.filter(i => i !== option)
                        : [...data.industries, option];
                      updateField('industries', newIndustries);
                    }}
                  >
                    <Checkbox
                      checked={data.industries.includes(option)}
                      onCheckedChange={(checked) => {
                        const newIndustries = checked
                          ? [...data.industries, option]
                          : data.industries.filter(i => i !== option);
                        updateField('industries', newIndustries);
                      }}
                    />
                    <span className="text-sm">{option}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label htmlFor="yearFounded">Year Founded</Label>
          <Input
            id="yearFounded"
            value={data.yearFounded}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              updateField('yearFounded', value);
            }}
            placeholder="e.g., 2015"
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="headcount">Headcount</Label>
          <Input
            id="headcount"
            value={data.headcount}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              updateField('headcount', value);
            }}
            placeholder="e.g., 150"
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
      </div>

      {/* Deal Type & Billing Model Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dealType">Deal Type *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.dealTypes.length > 0
                  ? data.dealTypes.length === 1
                    ? data.dealTypes[0]
                    : `${data.dealTypes.length} types selected`
                  : "Select deal types"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 bg-popover border z-50" align="start">
              <div className="p-2 space-y-1">
                {DEAL_TYPE_OPTIONS.map(option => (
                  <div
                    key={option}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newTypes = data.dealTypes.includes(option)
                        ? data.dealTypes.filter(t => t !== option)
                        : [...data.dealTypes, option];
                      updateField('dealTypes', newTypes);
                    }}
                  >
                    <Checkbox
                      checked={data.dealTypes.includes(option)}
                      onCheckedChange={(checked) => {
                        const newTypes = checked
                          ? [...data.dealTypes, option]
                          : data.dealTypes.filter(t => t !== option);
                        updateField('dealTypes', newTypes);
                      }}
                    />
                    <span className="text-sm">{option}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label htmlFor="billingModel">Billing Model *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {data.billingModels.length > 0
                  ? data.billingModels.length === 1
                    ? data.billingModels[0]
                    : `${data.billingModels.length} models selected`
                  : "Select billing models"}
                <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 bg-popover border z-50" align="start">
              <div className="p-2 space-y-1">
                {BILLING_MODEL_OPTIONS.map(option => (
                  <div
                    key={option}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => {
                      const newModels = data.billingModels.includes(option)
                        ? data.billingModels.filter(m => m !== option)
                        : [...data.billingModels, option];
                      updateField('billingModels', newModels);
                    }}
                  >
                    <Checkbox
                      checked={data.billingModels.includes(option)}
                      onCheckedChange={(checked) => {
                        const newModels = checked
                          ? [...data.billingModels, option]
                          : data.billingModels.filter(m => m !== option);
                        updateField('billingModels', newModels);
                      }}
                    />
                    <span className="text-sm">{option}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={data.status} onValueChange={(v) => updateField('status', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
