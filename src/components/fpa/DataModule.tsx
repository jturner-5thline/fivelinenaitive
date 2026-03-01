import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Database, Plus, Search, RefreshCw, CheckCircle2, AlertCircle, Clock,
  ArrowRight, ExternalLink, Sparkles, ThumbsUp, ThumbsDown, Settings2,
  FileSpreadsheet, BarChart3, GitBranch, Filter, Columns, MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectorDetailPanel } from './ConnectorDetailPanel';

// Demo connectors
const CONNECTORS = [
  { id: 'qb', name: 'QuickBooks', icon: '📗', status: 'connected' as const, lastSync: '2 min ago', records: '12,847', category: 'ERP & Accounting' },
  { id: 'sf', name: 'Salesforce', icon: '☁️', status: 'connected' as const, lastSync: '15 min ago', records: '8,234', category: 'Sales & CRM' },
  { id: 'bamboo', name: 'BambooHR', icon: '🎋', status: 'connected' as const, lastSync: '1 hr ago', records: '342', category: 'HRIS & ATS' },
  { id: 'stripe', name: 'Stripe', icon: '💳', status: 'connected' as const, lastSync: '5 min ago', records: '45,621', category: 'Payments & Spend' },
  { id: 'netsuite', name: 'NetSuite', icon: '🏢', status: 'available' as const, lastSync: '', records: '', category: 'ERP & Accounting' },
  { id: 'xero', name: 'Xero', icon: '🔵', status: 'available' as const, lastSync: '', records: '', category: 'ERP & Accounting' },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', status: 'available' as const, lastSync: '', records: '', category: 'Sales & CRM' },
  { id: 'snowflake', name: 'Snowflake', icon: '❄️', status: 'available' as const, lastSync: '', records: '', category: 'Databases & BI' },
  { id: 'rippling', name: 'Rippling', icon: '🟣', status: 'available' as const, lastSync: '', records: '', category: 'HRIS & ATS' },
  { id: 'ramp', name: 'Ramp', icon: '💚', status: 'available' as const, lastSync: '', records: '', category: 'Payments & Spend' },
  { id: 'shopify', name: 'Shopify', icon: '🛍️', status: 'available' as const, lastSync: '', records: '', category: 'E-commerce' },
  { id: 'sheets', name: 'Google Sheets', icon: '📊', status: 'available' as const, lastSync: '', records: '', category: 'Operations' },
];

// Demo tables
const TABLES = [
  { id: 't1', name: 'Income Statement', source: 'QuickBooks', icon: '📗', rows: 2847, cols: 18, updated: '2 min ago', type: 'synced' as const },
  { id: 't2', name: 'Balance Sheet', source: 'QuickBooks', icon: '📗', rows: 1923, cols: 14, updated: '2 min ago', type: 'synced' as const },
  { id: 't3', name: 'Cash Flow', source: 'QuickBooks', icon: '📗', rows: 956, cols: 12, updated: '2 min ago', type: 'synced' as const },
  { id: 't4', name: 'Pipeline Deals', source: 'Salesforce', icon: '☁️', rows: 234, cols: 22, updated: '15 min ago', type: 'synced' as const },
  { id: 't5', name: 'Headcount Roster', source: 'BambooHR', icon: '🎋', rows: 128, cols: 15, updated: '1 hr ago', type: 'synced' as const },
  { id: 't6', name: 'Subscription Revenue', source: 'Stripe', icon: '💳', rows: 8734, cols: 10, updated: '5 min ago', type: 'synced' as const },
  { id: 't7', name: 'Budget vs Actual', source: 'Calculated', icon: '🧮', rows: 1200, cols: 24, updated: '2 min ago', type: 'calculated' as const },
  { id: 't8', name: 'Department Roll-up', source: 'Calculated', icon: '🧮', rows: 340, cols: 16, updated: '2 min ago', type: 'calculated' as const },
];

// Demo mappings
const MAPPINGS = [
  { source: 'Product Sales', target: 'Revenue', confidence: 0.97, status: 'pending' as const },
  { source: 'Service Revenue', target: 'Revenue', confidence: 0.95, status: 'pending' as const },
  { source: 'Hosting Costs', target: 'Cost of Revenue', confidence: 0.92, status: 'pending' as const },
  { source: 'Salaries & Wages', target: 'Operating Expenses', confidence: 0.98, status: 'accepted' as const },
  { source: 'Software Licenses', target: 'G&A', confidence: 0.88, status: 'pending' as const },
  { source: 'Travel & Entertainment', target: 'S&M', confidence: 0.85, status: 'pending' as const },
  { source: 'Professional Fees', target: 'G&A', confidence: 0.91, status: 'accepted' as const },
  { source: 'Depreciation', target: 'D&A', confidence: 0.99, status: 'accepted' as const },
];

// Demo data checks
const DATA_CHECKS = [
  { id: 'c1', name: 'Revenue MoM > 10% & $50k', status: 'pass' as const, lastRun: '2 min ago', details: 'No flags' },
  { id: 'c2', name: 'Missing vendor names', status: 'fail' as const, lastRun: '2 min ago', details: '3 records with empty vendor' },
  { id: 'c3', name: 'OPEX > Budget threshold', status: 'warn' as const, lastRun: '2 min ago', details: 'Marketing 8% over budget' },
  { id: 'c4', name: 'Duplicate transactions', status: 'pass' as const, lastRun: '2 min ago', details: 'No duplicates found' },
  { id: 'c5', name: 'GL account mapping coverage', status: 'pass' as const, lastRun: '2 min ago', details: '100% mapped' },
];

