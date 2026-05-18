import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper } from "lucide-react";
import { BlogPostsTable } from "./blog/BlogPostsTable";
import { BlogPostEditor } from "./blog/BlogPostEditor";
import { BlogMediaLibrary } from "./blog/BlogMediaLibrary";

type View =
  | { kind: "list" }
  | { kind: "edit"; postId: string | null }
  | { kind: "media" };

type SubTab = "all" | "new" | "media";

type Props = { subTab: SubTab };

export function BlogManagementPanel({ subTab }: Props) {
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  // "new" sub-tab opens the editor with null (new post)
  if (subTab === "new" || (subTab === "all" && editing !== undefined)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            {editing ? "Edit Post" : "New Post"}
          </CardTitle>
          <CardDescription>
            Compose with the rich text editor. Save as draft, publish, or disable when needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BlogPostEditor
            postId={subTab === "new" ? null : editing ?? null}
            onClose={() => setEditing(undefined)}
          />
        </CardContent>
      </Card>
    );
  }

  if (subTab === "media") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Media Library
          </CardTitle>
          <CardDescription>Browse uploaded cover and inline images.</CardDescription>
        </CardHeader>
        <CardContent><BlogMediaLibrary /></CardContent>
      </Card>
    );
  }

  // All Posts
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          All Blog Posts
        </CardTitle>
        <CardDescription>
          Manage every blog post — draft, publish, disable, duplicate, or delete.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BlogPostsTable
          onEdit={(id) => setEditing(id)}
          onNew={() => setEditing(null)}
        />
      </CardContent>
    </Card>
  );
}