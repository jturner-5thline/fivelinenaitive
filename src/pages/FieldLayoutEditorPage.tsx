import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { FieldLayoutEditor } from '@/components/settings/FieldLayoutEditor';

export default function FieldLayoutEditorPage() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Field Layout Editor | naitive</title>
      </Helmet>
      <div className="min-h-screen">
        <div className="container mx-auto py-6 px-4 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Settings
            </Button>
            <div>
              <h1 className="text-xl font-bold">Field Layout Editor</h1>
              <p className="text-sm text-muted-foreground">Configure how contact and company fields are displayed on detail pages</p>
            </div>
          </div>
          <FieldLayoutEditor />
        </div>
      </div>
    </>
  );
}
