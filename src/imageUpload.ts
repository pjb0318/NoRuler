import { imageTypes } from './imageDimensions.ts';

export const RESIZE_SKIP_BYTES = 600 * 1024;
export const DEFAULT_MAX_DIM = 3200;
export const DEFAULT_MAX_PIXELS = 2_400_000;

/** Computes target dimensions bounded by max dimension and total pixel budget while preserving aspect ratio. */
export function computeResizeDimensions(
  width: number,
  height: number,
  maxDim = DEFAULT_MAX_DIM,
  maxPixels = DEFAULT_MAX_PIXELS,
): { width: number; height: number; resized: boolean } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, resized: false };
  }
  const pixels = width * height;
  const scale = Math.min(1, maxDim / Math.max(width, height), Math.sqrt(maxPixels / pixels));
  if (scale >= 1) {
    return { width: Math.round(width), height: Math.round(height), resized: false };
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

type DecodedSource = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  cleanup: () => void;
};

async function decodeImage(file: File): Promise<DecodedSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement fallback.
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, width, height) => ctx.drawImage(img, 0, 0, width, height),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}

function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'upload';
  return `${base}.${ext}`;
}

/** Shrinks oversized camera photos and heavy uploads before hitting `/api/image-dimensions`. */
export async function prepareUploadImage(file: File): Promise<File> {
  if (typeof document === 'undefined' || !imageTypes.includes(file.type)) {
    return file;
  }
  const source = await decodeImage(file);
  if (!source) return file;

  try {
    const target = computeResizeDimensions(source.width, source.height);
    if (!target.width || !target.height) return file;
    if (file.size <= RESIZE_SKIP_BYTES && !target.resized) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    source.draw(ctx, target.width, target.height);
    let encoded = await encodeCanvas(canvas, 'image/webp', 0.86);
    if (!encoded || encoded.type !== 'image/webp') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.width, target.height);
      source.draw(ctx, target.width, target.height);
      encoded = await encodeCanvas(canvas, 'image/jpeg', 0.86);
    }

    if (!encoded || encoded.size === 0 || !imageTypes.includes(encoded.type)) {
      return file;
    }
    if (!target.resized && encoded.size >= file.size) {
      return file;
    }

    const ext = encoded.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([encoded], replaceExtension(file.name, ext), {
      type: encoded.type,
      lastModified: file.lastModified,
    });
  } finally {
    source.cleanup();
  }
}
