# Blog Management CMS for Admin

Add a full blog CMS to the admin area with list/edit views, image uploads, rich text editing, and draft/published/disabled states.

## Database (Lovable Cloud)

New tables:
- `blog_posts` — title, slug (unique), excerpt, body_html, cover_image_url, cover_image_alt, author_id, status (draft|published|disabled), seo_title, seo_description, published_at, disabled_at, tags (text[]), created_at, updated_at
- `blog_categories` (optional initial seed)

RLS:
- SELECT: published posts public; drafts/disabled visible to admins only
- INSERT/UPDATE/DELETE: admins only (via existing `has_role(auth.uid(), 'admin')`)

Storage:
- New public bucket `blog-media` with folders `covers/` and `inline/`
- Policies: public read; admin write/update/delete

## UI

New admin section `blog` added to Admin.tsx sidebar nav (icon: `Newspaper`). Section component `BlogManagementPanel` with three sub-tabs:
1. **All Posts** — table (thumbnail, title, slug, status badge, author, updated, published) with search, status filter, and row actions: Edit, Duplicate, Publish/Unpublish, Disable/Enable, Delete (confirm).
2. **New Post** — form view (also used for Edit via `?postId=...`).
3. **Media Library** — simple grid of uploaded images from `blog-media` (basic; expandable later).

### Post editor

- Fields: title, slug (auto-generated from title, editable), excerpt, cover image upload + alt, tags input, author (defaults to current user), SEO title, SEO description, status, published date.
- Body: rich text editor using **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`) with toolbar: bold, italic, underline, strike, H1/H2/H3, bullet/ordered list, blockquote, link, alignment, image insert (uploads to `blog-media/inline/`), undo/redo, code block.
- Preview toggle renders the saved HTML inside a styled preview pane (sanitized via DOMPurify).
- Save as Draft / Publish / Update / Disable buttons; toast feedback; validation for required title, slug, body.

## Access control

Gate the Blog section in `Admin.tsx` behind existing admin role check (same as other admin panels).

## Files

- New: `src/components/admin/BlogManagementPanel.tsx`, `BlogPostsTable.tsx`, `BlogPostEditor.tsx`, `BlogRichTextEditor.tsx`, `BlogMediaLibrary.tsx`
- New hook: `src/hooks/useBlogPosts.ts`
- Edited: `src/pages/Admin.tsx` (add nav item + section render)
- Migration: create tables, RLS, storage bucket + policies
- Dependencies: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-*`, `dompurify`, `slugify`

## Notes

- Public blog rendering pages are out of scope for this task; the CMS produces data and a `/blog/:slug` consumer can be added later.
- Categories table is scaffolded but the Categories sub-tab is marked "coming soon" to keep this PR focused.
