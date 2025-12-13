import { TrendingUp, TrendingDown, Clock, AlertCircle, CheckCircle2, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mockDeals = [
  {
    id: "DL-2024-047",
    company: "TechFlow Solutions",
    sector: "SaaS",
    stage: "LOI",
    ev: "$42M",
    revenue: "$8.2M",
    growth: "+34%",
    status: "active",
    trend: "up",
  },
  {
    id: "DL-2024-052",
    company: "MedConnect Health",
    sector: "Healthcare IT",
    stage: "Due Diligence",
    ev: "$78M",
    revenue: "$15.4M",
    growth: "+22%",
    status: "active",
    trend: "up",
  },
  {
    id: "DL-2024-039",
    company: "GreenLogistics Corp",
    sector: "Logistics",
    stage: "Term Sheet",
    ev: "$55M",
    revenue: "$28M",
    growth: "+12%",
    status: "pending",
    trend: "neutral",
  },
  {
    id: "DL-2024-061",
    company: "FinServ Analytics",
    sector: "Fintech",
    stage: "Screening",
    ev: "$25M",
    revenue: "$4.8M",
    growth: "+48%",
    status: "new",
    trend: "up",
  },
];

const statusConfig = {
  active: { color: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
  pending: { color: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  new: { color: "bg-accent/10 text-accent border-accent/20", icon: AlertCircle },
};

export const DealDashboardPreview = () => {
  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-heading md:text-4xl text-foreground mb-4">
            Your Command Center for Deal Flow
          </h2>
          <p className="text-muted-foreground text-lg">
            See all your opportunities at a glance with real-time status updates and key metrics.
          </p>
        </div>

        {/* Dashboard preview */}
        <div className="max-w-5xl mx-auto">
          <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            {/* Dashboard header */}
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-destructive/80" />
                <div className="w-3 h-3 rounded-full bg-warning/80" />
                <div className="w-3 h-3 rounded-full bg-success/80" />
              </div>
              <span className="text-sm font-medium text-primary-foreground/80">
                Active Pipeline — Q4 2024
              </span>
              <div className="w-20" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 p-6 border-b border-border bg-secondary/30">
              <div className="text-center">
                <p className="text-2xl font-semibold text-foreground">12</p>
                <p className="text-xs text-muted-foreground">Active Deals</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-foreground">$312M</p>
                <p className="text-xs text-muted-foreground">Pipeline Value</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-success">3</p>
                <p className="text-xs text-muted-foreground">LOI Stage</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-warning">2</p>
                <p className="text-xs text-muted-foreground">Needs Attention</p>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-7 gap-4 px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
              <div className="col-span-2">Company</div>
              <div>Stage</div>
              <div className="text-right">EV</div>
              <div className="text-right">Revenue</div>
              <div className="text-right">Growth</div>
              <div className="text-center">Status</div>
            </div>

            {/* Table rows */}
            {mockDeals.map((deal, index) => {
              const statusStyle = statusConfig[deal.status as keyof typeof statusConfig];
              const StatusIcon = statusStyle.icon;
              
              return (
                <div
                  key={deal.id}
                  className="grid grid-cols-7 gap-4 px-6 py-4 items-center border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer group"
                >
                  <div className="col-span-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent">
                        {deal.company.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground group-hover:text-accent transition-colors flex items-center gap-1">
                          {deal.company}
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                        <p className="text-xs text-muted-foreground">{deal.sector}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Badge variant="secondary" className="font-medium">
                      {deal.stage}
                    </Badge>
                  </div>
                  <div className="text-right font-mono text-sm text-foreground">{deal.ev}</div>
                  <div className="text-right font-mono text-sm text-muted-foreground">{deal.revenue}</div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 font-mono text-sm ${
                      deal.trend === "up" ? "text-success" : "text-muted-foreground"
                    }`}>
                      {deal.trend === "up" && <TrendingUp className="w-3 h-3" />}
                      {deal.growth}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusStyle.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {deal.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
