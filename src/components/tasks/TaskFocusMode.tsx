import { useState, useEffect, useRef, useCallback } from 'react';
import { type Task } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskFocusModeProps {
  tasks: Task[];
  onExit: () => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

const WORK_DURATION = 25 * 60; // 25 min in seconds
const BREAK_DURATION = 5 * 60;

export function TaskFocusMode({ tasks, onExit, onUpdate }: TaskFocusModeProps) {
  const incompleteTasks = tasks.filter(t => t.status !== 'complete' && t.status !== 'blocked');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(WORK_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const currentTask = incompleteTasks[currentIndex] || null;

  const playChime = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      osc.stop(ctx.currentTime + 1);
    } catch {}
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            playChime();
            if (!isBreak) {
              setShowBreakPrompt(true);
            } else {
              setIsBreak(false);
              setTimeLeft(WORK_DURATION);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, isBreak, playChime, timeLeft]);

  const handleStartBreak = () => {
    setShowBreakPrompt(false);
    setIsBreak(true);
    setTimeLeft(BREAK_DURATION);
    setIsRunning(true);
  };

  const handleSkipBreak = () => {
    setShowBreakPrompt(false);
    setIsBreak(false);
    setTimeLeft(WORK_DURATION);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(isBreak ? BREAK_DURATION : WORK_DURATION);
  };

  const handleNext = () => {
    if (currentIndex < incompleteTasks.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleComplete = () => {
    if (currentTask) {
      onUpdate(currentTask.id, { status: 'complete' } as any);
      // Don't advance index since the array shifts
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = isBreak
    ? ((BREAK_DURATION - timeLeft) / BREAK_DURATION) * 100
    : ((WORK_DURATION - timeLeft) / WORK_DURATION) * 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (incompleteTasks.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: '#0d1117' }}>
        <Button variant="ghost" className="absolute top-4 right-4 text-[#8b92a5]" onClick={onExit}>
          <X className="h-5 w-5 mr-1" /> Exit Focus
        </Button>
        <p className="text-xl font-semibold" style={{ color: 'white' }}>🎉 All tasks complete!</p>
        <p className="text-sm mt-2" style={{ color: '#8b92a5' }}>Great work. Take a break.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: '#0d1117' }}>
      <Button variant="ghost" className="absolute top-4 right-4 text-[#8b92a5]" onClick={onExit}>
        <X className="h-5 w-5 mr-1" /> Exit Focus
      </Button>

      {showBreakPrompt ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-2xl font-bold" style={{ color: 'white' }}>⏰ Time's up!</p>
          <p className="text-lg" style={{ color: '#8b92a5' }}>Take a 5 minute break?</p>
          <div className="flex gap-3">
            <Button onClick={handleStartBreak} style={{ backgroundColor: '#3b7eff' }} className="text-white">
              Yes, start break
            </Button>
            <Button variant="outline" onClick={handleSkipBreak} style={{ borderColor: '#2a2f3e', color: '#8b92a5' }}>
              Skip, keep working
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Timer ring */}
          <div className="relative mb-8">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="#2a2f3e" strokeWidth="6" />
              <circle
                cx="100" cy="100" r="90" fill="none"
                stroke={isBreak ? '#22c55e' : '#3b7eff'}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 100 100)"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums" style={{ color: 'white' }}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
              <span className="text-xs mt-1" style={{ color: '#8b92a5' }}>
                {isBreak ? 'Break' : 'Focus'}
              </span>
            </div>
          </div>

          {/* Timer controls */}
          <div className="flex items-center gap-3 mb-10">
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10 rounded-full"
              style={{ borderColor: '#2a2f3e' }}
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" style={{ color: '#8b92a5' }} />
            </Button>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full"
              style={{ backgroundColor: '#3b7eff' }}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white ml-0.5" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10 rounded-full"
              style={{ borderColor: '#2a2f3e' }}
              onClick={handleNext}
              disabled={currentIndex >= incompleteTasks.length - 1}
            >
              <SkipForward className="h-4 w-4" style={{ color: '#8b92a5' }} />
            </Button>
          </div>

          {/* Current task card */}
          {currentTask && (
            <div
              className="w-full max-w-lg rounded-xl border p-6"
              style={{ backgroundColor: '#13181f', borderColor: '#2a2f3e' }}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={false}
                  onCheckedChange={handleComplete}
                  className="h-5 w-5 rounded-full mt-1 border-[#3b7eff]"
                />
                <div className="flex-1">
                  <h2 className="text-xl font-semibold" style={{ color: 'white' }}>{currentTask.title}</h2>
                  {currentTask.description && (
                    <p className="text-sm mt-2" style={{ color: '#8b92a5' }}>{currentTask.description}</p>
                  )}
                  {currentTask.deal?.company && (
                    <p className="text-xs mt-2" style={{ color: '#3b7eff' }}>{currentTask.deal.company}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid #2a2f3e' }}>
                <span className="text-xs" style={{ color: '#8b92a5' }}>
                  Task {currentIndex + 1} of {incompleteTasks.length}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
