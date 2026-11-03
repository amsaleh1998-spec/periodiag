import { useEffect, useState } from 'react';
import { newId, type ExportImage } from '../../domain/records';
import * as db from '../../storage/db';
import type { StoredImage } from '../../storage/db';

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const THUMB_MAX = 360;

export class ImageError extends Error {}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall back to <img> decoding below */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dims = (src: ImageBitmap | HTMLImageElement) =>
  'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };

function draw(src: ImageBitmap | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const { w, h } = dims(src);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, quality = 0.85) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Could not encode image'))), 'image/jpeg', quality));

/** Validate and decode an uploaded file, producing the stored record with a thumbnail. */
export async function processUpload(file: File, examId: string, patientId: string): Promise<StoredImage> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) {
    throw new ImageError(`${file.name}: not an image file. Export radiographs from your imaging software as JPEG or PNG.`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError(`${file.name}: larger than 40 MB.`);
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    throw new ImageError(`${file.name}: this browser cannot read this format (e.g. TIFF or DICOM). Export it as JPEG or PNG.`);
  }
  const { w, h } = dims(src);
  const thumb = await toBlob(draw(src, THUMB_MAX), 0.82);
  if ('close' in src) src.close();
  return {
    id: newId(),
    examId,
    patientId,
    name: file.name,
    type: file.type || 'image/jpeg',
    width: w,
    height: h,
    addedAt: new Date().toISOString(),
    blob: file,
    thumb,
  };
}

/** JPEG data URL (long side ≤ maxSide) for embedding in the PDF. */
export async function jpegDataUrl(blob: Blob, maxSide = 1800): Promise<{ dataUrl: string; width: number; height: number }> {
  const src = await decode(blob);
  const canvas = draw(src, maxSide);
  if ('close' in src) src.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function toExportImage(im: StoredImage): Promise<ExportImage> {
  const { blob, thumb, ...meta } = im;
  return { ...meta, data: await blobToBase64(blob), thumb: await blobToBase64(thumb) };
}

export function fromExportImage(im: ExportImage): StoredImage {
  const { data, thumb, ...meta } = im;
  return { ...meta, blob: base64ToBlob(data, im.type), thumb: base64ToBlob(thumb, 'image/jpeg') };
}

/**
 * Object URL for a stored image (thumbnail or original).
 * undefined while loading, null when the image is missing from this device.
 */
export function useImageUrl(id: string | undefined, which: 'thumb' | 'full' = 'thumb'): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    let created: string | undefined;
    setUrl(undefined);
    void db.getImage(id).then((im) => {
      if (!alive) return;
      if (!im) return setUrl(null);
      created = URL.createObjectURL(which === 'thumb' ? im.thumb : im.blob);
      setUrl(created);
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, which]);
  return url;
}