export function DataModule() {
  const [subTab, setSubTab] = useState('connectors');
  const [search, setSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<typeof CONNECTORS[0] | null>(null);

  const connectedCount = CONNECTORS.filter(c => c.status === 'connected').length;

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="connectors" className="gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Connectors
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{connectedCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Tables
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{TABLES.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="mappings" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI Mappings
            </TabsTrigger>
            <TabsTrigger value="checks" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Data Checks
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Source
            </Button>
          </div>
        </div>

        {/* Connectors */}
        <TabsContent value="connectors" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {CONNECTORS.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map((connector) => (
              <Card key={connector.id} className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                connector.status === 'connected' && "border-primary/30"
              )} onClick={() => setSelectedConnector(connector)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{connector.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{connector.name}</p>
                        <p className="text-[10px] text-muted-foreground">{connector.category}</p>
                      </div>
                    </div>
                    {connector.status === 'connected' ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Available
                      </Badge>
                    )}
                  </div>
                  {connector.status === 'connected' ? (
                    <div className="space-y-1.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last sync</span>
                        <span className="font-medium text-foreground">{connector.lastSync}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Records</span>
                        <span className="font-medium text-foreground">{connector.records}</span>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1 gap-1" onClick={(e) => { e.stopPropagation(); }}>
                          <RefreshCw className="h-3 w-3" /> Sync
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); setSelectedConnector(connector); }}>
                          <Settings2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full h-7 text-[10px] mt-2 gap-1" onClick={(e) => { e.stopPropagation(); setSelectedConnector(connector); }}>
                      <Plus className="h-3 w-3" /> Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center italic">
            We can bring new integrations live in ~48 hours. Contact us for custom connectors.
          </p>
        </TabsContent>

        {/* Tables */}
        <TabsContent value="tables" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Table Name</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs text-right">Rows</TableHead>
                  <TableHead className="text-xs text-right">Cols</TableHead>
                  <TableHead className="text-xs">Last Updated</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TABLES.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())).map((table) => (
                  <TableRow key={table.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTable(table.id)}>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <span>{table.icon}</span>
                        {table.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{table.source}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{table.rows.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{table.cols}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{table.updated}</TableCell>
                    <TableCell>
                      <Badge variant={table.type === 'calculated' ? 'secondary' : 'outline'} className="text-[10px]">
                        {table.type === 'calculated' ? '🧮 Calculated' : '🔄 Synced'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* AI Mappings */}
        <TabsContent value="mappings" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">AI Account Mappings</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {MAPPINGS.filter(m => m.status === 'pending').length} pending review
                    </Badge>
                    <Button size="sm" className="h-7 text-xs gap-1">
                      <ThumbsUp className="h-3 w-3" /> Accept All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Source Account</TableHead>
                      <TableHead className="text-xs text-center"><ArrowRight className="h-3 w-3 mx-auto" /></TableHead>
                      <TableHead className="text-xs">Mapped Category</TableHead>
                      <TableHead className="text-xs text-right">Confidence</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MAPPINGS.map((mapping, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{mapping.source}</TableCell>
                        <TableCell className="text-center"><ArrowRight className="h-3 w-3 mx-auto text-muted-foreground" /></TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="secondary" className="text-[10px]">{mapping.target}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          <span className={cn(
                            mapping.confidence >= 0.95 ? 'text-emerald-600' :
                            mapping.confidence >= 0.9 ? 'text-amber-600' : 'text-orange-600'
                          )}>
                            {(mapping.confidence * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={mapping.status === 'accepted' ? 'default' : 'outline'} className="text-[10px]">
                            {mapping.status === 'accepted' ? '✓ Accepted' : '⏳ Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {mapping.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10">
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Data Checks */}
        <TabsContent value="checks" className="mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-2xl font-bold text-foreground">{DATA_CHECKS.length}</div>
                <div className="text-xs text-muted-foreground">Total Checks</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-emerald-600">{DATA_CHECKS.filter(c => c.status === 'pass').length}</div>
                <div className="text-xs text-muted-foreground">Passing</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-destructive">{DATA_CHECKS.filter(c => c.status === 'fail').length}</div>
                <div className="text-xs text-muted-foreground">Failing</div>
              </Card>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Check Name</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                    <TableHead className="text-xs">Last Run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DATA_CHECKS.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="text-xs font-medium">{check.name}</TableCell>
                      <TableCell>
                        <Badge variant={
                          check.status === 'pass' ? 'default' :
                          check.status === 'fail' ? 'destructive' : 'secondary'
                        } className="text-[10px]">
                          {check.status === 'pass' ? '✓ Pass' : check.status === 'fail' ? '✗ Fail' : '⚠ Warn'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{check.details}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{check.lastRun}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Check Rule
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Connector Detail Panel */}
      <ConnectorDetailPanel
        open={!!selectedConnector}
        onOpenChange={(open) => !open && setSelectedConnector(null)}
        connector={selectedConnector}
      />
    </div>
  );
}
