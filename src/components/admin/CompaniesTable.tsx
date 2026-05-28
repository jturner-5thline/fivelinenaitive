import { useState } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, ExternalLink, Ban, Eye, Archive, Trash2, Loader2, MoreHorizontal, Mail, CalendarPlus, ShieldOff, BadgeCheck } from "lucide-react";
import { useAllCompanies } from "@/hooks/useAdminData";
import { CompanyDetailDialog } from "./CompanyDetailDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Company {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  industry: string;
  employee_size: string;
  created_at: string;
  member_count: number;
  suspended_at: string | null;
  suspended_reason: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  account_type: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  notes: string | null;
}

export const CompaniesTable = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "demo" | "client">("all");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extendTarget, setExtendTarget] = useState<Company | null>(null);
  const [extendDate, setExtendDate] = useState<string>("");
  const [revokeTarget, setRevokeTarget] = useState<Company | null>(null);
  const [convertTarget, setConvertTarget] = useState<Company | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const { data: companies, isLoading } = useAllCompanies();
  const queryClient = useQueryClient();

  const handleDeleteCompany = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('admin_delete_company', { _company_id: deleteTarget.id });
      if (error) throw error;
      toast.success(`"${deleteTarget.name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete company');
    } finally {
      setIsDeleting(false);
    }
  };

  const isDemoLike = (t?: string | null) =>
    !!t && ["demo", "pilot", "trial", "partner"].includes(t.toLowerCase());

  const filteredCompanies = companies?.filter((c) => {
    const matchesText =
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.industry?.toLowerCase().includes(search.toLowerCase());
    if (!matchesText) return false;
    if (typeFilter === "demo") return isDemoLike(c.account_type);
    if (typeFilter === "client") return !isDemoLike(c.account_type);
    return true;
  });

  const handleResendInvites = async (c: Company) => {
    setIsActioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-demo-invite", {
        body: { companyId: c.id },
      });
      if (error) throw error;
      const sent = (data as { sent?: number; total?: number } | null)?.sent ?? 0;
      toast.success(`Sent ${sent} invitation${sent === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend invitations");
    } finally {
      setIsActioning(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!extendTarget || !extendDate) return;
    setIsActioning(true);
    try {
      const { error } = await supabase.functions.invoke("extend-demo-trial", {
        body: { companyId: extendTarget.id, trialEndsAt: new Date(extendDate).toISOString() },
      });
      if (error) throw error;
      toast.success(`Trial extended to ${format(new Date(extendDate), "MMM d, yyyy")}`);
      setExtendTarget(null);
      setExtendDate("");
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to extend trial");
    } finally {
      setIsActioning(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsActioning(true);
    try {
      const { error } = await supabase.functions.invoke("revoke-demo-access", {
        body: { companyId: revokeTarget.id },
      });
      if (error) throw error;
      toast.success(`Access revoked for "${revokeTarget.name}"`);
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke access");
    } finally {
      setIsActioning(false);
    }
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    setIsActioning(true);
    try {
      const { error } = await supabase.functions.invoke("convert-demo-to-client", {
        body: { companyId: convertTarget.id, accountType: "Client" },
      });
      if (error) throw error;
      toast.success(`"${convertTarget.name}" converted to a paid client`);
      setConvertTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to convert company");
    } finally {
      setIsActioning(false);
    }
  };

  const handleViewCompany = (company: Company) => {
    setSelectedCompany(company);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="demo">Demo · Pilot</TabsTrigger>
            <TabsTrigger value="client">Client</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCompanies?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No companies found
                </TableCell>
              </TableRow>
            ) : (
              filteredCompanies?.map((company) => (
                <TableRow
                  key={company.id}
                  className={`cursor-pointer hover:bg-muted/40 transition-colors ${company.suspended_at || company.archived_at ? "opacity-60" : ""}`}
                  onClick={() => handleViewCompany(company)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={company.logo_url} />
                        <AvatarFallback>
                          {company.name?.[0] || "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{company.name}</p>
                        {company.website_url && (
                          <a
                            href={company.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            {company.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {company.account_type ? (
                      <Badge
                        variant="outline"
                        className={
                          isDemoLike(company.account_type)
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : "bg-white/10 text-white/70 border-white/20"
                        }
                      >
                        {company.account_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                    {company.trial_ends_at && isDemoLike(company.account_type) && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Trial ends {format(new Date(company.trial_ends_at), "MMM d")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {company.industry || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {company.employee_size || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <Users className="h-3 w-3" />
                      {company.member_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {company.archived_at ? (
                      <Badge variant="outline" className="flex items-center gap-1 w-fit border-muted-foreground text-muted-foreground">
                        <Archive className="h-3 w-3" />
                        Archived
                      </Badge>
                    ) : company.suspended_at ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <Ban className="h-3 w-3" />
                        Suspended
                      </Badge>
                    ) : company.subscription_status === "revoked" ? (
                      <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 w-fit">
                        Revoked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600/30 w-fit">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(company.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewCompany(company);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isDemoLike(company.account_type) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={isActioning}
                              onClick={() => handleResendInvites(company)}
                            >
                              <Mail className="h-4 w-4 mr-2" /> Resend invites
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setExtendTarget(company);
                                setExtendDate(
                                  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                                    .toISOString()
                                    .slice(0, 10),
                                );
                              }}
                            >
                              <CalendarPlus className="h-4 w-4 mr-2" /> Extend trial
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setConvertTarget(company)}
                            >
                              <BadgeCheck className="h-4 w-4 mr-2" /> Convert to client
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRevokeTarget(company)}
                            >
                              <ShieldOff className="h-4 w-4 mr-2" /> Revoke access
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(company);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CompanyDetailDialog
        company={selectedCompany}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            // Refresh the selected company data when dialog closes
            const updated = companies?.find(c => c.id === selectedCompany?.id);
            if (updated) setSelectedCompany(updated);
          }
        }}
      />

      {/* Extend trial dialog */}
      <Dialog open={!!extendTarget} onOpenChange={(open) => !open && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial — {extendTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">New trial end date</label>
            <Input
              type="date"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)} disabled={isActioning}>
              Cancel
            </Button>
            <Button onClick={handleExtendTrial} disabled={isActioning || !extendDate}>
              {isActioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extend trial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates every user account on this workspace. Their data is preserved and access can be restored later by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isActioning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isActioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this company, all its members, deals, and associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCompany}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Company
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert to client confirm */}
      <AlertDialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert "{convertTarget?.name}" to a paid client?</AlertDialogTitle>
            <AlertDialogDescription>
              This switches the account type to <strong>Client</strong>, clears the trial end date,
              and sets subscription status to <strong>active</strong>. Any deactivated members will
              be re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert} disabled={isActioning}>
              {isActioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Convert to client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};