import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DealSpaceConversation {
  id: string;
  deal_id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealSpaceMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: string[] | null;
  created_at: string;
}

export function useDealSpaceConversations(dealId: string | undefined) {
  const [conversations, setConversations] = useState<DealSpaceConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!dealId) return;
    
    try {
      const { data, error } = await supabase
        .from('deal_space_conversations' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations((data as unknown as DealSpaceConversation[]) || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Create a new conversation
  const createConversation = useCallback(async (title?: string): Promise<DealSpaceConversation | null> => {
    if (!dealId) return null;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('deal_space_conversations' as any)
        .insert({
          deal_id: dealId,
          user_id: user.id,
          title: title || 'New Conversation',
        })
        .select()
        .single();

      if (error) throw error;
      
      const newConvo = data as unknown as DealSpaceConversation;
      setConversations(prev => [newConvo, ...prev]);
      return newConvo;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive',
      });
      return null;
    }
  }, [dealId]);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('deal_space_conversations' as any)
        .delete()
        .eq('id', conversationId);

      if (error) throw error;
      
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      toast({ title: 'Conversation deleted' });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    }
  }, []);

  // Update conversation title
  const updateConversationTitle = useCallback(async (conversationId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('deal_space_conversations' as any)
        .update({ title })
        .eq('id', conversationId);

      if (error) throw error;
      
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title } : c)
      );
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  }, []);

  // Load messages for a conversation
  const loadConversationMessages = useCallback(async (conversationId: string): Promise<DealSpaceMessage[]> => {
    try {
      const { data, error } = await supabase
        .from('deal_space_messages' as any)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as unknown as DealSpaceMessage[]) || [];
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  }, []);

  // Save a message
  const saveMessage = useCallback(async (
    conversationId: string, 
    role: 'user' | 'assistant', 
    content: string, 
    sources?: string[]
  ): Promise<DealSpaceMessage | null> => {
    try {
      const { data, error } = await supabase
        .from('deal_space_messages' as any)
        .insert({
          conversation_id: conversationId,
          role,
          content,
          sources: sources || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Update conversation's updated_at
      await supabase
        .from('deal_space_conversations' as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      
      return data as unknown as DealSpaceMessage;
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  }, []);

  return {
    conversations,
    isLoading,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    loadConversationMessages,
    saveMessage,
    refetch: fetchConversations,
  };
}
