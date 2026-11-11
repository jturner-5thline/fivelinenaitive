import Image from '@tiptap/extension-image';

/** Short-lived lifetime for note image signed URLs (seconds). */
export const NOTE_IMAGE_URL_TTL = 60 * 60;
export const NOTE_IMAGE_BUCKET = 'deal-space';

/** Extract a deal-space storage path from a stored attribute or a legacy signed URL. */
export function noteImageStoragePath(src: string | null | undefined, storagePath?: string | null): string | null {
  if (storagePath) return storagePath;
  if (!src) return null;
  const m = src.match(/\/storage\/v1\/object\/sign\/deal-space\/([^?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** Image node that remembers its storage path so URLs can be re-signed on load. */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storagePath: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-storage-path'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.storagePath ? { 'data-storage-path': attrs.storagePath } : {},
      },
    };
  },
});
