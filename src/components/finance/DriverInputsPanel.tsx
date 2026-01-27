import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Settings2, 
  TrendingUp, 
  Percent, 
  DollarSign, 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calculator,
  Eye,
  EyeOff
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from "@/utils/currencyFormat";

export interface DriverInputs {
  // Revenue Drivers
  revenueGrowthRate: number;
  priceInflation: number;
  volumeGrowth: number;
  
  // Margin Drivers
  grossMarginPct: number;
  operatingMarginPct: number;
  ebitdaMarginPct: number;
  
  // Working Capital Assumptions
  daysReceivable: number;
  daysPayable: number;
  daysInventory: number;
  
  // Capital Expenditure
  capexAsRevenuePercent: number;
  maintenanceCapex: number;
  growthCapex: number;
  
  // Debt Schedule
  interestRate: number;
  debtBalance: number;
  annualPrincipalPayment: number;
  
  // Tax & Other
  taxRate: number;
  depreciationYears: number;
}

interface DriverInputsPanelProps {
  inputs: DriverInputs;
  onInputChange: (key: keyof DriverInputs, value: number) => void;
  onApplyDrivers: () => void;
  showFormulas: boolean;
  onToggleFormulas: (show: boolean) => void;
  layout: 'sidebar' | 'top';
  className?: string;
}

const defaultDrivers: DriverInputs = {
  revenueGrowthRate: 10,
  priceInflation: 2,
  volumeGrowth: 8,
  grossMarginPct: 45,
  operatingMarginPct: 20,
  ebitdaMarginPct: 25,
  daysReceivable: 45,
  daysPayable: 30,
  daysInventory: 60,
  capexAsRevenuePercent: 5,
  maintenanceCapex: 50000,
  growthCapex: 100000,
  interestRate: 6,
  debtBalance: 500000,
  annualPrincipalPayment: 50000,
  taxRate: 25,
  depreciationYears: 5,
};

export function useDriverInputs(initialValues?: Partial<DriverInputs>) {
  const [inputs, setInputs] = useState<DriverInputs>({
    ...defaultDrivers,
    ...initialValues,
  });

  const handleInputChange = useCallback((key: keyof DriverInputs, value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setInputs(defaultDrivers);
  }, []);

  return { inputs, handleInputChange, resetToDefaults };
}

interface DriverSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function DriverSection({ title, icon, children, defaultOpen = true }: DriverSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon}
            {title}
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-3 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface DriverInputRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  prefix?: string;
  formula?: string;
  showFormula?: boolean;
}

function DriverInputRow({ label, value, onChange, suffix, prefix, formula, showFormula }: DriverInputRowProps) {
  const [localValue, setLocalValue] = useState(value.toString());

  const handleBlur = () => {
    const parsed = parseFloat(localValue.replace(/,/g, '')) || 0;
    onChange(parsed);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="relative flex items-center">
          {prefix && <span className="absolute left-2 text-xs text-muted-foreground">{prefix}</span>}
          <Input
            type="text"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            className={cn("h-7 text-right text-xs w-24", prefix && "pl-5", suffix && "pr-7")}
          />
          {suffix && <span className="absolute right-2 text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      {showFormula && formula && (
        <div className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          {formula}
        </div>
      )}
    </div>
  );
}

