import { useRef, useState } from 'react';
import { Download, Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { TriggerType, WorkflowAction } from './WorkflowBuilder';
import { useCreateWorkflowTemplate } from '@/hooks/useWorkflowTemplates';

interface ExportableTemplate {
  name: string;
  description: string | null;
  category: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
  tags: string[];
}

interface TemplateExportData {
  version: string;
  exportedAt: string;
  templates: ExportableTemplate[];
}

interface TemplateImportExportProps {
  templates: ExportableTemplate[];
}

export function useTemplateExport() {
  const exportTemplates = (templates: ExportableTemplate[], filename?: string) => {
    const exportData: TemplateExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      templates: templates.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        trigger_type: t.trigger_type,
        trigger_config: t.trigger_config,
        actions: t.actions.map(a => ({
          id: a.id,
          type: a.type,
          config: a.config,
          condition: a.condition,
          delay: a.delay,
        })),
        tags: t.tags,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `workflow-templates-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Exported ${templates.length} template${templates.length === 1 ? '' : 's'}`);
  };

  return { exportTemplates };
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function TemplateImportDialog({ open, onOpenChange, onImportComplete }: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedTemplates, setParsedTemplates] = useState<ExportableTemplate[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  
  const createTemplate = useCreateWorkflowTemplate();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as TemplateExportData;

        // Validate structure
        if (!data.version || !data.templates || !Array.isArray(data.templates)) {
          throw new Error('Invalid file format. Expected a workflow templates export file.');
        }

        // Validate each template
        const validTemplates: ExportableTemplate[] = [];
        for (const template of data.templates) {
          if (!template.name || !template.trigger_type || !template.actions) {
            continue; // Skip invalid templates
          }
          validTemplates.push(template);
        }

        if (validTemplates.length === 0) {
          throw new Error('No valid templates found in the file.');
        }

        setParsedTemplates(validTemplates);
        setParseError(null);
      } catch (error) {
        console.error('Parse error:', error);
        setParseError(error instanceof Error ? error.message : 'Failed to parse file');
        setParsedTemplates([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedTemplates.length === 0) return;

    setIsImporting(true);
    setImportedCount(0);

    try {
      for (const template of parsedTemplates) {
        await createTemplate.mutateAsync({
          name: template.name,
          description: template.description || undefined,
          category: template.category || 'other',
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config || {},
          actions: template.actions,
          tags: template.tags || [],
          is_shared: false,
        });
        setImportedCount(prev => prev + 1);
      }

      toast.success(`Imported ${parsedTemplates.length} template${parsedTemplates.length === 1 ? '' : 's'}`);
      onImportComplete();
      handleClose();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import some templates');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setParsedTemplates([]);
    setParseError(null);
    setImportedCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Templates
          </DialogTitle>
          <DialogDescription>
            Import workflow templates from a JSON file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to select a JSON file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or drag and drop
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {parsedTemplates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">
                  Found {parsedTemplates.length} template{parsedTemplates.length === 1 ? '' : 's'}
                </span>
              </div>
              <ScrollArea className="h-32 rounded border p-2">
                <div className="space-y-2">
                  {parsedTemplates.map((template, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="truncate">{template.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">
                        {template.trigger_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {isImporting && (
            <div className="text-sm text-muted-foreground text-center">
              Importing... {importedCount} / {parsedTemplates.length}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedTemplates.length === 0 || isImporting}
          >
            {isImporting ? 'Importing...' : `Import ${parsedTemplates.length} Template${parsedTemplates.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
