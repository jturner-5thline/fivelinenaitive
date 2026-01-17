import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FlaskConical, Rocket, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  useFeatureFlags,
  useUpdateFeatureFlag,
  useCreateFeatureFlag,
  FeatureStatus,
} from "@/hooks/useFeatureFlags";

const statusConfig: Record<
  FeatureStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  deployed: {
    label: "Deployed",
    variant: "default",
    icon: <Rocket className="h-3 w-3" />,
  },
  staging: {
    label: "Staging",
    variant: "secondary",
    icon: <FlaskConical className="h-3 w-3" />,
  },
  disabled: {
    label: "Disabled",
    variant: "outline",
    icon: <Ban className="h-3 w-3" />,
  },
};

export const FeatureFlagsTable = () => {
  const { data: flags, isLoading } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const createFlag = useCreateFeatureFlag();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newFeature, setNewFeature] = useState({
    name: "",
    description: "",
    status: "disabled" as FeatureStatus,
  });

  const handleStatusChange = async (id: string, status: FeatureStatus) => {
    try {
      await updateFlag.mutateAsync({ id, status });
      toast.success(`Feature status updated to ${status}`);
    } catch (error) {
      toast.error("Failed to update feature status");
    }
  };

  const handleCreate = async () => {
    if (!newFeature.name.trim()) {
      toast.error("Feature name is required");
      return;
    }

    try {
      await createFlag.mutateAsync({
        name: newFeature.name.toLowerCase().replace(/\s+/g, "_"),
        description: newFeature.description || undefined,
        status: newFeature.status,
      });
      toast.success("Feature created successfully");
      setIsCreateOpen(false);
      setNewFeature({ name: "", description: "", status: "disabled" });
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("A feature with this name already exists");
      } else {
        toast.error("Failed to create feature");
      }
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <strong>Disabled:</strong> Feature is off for everyone
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Staging:</strong> Only 5thLine admins can test
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Deployed:</strong> Available to all nAItive users
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Feature
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Feature Flag</DialogTitle>
              <DialogDescription>
                Create a new feature flag to control access to functionality.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Feature Name</label>
                <Input
                  placeholder="e.g., new_dashboard"
                  value={newFeature.name}
                  onChange={(e) =>
                    setNewFeature({ ...newFeature, name: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Will be converted to snake_case
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe what this feature does..."
                  value={newFeature.description}
                  onChange={(e) =>
                    setNewFeature({ ...newFeature, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Initial Status</label>
                <Select
                  value={newFeature.status}
                  onValueChange={(value: FeatureStatus) =>
                    setNewFeature({ ...newFeature, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="staging">Staging (5thLine only)</SelectItem>
                    <SelectItem value="deployed">Deployed (All users)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createFlag.isPending}>
                Create Feature
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Feature</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No feature flags configured
              </TableCell>
            </TableRow>
          ) : (
            flags?.map((flag) => {
              const config = statusConfig[flag.status];
              return (
                <TableRow key={flag.id}>
                  <TableCell className="font-mono text-sm">{flag.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">
                    {flag.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={flag.status}
                      onValueChange={(value: FeatureStatus) =>
                        handleStatusChange(flag.id, value)
                      }
                    >
                      <SelectTrigger className="w-[160px]">
                        <div className="flex items-center gap-2">
                          <Badge variant={config.variant} className="gap-1">
                            {config.icon}
                            {config.label}
                          </Badge>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">
                          <div className="flex items-center gap-2">
                            <Ban className="h-3 w-3" />
                            Disabled
                          </div>
                        </SelectItem>
                        <SelectItem value="staging">
                          <div className="flex items-center gap-2">
                            <FlaskConical className="h-3 w-3" />
                            Staging (5thLine only)
                          </div>
                        </SelectItem>
                        <SelectItem value="deployed">
                          <div className="flex items-center gap-2">
                            <Rocket className="h-3 w-3" />
                            Deployed (All users)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(flag.updated_at), "MMM d, yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
