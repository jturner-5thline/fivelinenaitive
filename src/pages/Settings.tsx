import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Building2, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useLenders } from '@/contexts/LendersContext';
import { LenderStagesSettings } from '@/components/settings/LenderStagesSettings';
import { LenderSubstagesSettings } from '@/components/settings/LenderSubstagesSettings';

interface LenderForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  preferences: string;
}

const emptyForm: LenderForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  preferences: '',
};

export default function Settings() {
  const { lenders, addLender, updateLender, deleteLender } = useLenders();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLender, setEditingLender] = useState<string | null>(null);
  const [form, setForm] = useState<LenderForm>(emptyForm);

  const openAddDialog = () => {
    setEditingLender(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (lenderName: string) => {
    const lender = lenders.find(l => l.name === lenderName);
    if (lender) {
      setEditingLender(lenderName);
      setForm({
        name: lender.name,
        contactName: lender.contact.name,
        email: lender.contact.email,
        phone: lender.contact.phone,
        preferences: lender.preferences.join(', '),
      });
      setIsDialogOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Lender name is required', variant: 'destructive' });
      return;
    }

    const lenderData = {
      name: form.name.trim(),
      contact: {
        name: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
      preferences: form.preferences.split(',').map(p => p.trim()).filter(p => p),
    };

    if (editingLender) {
      updateLender(editingLender, lenderData);
      toast({ title: 'Lender updated', description: `${lenderData.name} has been updated.` });
    } else {
      if (lenders.some(l => l.name.toLowerCase() === lenderData.name.toLowerCase())) {
        toast({ title: 'Error', description: 'A lender with this name already exists', variant: 'destructive' });
        return;
      }
      addLender(lenderData);
      toast({ title: 'Lender added', description: `${lenderData.name} has been added.` });
    }

    setIsDialogOpen(false);
    setForm(emptyForm);
    setEditingLender(null);
  };

  const handleDelete = (name: string) => {
    deleteLender(name);
    toast({ title: 'Lender deleted', description: `${name} has been removed.` });
  };

  return (
    <>
      <Helmet>
        <title>Settings - nAItive</title>
        <meta name="description" content="Manage application settings and lender list" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>

          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="text-muted-foreground">Manage your application settings</p>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Lenders
                  </CardTitle>
                  <CardDescription>Manage the list of available lenders</CardDescription>
                </div>
                <Button onClick={openAddDialog} size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Lender
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lenders.map((lender) => (
                    <div
                      key={lender.name}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{lender.name}</p>
                        {lender.contact.name && (
                          <p className="text-sm text-muted-foreground truncate">
                            {lender.contact.name} • {lender.contact.email}
                          </p>
                        )}
                        {lender.preferences.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lender.preferences.slice(0, 3).map((pref, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {pref}
                              </Badge>
                            ))}
                            {lender.preferences.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{lender.preferences.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(lender.name)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {lender.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the lender from the available options. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(lender.name)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                  {lenders.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No lenders configured. Add one to get started.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <LenderStagesSettings />

            <LenderSubstagesSettings />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
                  Preferences
                </CardTitle>
                <CardDescription>Customize your personal preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to="/preferences"
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-medium">User Preferences</p>
                    <p className="text-sm text-muted-foreground">
                      Theme, notifications, and regional settings
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Add/Edit Lender Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLender ? 'Edit Lender' : 'Add Lender'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Lender Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter lender name"
                disabled={!!editingLender}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Primary contact name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 555-0100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferences">Deal Preferences</Label>
              <Input
                id="preferences"
                value={form.preferences}
                onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                placeholder="Comma-separated (e.g., $5M-$25M, SaaS, Tech)"
              />
              <p className="text-xs text-muted-foreground">Separate multiple preferences with commas</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingLender ? 'Save Changes' : 'Add Lender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
