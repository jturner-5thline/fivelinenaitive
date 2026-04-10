import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DOMPurify from 'dompurify';

interface Props {
  subjectLine: string;
  bodyHtml: string;
  title: string;
  templateNumber: number;
}

export function OutboundEmailPreview({ subjectLine, bodyHtml, title, templateNumber }: Props) {
  const sanitizedHtml = DOMPurify.sanitize(bodyHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'span', 'div', 'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
  });

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="pb-2 space-y-2 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">#{templateNumber}</Badge>
          <span className="text-xs text-muted-foreground">{title}</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Subject:</p>
          <p className="text-sm font-medium">{subjectLine || '(No subject)'}</p>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {bodyHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">No email body content yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
