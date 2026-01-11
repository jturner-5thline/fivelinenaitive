import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Loader2, Download, Upload, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ImportResult {
  success: boolean;
  totalInserted: number;
  tables: Record<string, { inserted: number; errors: string[] }>;
  tablesWithErrors: string[];
}

export default function MigrationTool() {
  const [step, setStep] = useState(1);
  const [exportedData, setExportedData] = useState<string>("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetServiceKey, setTargetServiceKey] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("export-data");
      if (error) throw error;
      setExportedData(JSON.stringify(data, null, 2));
      setExportSuccess(true);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const parsedData = JSON.parse(exportedData);
      const { data, error } = await supabase.functions.invoke("import-data", {
        body: {
          targetUrl,
          targetServiceKey,
          exportedData: parsedData,
        },
      });
      if (error) throw error;
      setImportResult(data);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const downloadExport = () => {
    const blob = new Blob([exportedData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lovable-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Database Migration Tool</h1>
          <p className="text-muted-foreground mt-2">
            Export data from Lovable Cloud and import to your Supabase project
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-2 ${
                step >= s ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step > s
                    ? "bg-primary text-primary-foreground"
                    : step === s
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              <span className="text-sm font-medium">
                {s === 1 ? "Export" : s === 2 ? "Configure" : "Complete"}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Export */}
        <Card className={step === 1 ? "" : "opacity-60"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Step 1: Export Data
            </CardTitle>
            <CardDescription>
              Export all your data from Lovable Cloud
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleExport}
              disabled={isExporting || exportSuccess}
              className="w-full"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : exportSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Export Complete
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </>
              )}
            </Button>
            {exportSuccess && (
              <Button
                variant="outline"
                onClick={downloadExport}
                className="w-full mt-2"
              >
                Download JSON Backup
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Configure & Import */}
        <Card className={step >= 2 ? "" : "opacity-40 pointer-events-none"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Step 2: Import to Supabase
            </CardTitle>
            <CardDescription>
              Enter your target Supabase project credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="targetUrl">Supabase Project URL</Label>
              <Input
                id="targetUrl"
                placeholder="https://your-project.supabase.co"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceKey">Service Role Key</Label>
              <Input
                id="serviceKey"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={targetServiceKey}
                onChange={(e) => setTargetServiceKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Found in Supabase Dashboard → Settings → API → service_role key
              </p>
            </div>
            <div className="space-y-2">
              <Label>Exported Data Preview</Label>
              <Textarea
                value={exportedData.slice(0, 500) + (exportedData.length > 500 ? "..." : "")}
                readOnly
                className="font-mono text-xs h-24"
              />
            </div>
            <Button
              onClick={handleImport}
              disabled={isImporting || !targetUrl || !targetServiceKey || !exportedData}
              className="w-full"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Step 3: Results */}
        {importResult && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle className="w-5 h-5" />
                Migration Complete!
              </CardTitle>
              <CardDescription>
                Successfully imported {importResult.totalInserted} records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(importResult.tables).map(([table, result]) => (
                  <div
                    key={table}
                    className="flex justify-between items-center text-sm py-1 border-b border-border last:border-0"
                  >
                    <span className="font-medium">{table}</span>
                    <span className={result.errors.length > 0 ? "text-destructive" : "text-muted-foreground"}>
                      {result.inserted} rows
                      {result.errors.length > 0 && ` (${result.errors.length} errors)`}
                    </span>
                  </div>
                ))}
              </div>
              {importResult.tablesWithErrors.length > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                  <p className="text-sm text-destructive font-medium">
                    Errors in: {importResult.tablesWithErrors.join(", ")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
