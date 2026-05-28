/**
 * Unified Companies directory (Phase 4 merge).
 *
 * Brings local Companies and synced External entities (deals + lenders)
 * under a single, source-aware view. Each tab still uses its existing
 * component so RLS, search and row actions are unchanged.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Cloud } from "lucide-react";
import { CompaniesTable } from "./CompaniesTable";
import { ExternalDataTab } from "./ExternalDataTab";
import { useExternalDataSummary } from "@/hooks/useExternalData";

export function CompaniesDirectoryPanel() {
  const { data: ext } = useExternalDataSummary();
  const extCount = (ext?.deals ?? 0) + (ext?.lenders ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Companies & External Entities
        </CardTitle>
        <CardDescription>
          Registered companies plus deals and lenders synced from external workspaces.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="local" className="space-y-4">
          <TabsList>
            <TabsTrigger value="local" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-1.5">
              <Cloud className="h-3.5 w-3.5" />
              External Entities
              {extCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
                  {extCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="mt-0"><CompaniesTable /></TabsContent>
          <TabsContent value="external" className="mt-0"><ExternalDataTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}