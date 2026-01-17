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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Edit, Megaphone, AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  Announcement,
} from "@/hooks/useAdminConfig";

const typeConfig = {
  info: { icon: Info, variant: "default" as const, label: "Info" },
  warning: { icon: AlertTriangle, variant: "secondary" as const, label: "Warning" },
  success: { icon: CheckCircle, variant: "default" as const, label: "Success" },
  error: { icon: XCircle, variant: "destructive" as const, label: "Error" },
};

export const AnnouncementsPanel = () => {
  const { data: announcements, isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "info" as Announcement["type"],
    is_active: true,
    show_from: "",
    show_until: "",
  });

  const resetForm = () => {
    setFormData({
      title: "",
      message: "",
      type: "info",
      is_active: true,
      show_from: "",
      show_until: "",
    });
    setEditingAnnouncement(null);
  };

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error("Title and message are required");
      return;
    }

    try {
      await createAnnouncement.mutateAsync({
        title: formData.title,
        message: formData.message,
        type: formData.type,
        is_active: formData.is_active,
        show_from: formData.show_from || null,
        show_until: formData.show_until || null,
        target_roles: null,
      });
      toast.success("Announcement created");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to create announcement");
    }
  };

  const handleUpdate = async () => {
    if (!editingAnnouncement) return;

    try {
      await updateAnnouncement.mutateAsync({
        id: editingAnnouncement.id,
        title: formData.title,
        message: formData.message,
        type: formData.type,
        is_active: formData.is_active,
        show_from: formData.show_from || null,
        show_until: formData.show_until || null,
      });
      toast.success("Announcement updated");
      setEditingAnnouncement(null);
      resetForm();
    } catch (error) {
      toast.error("Failed to update announcement");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncement.mutateAsync(id);
      toast.success("Announcement deleted");
    } catch (error) {
      toast.error("Failed to delete announcement");
    }
  };

  const openEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
      is_active: announcement.is_active,
      show_from: announcement.show_from ? announcement.show_from.split("T")[0] : "",
      show_until: announcement.show_until ? announcement.show_until.split("T")[0] : "",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const FormFields = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          placeholder="Announcement title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          placeholder="Announcement message..."
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value: Announcement["type"]) =>
              setFormData({ ...formData, type: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Active</Label>
          <div className="flex items-center h-10">
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Show From (optional)</Label>
          <Input
            type="date"
            value={formData.show_from}
            onChange={(e) => setFormData({ ...formData, show_from: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Show Until (optional)</Label>
          <Input
            type="date"
            value={formData.show_until}
            onChange={(e) => setFormData({ ...formData, show_until: e.target.value })}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Create banners and announcements visible to all users
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
              <DialogDescription>
                This announcement will be shown to all users when active
              </DialogDescription>
            </DialogHeader>
            <FormFields />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createAnnouncement.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingAnnouncement} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateAnnouncement.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {announcements?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No announcements yet
              </TableCell>
            </TableRow>
          ) : (
            announcements?.map((announcement) => {
              const config = typeConfig[announcement.type];
              const Icon = config.icon;
              return (
                <TableRow key={announcement.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{announcement.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={config.variant} className="gap-1">
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={announcement.is_active ? "default" : "outline"}>
                      {announcement.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {announcement.show_from || announcement.show_until ? (
                      <>
                        {announcement.show_from && format(new Date(announcement.show_from), "MMM d")}
                        {announcement.show_from && announcement.show_until && " - "}
                        {announcement.show_until && format(new Date(announcement.show_until), "MMM d")}
                      </>
                    ) : (
                      "Always"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(announcement.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(announcement)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this announcement?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(announcement.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
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
