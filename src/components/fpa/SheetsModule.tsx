import { SpreadsheetWorkspace } from '@/components/finance/spreadsheet/SpreadsheetWorkspace';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileSpreadsheet, Upload, Link2, RefreshCw, Clock, Sparkles } from 'lucide-react';

export function SheetsModule() {
  return (
    <div className="space-y-3">
      {/* Sync bar */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Workbook</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last sync: just now</span>
            </div>
            <Badge variant="outline" className="text-[10px]">Bi-directional sync active</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <Upload className="h-3 w-3" /> Push to Platform
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <RefreshCw className="h-3 w-3" /> Pull Data
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <Sparkles className="h-3 w-3" /> Analyze with AI
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Existing spreadsheet workspace */}
      <SpreadsheetWorkspace />
    </div>
  );
}
