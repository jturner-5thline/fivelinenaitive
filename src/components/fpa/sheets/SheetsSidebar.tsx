import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, Plus, Database, FileSpreadsheet, Link2, GripVertical,
  ChevronRight, Table2, BarChart3, ArrowDownToLine, ArrowUpFromLine,
  Copy, X, Sparkles, CheckCircle2, Clock, Filter, Columns, Rows3
} from 'lucide-react';

interface ConnectedSource {
  id: string;
  name: string;
  type: 'table' | 'sheet' | 'connector';
  source: string;
  lastSync: string;
  rowCount: number;
  status: 'synced' | 'stale' | 'error';
}

interface PivotField {
  id: string;
  name: string;
  type: 'dimension' | 'measure';
}

const DEMO_SOURCES: ConnectedSource[] = [
  { id: '1', name: 'Income Statement', type: 'table', source: 'QuickBooks', lastSync: '2 min ago', rowCount: 847, status: 'synced' },
  { id: '2', name: 'Budget FY25', type: 'sheet', source: 'Google Sheets', lastSync: '15 min ago', rowCount: 312, status: 'synced' },
  { id: '3', name: 'Headcount Plan', type: 'table', source: 'BambooHR', lastSync: '1 hr ago', rowCount: 156, status: 'stale' },
  { id: '4', name: 'Revenue by Segment', type: 'table', source: 'Salesforce', lastSync: '30 min ago', rowCount: 2340, status: 'synced' },
  { id: '5', name: 'Vendor Spend', type: 'connector', source: 'Ramp', lastSync: '5 min ago', rowCount: 1089, status: 'synced' },
];

const PIVOT_FIELDS: PivotField[] = [
  { id: 'account', name: 'Account', type: 'dimension' },
  { id: 'department', name: 'Department', type: 'dimension' },
  { id: 'entity', name: 'Entity', type: 'dimension' },
  { id: 'month', name: 'Month', type: 'dimension' },
  { id: 'scenario', name: 'Scenario', type: 'dimension' },
  { id: 'amount', name: 'Amount', type: 'measure' },
  { id: 'budget', name: 'Budget', type: 'measure' },
  { id: 'variance', name: 'Variance', type: 'measure' },
];

const FORMULA_EXAMPLES = [
  { formula: '=GETDATA("Income Statement", "Revenue", "2025-01")', description: 'Pull Revenue for Jan 2025' },
  { formula: '=GETDATA("Budget FY25", "Marketing", "Q1")', description: 'Pull Marketing budget for Q1' },
  { formula: '=SUMDATA("Vendor Spend", "amount", "department=Engineering")', description: 'Sum Engineering spend' },
];

export function SheetsSidebar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('sources');
  const [pivotRows, setPivotRows] = useState<string[]>(['account']);
  const [pivotCols, setPivotCols] = useState<string[]>(['month']);
  const [pivotValues, setPivotValues] = useState<string[]>(['amount']);
  const [pivotFilters, setPivotFilters] = useState<string[]>(['scenario']);

  const filteredSources = DEMO_SOURCES.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors = {
    synced: 'text-emerald-500',
    stale: 'text-amber-500',
    error: 'text-destructive',
  };

  const statusLabels = {
    synced: 'Synced',
    stale: 'Stale',
    error: 'Error',
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold">Finance Sidebar</CardTitle>
          <Badge variant="outline" className="text-[9px] px-1.5 h-4">Connected</Badge>
        </div>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-3">
          <TabsList className="w-full h-7">
            <TabsTrigger value="sources" className="text-[10px] flex-1">Sources</TabsTrigger>
            <TabsTrigger value="pivot" className="text-[10px] flex-1">Pivot</TabsTrigger>
            <TabsTrigger value="formulas" className="text-[10px] flex-1">Formulas</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* Sources Tab */}
          <TabsContent value="sources" className="p-3 pt-2 mt-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search datasets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>

            <Button variant="outline" size="sm" className="w-full h-7 text-[10px] gap-1.5">
              <Plus className="h-3 w-3" /> Connect Dataset
            </Button>

            <div className="space-y-1">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="group flex items-center gap-2 p-2 rounded-md border border-border/50 hover:border-border hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="flex-shrink-0">
                    {source.type === 'table' ? (
                      <Database className="h-3.5 w-3.5 text-primary" />
                    ) : source.type === 'sheet' ? (
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{source.name}</p>
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <span>{source.source}</span>
                      <span>·</span>
                      <span>{source.rowCount.toLocaleString()} rows</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <CheckCircle2 className={`h-3 w-3 ${statusColors[source.status]}`} />
                    <span className="text-[8px] text-muted-foreground">{source.lastSync}</span>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</p>
              <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-[10px] gap-1.5">
                <ArrowDownToLine className="h-3 w-3" /> Pull All Data
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-[10px] gap-1.5">
                <ArrowUpFromLine className="h-3 w-3" /> Push Changes
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-[10px] gap-1.5">
                <Sparkles className="h-3 w-3" /> AI Analysis
              </Button>
            </div>
          </TabsContent>

          {/* Pivot Builder Tab */}
          <TabsContent value="pivot" className="p-3 pt-2 mt-0 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Build pivot tables visually. Drag fields to configure.
            </p>

            {/* Available Fields */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Fields</p>
              <div className="flex flex-wrap gap-1">
                {PIVOT_FIELDS.map((field) => (
                  <Badge
                    key={field.id}
                    variant={field.type === 'dimension' ? 'outline' : 'secondary'}
                    className="text-[9px] px-1.5 h-5 cursor-grab"
                  >
                    {field.type === 'dimension' ? (
                      <Table2 className="h-2.5 w-2.5 mr-0.5" />
                    ) : (
                      <BarChart3 className="h-2.5 w-2.5 mr-0.5" />
                    )}
                    {field.name}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Rows */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Rows3 className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-medium">Rows</p>
              </div>
              <Select defaultValue="account">
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIVOT_FIELDS.filter(f => f.type === 'dimension').map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Columns */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Columns className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-medium">Columns</p>
              </div>
              <Select defaultValue="month">
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIVOT_FIELDS.filter(f => f.type === 'dimension').map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Values */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-medium">Values</p>
              </div>
              <Select defaultValue="amount">
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIVOT_FIELDS.filter(f => f.type === 'measure').map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filters */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-medium">Filters</p>
              </div>
              <Select defaultValue="scenario">
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIVOT_FIELDS.filter(f => f.type === 'dimension').map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" className="w-full h-7 text-[10px]">
              Generate Pivot Table
            </Button>
          </TabsContent>

          {/* Formulas Tab */}
          <TabsContent value="formulas" className="p-3 pt-2 mt-0 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Use GETDATA and SUMDATA to pull live data into any cell.
            </p>

            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Examples</p>
              {FORMULA_EXAMPLES.map((example, i) => (
                <div key={i} className="p-2 rounded-md border border-border/50 space-y-1">
                  <p className="text-[10px] text-muted-foreground">{example.description}</p>
                  <div className="flex items-center gap-1">
                    <code className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded flex-1 break-all">
                      {example.formula}
                    </code>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                          <Copy className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">Copy formula</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Formula Builder</p>
              <Select>
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue placeholder="Select dataset..." />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_SOURCES.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Field name (e.g., Revenue)" className="h-7 text-xs" />
              <Input placeholder="Filter (e.g., 2025-01)" className="h-7 text-xs" />
              <Button variant="outline" size="sm" className="w-full h-7 text-[10px] gap-1">
                <Copy className="h-3 w-3" /> Copy Formula
              </Button>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  );
}
