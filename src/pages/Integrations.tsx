import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useIntegrations, Integration } from "@/hooks/useIntegrations";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Plug, 
  Plus, 
  Settings2, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Webhook,
  Database,
  Mail,
  Calendar,
  FileText,
  MessageSquare,
  Zap,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Linkedin,
  FolderOpen,
  Users
} from "lucide-react";

const INTEGRATION_TEMPLATES = [
  { 
    id: "webhook", 
    name: "Webhook", 
    description: "Send data to external services via HTTP webhooks",
    icon: Webhook,
    fields: ["url", "secret"]
  },
  { 
    id: "zapier", 
    name: "Zapier", 
    description: "Connect to thousands of apps via Zapier",
    icon: Zap,
    fields: ["webhookUrl"]
  },
  { 
    id: "slack", 
    name: "Slack", 
    description: "Send notifications to Slack channels",
    icon: MessageSquare,
    fields: ["webhookUrl", "channel"]
  },
  { 
    id: "gmail", 
    name: "Gmail", 
    description: "Send and receive emails via Gmail API",
    icon: Mail,
    fields: ["clientId", "clientSecret", "refreshToken"]
  },
  { 
    id: "google-calendar", 
    name: "Google Calendar", 
    description: "Sync milestones and events with Google Calendar",
    icon: Calendar,
    fields: ["clientId", "clientSecret", "calendarId"]
  },
  { 
    id: "google-drive", 
    name: "Google Drive", 
    description: "Store and access documents in Google Drive",
    icon: FolderOpen,
    fields: ["clientId", "clientSecret", "folderId"]
  },
  { 
    id: "hubspot", 
    name: "HubSpot", 
    description: "Sync contacts, deals, and activities with HubSpot CRM",
    icon: Users,
    fields: ["apiKey", "portalId"]
  },
  { 
    id: "linkedin", 
    name: "LinkedIn", 
    description: "Connect with LinkedIn for professional networking",
    icon: Linkedin,
    fields: ["clientId", "clientSecret", "accessToken"]
  },
  { 
    id: "email", 
    name: "Email SMTP", 
    description: "Send emails via custom SMTP server",
    icon: Mail,
    fields: ["host", "port", "username", "password"]
  },
  { 
    id: "crm", 
    name: "CRM Integration", 
    description: "Sync deals with Salesforce or Pipedrive",
    icon: Database,
    fields: ["apiKey", "endpoint"]
  },
  { 
    id: "docs", 
    name: "Document Storage", 
    description: "Connect to Dropbox or OneDrive",
    icon: FileText,
    fields: ["provider", "accessToken"]
  },
];

const getIconForType = (type: string) => {
  const template = INTEGRATION_TEMPLATES.find(t => t.id === type);
  return template?.icon || Plug;
};

