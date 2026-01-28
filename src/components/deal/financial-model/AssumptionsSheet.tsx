import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModelAssumptions } from '@/hooks/useFinancialModel';
import { Building2, TrendingUp, DollarSign, Users, Wallet } from 'lucide-react';

interface AssumptionsSheetProps {
  assumptions: ModelAssumptions;
  onUpdate: <K extends keyof ModelAssumptions>(key: K, value: ModelAssumptions[K]) => void;
}

function InputField({ 
  label, 
  value, 
  onChange, 
  type = 'text',
  prefix,
  suffix,
}: { 
  label: string; 
  value: string | number; 
  onChange: (val: string) => void;
  type?: 'text' | 'number' | 'percent' | 'currency';
  prefix?: string;
  suffix?: string;
}) {
  const formatDisplay = (val: string | number): string => {
    if (type === 'currency' && typeof val === 'number') {
      return val.toLocaleString('en-US');
    }
    if (type === 'percent' && typeof val === 'number') {
      return (val * 100).toString();
    }
    return String(val);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          value={formatDisplay(value)}
          onChange={(e) => onChange(e.target.value)}
          className={`h-9 text-sm bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 focus:border-blue-400 ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function AssumptionsSheet({ assumptions, onUpdate }: AssumptionsSheetProps) {
  const handleGrowthRateChange = (index: number, value: string) => {
    const newRates = [...assumptions.revenueGrowthRates];
    newRates[index] = parseFloat(value) / 100 || 0;
    onUpdate('revenueGrowthRates', newRates);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {/* Company Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            Company Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputField
            label="Company Name"
            value={assumptions.companyName}
            onChange={(val) => onUpdate('companyName', val)}
          />
          <InputField
            label="Fiscal Year End"
            value={assumptions.fiscalYearEnd}
            onChange={(val) => onUpdate('fiscalYearEnd', val)}
          />
          <InputField
            label="Model Date"
            value={assumptions.modelDate}
            onChange={(val) => onUpdate('modelDate', val)}
          />
        </CardContent>
      </Card>

      {/* Revenue Assumptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Revenue Assumptions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputField
            label="Starting MRR"
            value={assumptions.startingMRR}
            onChange={(val) => onUpdate('startingMRR', parseFloat(val.replace(/,/g, '')) || 0)}
            type="currency"
            prefix="$"
          />
          <InputField
            label="Starting Customers"
            value={assumptions.startingCustomers}
            onChange={(val) => onUpdate('startingCustomers', parseInt(val) || 0)}
            type="number"
          />
          <InputField
            label="New Customers/Month"
            value={assumptions.newCustomersPerMonth}
            onChange={(val) => onUpdate('newCustomersPerMonth', parseInt(val) || 0)}
            type="number"
          />
          <InputField
            label="Avg Revenue/Customer"
            value={assumptions.avgRevenuePerCustomer}
            onChange={(val) => onUpdate('avgRevenuePerCustomer', parseFloat(val.replace(/,/g, '')) || 0)}
            type="currency"
            prefix="$"
          />
          <InputField
            label="Monthly Churn Rate"
            value={assumptions.monthlyChurnRate}
            onChange={(val) => onUpdate('monthlyChurnRate', parseFloat(val) / 100 || 0)}
            type="percent"
            suffix="%"
          />
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground mb-2 block">Annual Growth Rates</Label>
            <div className="grid grid-cols-5 gap-1">
              {assumptions.revenueGrowthRates.map((rate, i) => (
                <div key={i} className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Y{i + 1}</span>
                  <Input
                    value={(rate * 100).toFixed(0)}
                    onChange={(e) => handleGrowthRateChange(i, e.target.value)}
                    className="h-7 text-xs text-center bg-blue-50 dark:bg-blue-950/30 border-blue-200 px-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Assumptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-red-500" />
            Cost Assumptions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputField
            label="COGS (% of Revenue)"
            value={assumptions.cogsPercent}
            onChange={(val) => onUpdate('cogsPercent', parseFloat(val) / 100 || 0)}
            type="percent"
            suffix="%"
          />
          <InputField
            label="Sales & Marketing (%)"
            value={assumptions.salesMarketingPercent}
            onChange={(val) => onUpdate('salesMarketingPercent', parseFloat(val) / 100 || 0)}
            type="percent"
            suffix="%"
          />
          <InputField
            label="R&D (%)"
            value={assumptions.rdPercent}
            onChange={(val) => onUpdate('rdPercent', parseFloat(val) / 100 || 0)}
            type="percent"
            suffix="%"
          />
          <InputField
            label="G&A (%)"
            value={assumptions.gaPercent}
            onChange={(val) => onUpdate('gaPercent', parseFloat(val) / 100 || 0)}
            type="percent"
            suffix="%"
          />
        </CardContent>
      </Card>

      {/* Headcount Planning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Headcount Planning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputField
            label="Starting Headcount"
            value={assumptions.startingHeadcount}
            onChange={(val) => onUpdate('startingHeadcount', parseInt(val) || 0)}
            type="number"
          />
          <InputField
            label="Monthly Hiring Rate"
            value={assumptions.monthlyHiringRate}
            onChange={(val) => onUpdate('monthlyHiringRate', parseFloat(val) || 0)}
            type="number"
          />
          <InputField
            label="Fully Loaded Cost/Employee"
            value={assumptions.fullyLoadedCostPerEmployee}
            onChange={(val) => onUpdate('fullyLoadedCostPerEmployee', parseFloat(val.replace(/,/g, '')) || 0)}
            type="currency"
            prefix="$"
          />
        </CardContent>
      </Card>

      {/* Capital Structure */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-500" />
            Capital Structure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputField
            label="Starting Cash"
            value={assumptions.startingCash}
            onChange={(val) => onUpdate('startingCash', parseFloat(val.replace(/,/g, '')) || 0)}
            type="currency"
            prefix="$"
          />
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground mb-2 block">Funding Rounds</Label>
            {assumptions.fundingRounds.map((round, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <div className="flex-1">
                  <Input
                    placeholder="Month"
                    value={round.month}
                    onChange={(e) => {
                      const newRounds = [...assumptions.fundingRounds];
                      newRounds[i] = { ...round, month: parseInt(e.target.value) || 0 };
                      onUpdate('fundingRounds', newRounds);
                    }}
                    className="h-8 text-xs bg-blue-50 dark:bg-blue-950/30"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Amount"
                    value={round.amount.toLocaleString()}
                    onChange={(e) => {
                      const newRounds = [...assumptions.fundingRounds];
                      newRounds[i] = { ...round, amount: parseFloat(e.target.value.replace(/,/g, '')) || 0 };
                      onUpdate('fundingRounds', newRounds);
                    }}
                    className="h-8 text-xs bg-blue-50 dark:bg-blue-950/30"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
