import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Heading {
  level: number;
  text: string;
  pos: number;
}

interface NoteTOCProps {
  editor: Editor | null;
}

export function NoteTOC({ editor }: NoteTOCProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const items: Heading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          items.push({ level: node.attrs.level, text: node.textContent, pos });
        }
      });
      setHeadings(items);
    };
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  if (headings.length === 0) return null;

  return (
    <div className="relative">
      <button
        className="inline-flex items-center justify-center h-7 w-7 rounded-sm hover:bg-accent/80 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        title="Table of Contents"
      >
        <ListTree className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <div className="absolute top-8 left-0 z-50 w-56 bg-popover border rounded-md shadow-md p-2">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">Table of Contents</p>
          <ScrollArea className="max-h-48">
            {headings.map((h, i) => (
              <button
                key={i}
                className={cn(
                  "block w-full text-left text-xs py-1 px-1.5 rounded hover:bg-accent/50 transition-colors truncate",
                  h.level === 1 && "font-semibold",
                  h.level === 2 && "pl-4",
                  h.level === 3 && "pl-7 text-muted-foreground",
                )}
                onClick={() => {
                  editor?.chain().focus().setTextSelection(h.pos).scrollIntoView().run();
                  setIsOpen(false);
                }}
              >
                {h.text || 'Untitled'}
              </button>
            ))}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
