import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Database, Download, FlaskConical, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const DataManagementPanel = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleSeedDemoData = async () => {
    setIsSeeding(true);
    try {
      const { error } = await supabase.functions.invoke("seed-demo-data", {
        body: { action: "seed" },
      });
      if (error) throw error;
      toast.success("Demo data seeded successfully");
    } catch (error: any) {
      toast.error("Failed to seed demo data: " + error.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearDemoData = async () => {
    setIsSeeding(true);
    try {
      const { error } = await supabase.functions.invoke("seed-demo-data", {
        body: { action: "clear" },
      });
      if (error) throw error;
      toast.success("Demo data cleared successfully");
    } catch (error: any) {
      toast.error("Failed to clear demo data: " + error.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleExport = async (table: string) => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-data", {
        body: { tables: [table] },
      });
      if (error) throw error;

      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table}-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${table} data`);
    } catch (error: any) {
      toast.error("Export failed: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFullExport = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-data", {
        body: { tables: ["all"] },
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `full-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Full export completed");
    } catch (error: any) {
      toast.error("Export failed: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Data Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            <CardTitle className="text-lg">Demo Data Controls</CardTitle>
          </div>
          <CardDescription>
            Seed or clear demo data for testing purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleSeedDemoData} disabled={isSeeding}>
              {isSeeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Seed Demo Data
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isSeeding}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Demo Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Demo Data</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all demo data from the system. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearDemoData}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-sm text-muted-foreground">
            Demo data includes sample deals, lenders, and activity logs for testing.
          </p>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle className="text-lg">Data Export</CardTitle>
          </div>
          <CardDescription>
            Export data for backup or compliance purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              onClick={() => handleExport("deals")}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Deals
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("deal_lenders")}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Lenders
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("companies")}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Companies
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("profiles")}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Users
            </Button>
          </div>
          <div className="pt-2 border-t">
            <Button onClick={handleFullExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export All Data
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Exports are in JSON format and include all records the admin has access to.
          </p>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Environment:</span>
              <Badge variant="outline" className="ml-2">
                {import.meta.env.MODE}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Version:</span>
              <Badge variant="outline" className="ml-2">
                1.0.0
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Build:</span>
              <Badge variant="outline" className="ml-2">
                {new Date().toISOString().split("T")[0]}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
