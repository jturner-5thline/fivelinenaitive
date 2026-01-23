import { TrendingUp, CheckCircle2, Clock, AlertCircle, ArrowUpRight } from "lucide-react";

const mockDeals = [
  {
    company: "TechFlow Solutions",
    sector: "SaaS",
    stage: "LOI",
    ev: "$42M",
    growth: "+34%",
    status: "active",
  },
  {
    company: "MedConnect Health",
    sector: "Healthcare IT",
    stage: "Due Diligence",
    ev: "$78M",
    growth: "+22%",
    status: "active",
  },
  {
    company: "GreenLogistics Corp",
    sector: "Logistics",
    stage: "Term Sheet",
    ev: "$55M",
    growth: "+12%",
    status: "pending",
  },
];

const statusConfig = {
  active: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  pending: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  new: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: AlertCircle },
};

export const PlatformPreviewDealPipeline = () => {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-sm text-white/50">Active Pipeline — Q1 2026</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 rounded-lg bg-white/5">
          <p className="text-2xl font-semibold text-white">12</p>
          <p className="text-xs text-white/50">Active Deals</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-white/5">
          <p className="text-2xl font-semibold text-white">$312M</p>
          <p className="text-xs text-white/50">Pipeline Value</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-white/5">
          <p className="text-2xl font-semibold text-emerald-400">3</p>
          <p className="text-xs text-white/50">LOI Stage</p>
        </div>
      </div>

      {/* Deals list */}
      <div className="space-y-3">
        {mockDeals.map((deal) => {
          const statusStyle = statusConfig[deal.status as keyof typeof statusConfig];
          const StatusIcon = statusStyle.icon;
          
          return (
            <div
              key={deal.company}
              className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[hsl(292,46%,72%)]/20 flex items-center justify-center text-sm font-semibold text-[hsl(292,46%,72%)]">
                  {deal.company.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-white flex items-center gap-1">
                    {deal.company}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-white/50" />
                  </p>
                  <p className="text-xs text-white/50">{deal.sector}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-mono text-white/70">{deal.ev}</span>
                <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
                  <TrendingUp className="w-3 h-3" />
                  {deal.growth}
                </span>
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
  );
};

export const PlatformPreviewLenderKanban = () => {
  const stages = [
    { name: "Outreach", count: 8, lenders: ["First Republic", "SVB", "Comerica"] },
    { name: "Under Review", count: 5, lenders: ["Wells Fargo", "PNC Bank"] },
    { name: "Term Sheet", count: 3, lenders: ["JPMorgan"] },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-sm text-white/50">Lender Tracking — TechFlow Deal</span>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-3 gap-4">
        {stages.map((stage) => (
          <div key={stage.name} className="p-4 rounded-lg bg-white/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-white">{stage.name}</span>
              <span className="text-xs text-white/50">{stage.count}</span>
            </div>
            <div className="space-y-2">
              {stage.lenders.map((lender) => (
                <div
                  key={lender}
                  className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {lender}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PlatformPreviewDataRoom = () => {
  const folders = [
    { name: "Financial Statements", files: 12, complete: true },
    { name: "Legal Documents", files: 8, complete: true },
    { name: "Commercial DD", files: 6, complete: false },
    { name: "Management Presentations", files: 4, complete: false },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-sm text-white/50">Data Room — MedConnect Health</span>
      </div>

      {/* Progress */}
      <div className="mb-6 p-4 rounded-lg bg-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white">Checklist Progress</span>
          <span className="text-sm text-[hsl(292,46%,72%)]">67%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[hsl(292,46%,72%)] to-[hsl(292,46%,82%)]" />
        </div>
      </div>

      {/* Folders */}
      <div className="space-y-3">
        {folders.map((folder) => (
          <div
            key={folder.name}
            className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${folder.complete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50'}`}>
                {folder.complete ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              <span className="text-sm text-white">{folder.name}</span>
            </div>
            <span className="text-xs text-white/50">{folder.files} files</span>
          </div>
        ))}
      </div>
    </div>
  );
};
