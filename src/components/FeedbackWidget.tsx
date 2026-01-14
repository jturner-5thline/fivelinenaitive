import { useState, useRef } from 'react';
import { MessageSquarePlus, X, Send, Loader2, Bug, Lightbulb, Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

type FeedbackType = 'bug' | 'feature';

export function FeedbackWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<FeedbackType>('feature');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // Only show for @5thline.co users
  const is5thlineUser = user?.email?.endsWith('@5thline.co');

  if (!is5thlineUser) {
    return null;
  }

  const captureScreenshot = async () => {
    setIsCapturing(true);
    // Temporarily close the popover to capture the actual page
    setOpen(false);
    
    try {
      // Small delay to let the popover close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        logging: false,
        scale: 1,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });
      
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          },
          'image/png',
          0.9
        );
      });
      
      setScreenshot(blob);
      setScreenshotPreview(URL.createObjectURL(blob));
      
      toast({
        title: 'Screenshot captured',
        description: 'Screenshot attached to your feedback.',
      });
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      toast({
        title: 'Error',
        description: 'Failed to capture screenshot.',
        variant: 'destructive',
      });
    } finally {
      setIsCapturing(false);
      setOpen(true);
    }
  };

  const removeScreenshot = () => {
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim() || !user) return;

    setIsSubmitting(true);
    try {
      let screenshotUrl: string | null = null;

      // Upload screenshot if exists
      if (screenshot) {
        const fileName = `${user.id}/${Date.now()}-feedback-screenshot.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('feedback-screenshots')
          .upload(fileName, screenshot, {
            contentType: 'image/png',
          });

        if (uploadError) {
          console.error('Error uploading screenshot:', uploadError);
          // Continue without screenshot
        } else {
          screenshotUrl = uploadData.path;
        }
      }

      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        title: title.trim(),
        message: message.trim(),
        type,
        page_url: window.location.pathname,
        screenshot_url: screenshotUrl,
      });

      if (error) throw error;

      toast({
        title: 'Feedback submitted',
        description: 'Thank you for your feedback!',
      });
      setTitle('');
      setMessage('');
      setType('feature');
      removeScreenshot();
      setOpen(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
          >
            {open ? (
              <X className="h-5 w-5" />
            ) : (
              <MessageSquarePlus className="h-5 w-5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-80 p-4"
          sideOffset={12}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground">Send Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Help us improve the platform
              </p>
            </div>

            {/* Type Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Type</Label>
              <ToggleGroup
                type="single"
                value={type}
                onValueChange={(value) => value && setType(value as FeedbackType)}
                className="justify-start"
              >
                <ToggleGroupItem value="feature" aria-label="Feature request" className="gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Feature
                </ToggleGroupItem>
                <ToggleGroupItem value="bug" aria-label="Bug report" className="gap-2">
                  <Bug className="h-4 w-4" />
                  Bug
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="feedback-title" className="text-xs">Title</Label>
              <Input
                id="feedback-title"
                placeholder={type === 'bug' ? 'Brief bug summary...' : 'Feature idea...'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="feedback-desc" className="text-xs">Description</Label>
              <Textarea
                id="feedback-desc"
                placeholder={type === 'bug' ? 'Steps to reproduce, expected vs actual behavior...' : 'Describe the feature and why it would help...'}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </div>

            {/* Screenshot Section */}
            <div className="space-y-2">
              <Label className="text-xs">Screenshot (optional)</Label>
              {screenshotPreview ? (
                <div className="relative">
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="w-full h-20 object-cover rounded-md border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={removeScreenshot}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={captureScreenshot}
                  disabled={isCapturing}
                >
                  {isCapturing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  {isCapturing ? 'Capturing...' : 'Take Screenshot'}
                </Button>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={!title.trim() || !message.trim() || isSubmitting}
                size="sm"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
