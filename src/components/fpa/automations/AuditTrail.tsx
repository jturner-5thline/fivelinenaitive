import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Filter, Download, Clock, User, Zap, Sparkles,
  Database, Settings2, CheckCircle2, AlertTriangle, FileSpreadsheet,
  ChevronDown, ChevronRight, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  userType: 'human' | 'system' | 'ai';
  action: string;
  category: 'sync' | 'ai' | 'config' | 'check' | 'automation' | 'access' | 'export';
  detail: string;
  metadata?: Record<string, string>;
  severity: 'info' | 'warning' | 'success' | 'error';
}

const AUDIT_DATA: AuditEntry[] = [
  { id: '1', timestamp: '2026-02-28 14:32:05', user: 'System', userType: 'system', action: 'Data Sync', category: 'sync', detail: 'QuickBooks sync completed — 234 records updated, 0 errors', metadata: { duration: '4.2s', source: 'QuickBooks Online' }, severity: 'success' },
  { id: '2', timestamp: '2026-02-28 14:30:11', user: 'AI Engine', userType: 'ai', action: 'Variance Scan', category: 'ai', detail: 'Scan completed — 3 variances flagged above 5% threshold', metadata: { model: 'gemini-2.5-pro', tokens: '2,340' }, severity: 'warning' },
  { id: '3', timestamp: '2026-02-28 12:15:33', user: 'Sarah Chen', userType: 'human', action: 'Mapping Accept', category: 'config', detail: 'Accepted 5 AI-suggested account mappings for GL codes 5100–5199', severity: 'info' },
  { id: '4', timestamp: '2026-02-28 11:40:22', user: 'System', userType: 'system', action: 'Data Check Failed', category: 'check', detail: 'Check "Missing vendor names" failed — 3 records in AP table', severity: 'error' },
  { id: '5', timestamp: '2026-02-27 18:22:14', user: 'James Miller', userType: 'human', action: 'Dashboard Edit', category: 'config', detail: 'Updated Executive Dashboard — added Runway KPI card, repositioned Revenue chart', severity: 'info' },
  { id: '6', timestamp: '2026-02-27 16:00:08', user: 'AI Engine', userType: 'ai', action: 'Mapping Suggestion', category: 'ai', detail: 'New GL account detected: "Cloud Infrastructure" → suggested COGS (confidence: 87%)', severity: 'info' },
  { id: '7', timestamp: '2026-02-27 09:00:00', user: 'Automation', userType: 'system', action: 'Pipeline Run', category: 'automation', detail: 'Weekly P&L Refresh pipeline completed — 4/4 steps passed', metadata: { duration: '12.8s', pipeline: 'Weekly P&L Refresh' }, severity: 'success' },
  { id: '8', timestamp: '2026-02-26 14:15:50', user: 'Sarah Chen', userType: 'human', action: 'Schema Change', category: 'config', detail: 'Added column "cost_center" to Department Roll-up table', severity: 'info' },
  { id: '9', timestamp: '2026-02-26 10:30:00', user: 'James Miller', userType: 'human', action: 'Report Export', category: 'export', detail: 'Exported Board Report as PDF — 12 pages, sent to 3 recipients', severity: 'info' },
  { id: '10', timestamp: '2026-02-25 22:00:00', user: 'Automation', userType: 'system', action: 'Data Check', category: 'check', detail: 'Daily data quality suite: 8/8 checks passed', severity: 'success' },
  { id: '11', timestamp: '2026-02-25 15:45:30', user: 'Sarah Chen', userType: 'human', action: 'Access Change', category: 'access', detail: 'Granted James Miller "Editor" access to P&L workspace', severity: 'info' },
  { id: '12', timestamp: '2026-02-25 09:00:00', user: 'System', userType: 'system', action: 'Data Sync', category: 'sync', detail: 'Stripe sync completed — 156 transactions imported, $234K total', metadata: { duration: '2.1s', source: 'Stripe' }, severity: 'success' },
];

