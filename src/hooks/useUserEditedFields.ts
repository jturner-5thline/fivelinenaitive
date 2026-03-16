import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

type EditedFieldsMap = Record<string, boolean>;

export function useUserEditedFields(dealId: string | undefined) {
  const [editedFields, setEditedFields] = useState<EditedFieldsMap>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load edited fields from DB
  useEffect(() => {
    if (!dealId) {
      setEditedFields({});
      setIsLoaded(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('deal_writeups')
        .select('user_edited_fields')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (cancelled) return;
      if (!error && data?.user_edited_fields) {
        setEditedFields(data.user_edited_fields as unknown as EditedFieldsMap);
      } else {
        setEditedFields({});
      }
      setIsLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [dealId]);

  // Debounced persist to DB
  const persistEditedFields = useCallback((fields: EditedFieldsMap) => {
    if (!dealId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('deal_writeups')
        .update({ user_edited_fields: fields as unknown as Json })
        .eq('deal_id', dealId);
    }, 500);
  }, [dealId]);

  // Mark a field as user-edited
  const markFieldEdited = useCallback((fieldKey: string) => {
    setEditedFields(prev => {
      if (prev[fieldKey]) return prev; // already marked
      const next = { ...prev, [fieldKey]: true };
      persistEditedFields(next);
      return next;
    });
  }, [persistEditedFields]);

  // Check if a field has been user-edited
  const isFieldEdited = useCallback((fieldKey: string): boolean => {
    return !!editedFields[fieldKey];
  }, [editedFields]);

  // Get count of user-edited fields
  const editedCount = Object.values(editedFields).filter(Boolean).length;

  // Get list of edited field keys
  const editedFieldKeys = Object.keys(editedFields).filter(k => editedFields[k]);

  // Reset all flags (for "overwrite all" scenario)
  const resetAllFlags = useCallback(() => {
    setEditedFields({});
    if (dealId) {
      supabase
        .from('deal_writeups')
        .update({ user_edited_fields: {} as unknown as Json })
        .eq('deal_id', dealId);
    }
  }, [dealId]);

  // Reset specific flags
  const resetFlags = useCallback((fieldKeys: string[]) => {
    setEditedFields(prev => {
      const next = { ...prev };
      fieldKeys.forEach(k => delete next[k]);
      persistEditedFields(next);
      return next;
    });
  }, [persistEditedFields]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return {
    editedFields,
    isLoaded,
    markFieldEdited,
    isFieldEdited,
    editedCount,
    editedFieldKeys,
    resetAllFlags,
    resetFlags,
  };
}
