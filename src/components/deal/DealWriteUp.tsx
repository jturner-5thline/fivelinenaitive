import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';

export interface KeyItem {
  id: string;
  title: string;
  description: string;
}

export interface DealWriteUpData {
  companyName: string;
  companyUrl: string;
  linkedinUrl: string;
  dataRoomUrl: string;
  industry: string;
  location: string;
  dealType: string;
  billingModel: string;
  profitability: string;
  grossMargins: string;
  capitalAsk: string;
  thisYearRevenue: string;
  lastYearRevenue: string;
  financialDataAsOf: Date | null;
  accountingSystem: string;
  status: string;
  useOfFunds: string;
  existingDebtDetails: string;
  description: string;
  keyItems: KeyItem[];
  publishAsAnonymous: boolean;
}

export interface DealDataForWriteUp {
  company?: string;
  dealTypes?: string[] | null;
  value?: number;
  notes?: string | null;
  status?: string;
}

export const getEmptyDealWriteUpData = (deal?: DealDataForWriteUp): DealWriteUpData => ({
  companyName: deal?.company || '',
  companyUrl: '',
  linkedinUrl: '',
  dataRoomUrl: '',
  industry: '',
  location: '',
  dealType: deal?.dealTypes?.[0] || '',
  billingModel: '',
  profitability: '',
  grossMargins: '',
  capitalAsk: deal?.value ? `$${deal.value.toLocaleString()}` : '',
  thisYearRevenue: '',
  lastYearRevenue: '',
  financialDataAsOf: null,
  accountingSystem: '',
  status: deal?.status === 'active' ? 'Published' : deal?.status === 'closed' ? 'Closed' : 'Draft',
  useOfFunds: '',
  existingDebtDetails: '',
  description: deal?.notes || '',
  keyItems: [],
  publishAsAnonymous: false,
});