const categoryConfig: Record<string, { color: string; icon: any }> = {
  sync: { color: 'text-blue-600 bg-blue-500/10 border-blue-500/20', icon: Database },
  ai: { color: 'text-purple-600 bg-purple-500/10 border-purple-500/20', icon: Sparkles },
  config: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: Settings2 },
  check: { color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  automation: { color: 'text-primary bg-primary/10 border-primary/20', icon: Zap },
  access: { color: 'text-cyan-600 bg-cyan-500/10 border-cyan-500/20', icon: User },
  export: { color: 'text-rose-600 bg-rose-500/10 border-rose-500/20', icon: FileSpreadsheet },
};

const severityDot: Record<string, string> = {
  info: 'bg-muted-foreground',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  error: 'bg-destructive',
};

export function AuditTrail() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filteredEntries = AUDIT_DATA.filter(entry => {
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
    if (userFilter !== 'all' && entry.userType !== userFilter) return false;
    if (searchQuery && !entry.detail.toLowerCase().includes(searchQuery.toLowerCase()) && !entry.action.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const uniqueUsers = [...new Set(AUDIT_DATA.map(e => e.user))];

  return (
    <div className="space-y-3">
      {/* Filters Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search audit trail..."
            className="h-8 text-xs pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <Filter className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="sync">Data Sync</SelectItem>
            <SelectItem value="ai">AI Actions</SelectItem>
            <SelectItem value="config">Configuration</SelectItem>
            <SelectItem value="check">Data Checks</SelectItem>
            <SelectItem value="automation">Automations</SelectItem>
            <SelectItem value="access">Access</SelectItem>
            <SelectItem value="export">Exports</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="h-8 text-xs w-32">
            <User className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="human">Humans</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="ai">AI Engine</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Download className="h-3 w-3" /> Export
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>{filteredEntries.length} entries</span>
        <span>•</span>
        <span>{AUDIT_DATA.filter(e => e.severity === 'error').length} errors</span>
        <span>•</span>
        <span>{AUDIT_DATA.filter(e => e.severity === 'warning').length} warnings</span>
        <span>•</span>
        <span>Showing last 7 days</span>
      </div>

      {/* Audit Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] w-8"></TableHead>
                <TableHead className="text-[10px] w-40">Timestamp</TableHead>
                <TableHead className="text-[10px] w-28">User</TableHead>
                <TableHead className="text-[10px] w-32">Action</TableHead>
                <TableHead className="text-[10px]">Details</TableHead>
                <TableHead className="text-[10px] w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => {
                const cat = categoryConfig[entry.category];
                const isExpanded = expandedRow === entry.id;
                return (
                  <>
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                    >
                      <TableCell className="py-2">
                        <div className={cn("h-1.5 w-1.5 rounded-full", severityDot[entry.severity])} />
                      </TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap py-2">
                        {entry.timestamp}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-[8px] h-4 px-1", 
                            entry.userType === 'ai' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                            entry.userType === 'system' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                            'bg-muted'
                          )}>
                            {entry.userType === 'ai' ? 'AI' : entry.userType === 'system' ? 'SYS' : 'USR'}
                          </Badge>
                          <span className="text-xs">{entry.user}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={cn("text-[9px]", cat.color)}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-sm truncate py-2">
                        {entry.detail}
                      </TableCell>
                      <TableCell className="py-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${entry.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 py-2 px-6">
                          <div className="text-[10px] space-y-1">
                            <p className="text-muted-foreground">{entry.detail}</p>
                            {entry.metadata && (
                              <div className="flex gap-4 mt-1">
                                {Object.entries(entry.metadata).map(([k, v]) => (
                                  <span key={k}>
                                    <span className="text-muted-foreground">{k}:</span>{' '}
                                    <span className="font-mono text-foreground/80">{v}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
