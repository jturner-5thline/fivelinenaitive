import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

interface AvatarCropperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File | null;
  onCropComplete: (croppedFile: File) => void;
}

export function AvatarCropper({ open, onOpenChange, imageFile, onCropComplete }: AvatarCropperProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const urlRef = useRef<string | null>(null);

  const CROP_SIZE = 256;
  const PREVIEW_SIZE = 280;

  useEffect(() => {
    // Clean up previous URL
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      urlRef.current = url;
      setImageSrc(url);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setImageSize({ width: 0, height: 0 });
    } else {
      setImageSrc(null);
    }

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [imageFile]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  const getScaledDimensions = useCallback(() => {
    if (!imageSize.width || !imageSize.height) return { width: 0, height: 0 };
    const aspect = imageSize.width / imageSize.height;
    // The image must cover the PREVIEW_SIZE circle, so scale based on the shorter side
    let width: number, height: number;
    if (aspect >= 1) {
      // Landscape: height is shorter, fit height to PREVIEW_SIZE
      height = PREVIEW_SIZE * zoom;
      width = height * aspect;
    } else {
      // Portrait: width is shorter, fit width to PREVIEW_SIZE
      width = PREVIEW_SIZE * zoom;
      height = width / aspect;
    }
    return { width, height };
  }, [imageSize, zoom]);

  const clampOffset = useCallback((newOffset: { x: number; y: number }) => {
    const dims = getScaledDimensions();
    const maxX = Math.max(0, (dims.width - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (dims.height - PREVIEW_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, newOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, newOffset.y)),
    };
  }, [getScaledDimensions]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const newOffset = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
    setOffset(clampOffset(newOffset));
  }, [dragging, dragStart, clampOffset]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleZoomChange = useCallback((value: number[]) => {
    setZoom(value[0]);
    setOffset(prev => clampOffset(prev));
  }, [clampOffset]);

  const handleCrop = useCallback(async () => {
    if (!imageSrc || !imageSize.width) return;

    setIsProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageSrc;
      });

      const canvas = document.createElement('canvas');
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d')!;

      // Use a single uniform scale factor (natural pixels per displayed pixel)
      const dims = getScaledDimensions();
      const scale = imageSize.width / dims.width; // same as imageSize.height / dims.height

      // The visible crop center in displayed image coordinates
      const centerX = dims.width / 2 - offset.x;
      const centerY = dims.height / 2 - offset.y;

      // Source rectangle in natural image pixels
      const srcX = (centerX - PREVIEW_SIZE / 2) * scale;
      const srcY = (centerY - PREVIEW_SIZE / 2) * scale;
      const srcSize = PREVIEW_SIZE * scale;

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, CROP_SIZE, CROP_SIZE);

      canvas.toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], imageFile?.name || 'avatar.png', {
            type: 'image/png',
          });
          onCropComplete(croppedFile);
          onOpenChange(false);
        }
        setIsProcessing(false);
      }, 'image/png', 0.95);
    } catch {
      setIsProcessing(false);
    }
  }, [imageSrc, imageSize, zoom, offset, getScaledDimensions, imageFile, onCropComplete, onOpenChange]);

  const dims = getScaledDimensions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Crop area */}
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-full border-2 border-border bg-muted cursor-grab active:cursor-grabbing"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop preview"
                onLoad={handleImageLoad}
                className="absolute select-none pointer-events-none"
                draggable={false}
                style={{
                  width: dims.width,
                  height: 'auto',
                  left: `calc(50% - ${dims.width / 2}px + ${offset.x}px)`,
                  top: `calc(50% - ${dims.height / 2}px + ${offset.y}px)`,
                }}
              />
            )}
          </div>

          {/* Zoom control */}
          <div className="flex items-center gap-3 w-full max-w-[280px]">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              value={[zoom]}
              onValueChange={handleZoomChange}
              min={1}
              max={3}
              step={0.05}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Drag to reposition • Zoom to adjust
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCrop} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cropping...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