interface DealWriteUpProps {
  data: DealWriteUpData;
  onChange: (data: DealWriteUpData) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

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

const PROFITABILITY_OPTIONS = [
  'Profitable',
  'Break-even',
  'Pre-profit',
  'Negative',
];

const ACCOUNTING_SYSTEM_OPTIONS = [
  'QuickBooks',
  'Xero',
  'NetSuite',
  'Sage',
  'FreshBooks',
  'Wave',
  'Other',
];

const STATUS_OPTIONS = [
  'Draft',
  'Published',
  'Under Review',
  'Closed',
];

export const DealWriteUp = ({ data, onChange, onSave, onCancel, isSaving }: DealWriteUpProps) => {
  const updateField = <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const addKeyItem = () => {
    const newItem: KeyItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('keyItems', [...data.keyItems, newItem]);
  };

  const updateKeyItem = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'keyItems',
      data.keyItems.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteKeyItem = (id: string) => {
    updateField('keyItems', data.keyItems.filter(item => item.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deal Management</CardTitle>
        <CardDescription>Create, edit, and manage deal listings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Edit Deal Section */}
        <div className="border rounded-lg p-6 space-y-6">
          <h3 className="text-lg font-semibold">Edit Deal</h3>
          
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

          {/* LinkedIn & Data Room Row */}
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
              <Label htmlFor="dataRoomUrl">Data Room URL</Label>
              <Input
                id="dataRoomUrl"
                value={data.dataRoomUrl}
                onChange={(e) => updateField('dataRoomUrl', e.target.value)}
                placeholder="https://dataroom.example.com/techflow"
              />
            </div>
          </div>

          {/* Industry & Location Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry *</Label>
              <Select value={data.industry} onValueChange={(v) => updateField('industry', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Deal Type & Billing Model Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dealType">Deal Type *</Label>
              <Select value={data.dealType} onValueChange={(v) => updateField('dealType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select deal type" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingModel">Billing Model *</Label>
              <Select value={data.billingModel} onValueChange={(v) => updateField('billingModel', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing model" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_MODEL_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Profitability & Gross Margins Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profitability">Profitability *</Label>
              <Select value={data.profitability} onValueChange={(v) => updateField('profitability', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select profitability" />
                </SelectTrigger>
                <SelectContent>
                  {PROFITABILITY_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grossMargins">Gross Margins *</Label>
              <Input
                id="grossMargins"
                value={data.grossMargins}
                onChange={(e) => updateField('grossMargins', e.target.value)}
                placeholder="75%"
              />
            </div>
          </div>

          {/* Capital Ask & This Year Revenue Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capitalAsk">Capital Ask *</Label>
              <Input
                id="capitalAsk"
                value={data.capitalAsk}
                onChange={(e) => updateField('capitalAsk', e.target.value)}
                placeholder="$2.5M"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thisYearRevenue">This Year Revenue *</Label>
              <Input
                id="thisYearRevenue"
                value={data.thisYearRevenue}
                onChange={(e) => updateField('thisYearRevenue', e.target.value)}
                placeholder="$6.2M"
              />
            </div>
          </div>

          {/* Last Year Revenue & Financial Data As Of Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastYearRevenue">Last Year Revenue *</Label>
              <Input
                id="lastYearRevenue"
                value={data.lastYearRevenue}
                onChange={(e) => updateField('lastYearRevenue', e.target.value)}
                placeholder="$5.1M"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="financialDataAsOf">Financial Data As Of</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !data.financialDataAsOf && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {data.financialDataAsOf ? format(data.financialDataAsOf, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={data.financialDataAsOf ?? undefined}
                    onSelect={(date) => updateField('financialDataAsOf', date ?? null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Accounting System & Status Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountingSystem">Accounting System</Label>
              <Select value={data.accountingSystem} onValueChange={(v) => updateField('accountingSystem', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select accounting system" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNTING_SYSTEM_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          {/* Use of Funds */}
          <div className="space-y-2">
            <Label htmlFor="useOfFunds">Use of Funds</Label>
            <Textarea
              id="useOfFunds"
              value={data.useOfFunds}
              onChange={(e) => updateField('useOfFunds', e.target.value)}
              placeholder="Expand sales team and accelerate product development for enterprise features."
              className="min-h-[80px]"
            />
          </div>

          {/* Existing Debt Details */}
          <div className="space-y-2">
            <Label htmlFor="existingDebtDetails">Existing Debt Details</Label>
            <Textarea
              id="existingDebtDetails"
              value={data.existingDebtDetails}
              onChange={(e) => updateField('existingDebtDetails', e.target.value)}
              placeholder="Lender: Silicon Valley Bank&#10;Amount: $500,000&#10;Terms: 3-year term loan at 8.5% APR&#10;Maturity: March 2024"
              className="min-h-[100px]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={data.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Enterprise SaaS platform for workflow automation with strong recurring revenue and expanding customer base."
              className="min-h-[80px]"
            />
          </div>

          {/* Key Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Key Items</Label>
              <Button variant="outline" size="sm" onClick={addKeyItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Key Item
              </Button>
            </div>
            
            {data.keyItems.map((item) => (
              <div key={item.id} className="border rounded-lg p-4 space-y-3 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteKeyItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="space-y-2 pr-10">
                  <Label>Title</Label>
                  <Input
                    value={item.title}
                    onChange={(e) => updateKeyItem(item.id, 'title', e.target.value)}
                    placeholder="Strong Market Position"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={item.description}
                    onChange={(e) => updateKeyItem(item.id, 'description', e.target.value)}
                    placeholder="Leading SaaS provider in workflow automation with 150+ enterprise clients."
                    className="min-h-[60px]"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Publish as Anonymous */}
          <div className="flex items-start space-x-3 border-t pt-4">
            <Checkbox
              id="publishAsAnonymous"
              checked={data.publishAsAnonymous}
              onCheckedChange={(checked) => updateField('publishAsAnonymous', checked as boolean)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="publishAsAnonymous"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Publish as Anonymous Deal
              </label>
              <p className="text-xs text-muted-foreground">
                Company name, website, and LinkedIn will be hidden. Users must request access and be approved to see these details.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Update Deal'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

