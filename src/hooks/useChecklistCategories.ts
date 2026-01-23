import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ChecklistCategory {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CATEGORIES = ['Materials', 'Financials', 'Agreements', 'Other'];

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
      const inserts = DEFAULT_CATEGORIES.map((name, index) => ({
        user_id: user.id,
        name,
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

  const addCategory = async (name: string): Promise<ChecklistCategory | null> => {
    if (!user) return null;

    try {
      const position = categories.length;
      const { data, error } = await supabase
        .from('data_room_checklist_categories')
        .insert({ user_id: user.id, name, position })
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

  const updateCategory = async (id: string, name: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_checklist_categories')
        .update({ name })
        .eq('id', id);

      if (error) throw error;
      
      setCategories(prev => prev.map(cat => 
        cat.id === id ? { ...cat, name } : cat
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

  return {
    categories,
    categoryNames,
    loading,
    fetchCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };
}
