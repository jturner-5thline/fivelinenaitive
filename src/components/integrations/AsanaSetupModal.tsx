import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";

interface AsanaSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

export function AsanaSetupModal({ open, onOpenChange, onConnected }: AsanaSetupModalProps) {
  const { user } = useAuth();
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!apiToken.trim()) {
      toast.error("Please enter your Asana Personal Access Token");
      return;
    }
    if (!user) return;

    setIsConnecting(true);
    try {
      // Test the token by calling the edge function
      const { data, error } = await supabase.functions.invoke("asana-proxy", {
        body: { action: "test", token: apiToken.trim() },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Invalid token");
      }

      // Store the integration in the integrations table
      const { error: dbError } = await supabase.from("integrations").insert({
        user_id: user.id,
        name: "Asana",
        type: "asana",
        status: "connected",
        config: { workspace_name: data.workspace_name || "Asana" },
        last_sync_at: new Date().toISOString(),
      });

      if (dbError) throw dbError;

      toast.success("Asana connected successfully!");
      setApiToken("");
      onOpenChange(false);
      onConnected();
    } catch (err: any) {
      toast.error("Failed to connect Asana", {
        description: err.message || "Please check your token and try again.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Asana</DialogTitle>
          <DialogDescription>
            Enter your Asana Personal Access Token to connect your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="asana-token">Personal Access Token</Label>
            <div className="relative">
              <Input
                id="asana-token"
                type={showToken ? "text" : "password"}
                placeholder="1/12345678901234:abcdef..."
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              To get your Personal Access Token:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to Asana Developer Console</li>
              <li>Click "Create new token"</li>
              <li>Give it a name and confirm</li>
              <li>Copy the token and paste it above</li>
            </ol>
            <a
              href="https://app.asana.com/0/my-apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open Asana Developer Console
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={isConnecting || !apiToken.trim()}>
              {isConnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