export function DriverInputsPanel({
  inputs,
  onInputChange,
  onApplyDrivers,
  showFormulas,
  onToggleFormulas,
  layout,
  className,
}: DriverInputsPanelProps) {
  const isSidebar = layout === 'sidebar';

  return (
    <Card className={cn(
      "border-border/50",
      isSidebar ? "w-72 shrink-0 h-fit sticky top-4" : "w-full",
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Driver Inputs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onToggleFormulas(!showFormulas)}
            >
              {showFormulas ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              {showFormulas ? 'Hide' : 'Show'} Formulas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(
        "space-y-1",
        !isSidebar && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      )}>
        {isSidebar ? (
          <>
            <DriverSection 
              title="Revenue Drivers" 
              icon={<TrendingUp className="h-3.5 w-3.5 text-success" />}
            >
              <DriverInputRow
                label="Revenue Growth Rate"
                value={inputs.revenueGrowthRate}
                onChange={(v) => onInputChange('revenueGrowthRate', v)}
                suffix="%"
                formula="=Revenue_Prior * (1 + Growth_Rate)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Price Inflation"
                value={inputs.priceInflation}
                onChange={(v) => onInputChange('priceInflation', v)}
                suffix="%"
                formula="=Price_Prior * (1 + Inflation)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Volume Growth"
                value={inputs.volumeGrowth}
                onChange={(v) => onInputChange('volumeGrowth', v)}
                suffix="%"
                formula="=Units_Prior * (1 + Vol_Growth)"
                showFormula={showFormulas}
              />
            </DriverSection>

            <Separator />

            <DriverSection 
              title="Margins" 
              icon={<Percent className="h-3.5 w-3.5 text-primary" />}
            >
              <DriverInputRow
                label="Gross Margin"
                value={inputs.grossMarginPct}
                onChange={(v) => onInputChange('grossMarginPct', v)}
                suffix="%"
                formula="=Gross_Profit / Revenue"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Operating Margin"
                value={inputs.operatingMarginPct}
                onChange={(v) => onInputChange('operatingMarginPct', v)}
                suffix="%"
                formula="=Operating_Income / Revenue"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="EBITDA Margin"
                value={inputs.ebitdaMarginPct}
                onChange={(v) => onInputChange('ebitdaMarginPct', v)}
                suffix="%"
                formula="=EBITDA / Revenue"
                showFormula={showFormulas}
              />
            </DriverSection>

            <Separator />

            <DriverSection 
              title="Working Capital" 
              icon={<RefreshCw className="h-3.5 w-3.5 text-warning" />}
              defaultOpen={false}
            >
              <DriverInputRow
                label="Days Receivable (DSO)"
                value={inputs.daysReceivable}
                onChange={(v) => onInputChange('daysReceivable', v)}
                formula="=AR / (Revenue/365)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Days Payable (DPO)"
                value={inputs.daysPayable}
                onChange={(v) => onInputChange('daysPayable', v)}
                formula="=AP / (COGS/365)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Days Inventory (DIO)"
                value={inputs.daysInventory}
                onChange={(v) => onInputChange('daysInventory', v)}
                formula="=Inventory / (COGS/365)"
                showFormula={showFormulas}
              />
            </DriverSection>

            <Separator />

            <DriverSection 
              title="CapEx & D&A" 
              icon={<DollarSign className="h-3.5 w-3.5 text-destructive" />}
              defaultOpen={false}
            >
              <DriverInputRow
                label="CapEx (% of Revenue)"
                value={inputs.capexAsRevenuePercent}
                onChange={(v) => onInputChange('capexAsRevenuePercent', v)}
                suffix="%"
                formula="=Total_CapEx / Revenue"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Maintenance CapEx"
                value={inputs.maintenanceCapex}
                onChange={(v) => onInputChange('maintenanceCapex', v)}
                prefix="$"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Growth CapEx"
                value={inputs.growthCapex}
                onChange={(v) => onInputChange('growthCapex', v)}
                prefix="$"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Depreciation Years"
                value={inputs.depreciationYears}
                onChange={(v) => onInputChange('depreciationYears', v)}
                formula="=PP&E / Useful_Life"
                showFormula={showFormulas}
              />
            </DriverSection>

            <Separator />

            <DriverSection 
              title="Debt Schedule" 
              icon={<Calculator className="h-3.5 w-3.5 text-muted-foreground" />}
              defaultOpen={false}
            >
              <DriverInputRow
                label="Interest Rate"
                value={inputs.interestRate}
                onChange={(v) => onInputChange('interestRate', v)}
                suffix="%"
                formula="=Interest_Expense / Avg_Debt"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Debt Balance"
                value={inputs.debtBalance}
                onChange={(v) => onInputChange('debtBalance', v)}
                prefix="$"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Annual Principal"
                value={inputs.annualPrincipalPayment}
                onChange={(v) => onInputChange('annualPrincipalPayment', v)}
                prefix="$"
                formula="=Debt_Prior - Debt_Current"
                showFormula={showFormulas}
              />
            </DriverSection>

            <Separator />

            <DriverSection 
              title="Tax" 
              icon={<Percent className="h-3.5 w-3.5" />}
              defaultOpen={false}
            >
              <DriverInputRow
                label="Effective Tax Rate"
                value={inputs.taxRate}
                onChange={(v) => onInputChange('taxRate', v)}
                suffix="%"
                formula="=Tax_Expense / EBT"
                showFormula={showFormulas}
              />
            </DriverSection>

            <div className="pt-2">
              <Button 
                onClick={onApplyDrivers} 
                className="w-full" 
                size="sm"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Apply Drivers
              </Button>
            </div>
          </>
        ) : (
          // Top layout - horizontal grid
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                Revenue
              </div>
              <DriverInputRow
                label="Growth Rate"
                value={inputs.revenueGrowthRate}
                onChange={(v) => onInputChange('revenueGrowthRate', v)}
                suffix="%"
                formula="=Prior*(1+Rate)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="Price Inflation"
                value={inputs.priceInflation}
                onChange={(v) => onInputChange('priceInflation', v)}
                suffix="%"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Percent className="h-3.5 w-3.5 text-primary" />
                Margins
              </div>
              <DriverInputRow
                label="Gross Margin"
                value={inputs.grossMarginPct}
                onChange={(v) => onInputChange('grossMarginPct', v)}
                suffix="%"
                formula="=GP/Rev"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="EBITDA Margin"
                value={inputs.ebitdaMarginPct}
                onChange={(v) => onInputChange('ebitdaMarginPct', v)}
                suffix="%"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 text-warning" />
                Working Capital
              </div>
              <DriverInputRow
                label="DSO (Days)"
                value={inputs.daysReceivable}
                onChange={(v) => onInputChange('daysReceivable', v)}
                formula="=AR/(Rev/365)"
                showFormula={showFormulas}
              />
              <DriverInputRow
                label="DPO (Days)"
                value={inputs.daysPayable}
                onChange={(v) => onInputChange('daysPayable', v)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5 text-destructive" />
                CapEx & Debt
              </div>
              <DriverInputRow
                label="CapEx % Rev"
                value={inputs.capexAsRevenuePercent}
                onChange={(v) => onInputChange('capexAsRevenuePercent', v)}
                suffix="%"
              />
              <DriverInputRow
                label="Interest Rate"
                value={inputs.interestRate}
                onChange={(v) => onInputChange('interestRate', v)}
                suffix="%"
              />
              <div className="pt-1">
                <Button 
                  onClick={onApplyDrivers} 
                  className="w-full" 
                  size="sm"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Apply
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
