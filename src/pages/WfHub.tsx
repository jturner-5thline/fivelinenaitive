import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, CheckSquare, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import WfDeals from "./WfDeals";
import WfTasks from "./WfTasks";
import WfAdmin from "./WfAdmin";

export default function WfHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "deals";

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Workflows | Naitive</title></Helmet>
      <h1 className="text-2xl font-bold text-foreground">Workflows</h1>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="deals"><Briefcase className="h-4 w-4 mr-1.5" />Deals</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="h-4 w-4 mr-1.5" />Tasks</TabsTrigger>
          <TabsTrigger value="admin"><SlidersHorizontal className="h-4 w-4 mr-1.5" />Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="deals"><WfDeals embedded /></TabsContent>
        <TabsContent value="tasks"><WfTasks embedded /></TabsContent>
        <TabsContent value="admin"><WfAdmin embedded /></TabsContent>
      </Tabs>
    </div>
  );
}
