import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Briefcase, Users, FileText, Settings, Lightbulb, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDealsContext } from "@/contexts/DealsContext";
import { useLenders } from "@/contexts/LendersContext";

const quickActions = [
  { name: "Dashboard", icon: Briefcase, path: "/deals" },
  { name: "Metrics", icon: BarChart3, path: "/metrics" },
  { name: "Insights", icon: Lightbulb, path: "/insights" },
  { name: "Sales & BD", icon: Users, path: "/sales-bd" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { lenders } = useLenders();

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search deals, lenders, or navigate..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Quick Actions */}
          <CommandGroup heading="Quick Actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.path}
                value={action.name}
                onSelect={() => handleSelect(action.path)}
              >
                <action.icon className="mr-2 h-4 w-4" />
                <span>{action.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Deals */}
          {deals && deals.length > 0 && (
            <CommandGroup heading="Deals">
              {deals.slice(0, 5).map((deal) => (
                <CommandItem
                  key={deal.id}
                  value={`deal ${deal.company} ${deal.stage}`}
                  onSelect={() => handleSelect(`/deal/${deal.id}`)}
                >
                  <Briefcase className="mr-2 h-4 w-4" />
                  <div className="flex flex-1 items-center justify-between">
                    <span>{deal.company}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(deal.value)} • {deal.stage}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />

          {/* Lenders */}
          {lenders && lenders.length > 0 && (
            <CommandGroup heading="Lenders">
              {lenders.slice(0, 5).map((lender) => (
                <CommandItem
                  key={lender.name}
                  value={`lender ${lender.name} ${lender.contact?.name || ""}`}
                  onSelect={() => handleSelect(`/lenders?search=${encodeURIComponent(lender.name)}`)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  <div className="flex flex-1 items-center justify-between">
                    <span>{lender.name}</span>
                    {lender.contact?.name && (
                      <span className="text-xs text-muted-foreground">
                        {lender.contact.name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
