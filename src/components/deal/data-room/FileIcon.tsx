import { FileText, Eye, FileSpreadsheet, Presentation } from 'lucide-react';

export function FileIcon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext || '')) return <FileText className={`${className} text-red-500`} />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet className={`${className} text-green-600`} />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className={`${className} text-blue-500`} />;
  if (['ppt', 'pptx'].includes(ext || '')) return <Presentation className={`${className} text-orange-500`} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <Eye className={`${className} text-purple-500`} />;
  return <FileText className={`${className} text-muted-foreground`} />;
}
