import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgreementSection } from './types';
import { resolveForExport, renderQualifierList } from './templateResolver';

interface Props {
  sections: AgreementSection[];
  values: Record<string, string>;
  companyName: string;
  onClose: () => void;
  onExportPdf: () => void;
  onExportDocx: () => void;
}

export function AgreementFullPreview({ sections, values, companyName, onClose, onExportPdf, onExportDocx }: Props) {
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order);
  const companyShort = values['company_short'] || 'Company';

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 shrink-0">
        <span className="font-semibold text-sm">Agreement Preview</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onExportDocx}>
            <Download className="h-3 w-3 mr-1.5" /> Export DOCX
          </Button>
          <Button variant="default" size="sm" className="text-xs h-7" onClick={onExportPdf}>
            <Download className="h-3 w-3 mr-1.5" /> Export PDF
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Paper */}
      <ScrollArea className="flex-1">
        <div className="flex justify-center py-8 px-4">
          <div
            className="bg-white text-black max-w-[816px] w-full shadow-2xl"
            style={{
              fontFamily: "'Times New Roman', 'Georgia', serif",
              fontSize: '12pt',
              lineHeight: '1.8',
              padding: '72px',
            }}
          >
            {/* Title */}
            <h1 className="text-center font-bold uppercase text-base tracking-wide mb-8">
              ADVISORY AGREEMENT
            </h1>

            {/* Sections */}
            {enabledSections.map((section) => {
              const isExhibit = section.section_id.startsWith('exhibit_');
              const resolved = resolveForExport(section.template_text, values);

              return (
                <div key={section.section_id} className="mb-6">
                  {isExhibit ? (
                    <div className="mt-8 pt-6 border-t border-gray-300">
                      <h3 className="text-center font-bold uppercase tracking-wider mb-4 text-sm">{resolved}</h3>
                      {section.qualifiers && section.qualifiers.length > 0 && (
                        <div className="text-justify whitespace-pre-line">
                          {resolveForExport(
                            renderQualifierList(
                              section.qualifiers,
                              section.section_id === 'exhibit_a' ? 'exhibit_a' : 'exhibit_b',
                              values
                            ),
                            values
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-justify">
                      {resolved}
                      {section.subsections && section.subsections.filter(s => s.enabled).map((sub, si) => (
                        <div key={sub.id} className="ml-8 mt-2">
                          ({String.fromCharCode(105 + si)}) {resolveForExport(sub.template_text, values)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Signature Block */}
            <div className="mt-16 pt-8 border-t border-gray-300">
              <div className="grid grid-cols-2 gap-16">
                {['5th Line Capital Advisors LLC', companyShort].map(entity => (
                  <div key={entity}>
                    <p className="font-bold mb-4">{entity}</p>
                    <p className="text-sm text-gray-600 mb-6">Agreed to and Accepted:</p>
                    {['Name', 'Title', 'Date'].map(label => (
                      <div key={label} className="mb-4">
                        <div className="border-b border-gray-400 h-6" />
                        <p className="text-xs text-gray-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
