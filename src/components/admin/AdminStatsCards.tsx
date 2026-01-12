import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, FileText, Landmark, Clock, ListTodo } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminStatsCardsProps {
  stats: {
    total_users: number;
    total_companies: number;
    total_deals: number;
    total_lenders: number;
    active_deals: number;
    waitlist_count: number;
  } | null;
  isLoading: boolean;
}

export const AdminStatsCards = ({ stats, isLoading }: AdminStatsCardsProps) => {
  const cards = [
    { title: "Total Users", value: stats?.total_users ?? 0, icon: Users, color: "text-blue-500" },
    { title: "Companies", value: stats?.total_companies ?? 0, icon: Building2, color: "text-green-500" },
    { title: "Total Deals", value: stats?.total_deals ?? 0, icon: FileText, color: "text-purple-500" },
    { title: "Active Deals", value: stats?.active_deals ?? 0, icon: Clock, color: "text-orange-500" },
    { title: "Lenders", value: stats?.total_lenders ?? 0, icon: Landmark, color: "text-cyan-500" },
    { title: "Waitlist", value: stats?.waitlist_count ?? 0, icon: ListTodo, color: "text-pink-500" },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
