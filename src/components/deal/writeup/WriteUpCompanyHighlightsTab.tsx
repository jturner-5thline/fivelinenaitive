import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DealWriteUpData, CompanyHighlight } from '../DealWriteUp';

interface WriteUpCompanyHighlightsTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
}

export function WriteUpCompanyHighlightsTab({ data, updateField }: WriteUpCompanyHighlightsTabProps) {
  const addCompanyHighlight = () => {
    const newHighlight: CompanyHighlight = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('companyHighlights', [...data.companyHighlights, newHighlight]);
  };

  const updateCompanyHighlight = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'companyHighlights',
      data.companyHighlights.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteCompanyHighlight = (id: string) => {
    updateField('companyHighlights', data.companyHighlights.filter(item => item.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Company Highlights</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Key differentiators and strengths of the company</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCompanyHighlight}>
          <Plus className="h-4 w-4 mr-1" />
          Add Highlight
        </Button>
      </div>
      
      {data.companyHighlights.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-sm">No company highlights added yet.</p>
          <p className="text-xs mt-1">Click "Add Highlight" to showcase key differentiators.</p>
        </div>
      ) : (
        data.companyHighlights.map((item) => (
          <div key={item.id} className="border rounded-lg p-4 space-y-3 relative bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => deleteCompanyHighlight(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="space-y-2 pr-10">
              <Label>Title</Label>
              <Input
                value={item.title}
                onChange={(e) => updateCompanyHighlight(item.id, 'title', e.target.value)}
                placeholder="Exclusive Importer Status"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={item.description}
                onChange={(e) => updateCompanyHighlight(item.id, 'description', e.target.value)}
                placeholder="Sole U.S. importer for premium brand portfolio..."
                className="min-h-[60px]"
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
