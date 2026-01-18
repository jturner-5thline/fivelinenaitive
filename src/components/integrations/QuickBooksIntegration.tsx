import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Link2,
  Link2Off,
  RefreshCw,
  Users,
  FileText,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useQuickBooksStatus,
  useQuickBooksConnect,
  useQuickBooksDisconnect,
  useQuickBooksSync,
  useQuickBooksCustomers,
  useQuickBooksInvoices,
  useQuickBooksPayments,
  useQuickBooksSyncHistory,
} from "@/hooks/useQuickBooks";

export function QuickBooksIntegration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: status, isLoading: statusLoading } = useQuickBooksStatus();
  const connect = useQuickBooksConnect();
  const disconnect = useQuickBooksDisconnect();
  const sync = useQuickBooksSync();

  const { data: customers = [], isLoading: customersLoading } = useQuickBooksCustomers();
  const { data: invoices = [], isLoading: invoicesLoading } = useQuickBooksInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = useQuickBooksPayments();
  const { data: syncHistory = [] } = useQuickBooksSyncHistory();

  // Handle callback redirect
  useEffect(() => {
    if (searchParams.get("quickbooks") === "connected") {
      toast.success("QuickBooks connected successfully!");
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const getSyncStatusIcon = (syncStatus: string) => {
    switch (syncStatus) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "partial":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "running":
        return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (statusLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#2CA01C]/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#2CA01C">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <div>
              <CardTitle>QuickBooks Online</CardTitle>
              <CardDescription>
                Sync customers, invoices, and payments from QuickBooks
              </CardDescription>
            </div>
          </div>
          <Badge variant={status?.connected ? "default" : "secondary"}>
            {status?.connected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!status?.connected ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Connect your QuickBooks Online account to sync financial data.
            </p>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              <Link2 className="h-4 w-4 mr-2" />
              {connect.isPending ? "Connecting..." : "Connect QuickBooks"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => sync.mutate(undefined)}
                disabled={sync.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
                  {sync.isPending ? "Syncing..." : "Sync Now"}
                </Button>
                {status?.lastSync && (
                  <span className="text-sm text-muted-foreground">
                    Last synced: {format(new Date(status.lastSync), "MMM d, yyyy HH:mm")}
                  </span>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Link2Off className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect QuickBooks?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your QuickBooks connection and delete all synced data.
                      You can reconnect at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnect.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <Tabs defaultValue="customers" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="customers" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Customers ({customers.length})
                </TabsTrigger>
                <TabsTrigger value="invoices" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payments ({payments.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Sync History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="customers" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {customersLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : customers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No customers synced yet. Click "Sync Now" to fetch data.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customers.map((customer) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">
                              {customer.display_name || `${customer.given_name || ""} ${customer.family_name || ""}`.trim() || "-"}
                            </TableCell>
                            <TableCell>{customer.company_name || "-"}</TableCell>
                            <TableCell>{customer.email || "-"}</TableCell>
                            <TableCell>{customer.phone || "-"}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(customer.balance)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={customer.active ? "default" : "secondary"}>
                                {customer.active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="invoices" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {invoicesLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No invoices synced yet. Click "Sync Now" to fetch data.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              {invoice.doc_number || "-"}
                            </TableCell>
                            <TableCell>{invoice.customer_name || "-"}</TableCell>
                            <TableCell>
                              {invoice.txn_date
                                ? format(new Date(invoice.txn_date), "MMM d, yyyy")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {invoice.due_date
                                ? format(new Date(invoice.due_date), "MMM d, yyyy")
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(invoice.total_amt)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(invoice.balance)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  invoice.status === "Paid"
                                    ? "default"
                                    : invoice.status === "Overdue"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {invoice.status || "Open"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {paymentsLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : payments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No payments synced yet. Click "Sync Now" to fetch data.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Payment Method</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              {payment.customer_name || "-"}
                            </TableCell>
                            <TableCell>
                              {payment.txn_date
                                ? format(new Date(payment.txn_date), "MMM d, yyyy")
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(payment.total_amt)}
                            </TableCell>
                            <TableCell>{payment.payment_method || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {syncHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No sync history yet.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Records</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncHistory.map((sync) => (
                          <TableRow key={sync.id}>
                            <TableCell className="font-medium capitalize">
                              {sync.sync_type}
                            </TableCell>
                            <TableCell>
                              {format(new Date(sync.started_at), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell>
                              {sync.completed_at
                                ? format(new Date(sync.completed_at), "MMM d, HH:mm")
                                : "-"}
                            </TableCell>
                            <TableCell>{sync.records_synced || 0}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getSyncStatusIcon(sync.status)}
                                <span className="capitalize">{sync.status}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
