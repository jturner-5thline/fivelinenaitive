import { useMemo, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ArrowUpDown } from 'lucide-react';

export interface DrilldownColumn<T = any> {
  key: keyof T & string;
  label: string;
  align?: 'left' | 'right';
  format?: (v: any, row: T) => ReactNode;
  sortable?: boolean;
}

export interface DrilldownPayload<T = any> {
  title: string;
  description?: string;
  rows: T[];
  columns: DrilldownColumn<T>[];
}

interface DrilldownCtx {
  open: (p: DrilldownPayload) => void;
  close: () => void;
}
const Ctx = createContext<DrilldownCtx | null>(null);

export function RevenueDrilldownProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DrilldownPayload | null>(null);
  const open = useCallback((p: DrilldownPayload) => setPayload(p), []);
  const close = useCallback(() => setPayload(null), []);
  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <RevenueDrilldownDrawer payload={payload} onClose={close} />
    </Ctx.Provider>
  );
}

export function useDrilldown() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDrilldown must be used within RevenueDrilldownProvider');
  return ctx;
}

function toCSV(payload: DrilldownPayload): string {
  const headers = payload.columns.map(c => c.label);
  const lines = [headers.join(',')];
  for (const row of payload.rows) {
    const cells = payload.columns.map(c => {
      const v = (row as any)[c.key];
      const s = v == null ? '' : String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

function RevenueDrilldownDrawer({ payload, onClose }: { payload: DrilldownPayload | null; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedRows = useMemo(() => {
    if (!payload || !sortKey) return payload?.rows ?? [];
    return [...payload.rows].sort((a: any, b: any) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [payload, sortKey, sortDir]);

  const handleDownload = () => {
    if (!payload) return;
    const blob = new Blob([toCSV(payload)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={!!payload} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] flex flex-col p-0">
        {payload && (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-border/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="text-base font-semibold">{payload.title}</SheetTitle>
                  {payload.description && (
                    <SheetDescription className="text-xs mt-1">{payload.description}</SheetDescription>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownload}>
                  <Download className="h-3 w-3" /> CSV
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{payload.rows.length} records</p>
            </SheetHeader>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {payload.columns.map(c => (
                      <TableHead
                        key={c.key}
                        className={c.align === 'right' ? 'text-right' : ''}
                      >
                        {c.sortable !== false ? (
                          <button
                            className="inline-flex items-center gap-1 hover:text-foreground"
                            onClick={() => {
                              if (sortKey === c.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                              else { setSortKey(c.key); setSortDir('desc'); }
                            }}
                          >
                            {c.label}
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          </button>
                        ) : c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={payload.columns.length} className="text-center text-xs text-muted-foreground py-8">
                        No records.
                      </TableCell>
                    </TableRow>
                  ) : sortedRows.map((row: any, i) => (
                    <TableRow key={i}>
                      {payload.columns.map(c => (
                        <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>
                          {c.format ? c.format((row as any)[c.key], row) : (row as any)[c.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}