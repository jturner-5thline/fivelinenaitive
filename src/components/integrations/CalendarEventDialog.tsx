import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { format, parseISO } from 'date-fns';

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  all_day?: boolean;
}

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  onSave: (eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  isLoading?: boolean;
}

export function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  onSave,
  onDelete,
  isLoading,
}: CalendarEventDialogProps) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);

  useEffect(() => {
    if (event) {
      setSummary(event.summary || '');
      setDescription(event.description || '');
      setLocation(event.location || '');
      setAllDay(event.all_day || false);

      if (event.start) {
        try {
          const startDt = parseISO(event.start);
          setStartDate(format(startDt, 'yyyy-MM-dd'));
          setStartTime(event.all_day ? '09:00' : format(startDt, 'HH:mm'));
        } catch {
          setStartDate('');
          setStartTime('09:00');
        }
      }

      if (event.end) {
        try {
          const endDt = parseISO(event.end);
          setEndDate(format(endDt, 'yyyy-MM-dd'));
          setEndTime(event.all_day ? '10:00' : format(endDt, 'HH:mm'));
        } catch {
          setEndDate('');
          setEndTime('10:00');
        }
      }
    } else {
      // New event defaults
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      setSummary('');
      setDescription('');
      setLocation('');
      setStartDate(format(now, 'yyyy-MM-dd'));
      setStartTime(format(now, 'HH:mm'));
      setEndDate(format(oneHourLater, 'yyyy-MM-dd'));
      setEndTime(format(oneHourLater, 'HH:mm'));
      setAllDay(false);
    }
  }, [event, open]);

  const handleSave = async () => {
    if (!summary.trim() || !startDate || !endDate) return;

    let start: string;
    let end: string;

    if (allDay) {
      start = startDate;
      end = endDate;
    } else {
      start = `${startDate}T${startTime}:00`;
      end = `${endDate}T${endTime}:00`;
    }

    await onSave({
      summary: summary.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start,
      end,
      allDay,
    });
  };

  const isEditing = !!event?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="summary">Title *</Label>
            <Input
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Event title"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="allDay"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <Label htmlFor="allDay" className="cursor-pointer">All day event</Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {isEditing && onDelete && (
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={isLoading}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading || !summary.trim()}>
              {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
