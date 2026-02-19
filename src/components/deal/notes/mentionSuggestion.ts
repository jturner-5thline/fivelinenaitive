import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance } from 'tippy.js';
import { MentionList, type MentionItem } from './MentionList';
import { supabase } from '@/integrations/supabase/client';

const mentionSuggestion = {
  items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase.rpc('get_team_members_for_mention', {
        _user_id: user.id,
      });

      if (error) {
        console.error('Error fetching team members:', error);
        return [];
      }

      const members = (data || []) as MentionItem[];

      // Filter by query
      const lowerQuery = query.toLowerCase();
      return members.filter((m) => {
        const name = (m.display_name || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const first = (m.first_name || '').toLowerCase();
        const last = (m.last_name || '').toLowerCase();
        return (
          name.includes(lowerQuery) ||
          email.includes(lowerQuery) ||
          first.includes(lowerQuery) ||
          last.includes(lowerQuery)
        );
      }).slice(0, 8);
    } catch {
      return [];
    }
  },

  render: () => {
    let component: ReactRenderer | null = null;
    let popup: Instance[] | null = null;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = (tippy as any)('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        component?.updateProps(props);
        if (!props.clientRect) return;
        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide();
          return true;
        }
        return (component?.ref as any)?.onKeyDown(props);
      },

      onExit() {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};

export default mentionSuggestion;
