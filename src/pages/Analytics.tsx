import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, AreaChart, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCharts, ChartType, ChartConfig } from '@/contexts/ChartsContext';
import { toast } from '@/hooks/use-toast';
import { 
  BarChart, 
  Bar, 
  LineChart as RechartsLineChart, 
  Line, 
  PieChart as RechartsPieChart, 
  Pie, 
  AreaChart as RechartsAreaChart, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { mockDeals } from '@/data/mockDeals';
import { cn } from '@/lib/utils';

// Generate chart data based on data source
const getChartData = (dataSource: string) => {
  switch (dataSource) {
    case 'deals-by-stage':
      const stageCounts: Record<string, number> = {};
      mockDeals.forEach(deal => {
        stageCounts[deal.stage] = (stageCounts[deal.stage] || 0) + 1;
      });
      return Object.entries(stageCounts).map(([name, value]) => ({ name, value }));
    
    case 'monthly-value':
      return [
        { name: 'Jan', value: 12500000 },
        { name: 'Feb', value: 15000000 },
        { name: 'Mar', value: 18000000 },
        { name: 'Apr', value: 22000000 },
        { name: 'May', value: 19500000 },
        { name: 'Jun', value: 25000000 },
      ];
    
    case 'deals-by-status':
      const statusCounts: Record<string, number> = {};
      mockDeals.forEach(deal => {
        statusCounts[deal.status] = (statusCounts[deal.status] || 0) + 1;
      });
      return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    
    case 'lender-activity':
      return [
        { name: 'Active', value: 15 },
        { name: 'On Deck', value: 8 },
        { name: 'Passed', value: 12 },
        { name: 'On Hold', value: 5 },
      ];
    
    case 'deal-value-distribution':
      return [
        { name: '$0-5M', value: 8 },
        { name: '$5-10M', value: 12 },
        { name: '$10-20M', value: 6 },
        { name: '$20M+', value: 4 },
      ];
    
    default:
      return [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
        { name: 'C', value: 15 },
        { name: 'D', value: 25 },
      ];
  }
};

const DATA_SOURCES = [
  { id: 'deals-by-stage', label: 'Deals by Stage' },
  { id: 'monthly-value', label: 'Monthly Deal Value' },
  { id: 'deals-by-status', label: 'Deals by Status' },
  { id: 'lender-activity', label: 'Lender Activity' },
  { id: 'deal-value-distribution', label: 'Deal Value Distribution' },
];

const CHART_COLORS = [
  '#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'
];

const ChartTypeIcon = ({ type }: { type: ChartType }) => {
  switch (type) {
    case 'bar': return <BarChart3 className="h-4 w-4" />;
    case 'line': return <LineChart className="h-4 w-4" />;
    case 'pie': return <PieChart className="h-4 w-4" />;
    case 'area': return <AreaChart className="h-4 w-4" />;
  }
};

function ChartRenderer({ chart }: { chart: ChartConfig }) {
  const data = getChartData(chart.dataSource);
  
  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Bar dataKey="value" fill={chart.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <RechartsLineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color }} />
          </RechartsLineChart>
        </ResponsiveContainer>
      );
    
    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      );
    
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <RechartsAreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }} 
            />
            <Area type="monotone" dataKey="value" stroke={chart.color} fill={chart.color} fillOpacity={0.3} />
          </RechartsAreaChart>
        </ResponsiveContainer>
      );
  }
}

// Sortable Chart Card Component
function SortableChartCard({ 
  chart, 
  onEdit, 
  onDelete 
}: { 
  chart: ChartConfig; 
  onEdit: (chart: ChartConfig) => void;
  onDelete: (chartId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chart.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className={cn(isDragging && "shadow-lg ring-2 ring-primary/20")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <ChartTypeIcon type={chart.type} />
          <CardTitle className="text-lg">{chart.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => onEdit(chart)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(chart.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ChartRenderer chart={chart} />
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { charts, addChart, updateChart, deleteChart, reorderCharts } = useCharts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    type: 'bar' as ChartType,
    dataSource: 'deals-by-stage',
    color: '#9333ea',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = charts.findIndex(c => c.id === active.id);
      const newIndex = charts.findIndex(c => c.id === over.id);
      reorderCharts(arrayMove(charts, oldIndex, newIndex));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'bar',
      dataSource: 'deals-by-stage',
      color: '#9333ea',
    });
    setEditingChart(null);
  };

  const handleOpenDialog = (chart?: ChartConfig) => {
    if (chart) {
      setEditingChart(chart);
      setFormData({
        title: chart.title,
        type: chart.type,
        dataSource: chart.dataSource,
        color: chart.color,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSaveChart = () => {
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a chart title', variant: 'destructive' });
      return;
    }

    if (editingChart) {
      updateChart(editingChart.id, formData);
      toast({ title: 'Chart updated', description: `"${formData.title}" has been updated.` });
    } else {
      addChart(formData);
      toast({ title: 'Chart added', description: `"${formData.title}" has been created.` });
    }
    
    setDialogOpen(false);
    resetForm();
  };

  const handleDeleteChart = () => {
    if (chartToDelete) {
      const chart = charts.find(c => c.id === chartToDelete);
      deleteChart(chartToDelete);
      toast({ title: 'Chart deleted', description: `"${chart?.title}" has been removed.` });
      setChartToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const confirmDelete = (chartId: string) => {
    setChartToDelete(chartId);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Analytics | nAltive</title>
        <meta name="description" content="View and manage analytics charts for your deals pipeline" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        
        <main className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Analytics</h1>
              <p className="text-muted-foreground mt-1">
                View insights and manage your custom charts. Drag to reorder.
              </p>
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Chart
            </Button>
          </div>

          {charts.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">No charts yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Add your first chart to start visualizing your data
                  </p>
                </div>
                <Button onClick={() => handleOpenDialog()} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" />
                  Add Chart
                </Button>
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={charts.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {charts.map(chart => (
                    <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      onEdit={handleOpenDialog}
                      onDelete={confirmDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>
      </div>

      {/* Add/Edit Chart Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingChart ? 'Edit Chart' : 'Add New Chart'}</DialogTitle>
            <DialogDescription>
              {editingChart ? 'Update your chart configuration' : 'Configure your new chart'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Chart Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter chart title"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Type</Label>
              <div className="flex gap-2">
                {(['bar', 'line', 'pie', 'area'] as ChartType[]).map(type => (
                  <Button
                    key={type}
                    type="button"
                    variant={formData.type === type ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => setFormData(prev => ({ ...prev, type }))}
                  >
                    <ChartTypeIcon type={type} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="dataSource">Data Source</Label>
              <Select
                value={formData.dataSource}
                onValueChange={(value) => setFormData(prev => ({ ...prev, dataSource: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Chart Color</Label>
              <div className="flex gap-2 flex-wrap">
                {CHART_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                      formData.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveChart}>
              {editingChart ? 'Save Changes' : 'Add Chart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chart</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chart? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChart} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
