import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type CategoryColor = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'cyan' | 'gray' | 'orange';
export type CategoryIcon = 'folder' | 'file-text' | 'dollar-sign' | 'file-check' | 'briefcase' | 'clipboard' | 'archive' | 'files';

export const CATEGORY_COLORS: { value: CategoryColor; label: string; bgClass: string; textClass: string }[] = [
  { value: 'blue', label: 'Blue', bgClass: 'bg-blue-100 dark:bg-blue-950/50', textClass: 'text-blue-600 dark:text-blue-400' },
  { value: 'green', label: 'Green', bgClass: 'bg-green-100 dark:bg-green-950/50', textClass: 'text-green-600 dark:text-green-400' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-100 dark:bg-purple-950/50', textClass: 'text-purple-600 dark:text-purple-400' },
  { value: 'amber', label: 'Amber', bgClass: 'bg-amber-100 dark:bg-amber-950/50', textClass: 'text-amber-600 dark:text-amber-400' },
  { value: 'pink', label: 'Pink', bgClass: 'bg-pink-100 dark:bg-pink-950/50', textClass: 'text-pink-600 dark:text-pink-400' },
  { value: 'cyan', label: 'Cyan', bgClass: 'bg-cyan-100 dark:bg-cyan-950/50', textClass: 'text-cyan-600 dark:text-cyan-400' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-100 dark:bg-orange-950/50', textClass: 'text-orange-600 dark:text-orange-400' },
  { value: 'gray', label: 'Gray', bgClass: 'bg-gray-100 dark:bg-gray-800/50', textClass: 'text-gray-600 dark:text-gray-400' },
];

export const CATEGORY_ICONS: { value: CategoryIcon; label: string }[] = [
  { value: 'folder', label: 'Folder' },
  { value: 'file-text', label: 'Document' },
  { value: 'dollar-sign', label: 'Financial' },
  { value: 'file-check', label: 'Agreement' },
  { value: 'briefcase', label: 'Business' },
  { value: 'clipboard', label: 'Clipboard' },
  { value: 'archive', label: 'Archive' },
  { value: 'files', label: 'Files' },
];

export interface ChecklistCategory {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
  position: number;
  created_at: string;
  updated_at: string;
}

interface DefaultCategory {
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Materials', icon: 'folder', color: 'blue' },
  { name: 'Financials', icon: 'dollar-sign', color: 'green' },
  { name: 'Agreements', icon: 'file-check', color: 'purple' },
  { name: 'Other', icon: 'files', color: 'gray' },
];

export function getCategoryColorClasses(color: CategoryColor | string) {
  const found = CATEGORY_COLORS.find(c => c.value === color);
  return found || CATEGORY_COLORS.find(c => c.value === 'gray')!;
}

export function useChecklistCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('data_room_checklist_categories')
        .select('*')
        .order('position', { ascending: true });

      if (error) throw error;
      
      // If no categories exist, seed with defaults
      if (!data || data.length === 0) {
        await seedDefaultCategories();
      } else {
        setCategories(data as ChecklistCategory[]);
      }
    } catch (err) {
      console.error('Error fetching checklist categories:', err);
      toast.error('Failed to load checklist categories');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const seedDefaultCategories = async () => {
    if (!user) return;

    try {
      const inserts = DEFAULT_CATEGORIES.map((cat, index) => ({
        user_id: user.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        position: index,
      }));

      const { data, error } = await supabase
        .from('data_room_checklist_categories')
        .insert(inserts)
        .select();

      if (error) throw error;
      setCategories((data as ChecklistCategory[]) || []);
    } catch (err) {
      console.error('Error seeding default categories:', err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = async (name: string, icon: CategoryIcon = 'folder', color: CategoryColor = 'gray'): Promise<ChecklistCategory | null> => {
    if (!user) return null;

    try {
      const position = categories.length;
      const { data, error } = await supabase
        .from('data_room_checklist_categories')
        .insert({ user_id: user.id, name, icon, color, position })
        .select()
        .single();

      if (error) throw error;
      
      const newCategory = data as ChecklistCategory;
      setCategories(prev => [...prev, newCategory]);
      return newCategory;
    } catch (err) {
      console.error('Error adding category:', err);
      toast.error('Failed to add category');
      return null;
    }
  };

  const updateCategory = async (id: string, updates: { name?: string; icon?: CategoryIcon; color?: CategoryColor }): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_checklist_categories')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setCategories(prev => prev.map(cat => 
        cat.id === id ? { ...cat, ...updates } : cat
      ));
      return true;
    } catch (err) {
      console.error('Error updating category:', err);
      toast.error('Failed to update category');
      return false;
    }
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_checklist_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setCategories(prev => prev.filter(cat => cat.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting category:', err);
      toast.error('Failed to delete category');
      return false;
    }
  };

  const reorderCategories = async (reorderedCategories: ChecklistCategory[]): Promise<boolean> => {
    try {
      const updates = reorderedCategories.map((cat, index) => ({
        id: cat.id,
        position: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('data_room_checklist_categories')
          .update({ position: update.position })
          .eq('id', update.id);
        if (error) throw error;
      }

      setCategories(reorderedCategories.map((cat, index) => ({ ...cat, position: index })));
      return true;
    } catch (err) {
      console.error('Error reordering categories:', err);
      toast.error('Failed to reorder categories');
      return false;
    }
  };

  // Get category names as a simple array for dropdowns
  const categoryNames = categories.map(c => c.name);

  // Get a category by name
  const getCategoryByName = (name: string) => categories.find(c => c.name === name);

  return {
    categories,
    categoryNames,
    loading,
    fetchCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    getCategoryByName,
  };
}
