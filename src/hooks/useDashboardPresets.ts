import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from '@/hooks/use-toast';

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  config: Record<string, any>;
}

export interface DashboardPreset {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  grid_config: GridItem[];
  widgets_config: WidgetConfig[];
  settings: Record<string, any>;
  position: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_GRID: GridItem[] = [
  { i: 'my-deals', x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
  { i: 'my-tasks', x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
  { i: 'email-intelligence', x: 0, y: 6, w: 12, h: 4, minW: 3, minH: 2 },
];

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'my-deals', type: 'my-deals', title: 'My Deals', config: { maxItems: 10, variant: 'expanded' } },
  { id: 'my-tasks', type: 'my-tasks', title: 'My Tasks', config: { variant: 'expanded' } },
  { id: 'email-intelligence', type: 'email-intelligence', title: 'Email Intelligence', config: {} },
];

export function useDashboardPresets() {
  const { company, isAdmin, isOwner } = useCompany();
  const canEdit = !!company?.id; // All company members can edit global dashboard layouts
  const [presets, setPresets] = useState<DashboardPreset[]>([]);
  const [activePreset, setActivePreset] = useState<DashboardPreset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPresets = useCallback(async () => {
    if (!company?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('*')
        .eq('company_id', company.id)
        .order('position', { ascending: true });

      if (error) throw error;

      const mapped: DashboardPreset[] = (data || []).map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        is_active: d.is_active,
        grid_config: (d.grid_config as any) || [],
        widgets_config: (d.widgets_config as any) || [],
        settings: (d.settings as any) || {},
        position: d.position,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));

      if (mapped.length === 0 && canEdit) {
        const defaultPreset = await createPreset('My Dashboard', DEFAULT_GRID, DEFAULT_WIDGETS, true);
        if (defaultPreset) {
          setPresets([defaultPreset]);
          setActivePreset(defaultPreset);
        }
      } else {
        setPresets(mapped);
        setActivePreset(mapped.find(p => p.is_active) || mapped[0]);
      }
    } catch (error) {
      console.error('Error fetching presets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id, canEdit]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const createPreset = useCallback(async (
    name: string,
    gridConfig: GridItem[] = DEFAULT_GRID,
    widgetsConfig: WidgetConfig[] = DEFAULT_WIDGETS,
    isActive: boolean = false
  ): Promise<DashboardPreset | null> => {
    if (!company?.id || !canEdit) {
      toast({ title: 'Permission denied', description: 'Only admins can create dashboard presets.', variant: 'destructive' });
      return null;
    }
    try {
      if (isActive) {
        await supabase
          .from('dashboard_layouts')
          .update({ is_active: false })
          .eq('company_id', company.id);
      }

      const { data, error } = await supabase
        .from('dashboard_layouts')
        .insert({
          company_id: company.id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          name,
          is_active: isActive,
          grid_config: gridConfig as any,
          widgets_config: widgetsConfig as any,
          settings: {} as any,
          position: presets.length,
        })
        .select()
        .single();

      if (error) throw error;

      const preset: DashboardPreset = {
        id: data.id,
        name: data.name,
        description: data.description,
        is_active: data.is_active,
        grid_config: (data.grid_config as any) || [],
        widgets_config: (data.widgets_config as any) || [],
        settings: (data.settings as any) || {},
        position: data.position,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      setPresets(prev => [...prev, preset]);
      if (isActive) setActivePreset(preset);

      return preset;
    } catch (error) {
      console.error('Error creating preset:', error);
      toast({ title: 'Error', description: 'Failed to create preset', variant: 'destructive' });
      return null;
    }
  }, [company?.id, canEdit, presets.length]);

  const updatePreset = useCallback(async (
    presetId: string,
    updates: Partial<Pick<DashboardPreset, 'name' | 'description' | 'grid_config' | 'widgets_config' | 'settings'>>
  ) => {
    if (!company?.id || !canEdit) return;
    setIsSaving(true);
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.grid_config !== undefined) dbUpdates.grid_config = updates.grid_config;
      if (updates.widgets_config !== undefined) dbUpdates.widgets_config = updates.widgets_config;
      if (updates.settings !== undefined) dbUpdates.settings = updates.settings;

      const { error } = await supabase
        .from('dashboard_layouts')
        .update(dbUpdates)
        .eq('id', presetId)
        .eq('company_id', company.id);

      if (error) throw error;

      setPresets(prev => prev.map(p => p.id === presetId ? { ...p, ...updates } : p));
      if (activePreset?.id === presetId) {
        setActivePreset(prev => prev ? { ...prev, ...updates } : prev);
      }
    } catch (error) {
      console.error('Error updating preset:', error);
      toast({ title: 'Error', description: 'Failed to save layout', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [company?.id, canEdit, activePreset]);

  const switchPreset = useCallback(async (presetId: string) => {
    if (!company?.id || !canEdit) return;
    try {
      await supabase
        .from('dashboard_layouts')
        .update({ is_active: false })
        .eq('company_id', company.id);

      await supabase
        .from('dashboard_layouts')
        .update({ is_active: true })
        .eq('id', presetId)
        .eq('company_id', company.id);

      setPresets(prev => prev.map(p => ({ ...p, is_active: p.id === presetId })));
      setActivePreset(presets.find(p => p.id === presetId) || null);
    } catch (error) {
      console.error('Error switching preset:', error);
    }
  }, [company?.id, canEdit, presets]);

  const deletePreset = useCallback(async (presetId: string) => {
    if (!company?.id || !canEdit || presets.length <= 1) {
      toast({ title: 'Cannot delete', description: presets.length <= 1 ? 'You must keep at least one dashboard preset.' : 'Only admins can delete presets.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('dashboard_layouts')
        .delete()
        .eq('id', presetId)
        .eq('company_id', company.id);

      if (error) throw error;

      const remaining = presets.filter(p => p.id !== presetId);
      setPresets(remaining);

      if (activePreset?.id === presetId) {
        const next = remaining[0];
        if (next) {
          await switchPreset(next.id);
        }
      }

      toast({ title: 'Deleted', description: 'Dashboard preset removed.' });
    } catch (error) {
      console.error('Error deleting preset:', error);
    }
  }, [company?.id, canEdit, presets, activePreset, switchPreset]);

  const duplicatePreset = useCallback(async (presetId: string) => {
    const source = presets.find(p => p.id === presetId);
    if (!source) return;
    return createPreset(
      `${source.name} (copy)`,
      source.grid_config,
      source.widgets_config,
      false
    );
  }, [presets, createPreset]);

  const addWidgetToPreset = useCallback(async (widget: WidgetConfig) => {
    if (!activePreset) return;
    const maxY = activePreset.grid_config.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const newGridItem: GridItem = {
      i: widget.id,
      x: 0,
      y: maxY,
      w: 6,
      h: 4,
      minW: 3,
      minH: 2,
    };
    await updatePreset(activePreset.id, {
      grid_config: [...activePreset.grid_config, newGridItem],
      widgets_config: [...activePreset.widgets_config, widget],
    });
  }, [activePreset, updatePreset]);

  const removeWidgetFromPreset = useCallback(async (widgetId: string) => {
    if (!activePreset) return;
    await updatePreset(activePreset.id, {
      grid_config: activePreset.grid_config.filter(g => g.i !== widgetId),
      widgets_config: activePreset.widgets_config.filter(w => w.id !== widgetId),
    });
  }, [activePreset, updatePreset]);

  return {
    presets,
    activePreset,
    isLoading,
    isSaving,
    canEdit,
    createPreset,
    updatePreset,
    switchPreset,
    deletePreset,
    duplicatePreset,
    addWidgetToPreset,
    removeWidgetFromPreset,
    refreshPresets: fetchPresets,
  };
}
