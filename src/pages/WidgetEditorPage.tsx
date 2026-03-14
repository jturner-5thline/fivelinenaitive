import { DatarailsWidgetEditor } from '@/components/widget-editor/DatarailsWidgetEditor';

export default function WidgetEditorPage() {
  return (
    <div className="h-[calc(100vh-64px)]">
      <DatarailsWidgetEditor
        onSave={(config) => console.log('Save widget:', config)}
        onCancel={() => console.log('Cancel')}
      />
    </div>
  );
}
