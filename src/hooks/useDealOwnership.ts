import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DealOwner {
  id: string;
  owner_name: string;
  ownership_percentage: number;
  position: number;
}

const MAX_OWNERS = 5;

export function useDealOwnership(dealId: string | undefined) {
  const [owners, setOwners] = useState<DealOwner[]>([]);
  const [totalEquityRaised, setTotalEquityRaisedState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchOwners = useCallback(async () => {
    if (!dealId) {
      setOwners([]);
      setTotalEquityRaisedState('');
      setIsLoading(false);
      return;
    }

    try {
      // Fetch ownership data
      const { data, error } = await supabase
        .from('deal_ownership')
        .select('id, owner_name, ownership_percentage, position')
        .eq('deal_id', dealId)
        .order('position', { ascending: true });

      if (error) throw error;
      
      setOwners(data?.map(d => ({
        id: d.id,
        owner_name: d.owner_name,
        ownership_percentage: Number(d.ownership_percentage),
        position: d.position,
      })) || []);

      // Fetch total equity raised from deal_writeups
      const { data: writeupData, error: writeupError } = await supabase
        .from('deal_writeups')
        .select('total_equity_raised')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (writeupError) throw writeupError;
      setTotalEquityRaisedState(writeupData?.total_equity_raised || '');
    } catch (error) {
      console.error('Error fetching ownership:', error);
      toast({
        title: 'Error',
        description: 'Failed to load ownership data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  const addOwner = useCallback(async (ownerName: string, percentage: number) => {
    if (!dealId) return null;
    if (owners.length >= MAX_OWNERS) {
      toast({
        title: 'Maximum owners reached',
        description: `You can only add up to ${MAX_OWNERS} owners`,
        variant: 'destructive',
      });
      return null;
    }

    setIsSaving(true);
    try {
      const newPosition = owners.length;
      const { data, error } = await supabase
        .from('deal_ownership')
        .insert({
          deal_id: dealId,
          owner_name: ownerName,
          ownership_percentage: percentage,
          position: newPosition,
        })
        .select()
        .single();

      if (error) throw error;

      const newOwner: DealOwner = {
        id: data.id,
        owner_name: data.owner_name,
        ownership_percentage: Number(data.ownership_percentage),
        position: data.position,
      };

      setOwners(prev => [...prev, newOwner]);
      return newOwner;
    } catch (error) {
      console.error('Error adding owner:', error);
      toast({
        title: 'Error',
        description: 'Failed to add owner',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [dealId, owners.length]);

  const updateOwner = useCallback(async (ownerId: string, updates: Partial<Pick<DealOwner, 'owner_name' | 'ownership_percentage'>>) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('deal_ownership')
        .update(updates)
        .eq('id', ownerId);

      if (error) throw error;

      setOwners(prev => prev.map(o => 
        o.id === ownerId ? { ...o, ...updates } : o
      ));
    } catch (error) {
      console.error('Error updating owner:', error);
      toast({
        title: 'Error',
        description: 'Failed to update owner',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, []);

  const deleteOwner = useCallback(async (ownerId: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('deal_ownership')
        .delete()
        .eq('id', ownerId);

      if (error) throw error;

      setOwners(prev => prev.filter(o => o.id !== ownerId));
    } catch (error) {
      console.error('Error deleting owner:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete owner',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateTotalEquityRaised = useCallback(async (value: string) => {
    if (!dealId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('deal_writeups')
        .update({ total_equity_raised: value })
        .eq('deal_id', dealId);

      if (error) throw error;
      setTotalEquityRaisedState(value);
    } catch (error) {
      console.error('Error updating total equity raised:', error);
      toast({
        title: 'Error',
        description: 'Failed to update total equity raised',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [dealId]);

  const totalPercentage = owners.reduce((sum, o) => sum + o.ownership_percentage, 0);
  const canAddMore = owners.length < MAX_OWNERS;

  return {
    owners,
    isLoading,
    isSaving,
    addOwner,
    updateOwner,
    deleteOwner,
    totalPercentage,
    canAddMore,
    maxOwners: MAX_OWNERS,
    refresh: fetchOwners,
    totalEquityRaised,
    updateTotalEquityRaised,
  };
}
