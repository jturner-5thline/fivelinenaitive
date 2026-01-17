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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Mail, Code } from "lucide-react";
import { toast } from "sonner";
import { useEmailTemplates, useUpdateEmailTemplate, EmailTemplate } from "@/hooks/useAdminConfig";

export const EmailTemplatesPanel = () => {
  const { data: templates, isLoading } = useEmailTemplates();
  const updateTemplate = useUpdateEmailTemplate();

  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    subject: "",
    body_html: "",
    body_text: "",
    is_active: true,
  });

  const openEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text || "",
      is_active: template.is_active,
    });
  };

  const handleSave = async () => {
    if (!editingTemplate) return;

    try {
      await updateTemplate.mutateAsync({
        id: editingTemplate.id,
        subject: formData.subject,
        body_html: formData.body_html,
        body_text: formData.body_text || null,
        is_active: formData.is_active,
      });
      toast.success("Template updated");
      setEditingTemplate(null);
    } catch (error) {
      toast.error("Failed to update template");
    }
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Customize email templates sent by the system. Use {"{{variable_name}}"} syntax for dynamic content.
      </p>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Customize the email content. Available variables are shown below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Template Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Email subject..."
              />
            </div>
            <div className="space-y-2">
              <Label>Available Variables</Label>
              <div className="flex flex-wrap gap-2">
                {editingTemplate?.variables.map((v) => (
                  <Badge key={v} variant="outline" className="font-mono text-xs">
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>HTML Body</Label>
              <Textarea
                value={formData.body_html}
                onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                placeholder="<h1>Hello!</h1>..."
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Plain Text Body (fallback)</Label>
              <Textarea
                value={formData.body_text}
                onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
                placeholder="Hello!..."
                rows={5}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateTemplate.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Template Name</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Variables</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No email templates configured
              </TableCell>
            </TableRow>
          ) : (
            templates?.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{template.name}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {template.subject}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Code className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {template.variables.length} vars
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={template.is_active ? "default" : "secondary"}>
                    {template.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(template.updated_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(template)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