export default function Integrations() {
  const { user } = useAuth();
  const { 
    integrations, 
    isLoading, 
    createIntegration, 
    updateIntegration, 
    deleteIntegration, 
    toggleIntegration 
  } = useIntegrations();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof INTEGRATION_TEMPLATES[0] | null>(null);
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testingIntegrationId, setTestingIntegrationId] = useState<string | null>(null);

  const handleAddIntegration = async () => {
    if (!selectedTemplate || !newIntegrationName) {
      toast.error("Please fill in all required fields");
      return;
    }

    await createIntegration.mutateAsync({
      name: newIntegrationName,
      type: selectedTemplate.id,
      config: configValues,
    });

    setIsAddDialogOpen(false);
    setSelectedTemplate(null);
    setNewIntegrationName("");
    setConfigValues({});
  };

  const handleTestConnection = async (integration: Integration) => {
    if (!user) {
      toast.error("You must be logged in to test webhooks");
      return;
    }

    // Check if webhook URL is configured
    const webhookUrl = integration.config?.url || integration.config?.webhookUrl || integration.config?.webhook_url;
    if (!webhookUrl && integration.type === 'webhook') {
      toast.error("No webhook URL configured for this integration");
      return;
    }

    setTestingIntegrationId(integration.id);

    try {
      // Send a test payload via the webhook-sync edge function
      const testPayload = {
        type: 'TEST' as const,
        table: 'test',
        record: {
          id: 'test-' + Date.now(),
          message: 'This is a test webhook from your integration',
          integration_name: integration.name,
          timestamp: new Date().toISOString(),
          sample_deal: {
            id: 'sample-deal-123',
            company: 'Acme Corporation',
            value: 1000000,
            stage: 'diligence',
            status: 'on-track',
          }
        },
        old_record: null,
        user_id: user.id,
        timestamp: new Date().toISOString(),
      };

      const { data, error } = await supabase.functions.invoke('webhook-sync', {
        body: testPayload,
      });

      if (error) {
        throw error;
      }

      if (data?.success && data?.sent > 0) {
        toast.success(`Test webhook sent successfully to ${integration.name}!`, {
          description: `Delivered to ${data.sent} endpoint(s)`,
        });
      } else if (data?.success && data?.sent === 0) {
        toast.warning("No webhooks were sent", {
          description: integration.status !== 'connected' 
            ? "Integration is not enabled. Enable it first to receive webhooks."
            : "Check your webhook configuration.",
        });
      } else if (data?.results) {
        const failedResults = data.results.filter((r: any) => !r.success);
        if (failedResults.length > 0) {
          toast.error(`Webhook test failed: ${failedResults[0].error || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      console.error('Webhook test error:', error);
      toast.error("Failed to send test webhook", {
        description: error.message || "Please check your configuration and try again",
      });
    } finally {
      setTestingIntegrationId(null);
    }
  };

  const handleDeleteIntegration = async (id: string) => {
    await deleteIntegration.mutateAsync(id);
  };

  const handleToggleIntegration = async (id: string, enabled: boolean) => {
    await toggleIntegration.mutateAsync({ id, enabled });
  };

  const handleSaveConfig = async () => {
    if (selectedIntegration) {
      await updateIntegration.mutateAsync({
        id: selectedIntegration.id,
        updates: { config: configValues },
      });
      setIsConfigDialogOpen(false);
      setSelectedIntegration(null);
      setConfigValues({});
      toast.success("Configuration saved");
    }
  };

  const openConfigDialog = (integration: Integration) => {
    setSelectedIntegration(integration);
    setConfigValues(integration.config as Record<string, string>);
    setIsConfigDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Connected</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Disconnected</Badge>;
    }
  };

  const formatLastSync = (lastSyncAt: string | null) => {
    if (!lastSyncAt) return null;
    return formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Connect and manage external platforms and services
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Integration
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Integration</DialogTitle>
              <DialogDescription>
                Choose an integration type and configure it to connect with external services.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Integration Name</Label>
                <Input
                  placeholder="My Integration"
                  value={newIntegrationName}
                  onChange={(e) => setNewIntegrationName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Integration Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {INTEGRATION_TEMPLATES.map((template) => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-all ${
                        selectedTemplate?.id === template.id
                          ? "ring-2 ring-primary"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => {
                        setSelectedTemplate(template);
                        setConfigValues({});
                      }}
                    >
                      <CardContent className="p-3 flex items-start gap-3">
                        <template.icon className="h-5 w-5 text-primary mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              {selectedTemplate && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium">Configuration</Label>
                  {selectedTemplate.fields.map((field) => (
                    <div key={field} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground capitalize">
                        {field.replace(/([A-Z])/g, " $1").trim()}
                      </Label>
                      <Input
                        type={field.toLowerCase().includes("password") || field.toLowerCase().includes("secret") || field.toLowerCase().includes("key") || field.toLowerCase().includes("token") ? "password" : "text"}
                        placeholder={`Enter ${field}`}
                        value={configValues[field] || ""}
                        onChange={(e) => setConfigValues({ ...configValues, [field]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddIntegration}
                disabled={createIntegration.isPending}
              >
                {createIntegration.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Integration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Integrations ({integrations.length})</TabsTrigger>
          <TabsTrigger value="available">Available Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {integrations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Plug className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No integrations configured</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first integration to connect with external services
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Integration
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {integrations.map((integration) => {
                const IconComponent = getIconForType(integration.type);
                return (
                  <Card key={integration.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <IconComponent className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{integration.name}</h3>
                              {getStatusBadge(integration.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {integration.last_sync_at 
                                ? `Last sync: ${formatLastSync(integration.last_sync_at)}`
                                : "Never synced"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={integration.status === "connected"}
                            onCheckedChange={(checked) => handleToggleIntegration(integration.id, checked)}
                            disabled={toggleIntegration.isPending}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTestConnection(integration)}
                            disabled={testingIntegrationId === integration.id}
                            title="Send test webhook"
                          >
                            {testingIntegrationId === integration.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openConfigDialog(integration)}
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteIntegration(integration.id)}
                            disabled={deleteIntegration.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRATION_TEMPLATES.map((template) => (
              <Card key={template.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <template.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {template.description}
                  </CardDescription>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSelectedTemplate(template);
                      setIsAddDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Configure
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure {selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Update the configuration for this integration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedIntegration && Object.entries(selectedIntegration.config as Record<string, string>).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <Label className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets[key] ? "text" : (key.toLowerCase().includes("password") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("key") || key.toLowerCase().includes("token") ? "password" : "text")}
                    value={configValues[key] || ""}
                    onChange={(e) => setConfigValues({ ...configValues, [key]: e.target.value })}
                  />
                  {(key.toLowerCase().includes("password") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("key") || key.toLowerCase().includes("token")) && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSecrets({ ...showSecrets, [key]: !showSecrets[key] })}
                      >
                        {showSecrets[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(configValues[key] || "");
                          toast.success("Copied to clipboard");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveConfig}
              disabled={updateIntegration.isPending}
            >
              {updateIntegration.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
