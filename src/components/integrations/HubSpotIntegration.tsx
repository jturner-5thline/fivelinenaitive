import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useHubSpot, HubSpotContact, HubSpotDeal, HubSpotCompany } from "@/hooks/useHubSpot";
import { formatDistanceToNow } from "date-fns";
import {
  Users,
  Building2,
  Handshake,
  MessageSquare,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Mail,
  Phone,
  Globe,
  MapPin,
  Briefcase,
} from "lucide-react";

export function HubSpotIntegration() {
  const hubspot = useHubSpot();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [activeTab, setActiveTab] = useState("contacts");
  
  // Search states
  const [contactSearch, setContactSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  
  // Dialog states
  const [isCreateContactOpen, setIsCreateContactOpen] = useState(false);
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  
  // Form states
  const [newContact, setNewContact] = useState({ email: "", firstname: "", lastname: "", phone: "", company: "", jobtitle: "" });
  const [newDeal, setNewDeal] = useState({ dealname: "", amount: "", pipeline: "", dealstage: "" });
  const [newCompany, setNewCompany] = useState({ name: "", domain: "", industry: "", phone: "", city: "", state: "", country: "" });
  const [activityForm, setActivityForm] = useState({ objectType: "deals" as "contacts" | "deals" | "companies", objectId: "", noteBody: "" });

  // Data queries
  const { data: contactsData, isLoading: contactsLoading, refetch: refetchContacts } = hubspot.useContacts();
  const { data: dealsData, isLoading: dealsLoading, refetch: refetchDeals } = hubspot.useDeals();
  const { data: companiesData, isLoading: companiesLoading, refetch: refetchCompanies } = hubspot.useCompanies();
  const { data: pipelinesData } = hubspot.usePipelines();

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      await hubspot.testConnection();
      setIsConnected(true);
      toast.success("Successfully connected to HubSpot!");
    } catch (error: any) {
      setIsConnected(false);
      toast.error("Failed to connect to HubSpot", { description: error.message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleCreateContact = async () => {
    try {
      await hubspot.createContact.mutateAsync({ properties: newContact });
      setIsCreateContactOpen(false);
      setNewContact({ email: "", firstname: "", lastname: "", phone: "", company: "", jobtitle: "" });
      refetchContacts();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCreateDeal = async () => {
    try {
      await hubspot.createDeal.mutateAsync({ properties: newDeal });
      setIsCreateDealOpen(false);
      setNewDeal({ dealname: "", amount: "", pipeline: "", dealstage: "" });
      refetchDeals();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleCreateCompany = async () => {
    try {
      await hubspot.createCompany.mutateAsync({ properties: newCompany });
      setIsCreateCompanyOpen(false);
      setNewCompany({ name: "", domain: "", industry: "", phone: "", city: "", state: "", country: "" });
      refetchCompanies();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleLogActivity = async () => {
    try {
      await hubspot.logActivity.mutateAsync(activityForm);
      setIsLogActivityOpen(false);
      setActivityForm({ objectType: "deals", objectId: "", noteBody: "" });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(parseFloat(amount));
  };

  const getStatusBadge = () => {
    if (isConnected === null) {
      return <Badge variant="secondary">Not tested</Badge>;
    }
    return isConnected ? (
      <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Connected
      </Badge>
    ) : (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Disconnected
      </Badge>
    );
  };

  // Filter data based on search
  const filteredContacts = contactsData?.results?.filter((c) =>
    !contactSearch ||
    c.properties.email?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.properties.firstname?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.properties.lastname?.toLowerCase().includes(contactSearch.toLowerCase())
  ) || [];

  const filteredDeals = dealsData?.results?.filter((d) =>
    !dealSearch || d.properties.dealname?.toLowerCase().includes(dealSearch.toLowerCase())
  ) || [];

  const filteredCompanies = companiesData?.results?.filter((c) =>
    !companySearch || c.properties.name?.toLowerCase().includes(companySearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg">HubSpot CRM</CardTitle>
                <CardDescription>Sync contacts, deals, companies, and activities</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge()}
              <Button onClick={handleTestConnection} disabled={isTestingConnection} variant="outline">
                {isTestingConnection ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Data Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="contacts" className="gap-2">
              <Users className="h-4 w-4" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="deals" className="gap-2">
              <Handshake className="h-4 w-4" />
              Deals
            </TabsTrigger>
            <TabsTrigger value="companies" className="gap-2">
              <Building2 className="h-4 w-4" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="activities" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Activities
            </TabsTrigger>
          </TabsList>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {activeTab === "contacts" && (
              <Dialog open={isCreateContactOpen} onOpenChange={setIsCreateContactOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create HubSpot Contact</DialogTitle>
                    <DialogDescription>Add a new contact to HubSpot CRM</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input value={newContact.firstname} onChange={(e) => setNewContact({ ...newContact, firstname: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input value={newContact.lastname} onChange={(e) => setNewContact({ ...newContact, lastname: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Job Title</Label>
                      <Input value={newContact.jobtitle} onChange={(e) => setNewContact({ ...newContact, jobtitle: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateContactOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateContact} disabled={!newContact.email || hubspot.createContact.isPending}>
                      {hubspot.createContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Contact
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {activeTab === "deals" && (
              <Dialog open={isCreateDealOpen} onOpenChange={setIsCreateDealOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Deal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create HubSpot Deal</DialogTitle>
                    <DialogDescription>Add a new deal to HubSpot CRM</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Deal Name *</Label>
                      <Input value={newDeal.dealname} onChange={(e) => setNewDeal({ ...newDeal, dealname: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input type="number" value={newDeal.amount} onChange={(e) => setNewDeal({ ...newDeal, amount: e.target.value })} />
                    </div>
                    {pipelinesData?.results && (
                      <>
                        <div className="space-y-2">
                          <Label>Pipeline</Label>
                          <Select value={newDeal.pipeline} onValueChange={(v) => setNewDeal({ ...newDeal, pipeline: v, dealstage: "" })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select pipeline" />
                            </SelectTrigger>
                            <SelectContent>
                              {pipelinesData.results.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {newDeal.pipeline && (
                          <div className="space-y-2">
                            <Label>Stage</Label>
                            <Select value={newDeal.dealstage} onValueChange={(v) => setNewDeal({ ...newDeal, dealstage: v })}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                {pipelinesData.results
                                  .find((p) => p.id === newDeal.pipeline)
                                  ?.stages.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDealOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateDeal} disabled={!newDeal.dealname || hubspot.createDeal.isPending}>
                      {hubspot.createDeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Deal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {activeTab === "companies" && (
              <Dialog open={isCreateCompanyOpen} onOpenChange={setIsCreateCompanyOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Company
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create HubSpot Company</DialogTitle>
                    <DialogDescription>Add a new company to HubSpot CRM</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Company Name *</Label>
                      <Input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Domain</Label>
                      <Input value={newCompany.domain} onChange={(e) => setNewCompany({ ...newCompany, domain: e.target.value })} placeholder="example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Industry</Label>
                      <Input value={newCompany.industry} onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={newCompany.phone} onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input value={newCompany.city} onChange={(e) => setNewCompany({ ...newCompany, city: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Input value={newCompany.state} onChange={(e) => setNewCompany({ ...newCompany, state: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Input value={newCompany.country} onChange={(e) => setNewCompany({ ...newCompany, country: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateCompanyOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateCompany} disabled={!newCompany.name || hubspot.createCompany.isPending}>
                      {hubspot.createCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Company
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {activeTab === "activities" && (
              <Dialog open={isLogActivityOpen} onOpenChange={setIsLogActivityOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Activity
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Activity to HubSpot</DialogTitle>
                    <DialogDescription>Create a note and associate it with a record</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Object Type</Label>
                      <Select value={activityForm.objectType} onValueChange={(v) => setActivityForm({ ...activityForm, objectType: v as any })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contacts">Contact</SelectItem>
                          <SelectItem value="deals">Deal</SelectItem>
                          <SelectItem value="companies">Company</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Object ID *</Label>
                      <Input 
                        value={activityForm.objectId} 
                        onChange={(e) => setActivityForm({ ...activityForm, objectId: e.target.value })} 
                        placeholder="Enter the HubSpot record ID"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Note *</Label>
                      <Textarea 
                        value={activityForm.noteBody} 
                        onChange={(e) => setActivityForm({ ...activityForm, noteBody: e.target.value })}
                        placeholder="Enter your note..."
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsLogActivityOpen(false)}>Cancel</Button>
                    <Button onClick={handleLogActivity} disabled={!activityForm.objectId || !activityForm.noteBody || hubspot.logActivity.isPending}>
                      {hubspot.logActivity.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Log Activity
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Contacts</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts..."
                      className="pl-8 w-[200px]"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchContacts()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            {contact.properties.firstname || contact.properties.lastname
                              ? `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {contact.properties.email ? (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {contact.properties.email}
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell>{contact.properties.company || "-"}</TableCell>
                          <TableCell>{contact.properties.jobtitle || "-"}</TableCell>
                          <TableCell>
                            {contact.properties.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {contact.properties.phone}
                              </div>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredContacts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No contacts found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deals Tab */}
        <TabsContent value="deals">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Deals</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search deals..."
                      className="pl-8 w-[200px]"
                      value={dealSearch}
                      onChange={(e) => setDealSearch(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchDeals()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Deal Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Close Date</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeals.map((deal) => (
                        <TableRow key={deal.id}>
                          <TableCell className="font-medium">{deal.properties.dealname || "-"}</TableCell>
                          <TableCell>{formatCurrency(deal.properties.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{deal.properties.dealstage || "-"}</Badge>
                          </TableCell>
                          <TableCell>
                            {deal.properties.closedate
                              ? new Date(deal.properties.closedate).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {deal.properties.createdate
                              ? formatDistanceToNow(new Date(deal.properties.createdate), { addSuffix: true })
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredDeals.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No deals found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Companies Tab */}
        <TabsContent value="companies">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Companies</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search companies..."
                      className="pl-8 w-[200px]"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchCompanies()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {companiesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompanies.map((company) => (
                        <TableRow key={company.id}>
                          <TableCell className="font-medium">{company.properties.name || "-"}</TableCell>
                          <TableCell>
                            {company.properties.domain ? (
                              <div className="flex items-center gap-1">
                                <Globe className="h-3 w-3 text-muted-foreground" />
                                {company.properties.domain}
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {company.properties.industry ? (
                              <Badge variant="outline">{company.properties.industry}</Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {company.properties.city || company.properties.state || company.properties.country ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {[company.properties.city, company.properties.state, company.properties.country]
                                  .filter(Boolean)
                                  .join(", ")}
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {company.properties.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {company.properties.phone}
                              </div>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredCompanies.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No companies found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Logging</CardTitle>
              <CardDescription>
                Log notes and activities to HubSpot records. Use the "Log Activity" button to create a new note
                and associate it with a contact, deal, or company.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Log Activities to HubSpot</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  Create notes and associate them with contacts, deals, or companies in your HubSpot CRM.
                  All activities will be visible in the HubSpot timeline.
                </p>
                <Button onClick={() => setIsLogActivityOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Activity
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
