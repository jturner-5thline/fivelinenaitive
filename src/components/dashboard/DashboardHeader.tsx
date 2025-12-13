import { BarChart3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">DealFlow Pro</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" className="text-foreground">
              Pipeline
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Analytics
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Reports
            </Button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Deal
          </Button>
        </div>
      </div>
    </header>
  );
}
