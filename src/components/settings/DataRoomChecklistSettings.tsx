import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, FileCheck, ShieldAlert, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataRoomChecklist, ChecklistItem, ChecklistItemInsert } from '@/hooks/useDataRoomChecklist';
import { useChecklistCategories, ChecklistCategory, CategoryIcon, CategoryColor, getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { CategoryIconPicker, getCategoryIcon } from './CategoryIconPicker';
import { CategoryColorPicker } from './CategoryColorPicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCompany } from '@/hooks/useCompany';

interface DataRoomChecklistSettingsProps {
  embedded?: boolean;
}

export function DataRoomChecklistSettings({ embedded = false }: DataRoomChecklistSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { items, loading: itemsLoading, addItem, updateItem, deleteItem, reorderItems } = useDataRoomChecklist();
  const { categories, categoryNames, loading: categoriesLoading, addCategory, updateCategory, deleteCategory, reorderCategories, getCategoryByName } = useChecklistCategories();
  const { isAdmin } = useCompany();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ChecklistItemInsert>({
    name: '',
    category: '',
    description: '',
    is_required: true,
  });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Category management state
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChecklistCategory | null>(null);
  const [deleteCategoryConfirmId, setDeleteCategoryConfirmId] = useState<string | null>(null);
  const [categoryFormData, setCategoryFormData] = useState<{ name: string; icon: CategoryIcon; color: CategoryColor }>({ 
    name: '', 
    icon: 'folder', 
    color: 'gray' 
  });
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);

  const loading = itemsLoading || categoriesLoading;

  const resetForm = () => {
    setFormData({ name: '', category: categoryNames[0] || '', description: '', is_required: true });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (item: ChecklistItem) => {
    setFormData({
      name: item.name,
      category: item.category || '',
      description: item.description || '',
      is_required: item.is_required,
    });
    setEditingItem(item);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (editingItem) {
      const success = await updateItem(editingItem.id, formData);
      if (success) {
        toast.success('Checklist item updated');
        setEditingItem(null);
      }
    } else {
      const result = await addItem(formData);
      if (result) {
        toast.success('Checklist item added');
        setIsAddDialogOpen(false);
      }
    }
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    const success = await deleteItem(deleteConfirmId);
    if (success) {
      toast.success('Checklist item deleted');
    }
    setDeleteConfirmId(null);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    
    reorderItems(newItems);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Category handlers
  const handleOpenAddCategory = () => {
    setCategoryFormData({ name: '', icon: 'folder', color: 'gray' });
    setIsAddCategoryDialogOpen(true);
  };

  const handleOpenEditCategory = (category: ChecklistCategory) => {
    setCategoryFormData({ 
      name: category.name, 
      icon: category.icon || 'folder', 
      color: category.color || 'gray' 
    });
    setEditingCategory(category);
  };

  const handleSaveCategory = async () => {
    if (!categoryFormData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    if (editingCategory) {
      const success = await updateCategory(editingCategory.id, {
        name: categoryFormData.name,
        icon: categoryFormData.icon,
        color: categoryFormData.color,
      });
      if (success) {
        toast.success('Category updated');
        setEditingCategory(null);
      }
    } else {
      const result = await addCategory(categoryFormData.name, categoryFormData.icon, categoryFormData.color);
      if (result) {
        toast.success('Category added');
        setIsAddCategoryDialogOpen(false);
      }
    }
    setCategoryFormData({ name: '', icon: 'folder', color: 'gray' });
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryConfirmId) return;
    const success = await deleteCategory(deleteCategoryConfirmId);
    if (success) {
      toast.success('Category deleted');
    }
    setDeleteCategoryConfirmId(null);
  };

  const handleCategoryDragStart = (index: number) => {
    setDraggedCategoryIndex(index);
  };

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === index) return;

    const newCategories = [...categories];
    const [draggedCategory] = newCategories.splice(draggedCategoryIndex, 1);
    newCategories.splice(index, 0, draggedCategory);
    
    reorderCategories(newCategories);
    setDraggedCategoryIndex(index);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryIndex(null);
  };

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const itemCategories = Object.keys(groupedItems).sort((a, b) => 
    a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)
  );

  const requiredCount = items.filter(i => i.is_required).length;

  const innerContent = (
        <Tabs defaultValue="items" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="items">Checklist Items</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
          {/* Re-render existing TabsContent from original lines 259-428 */}
        </Tabs>
  );

  // We need the actual inner content, so let me just do the conditional wrap approach
  return (
    <>
    {embedded ? (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Define the standard information required for all deals. {items.length} items ({requiredCount} required)
          {!isAdmin && (
            <span className="block mt-1">Only company admins can edit the default checklist.</span>
          )}
        </p>
        <Tabs defaultValue="items" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="items">Checklist Items</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
    ) : (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>

      {/* Add/Edit Item Dialog */}
      <Dialog 
        open={isAddDialogOpen || !!editingItem} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingItem(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Checklist Item' : 'Add Checklist Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Item Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Financial Statements"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => {
                    const colorClasses = getCategoryColorClasses(cat.color);
                    const IconComp = getCategoryIcon(cat.icon);
                    return (
                      <SelectItem key={cat.id} value={cat.name}>
                        <div className="flex items-center gap-2">
                          <IconComp className={cn("h-4 w-4", colorClasses.textClass)} />
                          <span>{cat.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Additional details about what's needed..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_required"
                checked={formData.is_required}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, is_required: checked === true }))
                }
              />
              <Label htmlFor="is_required" className="cursor-pointer">
                Required item
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingItem(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Category Dialog */}
      <Dialog 
        open={isAddCategoryDialogOpen || !!editingCategory} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddCategoryDialogOpen(false);
            setEditingCategory(null);
            setCategoryFormData({ name: '', icon: 'folder', color: 'gray' });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">Category Name *</Label>
              <Input
                id="categoryName"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Legal Documents"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <CategoryIconPicker 
                value={categoryFormData.icon} 
                onChange={(icon) => setCategoryFormData(prev => ({ ...prev, icon }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <CategoryColorPicker 
                value={categoryFormData.color} 
                onChange={(color) => setCategoryFormData(prev => ({ ...prev, color }))} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddCategoryDialogOpen(false);
                setEditingCategory(null);
                setCategoryFormData({ name: '', icon: 'folder', color: 'gray' });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCategory}>
              {editingCategory ? 'Save Changes' : 'Add Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete checklist item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from your checklist template. Existing deal checklist data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deleteCategoryConfirmId} onOpenChange={() => setDeleteCategoryConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the category. Items using this category will show as "Uncategorized".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
