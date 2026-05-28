/**
 * Unified People directory (Phase 4 merge).
 *
 * Merges the legacy "All Users" surface with the "External" tab so admins
 * see a single, source-aware directory of every human the platform knows
 * about — local users + synced external profiles — under one roof.
 *
 * Each segment still uses its existing component (so RLS, sync state and
 * row actions are unchanged). The wrapper just unifies entry into one
 * tabbed view with source-aware counts.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Cloud } from "lucide-react";
import { UsersTable } from "./UsersTable";
import { ExternalDataTab } from "./ExternalDataTab";
import { useExternalDataSummary } from "@/hooks/useExternalData";

export function PeopleDirectoryPanel() {
  const { data: ext } = useExternalDataSummary();
  const extCount = ext?.profiles ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          All Users
        </CardTitle>
        <CardDescription>
          Every person known to the platform — local accounts plus profiles synced from
          external workspaces.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="local" className="space-y-4">
          <TabsList>
            <TabsTrigger value="local" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Local
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-1.5">
              <Cloud className="h-3.5 w-3.5" />
              External
              {extCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
                  {extCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="mt-0"><UsersTable /></TabsContent>
          <TabsContent value="external" className="mt-0"><ExternalDataTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}