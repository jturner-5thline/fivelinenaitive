import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, FileSpreadsheet, Wallet, Upload, TrendingDown, Landmark, Loader2, Check, BarChart3, ShieldCheck } from 'lucide-react';
import { useSaaSModel } from '@/hooks/useSaaSModel';
import { SaaSModelDashboard } from './SaaSModelDashboard';
import { SaaSModelIncomeStatement } from './SaaSModelIncomeStatement';
import { SaaSModelBalanceSheet } from './SaaSModelBalanceSheet';
import { SaaSModelDataMapping } from './SaaSModelDataMapping';
import { SaaSModelSensitivity } from './SaaSModelSensitivity';
import { SaaSModelDebtServicing } from './SaaSModelDebtServicing';
import { SaaSModelCharts } from './SaaSModelCharts';
import { SaaSModelCreditAnalysis } from './SaaSModelCreditAnalysis';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SaaSModelTabProps {
  dealId: string;
  dealData?: {
    company: string;
    value?: number;
    stage?: string;
  };
}

export function SaaSModelTab({ dealId, dealData }: SaaSModelTabProps) {
  const { model, scenarios, lenders, isLoading, saveStatus, updateModel, recalculate, updateScenarios, updateLender } = useSaaSModel(dealId);
  const [activeTab, setActiveTab] = useState('dashboard');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with save status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-[Inter]">
            SaaS Financial Model
          </h2>
          <p className="text-xs text-muted-foreground">
            {model.settings.companyName} — {model.settings.businessModel}
          </p>
        </div>
        {saveStatus !== 'idle' && (
          <Badge variant="outline" className={cn(
            "text-xs gap-1 transition-opacity",
            saveStatus === 'saved' && "text-emerald-500 border-emerald-500/30"
          )}>
            {saveStatus === 'saving' ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
            ) : (
              <><Check className="h-3 w-3" /> Saved</>
            )}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8 bg-muted/30 rounded-sm">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs rounded-sm h-7">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="income-statement" className="gap-1.5 text-xs rounded-sm h-7">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Income Statement
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="gap-1.5 text-xs rounded-sm h-7">
            <Wallet className="h-3.5 w-3.5" /> Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="data-mapping" className="gap-1.5 text-xs rounded-sm h-7">
            <Upload className="h-3.5 w-3.5" /> Data Mapping
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="gap-1.5 text-xs rounded-sm h-7">
            <TrendingDown className="h-3.5 w-3.5" /> Sensitivity
          </TabsTrigger>
          <TabsTrigger value="debt-servicing" className="gap-1.5 text-xs rounded-sm h-7">
            <Landmark className="h-3.5 w-3.5" /> Debt Servicing
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 text-xs rounded-sm h-7">
            <BarChart3 className="h-3.5 w-3.5" /> Charts
          </TabsTrigger>
          <TabsTrigger value="credit-analysis" className="gap-1.5 text-xs rounded-sm h-7">
            <ShieldCheck className="h-3.5 w-3.5" /> Credit Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <SaaSModelDashboard model={model} />
        </TabsContent>
        <TabsContent value="income-statement" className="mt-4">
          <SaaSModelIncomeStatement model={model} />
        </TabsContent>
        <TabsContent value="balance-sheet" className="mt-4">
          <SaaSModelBalanceSheet model={model} />
        </TabsContent>
        <TabsContent value="data-mapping" className="mt-4">
          <SaaSModelDataMapping dealId={dealId} model={model} updateModel={updateModel} recalculate={recalculate} />
        </TabsContent>
        <TabsContent value="sensitivity" className="mt-4">
          <SaaSModelSensitivity model={model} scenarios={scenarios} updateScenarios={updateScenarios} />
        </TabsContent>
        <TabsContent value="debt-servicing" className="mt-4">
          <SaaSModelDebtServicing lenders={lenders} updateLender={updateLender} />
        </TabsContent>
        <TabsContent value="charts" className="mt-4">
          <SaaSModelCharts model={model} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
