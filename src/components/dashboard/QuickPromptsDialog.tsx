import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, 
  Plus, 
  Search, 
  FileText, 
  TrendingUp, 
  Users, 
  Lightbulb,
  Trash2,
  Sparkles,
  X
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface QuickPrompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
  icon: string;
}

const PRESET_PROMPTS: QuickPrompt[] = [
  {
    id: 'preset-1',
    title: 'Research a Company',
    prompt: 'Research and provide a comprehensive analysis of [company name] including their market position, financials, and competitive landscape.',
    category: 'research',
    icon: 'search',
  },
  {
    id: 'preset-2',
    title: 'Deal Summary',
    prompt: 'Summarize the current status, key metrics, and next steps for my active deals.',
    category: 'deals',
    icon: 'filetext',
  },
  {
    id: 'preset-3',
    title: 'Lender Matching',
    prompt: 'Find the best matching lenders for a deal in the [industry] sector with [deal size] capital requirements.',
    category: 'lenders',
    icon: 'users',
  },
  {
    id: 'preset-4',
    title: 'Market Analysis',
    prompt: 'Provide current market trends and rate analysis for [loan type] in the [geography] region.',
    category: 'research',
    icon: 'trendingup',
  },
  {
    id: 'preset-5',
    title: 'Generate Insights',
    prompt: 'Analyze my pipeline and generate actionable insights to improve deal conversion rates.',
    category: 'insights',
    icon: 'lightbulb',
  },
];

const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'search':
      return Search;
    case 'filetext':
      return FileText;
    case 'users':
      return Users;
    case 'trendingup':
      return TrendingUp;
    case 'lightbulb':
      return Lightbulb;
    case 'sparkles':
    default:
      return Sparkles;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'research':
      return 'bg-primary/10 text-primary';
    case 'deals':
      return 'bg-success/20 text-success';
    case 'lenders':
      return 'bg-accent/50 text-accent-foreground';
    case 'insights':
      return 'bg-warning/20 text-warning';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

interface QuickPromptsDialogProps {
  trigger: React.ReactNode;
}

export function QuickPromptsDialog({ trigger }: QuickPromptsDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<QuickPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ title: '', prompt: '' });

  useEffect(() => {
    if (open && user) {
      fetchCustomPrompts();
    }
  }, [open, user]);

  const fetchCustomPrompts = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_quick_prompts')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true });

      if (error) throw error;
      
      setCustomPrompts(data?.map(p => ({
        id: p.id,
        title: p.title,
        prompt: p.prompt,
        category: p.category || 'custom',
        icon: p.icon || 'sparkles',
      })) || []);
    } catch (error) {
      console.error('Error fetching prompts:', error);
    }
  };

  const handlePromptClick = (prompt: QuickPrompt) => {
    // Navigate to research page with the prompt
    navigate('/research', { state: { initialPrompt: prompt.prompt } });
    setOpen(false);
  };

  const handleAddPrompt = async () => {
    if (!user || !newPrompt.title.trim() || !newPrompt.prompt.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in both title and prompt.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('user_quick_prompts')
        .insert({
          user_id: user.id,
          title: newPrompt.title.trim(),
          prompt: newPrompt.prompt.trim(),
          category: 'custom',
          icon: 'sparkles',
          position: customPrompts.length,
        });

      if (error) throw error;

      toast({
        title: "Prompt added",
        description: "Your custom prompt has been saved.",
      });

      setNewPrompt({ title: '', prompt: '' });
      setShowAddForm(false);
      fetchCustomPrompts();
    } catch (error) {
      console.error('Error adding prompt:', error);
      toast({
        title: "Error",
        description: "Failed to add prompt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_quick_prompts')
        .delete()
        .eq('id', promptId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Prompt deleted",
        description: "Your custom prompt has been removed.",
      });

      fetchCustomPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast({
        title: "Error",
        description: "Failed to delete prompt. Please try again.",
        variant: "destructive",
      });
    }
  };

  const allPrompts = [...PRESET_PROMPTS, ...customPrompts];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-success" />
            Quick Prompts
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4">
          {/* Preset Prompts Section */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Preset Prompts</h4>
            <div className="grid gap-2">
              {PRESET_PROMPTS.map((prompt) => {
                const IconComponent = getIconComponent(prompt.icon);
                return (
                  <Card 
                    key={prompt.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${getCategoryColor(prompt.category)}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="font-medium text-sm text-foreground truncate">{prompt.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 break-words">{prompt.prompt}</p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize shrink-0 hidden sm:inline-flex">
                        {prompt.category}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Custom Prompts Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">Your Custom Prompts</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add
                  </>
                )}
              </Button>
            </div>

            {/* Add Form */}
            {showAddForm && (
              <Card className="mb-3 border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="prompt-title">Title</Label>
                    <Input
                      id="prompt-title"
                      placeholder="e.g., Analyze Term Sheet"
                      value={newPrompt.title}
                      onChange={(e) => setNewPrompt({ ...newPrompt, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prompt-text">Prompt</Label>
                    <Input
                      id="prompt-text"
                      placeholder="e.g., Analyze the term sheet for [deal name] and highlight key terms..."
                      value={newPrompt.prompt}
                      onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                    />
                  </div>
                  <Button 
                    size="sm" 
                    onClick={handleAddPrompt}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? 'Saving...' : 'Save Prompt'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Custom Prompts List */}
            {customPrompts.length > 0 ? (
              <div className="grid gap-2">
                {customPrompts.map((prompt) => {
                  const IconComponent = getIconComponent(prompt.icon);
                  return (
                    <Card 
                      key={prompt.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors group"
                    >
                      <CardContent className="p-3 flex items-start gap-3">
                        <div 
                          className={`p-2 rounded-lg shrink-0 ${getCategoryColor(prompt.category)}`}
                          onClick={() => handlePromptClick(prompt)}
                        >
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div 
                          className="flex-1 min-w-0 overflow-hidden"
                          onClick={() => handlePromptClick(prompt)}
                        >
                          <p className="font-medium text-sm text-foreground truncate">{prompt.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 break-words">{prompt.prompt}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePrompt(prompt.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : !showAddForm ? (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No custom prompts yet. Click "Add" to create your own.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
