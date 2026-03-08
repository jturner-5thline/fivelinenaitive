import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, FileText, Table2, File, Loader2 } from 'lucide-react';
import { DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { format } from 'date-fns';

interface FileSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DealSpaceDocument[];
  alreadySelectedIds: string[];
  onConfirm: (selectedDocs: DealSpaceDocument[]) => void;
  isLoading?: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-400" />;
  }
  if (lower.endsWith('.csv')) {
    return <Table2 className="h-4 w-4 text-emerald-400" />;
  }
  if (lower.endsWith('.pdf')) {
    return <FileText className="h-4 w-4 text-red-400" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
};

const isFinancialFile = (name: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.csv');
};

export function FileSelectionModal({
  isOpen,
  onClose,
  documents,
  alreadySelectedIds,
  onConfirm,
  isLoading,
}: FileSelectionModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(alreadySelectedIds));

  // Sort: financial files first, then by date
  const sortedDocs = useMemo(() => {
    return [...documents].sort((a, b) => {
      const aFin = isFinancialFile(a.name) ? 0 : 1;
      const bFin = isFinancialFile(b.name) ? 0 : 1;
      if (aFin !== bFin) return aFin - bFin;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [documents]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = documents.filter(d => selectedIds.has(d.id));
    onConfirm(selected);
    onClose();
  };

  const newSelections = [...selectedIds].filter(id => !alreadySelectedIds.includes(id));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select files for analysis</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Choose documents from your Deal Space to designate as financial models for metric extraction.
        </p>

        <ScrollArea className="max-h-[400px] -mx-6 px-6">
          <div className="space-y-1">
            {sortedDocs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No documents uploaded yet</p>
                <p className="text-xs mt-1">Upload files in the Documents tab first</p>
              </div>
            ) : (
              sortedDocs.map(doc => {
                const alreadyIngested = alreadySelectedIds.includes(doc.id);
                return (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => toggleId(doc.id)}
                      disabled={alreadyIngested}
                    />
                    {getFileIcon(doc.name)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{doc.name}</span>
                        {alreadyIngested && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Already added</Badge>
                        )}
                        {isFinancialFile(doc.name) && !alreadyIngested && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-emerald-400 border-emerald-400/30">Spreadsheet</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatFileSize(doc.size_bytes)} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={newSelections.length === 0 || isLoading}
            className="gap-2"
          >
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            Add {newSelections.length > 0 ? `${newSelections.length} file${newSelections.length !== 1 ? 's' : ''}` : 'files'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
