/**
 * Unified People directory.
 *
 * Three strictly-separated tabs so FLEx-imported reference profiles are
 * never miscounted as Naitive users:
 *   - Local:    Real Naitive accounts in this tenant
 *   - External: Real Naitive collaborators invited via Access Requests
 *   - FLEx:     Read-only FLEx-imported profiles (NO Naitive login access)
 *
 * Header counts reflect Naitive users (Local + External) as the total; FLEx
 * is shown as a separate reference metric.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Cloud, Globe, Home } from "lucide-react";
import { UsersTable } from "./UsersTable";
import { useConsolidatedUsers } from "@/hooks/useAdminData";

export function PeopleDirectoryPanel() {
  const { data: users } = useConsolidatedUsers();
  const localCount = users?.filter(u => u.source === 'local').length ?? 0;
  const externalCount = users?.filter(u => u.source === 'external').length ?? 0;
  const flexCount = users?.filter(u => u.source === 'flex').length ?? 0;
  const naitiveTotal = localCount + externalCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          All Users
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{naitiveTotal} Naitive users</span>
          {' '}({localCount} local · {externalCount} external) · {flexCount} FLEx-imported reference profiles (no login access)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="local" className="space-y-4">
          <TabsList>
            <TabsTrigger value="local" className="gap-1.5">
              <Home className="h-3.5 w-3.5" />
              Local
              {localCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
                  {localCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              External
              {externalCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
                  {externalCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="flex" className="gap-1.5">
              <Cloud className="h-3.5 w-3.5" />
              FLEx
              {flexCount > 0 && (
                <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] leading-none">
                  {flexCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="mt-0"><UsersTable scope="local" /></TabsContent>
          <TabsContent value="external" className="mt-0"><UsersTable scope="external" /></TabsContent>
          <TabsContent value="flex" className="mt-0"><UsersTable scope="flex" /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}