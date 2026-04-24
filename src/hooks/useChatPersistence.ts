import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const ACTIVE_CONVERSATION_STORAGE_KEY = 'dashboardChat:activeConversationId';

function getStoredActiveConversationId(userId: string | undefined): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${ACTIVE_CONVERSATION_STORAGE_KEY}:${userId}`);
  } catch {
    return null;
  }
}

function setStoredActiveConversationId(userId: string | undefined, id: string | null) {
  if (!userId || typeof window === 'undefined') return;
  try {
    const key = `${ACTIVE_CONVERSATION_STORAGE_KEY}:${userId}`;
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

export function useChatPersistence() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [autoResumed, setAutoResumed] = useState(false);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for a conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data.map(m => ({ ...m, role: m.role as 'user' | 'assistant' })));
      setActiveConversationId(conversationId);
      setStoredActiveConversationId(user?.id, conversationId);
    }
    setLoadingHistory(false);
  }, [user?.id]);

  // Auto-resume the most recent conversation on mount / after refresh
  // so the user's Ask anything chat persists across page reloads and navigation.
  // Preference order:
  //   1. The conversation the user last had open (localStorage hint).
  //   2. Otherwise, their most recently updated conversation.
  // We only run this once per session and skip if a conversation is already active.
  useEffect(() => {
    if (!user || autoResumed) return;
    if (activeConversationId) return;
    if (conversations.length === 0) return;

    const storedId = getStoredActiveConversationId(user.id);
    const candidateId =
      (storedId && conversations.find(c => c.id === storedId)?.id) ||
      conversations[0]?.id;

    if (!candidateId) return;
    setAutoResumed(true);
    loadConversation(candidateId);
  }, [user, conversations, activeConversationId, autoResumed, loadConversation]);

  // Create new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!user) return null;
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : '');
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: user.id, title })
      .select('id')
      .single();
    if (error || !data) return null;
    setActiveConversationId(data.id);
    setStoredActiveConversationId(user.id, data.id);
    setAutoResumed(true);
    loadConversations();
    return data.id;
  }, [user, loadConversations]);

  // Save a message
  const saveMessage = useCallback(async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    await supabase.from('chat_messages').insert({ conversation_id: conversationId, role, content });
    // Touch conversation updated_at
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    await supabase.from('chat_conversations').delete().eq('id', conversationId);
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setStoredActiveConversationId(user?.id, null);
    }
    loadConversations();
  }, [activeConversationId, loadConversations, user?.id]);

  // Start new chat
  const startNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setStoredActiveConversationId(user?.id, null);
    // User explicitly asked for a fresh chat; don't auto-resume after this.
    setAutoResumed(true);
  }, [user?.id]);

  return {
    conversations,
    activeConversationId,
    messages,
    setMessages,
    loadingHistory,
    loadConversation,
    createConversation,
    saveMessage,
    deleteConversation,
    startNewChat,
    loadConversations,
  };
}
