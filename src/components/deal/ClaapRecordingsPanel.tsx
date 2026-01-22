import { useState, useEffect } from 'react';
import { Video, Clock, User, ExternalLink, Search, RefreshCw, Link2, FileText, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useClaapRecordings, ClaapRecording } from '@/hooks/useClaapRecordings';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ClaapRecordingsPanelProps {
  dealId: string;
  linkedRecordings?: string[]; // Array of recording IDs linked to this deal
  onLinkRecording?: (recordingId: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ClaapRecordingsPanel({ 
  dealId, 
  linkedRecordings = [],
  onLinkRecording 
}: ClaapRecordingsPanelProps) {
  const { recordings, loading, error, fetchRecordings, getTranscript } = useClaapRecordings();
  const [search, setSearch] = useState('');
  const [selectedRecording, setSelectedRecording] = useState<ClaapRecording | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const handleSearch = () => {
    fetchRecordings(search);
  };

  const handleViewTranscript = async (recording: ClaapRecording) => {
    setSelectedRecording(recording);
    setLoadingTranscript(true);
    const transcriptText = await getTranscript(recording.id);
    setTranscript(transcriptText);
    setLoadingTranscript(false);
  };

  const filteredRecordings = search
    ? recordings.filter(r => 
        r.title?.toLowerCase().includes(search.toLowerCase()) ||
        r.recorder?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : recordings;

  if (error && recordings.length === 0) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg">
        <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">Unable to load Claap recordings</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchRecordings()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recordings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => fetchRecordings(search)} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Recordings List */}
      <ScrollArea className="h-[350px]">
        <div className="space-y-2 pr-2">
          {loading && recordings.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border bg-card">
                <div className="flex gap-3">
                  <Skeleton className="h-16 w-24 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredRecordings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recordings found</p>
            </div>
          ) : (
            filteredRecordings.map((recording) => {
              const isLinked = linkedRecordings.includes(recording.id);
              
              return (
                <div
                  key={recording.id}
                  className={cn(
                    "p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors",
                    isLinked && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="relative h-16 w-24 rounded overflow-hidden bg-muted shrink-0">
                      {recording.thumbnailUrl ? (
                        <img
                          src={recording.thumbnailUrl}
                          alt={recording.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Video className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                        {formatDuration(recording.durationSeconds)}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{recording.title || 'Untitled'}</h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <User className="h-3 w-3" />
                        <span className="truncate">{recording.recorder?.name || 'Unknown'}</span>
                        <span>•</span>
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(recording.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                      {recording.labels?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {recording.labels.slice(0, 3).map((label, i) => (
                            <Badge key={i} variant="secondary" className="text-xs py-0">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => window.open(recording.url, '_blank')}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Watch in Claap</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleViewTranscript(recording)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Transcript</TooltipContent>
                      </Tooltip>
                      {onLinkRecording && !isLinked && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onLinkRecording(recording.id)}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Link to Deal</TooltipContent>
                        </Tooltip>
                      )}
                      {isLinked && (
                        <Badge variant="outline" className="text-xs">Linked</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Transcript Dialog */}
      <Dialog open={!!selectedRecording} onOpenChange={(open) => !open && setSelectedRecording(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedRecording?.title || 'Transcript'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] mt-4">
            {loadingTranscript ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : transcript ? (
              <pre className="text-sm whitespace-pre-wrap font-sans">{transcript}</pre>
            ) : (
              <p className="text-muted-foreground text-center py-8">No transcript available</p>
            )}
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSelectedRecording(null)}>
              Close
            </Button>
            {selectedRecording && (
              <Button onClick={() => window.open(selectedRecording.url, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Claap
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
